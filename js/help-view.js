// js/help-view.js
// De pagina Hulp (idee 68): de handleiding per onderdeel, de Obeya-methode en
// wat er nieuw is. Puur informatief: geen bord-data, geen opslag. De tekst
// komt uit handleiding/*.md en RELEASENOTES.md, ingesloten in js/help-content.js
// (bijwerken met node tools/sync-help.js), en wordt omgezet met dezelfde
// beperkte Markdown als de Stukken (js/documents.js).
//
// Ontwerp UX-designer (6 november 2026): de "?" in de hoofdbalk opent deze
// pagina meteen, bij het hoofdstuk van de weergave waar je was; links de
// onderdelen, rechts één pagina, de tabs blijven ongemoeid.

const ObeyaHelpView = (function () {
  'use strict';

  const H = ObeyaUI;

  const NIEUW = 'nieuw';
  const METHODE = 'obeya-methode';
  const GROEPEN = ['Achtergrond', 'Weergaven', 'Werken met het bord', 'Overleg en delen'];
  // "Wat is er nieuw" toont alleen de versies van de laatste maand (besluit
  // 25 november 2026). Oudere versies staan in RELEASENOTES.md.
  const RECENT_MAANDEN = 1;

  function content() {
    return typeof OBEYA_HELP !== 'undefined' ? OBEYA_HELP : { pages: [], changelog: '' };
  }

  function pages() {
    const groep = (p) => (GROEPEN.indexOf(p.groep) + 1) || GROEPEN.length + 1;
    return content().pages.slice().sort((a, b) => groep(a) - groep(b) || a.volgorde - b.volgorde || a.titel.localeCompare(b.titel));
  }

  function exists(slug) {
    return slug === NIEUW || pages().some((p) => p.slug === slug);
  }

  // Het hoofdstuk bij een weergave, zodat de "?" meteen het goede opent.
  function pageForView(view) {
    const p = pages().find((x) => x.weergave === view);
    return p ? p.slug : METHODE;
  }

  // De versies uit RELEASENOTES.md, nieuwste eerst; "Nog niet uitgebracht" alleen
  // als er iets onder staat.
  function releases(changelog) {
    const out = [];
    let huidig = null;
    String(changelog || '').replace(/\r\n?/g, '\n').split('\n').forEach((regel) => {
      const kop = regel.match(/^##\s+(.*)$/);
      if (kop) {
        const m = kop[1].match(/^(\d+\.\d+\.\d+)\s*[—-]\s*(\d{4}-\d{2}-\d{2})/);
        huidig = { titel: kop[1].trim(), versie: m ? m[1] : '', datum: m ? m[2] : '', lines: [] };
        out.push(huidig);
      } else if (huidig) {
        huidig.lines.push(regel);
      }
    });
    return out
      .map((r) => ({ ...r, text: r.lines.join('\n').trim() }))
      .filter((r) => r.text && (r.versie || /niet uitgebracht/i.test(r.titel)));
  }

  function nav(actief) {
    const link = (slug, titel) => `<li><button type="button" class="help-nav__link" data-action="open-help" data-page="${slug}"${slug === actief ? ' aria-current="page"' : ''}>${H.escapeHtml(titel)}</button></li>`;
    const perGroep = {};
    pages().forEach((p) => { (perGroep[p.groep] = perGroep[p.groep] || []).push(p); });
    const groepen = [...GROEPEN, ...Object.keys(perGroep).filter((g) => !GROEPEN.includes(g))]
      .filter((g) => perGroep[g])
      .map((g) => `<li class="help-nav__group"><span class="help-nav__label">${H.escapeHtml(g || 'Overig')}</span><ul>${perGroep[g].map((p) => link(p.slug, p.titel)).join('')}</ul></li>`);
    return `
      <nav class="help-nav" aria-label="Onderdelen van Hulp">
        <ul>
          <li class="help-nav__group"><ul>${link(NIEUW, 'Wat is er nieuw')}</ul></li>
          ${groepen.join('')}
        </ul>
      </nav>`;
  }

  function renderPage(slug, today) {
    const p = pages().find((x) => x.slug === slug);
    const doc = ObeyaDocs.parse(p.text, `${slug}.md`, { today, pageLinks: true, headingIds: true });
    return { titel: p.titel, meta: p.groep === 'Achtergrond' ? 'Achtergrond' : `Handleiding · ${p.groep}`, html: doc.html };
  }

  function renderNieuw(today) {
    const blok = (r) => `
      <section class="help-release">
        <h2>${H.escapeHtml(r.versie ? `Versie ${r.versie}` : r.titel)}${r.datum ? ` <span class="help-release__date">${H.escapeHtml(H.formatDate(r.datum))}</span>` : ''}</h2>
        ${ObeyaDocs.parse(r.text, 'RELEASENOTES.md', { today, pageLinks: true }).html}
      </section>`;
    const alle = releases(content().changelog);
    const grens = new Date(`${today}T00:00:00Z`);
    grens.setUTCMonth(grens.getUTCMonth() - RECENT_MAANDEN);
    const vanaf = grens.toISOString().slice(0, 10);
    const binnen = alle.filter((r) => !r.datum || r.datum >= vanaf);
    // Altijd minstens de nieuwste uitgebrachte versie.
    const recent = binnen.some((r) => r.versie) ? binnen : [...binnen, ...alle.filter((r) => r.versie).slice(0, 1)];
    return {
      titel: 'Wat is er nieuw',
      meta: `De laatste maand, nieuwste eerst · nu versie ${OBEYA_APP_VERSION}`,
      html: recent.map(blok).join(''),
    };
  }

  // slug: de pagina; back: de naam van de weergave waar je vandaan kwam.
  function render(slug, opts) {
    const o = opts || {};
    const today = o.today || new Date().toISOString().slice(0, 10);
    const open = exists(slug) ? slug : METHODE;
    const pagina = open === NIEUW ? renderNieuw(today) : renderPage(open, today);
    return `
      <section class="help-view">
        <nav class="crumbs" aria-label="Kruimelpad">
          <button class="crumbs__link" data-action="close-help">← ${H.escapeHtml(o.back || 'Terug')}</button><span class="crumbs__sep">/</span><span>Hulp</span><span class="crumbs__sep">/</span><span class="crumbs__current">${H.escapeHtml(pagina.titel)}</span>
        </nav>
        <div class="help-layout">
          ${nav(open)}
          <article class="doc help-page">
            <header class="doc__head">
              <h1 id="help-title" tabindex="-1">${H.escapeHtml(pagina.titel)}</h1>
              <p class="doc__meta muted">${H.escapeHtml(pagina.meta)}</p>
            </header>
            <div class="doc__body">
              ${pagina.html}
            </div>
          </article>
        </div>
      </section>`;
  }

  return { render, pages, pageForView, releases, exists, NIEUW, METHODE, GROEPEN };
})();
