// js/documents.js
// Stukken (idee 54): adviezen, voorbereidingen en verslagen die als Markdown
// in het data-repo staan (map stukken/, formaat in stukken/README.md daar).
// Dit zet zo'n stuk om naar HTML in de vaste opmaak van de app.
//
// Bewust een eigen, beperkte omzetting en geen Markdown-bibliotheek: alleen
// wat het formaat afspreekt (koppen, alinea's, lijsten, tabellen, nadruk,
// links, drie vaste blokken en te-besluiten-punten) wordt opmaak. Al het
// andere blijft ge-escapete tekst, dus een stuk kan geen eigen stijl, HTML
// of scripts meenemen. Zo blijft de stijl van alle stukken gelijk.

const ObeyaDocs = (function () {
  'use strict';

  const STATUSES = ['concept', 'besproken', 'besloten'];
  const STATUS_LABELS = { concept: 'Concept', besproken: 'Besproken', besloten: 'Besloten' };
  const BLOCKS = { observatie: 'Observatie', advies: 'Advies', besluit: 'Besluit' };

  // Blokken met een datum, voor de handleiding (idee 68): ::: nieuw 2026-11-06.
  // Drie maanden na die datum verliezen "nieuw" en "gewijzigd" hun label (de
  // tekst blijft) en valt "vervallen" helemaal weg. Zonder vandaag (opts.today)
  // blijven ze altijd zichtbaar.
  const DATED = { nieuw: 'Nieuw sinds', gewijzigd: 'Aangepast op', vervallen: 'Vervallen op' };
  const ZICHTBAAR_MAANDEN = 3;
  const MAANDEN = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];

  function plusMaanden(iso, n) {
    const [j, m, d] = iso.split('-').map(Number);
    const t = (m - 1) + n;
    return `${j + Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  function datumTekst(iso) {
    const [j, m, d] = iso.split('-').map(Number);
    return `${d} ${MAANDEN[m - 1]} ${j}`;
  }

  // Nog zichtbaar als nieuw, aangepast of vervallen op `today` (JJJJ-MM-DD)?
  function stillMarked(datum, today) {
    return !today || plusMaanden(datum, ZICHTBAAR_MAANDEN) > today;
  }

  function escapeHtml(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  // --- gegevens bovenaan ----------------------------------------------------

  // Zonder titel of datum: uit de bestandsnaam (JJJJ-MM-DD-korte-naam.md).
  function metaFromPath(filePath) {
    const naam = String(filePath || '').split('/').pop().replace(/\.md$/i, '');
    const m = naam.match(/^(\d{4}-\d{2}-\d{2})-(.+)$/);
    return { titel: (m ? m[2] : naam).replace(/-/g, ' '), datum: m ? m[1] : '' };
  }

  function splitFrontMatter(text) {
    const t = String(text || '').replace(/\r\n?/g, '\n');
    const m = t.match(/^---\n([\s\S]*?)\n---[ \t]*(?:\n|$)/);
    if (!m) return { fields: {}, body: t };
    const fields = {};
    m[1].split('\n').forEach((regel) => {
      const kv = regel.match(/^([a-zA-Z]+):\s*(.*)$/);
      if (kv) fields[kv[1].toLowerCase()] = kv[2].trim();
    });
    return { fields, body: t.slice(m[0].length) };
  }

  // --- tekst binnen een regel ---------------------------------------------

  function inline(text, opts) {
    const o = opts || {};
    let s = escapeHtml(text);
    s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/\*([^*\s][^*]*)\*/g, '<em>$1</em>');
    // Alleen links naar http(s), en in de handleiding naar een andere pagina
    // (pagina:naam); al het andere blijft gewone tekst.
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (heel, label, url) => {
      if (/^https?:\/\//i.test(url)) return `<a href="${url}" rel="noopener noreferrer" target="_blank">${label}</a>`;
      const pagina = url.match(/^pagina:([a-z0-9-]+)(?:#([a-z0-9-]+))?$/);
      if (pagina && o.pageLinks) return `<button type="button" class="doc-link" data-action="open-help" data-page="${pagina[1]}"${pagina[2] ? ` data-anchor="${pagina[2]}"` : ''}>${label}</button>`;
      return label;
    });
    return s;
  }

  // --- blokken ------------------------------------------------------------

  const isTableRow = (r) => /^\s*\|.*\|\s*$/.test(r);
  const isTableSep = (r) => /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(r);
  const cells = (r) => r.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());

  function renderTable(rows, opts) {
    const [kop, ...rest] = rows;
    return `<div class="doc-table" role="region" aria-label="Tabel" tabindex="0"><table>
<thead><tr>${cells(kop).map((c) => `<th>${inline(c, opts)}</th>`).join('')}</tr></thead>
<tbody>${rest.map((r) => `<tr>${cells(r).map((c) => `<td>${inline(c, opts)}</td>`).join('')}</tr>`).join('\n')}</tbody>
</table></div>`;
  }

  function renderTask(done, text, opts) {
    return `<li class="doc-task doc-task--${done ? 'done' : 'open'}"><span class="doc-task__state">${done ? '☑ Besloten' : '☐ Te besluiten'}</span> <span class="doc-task__text">${inline(text, opts)}</span></li>`;
  }

  // Een afbeelding op een eigen regel: ![beschrijving](afbeeldingen/x.svg "bijschrift").
  // De beschrijving is verplicht (voor wie het plaatje niet ziet); het
  // bijschrift is zichtbaar en mag weg. Alleen bestanden uit de map
  // afbeeldingen/ naast het stuk, zoals de app ze heeft opgehaald
  // (opts.images: pad → data-URL); een adres van buiten wordt nooit geladen.
  const IMAGE_LINE = /^!\[([^\]]+)\]\((afbeeldingen\/[A-Za-z0-9._-]+\.(?:svg|png|jpe?g|webp))(?:\s+"([^"]*)")?\)\s*$/i;
  const DATA_URL = /^data:image\/(?:svg\+xml|png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;

  function renderImage(alt, pad, bijschrift, opts) {
    const bron = ((opts || {}).images || {})[`stukken/${pad}`];
    if (!bron || !DATA_URL.test(bron)) {
      return `<p class="doc-figure doc-figure--missing">Afbeelding ontbreekt: ${escapeHtml(alt)} <span class="muted">(${escapeHtml(pad)})</span></p>`;
    }
    return `<figure class="doc-figure"><img src="${bron}" alt="${escapeHtml(alt)}" loading="lazy">${bijschrift ? `<figcaption>${inline(bijschrift, opts)}</figcaption>` : ''}</figure>`;
  }

  // Een vast id per kop, zodat een link naar pagina:naam#kop ergens heen kan.
  function kopId(tekst) {
    const id = String(tekst).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return id ? ` id="h-${id}"` : '';
  }

  function renderLines(lines, opts) {
    const out = [];
    let i = 0;
    let para = [];
    const flushPara = () => {
      if (para.length) out.push(`<p>${inline(para.join(' '), opts)}</p>`);
      para = [];
    };

    while (i < lines.length) {
      const regel = lines[i];

      // ::: soort … ::: — een vast blok, of gewone tekst als de soort onbekend is.
      const blok = regel.match(/^:::\s*([a-z-]+)(?:\s+(\d{4}-\d{2}-\d{2}))?\s*$/i);
      if (blok) {
        flushPara();
        const binnen = [];
        i += 1;
        while (i < lines.length && !/^:::\s*$/.test(lines[i])) { binnen.push(lines[i]); i += 1; }
        i += 1;
        const soort = blok[1].toLowerCase();
        const datum = blok[2] && /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(blok[2]) ? blok[2] : null;
        if (DATED[soort] && datum) {
          const label = `${DATED[soort]} ${datumTekst(datum)}`;
          if (stillMarked(datum, (opts || {}).today)) {
            out.push(`<aside class="doc-block doc-block--${soort}" aria-label="${label}"><p class="doc-block__label">${label}</p>\n${renderLines(binnen, opts)}\n</aside>`);
          } else if (soort !== 'vervallen') {
            out.push(renderLines(binnen, opts));
          }
        } else if (BLOCKS[soort]) {
          out.push(`<aside class="doc-block doc-block--${soort}" aria-label="${BLOCKS[soort]}"><p class="doc-block__label">${BLOCKS[soort]}</p>\n${renderLines(binnen, opts)}\n</aside>`);
        } else {
          out.push(renderLines(binnen, opts));
        }
        continue;
      }

      if (!regel.trim()) { flushPara(); i += 1; continue; }

      const beeld = regel.match(IMAGE_LINE);
      if (beeld) {
        flushPara();
        out.push(renderImage(beeld[1], beeld[2], beeld[3], opts));
        i += 1;
        continue;
      }

      const kop = regel.match(/^(#{1,3})\s+(.*)$/);
      if (kop) {
        flushPara();
        const niveau = kop[1].length + 1; // # = h2: de titel van het stuk is de h1
        out.push(`<h${niveau}${(opts || {}).headingIds ? kopId(kop[2]) : ''}>${inline(kop[2], opts)}</h${niveau}>`);
        i += 1;
        continue;
      }

      if (isTableRow(regel) && i + 1 < lines.length && isTableSep(lines[i + 1])) {
        flushPara();
        const rows = [regel];
        i += 2;
        while (i < lines.length && isTableRow(lines[i])) { rows.push(lines[i]); i += 1; }
        out.push(renderTable(rows, opts));
        continue;
      }

      if (/^\s*[-*]\s+\[[ xX]\]\s+/.test(regel)) {
        flushPara();
        const items = [];
        while (i < lines.length) {
          const m = lines[i].match(/^\s*[-*]\s+\[([ xX])\]\s+(.*)$/);
          if (!m) break;
          items.push(renderTask(m[1] !== ' ', m[2], opts));
          i += 1;
        }
        out.push(`<ul class="doc-tasks">\n${items.join('\n')}\n</ul>`);
        continue;
      }

      const lijst = regel.match(/^\s*(?:([-*])|(\d+)[.)])\s+/);
      if (lijst) {
        flushPara();
        const geordend = !lijst[1];
        const patroon = geordend ? /^\s*\d+[.)]\s+(.*)$/ : /^\s*[-*]\s+(?!\[[ xX]\])(.*)$/;
        const items = [];
        while (i < lines.length) {
          const m = lines[i].match(patroon);
          if (!m) break;
          items.push(`<li>${inline(m[1], opts)}</li>`);
          i += 1;
        }
        const tag = geordend ? 'ol' : 'ul';
        out.push(`<${tag}>\n${items.join('\n')}\n</${tag}>`);
        continue;
      }

      para.push(regel.trim());
      i += 1;
    }
    flushPara();
    return out.join('\n');
  }

  // --- publiek ------------------------------------------------------------

  // opts: { today: 'JJJJ-MM-DD' (voor de blokken met een datum),
  //         pageLinks: true (links naar pagina:naam worden knoppen),
  //         headingIds: true (elke kop een id, voor pagina:naam#kop),
  //         images: { 'stukken/afbeeldingen/x.svg': 'data:image/…' } }.
  function parse(text, filePath, opts) {
    const { fields, body } = splitFrontMatter(text);
    const uitPad = metaFromPath(filePath);
    const meta = {
      titel: fields.titel || uitPad.titel,
      datum: /^\d{4}-\d{2}-\d{2}$/.test(fields.datum || '') ? fields.datum : uitPad.datum,
      voor: fields.voor || '',
      status: STATUSES.includes((fields.status || '').toLowerCase()) ? fields.status.toLowerCase() : '',
      bron: fields.bron || '',
    };
    return { path: filePath, meta, html: renderLines(body.split('\n'), opts) };
  }

  function sortDocs(docs) {
    return docs.slice().sort((a, b) => (b.meta.datum || '').localeCompare(a.meta.datum || '') || String(a.path).localeCompare(String(b.path)));
  }

  return { parse, sortDocs, stillMarked, STATUSES, STATUS_LABELS, BLOCKS, DATED, escapeHtml };
})();
