// js/print.js
// Muurvellen: het bord op papier, om op te hangen in een kamer voor een
// fysieke Obeya-sessie of permanent in de teamruimte. Zie docs/muurvellen.md.
//
// Vellen (sinds 12 oktober 2026 als een muur met geeltjes; de oude
// strategiemuur en het ketenvel zijn vervallen, zie docs/muurvellen.md):
//   - Muur: visie en per thema een kolom in de themakleur, met een geeltje
//     per doel (status, eigenaar, principes, telling).
//   - Meetbare resultaten: per thema een kolom, per doel de resultaten als
//     kaart met "Klaar als", status, eigenaar en streefkwartaal, en een vak
//     om de stand met de hand bij te schrijven (idee 80, punt 1). De muur
//     "werkelijkheid": hier zie je de afwijking.
//   - Muur per thema: per doel een geeltje met de projecten eronder.
// Op deze drie muurvellen heeft elk kaartje dezelfde vaste maat; wat niet
// past, gaat naar een volgend vel ("1/2"), nooit kleiner.
//   - Sessievel: wat rood of aandacht nodig is (en wat gemarkeerd is), met
//     lege vakken voor afwijking, tegenmaatregel, wie en wanneer, om tijdens
//     de sessie met de hand in te vullen.
//   - Actielijst: alle acties met eigenaar, deadline en status, een vakje om
//     af te vinken en ruimte voor een update.
//
// Groot formaat (A1/A0 liggend, A3 als proefdruk). De browser maakt er via
// "Afdrukken → Opslaan als PDF" een PDF van met het juiste papierformaat, die
// een drukker of plotter zo kan afdrukken. Status staat altijd als symbool én
// tekst op papier, zodat het ook in zwart-wit leesbaar is.
//
// render() is puur (HTML als tekst, in Node te testen); prepare() en
// cleanup() doen het werk in de browser: de vellen klaarzetten en weer
// opruimen.

const ObeyaPrint = (function () {
  'use strict';

  const H = ObeyaUI;

  // Liggend, in millimeters. k is de lettergrootte ten opzichte van A1.
  const FORMATS = {
    A0: { w: 1189, h: 841, margin: 15, k: 1.41, label: 'A0' },
    A1: { w: 841, h: 594, margin: 12, k: 1, label: 'A1' },
    A3: { w: 420, h: 297, margin: 8, k: 0.5, label: 'A3 (proefdruk)' },
    // De muurvellen op A1-maat, verdeeld over vier A3's om aan elkaar te
    // plakken (David, 11 november 2026: morgen alleen een A3-printer). Sessievel
    // en actielijst gaan gewoon op A3.
    'A1-A3': { w: 841, h: 594, margin: 12, k: 1, label: 'A1 als mozaïek van 4 × A3', tegels: 'A3' },
  };

  const MUURVELLEN = ['wall', 'results', 'themeWall'];

  // Hoe een A1-vel over 2 × 2 vellen papier valt. Elk vel heeft een witte rand
  // (de marge van de printer); het venster daarbinnen toont een kwart van het
  // A1-vel, iets verkleind (ongeveer 1,5%) zodat de vier vensters samen precies
  // het hele vel zijn.
  function tegelMaat(groot, papier) {
    const sw = groot.w - 2 * groot.margin;
    const sh = groot.h - 2 * groot.margin;
    const vw = papier.w - 2 * papier.margin;
    const vh = papier.h - 2 * papier.margin;
    const s = Math.min((2 * vw) / sw, (2 * vh) / sh);
    const r = (x) => Math.round(x * 100) / 100;
    const schaal = Math.floor(s * 10000) / 10000; // naar beneden: nooit groter dan het venster
    return { vw, vh, sw, sh, s: schaal, dx: r((2 * vw - sw * schaal) / 2), dy: r((2 * vh - sh * schaal) / 2) };
  }

  const TEGELS = [
    { c: 0, r: 0, naam: 'links boven' },
    { c: 1, r: 0, naam: 'rechts boven' },
    { c: 0, r: 1, naam: 'links onder' },
    { c: 1, r: 1, naam: 'rechts onder' },
  ];

  // Eén muurvel als vier pagina's. Op de randen die tegen een ander deel komen
  // staat een stippellijn: daar knip je (bij de delen links en boven) of leg je
  // het buurdeel tegenaan.
  function tegels(o, html) {
    const t = o && o.tegels;
    if (!t) return html;
    return TEGELS.map(({ c, r, naam }, i) => {
      const randen = [c === 0 ? 'right' : 'left', r === 0 ? 'bottom' : 'top'];
      return `
      <div class="tile-page" style="width:${t.vw}mm;height:${t.vh}mm">
        <div class="tile-content" style="width:${t.sw}mm;height:${t.sh}mm;transform:translate(${r2(t.dx - c * t.vw)}mm, ${r2(t.dy - r * t.vh)}mm) scale(${t.s})">${html}</div>
        ${randen.map((k) => `<i class="tile-cut tile-cut--${k}" aria-hidden="true"></i>`).join('')}
        <span class="tile-label tile-label--${r === 0 ? 'top' : 'bottom'}-${(c === 0) === (r === 0) ? 'left' : 'right'}">Deel ${i + 1}/4 · ${naam}</span>
      </div>`;
    }).join('');
  }

  function r2(x) {
    return Math.round(x * 100) / 100;
  }

  const SHEETS = {
    wall: "Muur: thema's en doelen",
    results: 'Muur: meetbare resultaten',
    themeWall: 'Muur per thema: doelen en projecten',
    session: 'Sessievel: afwijkingen en tegenmaatregelen',
    actions: 'Actielijst',
  };

  // Vorm + tekst, zodat een zwart-witafdruk net zo goed leest.
  const STATUS_SYMBOL = { green: '✓', amber: '▲', red: '✖', grey: '?', blue: '▶', done: '✔' };

  function statusMark(status, entityType, dataset) {
    const key = STATUS_SYMBOL[status] ? status : 'grey';
    return `<span class="pm pm--${key}"><span class="pm__sym" aria-hidden="true">${STATUS_SYMBOL[key]}</span> ${H.escapeHtml(ObeyaData.statusLabelFor(entityType, key, dataset))}</span>`;
  }

  // Dezelfde status als platte tekst, voor plekken zonder HTML (PowerPoint).
  function statusText(status, entityType, dataset) {
    const key = STATUS_SYMBOL[status] ? status : 'grey';
    return `${STATUS_SYMBOL[key]} ${ObeyaData.statusLabelFor(entityType, key, dataset)}`;
  }

  function today() {
    return new Date().toISOString().slice(0, 10);
  }

  function sheetHeader(dataset, title, subtitle, opts) {
    const meta = dataset.meta || {};
    return `
      <header class="sheet__head">
        <div>
          <p class="sheet__board">${H.escapeHtml(meta.name || 'Obeya')}</p>
          <h1 class="sheet__title">${H.escapeHtml(title)}</h1>
          ${subtitle ? `<p class="sheet__sub">${subtitle}</p>` : ''}
        </div>
        <div class="sheet__dates">
          ${meta.lastUpdated ? `<p>Peildatum <strong>${H.escapeHtml(H.formatDate(meta.lastUpdated))}</strong></p>` : ''}
          <p>Afgedrukt <strong>${H.escapeHtml(H.formatDate(opts.date || today()))}</strong></p>
        </div>
      </header>`;
  }

  function legend(dataset) {
    return `<p class="sheet__legend">${['green', 'amber', 'red', 'grey', 'blue', 'done'].map((s) => statusMark(s, s === 'blue' || s === 'done' ? 'project' : 'objective', dataset)).join(' ')}</p>`;
  }

  // --- vellen ---------------------------------------------------------------

  // --- de muur met geeltjes ---------------------------------------------------
  // Zoals een fysieke Obeya: een geeltje per doel (en per project, en per
  // meetbaar resultaat), groot genoeg om op twee à drie meter te lezen.
  //
  // Elk kaartje heeft op elk vel dezelfde maat: 127 × 76 mm op A1, een groot
  // geeltje (David, 9 november 2026). Er wordt niets geschaald: een vel heeft
  // een vast raster van KOLOMMEN naast elkaar en RIJEN onder elkaar, en wat
  // niet past, gaat naar een volgend vel. Tekst die niet op een kaartje past,
  // wordt afgekapt met "…"; de volledige tekst staat in de app. A0 en A3
  // hebben hetzelfde raster, met grotere of kleinere kaartjes.

  const KOLOMMEN = 6;
  const RIJEN = 5;

  // Verdeelt groepen (een thema met zijn kaartjes) over vellen: per groep
  // kolommen van hooguit RIJEN kaartjes, per vel hooguit KOLOMMEN kolommen.
  // Een groep die op een leeg vel past, wordt niet over twee vellen gesplitst.
  function overVellen(groepen) {
    const vellen = [];
    let vel = [];
    let vrij = KOLOMMEN;
    groepen.forEach((g) => {
      const kolommen = [];
      for (let i = 0; i < Math.max(1, g.items.length); i += RIJEN) kolommen.push(g.items.slice(i, i + RIJEN));
      if (kolommen.length <= KOLOMMEN && kolommen.length > vrij) { vellen.push(vel); vel = []; vrij = KOLOMMEN; }
      let deel = 0;
      while (kolommen.length) {
        if (!vrij) { vellen.push(vel); vel = []; vrij = KOLOMMEN; }
        const stuk = kolommen.splice(0, vrij);
        vel.push({ ...g, kolommen: stuk, vervolg: deel > 0 });
        vrij -= stuk.length;
        deel += 1;
      }
    });
    if (vel.length || !vellen.length) vellen.push(vel);
    return vellen.filter((v, i) => v.length || i === 0);
  }

  // Een blok per thema op een vel: de kop in de themakleur over de breedte
  // van zijn kolommen, met de kaartjes eronder.
  function themaBlok(dataset, blok, kaart) {
    const t = blok.theme;
    return `
      <section class="pw-theme" style="${themeStyle(t)};--cols:${blok.kolommen.length}">
        <header class="pw-theme__head">
          <h2>${H.escapeHtml(t.name)}${blok.vervolg ? ' <span class="pw-theme__more">(vervolg)</span>' : ''}</h2>
          ${blok.kop || ''}
        </header>
        <div class="pw-grid">
          ${blok.kolommen.map((kolom) => `<div class="pw-col">${kolom.map((item, i) => kaart(item, i)).join('')}</div>`).join('')}
        </div>
      </section>`;
  }

  function volgnummer(nr, totaal) {
    return totaal > 1 ? ` (${nr + 1}/${totaal})` : '';
  }

  // Tekst op de themakleur: wit op een donkere kleur, bijna zwart op een
  // lichte (zoals oranje), zodat de kop overal leesbaar blijft.
  function inkOn(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
    if (!m) return '#ffffff';
    const n = parseInt(m[1], 16);
    const lin = (c) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    const L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
    return (1.05) / (L + 0.05) >= (L + 0.05) / 0.05 ? '#ffffff' : '#111111';
  }

  function themeStyle(t) {
    const kleur = ObeyaData.themeColor(t);
    return `--theme-color:${H.escapeHtml(kleur)};--theme-ink:${inkOn(kleur)}`;
  }

  function principleText(dataset, item) {
    const lijst = ObeyaData.getPrinciples(dataset);
    return (item.principleIds || []).map((id) => (lijst.find((p) => p.id === id) || {}).name).filter(Boolean).join(' · ');
  }

  function doelTelling(o) {
    const delen = [];
    const mr = o.measurableResults.length;
    const laat = o.measurableResults.filter((m) => ObeyaData.isLate(m)).length;
    delen.push(mr ? `${mr} deelproduct${mr === 1 ? '' : 'en'}` : 'nog geen deelproduct');
    if (laat) delen.push(`<strong class="pw-late">⏰ ${laat} te laat</strong>`);
    delen.push(`${o.projects.length} project${o.projects.length === 1 ? '' : 'en'}`);
    return delen.join(' · ');
  }

  // Drie vaste standen (licht naar links, recht, licht naar rechts) op
  // volgorde: rustig, en toch een muur met briefjes.
  const TILTS = [-0.6, 0, 0.6];

  function doelBriefje(dataset, o, index, opts) {
    const principes = principleText(dataset, o);
    return `
      <article class="pw-note pw-note--doel" style="--tilt:${TILTS[index % TILTS.length]}deg">
        <h3 class="pw-note__title">${H.escapeHtml(o.title)}</h3>
        <p class="pw-note__meta">${statusMark(o.status, 'objective', dataset)}${o.owner ? `<span>${H.escapeHtml(o.owner)}</span>` : '<span class="pw-noowner">geen eigenaar</span>'}</p>
        ${principes ? `<p class="pw-note__principles">${H.escapeHtml(principes)}</p>` : ''}
        ${opts && opts.telling === false ? '' : `<p class="pw-note__count">${doelTelling(o)}</p>`}
      </article>`;
  }

  function wallSheet(dataset, opts) {
    const vision = dataset.meta && dataset.meta.vision;
    const groepen = dataset.themes.map((t) => ({
      theme: t,
      items: t.objectives.length ? t.objectives : [null],
      kop: `<p>${statusMark(t.status, 'theme', dataset)}${t.owner ? `<span>${H.escapeHtml(t.owner)}</span>` : ''}</p>`,
    }));
    const vellen = overVellen(groepen);
    return vellen.map((vel, nr) => tegels(opts, `
      <section class="sheet sheet--page sheet--wall">
        ${sheetHeader(dataset, `Thema's en doelen${volgnummer(nr, vellen.length)}`, 'Waar we naartoe werken, en hoe het ervoor staat', opts)}
        <div class="sheet__body pw-wall">
          ${vision && nr === 0 ? `<div class="pw-vision"><span>Visie</span><p>${H.escapeHtml(vision)}</p></div>` : ''}
          <div class="pw-board">
            ${vel.map((blok) => themaBlok(dataset, blok, (o, i) => (o ? doelBriefje(dataset, o, i) : '<p class="pw-note pw-note--gap">Nog geen doelen</p>'))).join('')}
          </div>
        </div>
        ${legend(dataset)}
      </section>`)).join('');
  }

  function projectBriefje(dataset, p) {
    return `
      <article class="pw-note pw-note--project">
        <h4 class="pw-note__title">${H.escapeHtml(p.name)}</h4>
        <p class="pw-note__meta">${statusMark(p.status, 'project', dataset)}${p.owner ? `<span>${H.escapeHtml(p.owner)}</span>` : ''}${p.periodYear ? `<span>${H.escapeHtml(ObeyaData.formatPeriod(p.periodYear, p.periodQuarter))}</span>` : ''}</p>
      </article>`;
  }

  // Per thema: elk doel een kolom, het doelbriefje bovenaan en de projecten
  // eronder. Past een doel niet in één kolom, dan "+ n projecten (in de app)".
  function themeWallSheets(dataset, opts) {
    const themes = opts.themeId ? dataset.themes.filter((t) => t.id === opts.themeId) : dataset.themes;
    const vellen = [];
    themes.forEach((t) => {
      const kolommen = (t.objectives.length ? t.objectives : [null]).map((o) => {
        if (!o) return ['<p class="pw-note pw-note--gap">Nog geen doelen</p>'];
        const ruimte = RIJEN - 1;
        const passend = o.projects.length <= ruimte ? o.projects : o.projects.slice(0, ruimte - 1);
        const meer = o.projects.length - passend.length;
        return [
          doelBriefje(dataset, o, 1),
          ...passend.map((p) => projectBriefje(dataset, p)),
          ...(meer > 0 ? [`<p class="pw-note pw-note--gap">+ ${meer} project${meer === 1 ? '' : 'en'} (in de app)</p>`] : []),
          ...(o.projects.length ? [] : ['<p class="pw-note pw-note--gap">Nog geen project</p>']),
        ];
      });
      const stukken = [];
      for (let i = 0; i < kolommen.length; i += KOLOMMEN) stukken.push(kolommen.slice(i, i + KOLOMMEN));
      stukken.forEach((deel, nr) => {
        vellen.push(tegels(opts, `
          <section class="sheet sheet--page sheet--wall sheet--theme-wall" style="${themeStyle(t)}">
            ${sheetHeader(dataset, `${t.name}${volgnummer(nr, stukken.length)}`, `${statusMark(t.status, 'theme', dataset)}${t.owner ? ` · eigenaar ${H.escapeHtml(t.owner)}` : ''} · doelen en de projecten die eraan werken`, opts)}
            <div class="sheet__body pw-wall pw-wall--theme">
              <div class="pw-grid">
                ${deel.map((kolom) => `<div class="pw-col">${kolom.join('')}</div>`).join('')}
              </div>
            </div>
            ${legend(dataset)}
          </section>`));
      });
    });
    return vellen.join('');
  }

  // --- de muur met meetbare resultaten (idee 80, punt 1) ----------------------
  // Muur 2 uit het stuk "De Obeya-kamer": halen we het? Nog zonder grafiek,
  // want de app bewaart geen metingen; wel een vak om de stand bij te
  // schrijven, zodat de muur elke maand bij te houden is (advies Obeya-coach,
  // 8 november 2026).

  // Wat afwijkt, valt op: buiten koers en aandacht nodig met een dikke rand
  // in de statuskleur, niet beoordeeld met een gestippelde (geen feiten is ook
  // een afwijking). Het statuswoord blijft staan (review Obeya-coach).
  const AFWIJKING = { red: true, amber: true, grey: true };

  // Hoe oud de stand uit de app is bij het afdrukken. Vanaf twee weken een
  // regel op het vel, zodat de zaal weet dat de stand bijgeschreven moet.
  function standLeeftijd(dataset, opts) {
    const peil = dataset.meta && dataset.meta.lastUpdated;
    if (!peil) return '';
    const dagen = Math.floor((new Date(opts.date || today()) - new Date(String(peil).slice(0, 10))) / 86400000);
    return dagen >= 14 ? `<p class="pw-stale">De stand uit de app is van ${H.escapeHtml(H.formatDate(peil))}, ${dagen} dagen voor het afdrukken. Schrijf de actuele stand bij.</p>` : '';
  }

  // Het doel staat bovenaan het kaartje, in twee regels; is de titel van het
  // resultaat zelf al twee regels lang, dan in één, zodat alles past.
  const LANGE_TITEL = 36;

  function resultaatKaart(dataset, m, doel) {
    const laat = ObeyaData.isLate(m);
    const periode = m.periodYear ? ObeyaData.formatPeriod(m.periodYear, m.periodQuarter) : '';
    return `
      <article class="pw-note pw-note--result${AFWIJKING[m.status] ? ` pw-result--${m.status}` : ''}">
        <p class="pw-result__goal${String(m.name).length > LANGE_TITEL ? ' pw-result__goal--kort' : ''}">${H.escapeHtml(doel.title)}</p>
        <h4 class="pw-note__title">${H.escapeHtml(m.name)}</h4>
        <p class="pw-result__done">${m.doneCriterion ? `<span>Klaar als</span> ${H.escapeHtml(m.doneCriterion)}` : '<span>Klaar als</span> <em class="pw-noowner">nog niet ingevuld</em>'}</p>
        <p class="pw-note__meta">${statusMark(m.status, 'measurableResult', dataset)}${laat ? '<strong class="pw-late">⏰ te laat</strong>' : ''}${m.owner ? `<span>${H.escapeHtml(m.owner)}</span>` : '<span class="pw-noowner">geen eigenaar</span>'}${periode ? `<span>streef ${H.escapeHtml(periode)}</span>` : ''}</p>
        ${ObeyaData.valueText(m)
    ? `<p class="pw-result__now">Stand${m.valueDate ? ` op ${H.escapeHtml(ObeyaData.korteDatum(m.valueDate))}` : ''}: ${H.escapeHtml(ObeyaData.valueText(m, { noDate: true }))}</p>`
    : (m.monitoringText ? `<p class="pw-result__now">Laatst bekend (datum onbekend): ${H.escapeHtml(m.monitoringText)}</p>` : '')}
        <p class="pw-result__write">Stand op <span class="pw-line pw-line--short"></span> : <span class="pw-line"></span></p>
      </article>`;
  }

  // Per thema de resultaten; elk kaartje noemt zijn doel bovenaan, zodat alle
  // kaartjes even groot blijven. Een doel zonder resultaat is een gestippeld
  // kaartje: een gat in de keten.
  function resultsSheet(dataset, opts) {
    const groepen = dataset.themes.map((t) => ({
      theme: t,
      items: t.objectives.flatMap((o) => (o.measurableResults.length ? o.measurableResults.map((m) => ({ m, o })) : [{ o }])),
    }));
    const vellen = overVellen(groepen);
    const kaart = (item) => {
      if (!item) return '<p class="pw-note pw-note--gap">Nog geen doelen</p>';
      if (!item.m) return `<div class="pw-note pw-note--gap"><p class="pw-result__goal">${H.escapeHtml(item.o.title)}</p><p>Nog geen meetbaar resultaat</p></div>`;
      return resultaatKaart(dataset, item.m, item.o);
    };
    return vellen.map((vel, nr) => tegels(opts, `
      <section class="sheet sheet--page sheet--wall sheet--results">
        ${sheetHeader(dataset, `Meetbare resultaten${volgnummer(nr, vellen.length)}`, 'Halen we het? Per doel wanneer het klaar is, hoe het ervoor staat, en ruimte om de stand bij te schrijven', opts)}
        ${nr === 0 ? standLeeftijd(dataset, opts) : ''}
        <div class="sheet__body pw-wall">
          <div class="pw-board">
            ${vel.map((blok) => themaBlok(dataset, blok, kaart)).join('')}
          </div>
        </div>
        ${legend(dataset)}
      </section>`)).join('');
  }

  // Wat aandacht vraagt: rood of aandacht nodig, plus wat iemand voor
  // bespreking heeft gemarkeerd. Rood eerst.
  function sessionItems(dataset) {
    const items = [];
    const seen = new Set();
    const add = (type, entity) => {
      if (seen.has(entity.id)) return;
      seen.add(entity.id);
      const info = ObeyaData.describeItem(dataset, entity.id);
      items.push({ type, entity, info });
    };
    const aandacht = (s) => s === 'red' || s === 'amber';
    ObeyaData.allMeasurableResults(dataset).forEach((m) => { if (aandacht(m.status)) add('measurableResult', m); });
    ObeyaData.allProjects(dataset).forEach((p) => { if (aandacht(p.status)) add('project', p); });
    ObeyaData.allActions(dataset).forEach((a) => { if (aandacht(a.status)) add('action', a); });
    ObeyaData.allFlaggedItems(dataset).forEach(({ type, entity }) => add(type, entity));
    const rang = { red: 0, amber: 1 };
    return items.sort((a, b) => (rang[a.entity.status] ?? 2) - (rang[b.entity.status] ?? 2));
  }

  const TYPE_LABEL = { theme: 'Thema', objective: 'Doel', measurableResult: 'Meetbaar resultaat', project: 'Project', action: 'Actie' };

  function contextOf(info) {
    if (!info) return '';
    const bits = [];
    if (info.theme) bits.push(info.theme.name);
    if (info.objective && info.type !== 'objective') bits.push(info.objective.title);
    return bits.join(' › ');
  }

  function emptyRows(n, cols) {
    return Array.from({ length: n }, () => `<tr class="pt-empty">${'<td></td>'.repeat(cols)}</tr>`).join('');
  }

  function sessionSheet(dataset, opts) {
    const items = sessionItems(dataset);
    return `
      <section class="sheet sheet--flow sheet--session">
        ${sheetHeader(dataset, 'Sessievel: afwijkingen en tegenmaatregelen', 'Wat wijkt af? Wat doen we eraan, wie, en wanneer? Vul tijdens de sessie in.', opts)}
        <p class="pt-fields">Sessie op: <span class="pt-line"></span> Aanwezig: <span class="pt-line pt-line--long"></span></p>
        <table class="pt-table">
          <thead><tr>
            <th class="pt-col-item">Item</th><th>Eigenaar</th><th>Status</th>
            <th class="pt-col-write">Afwijking: wat zien we?</th><th class="pt-col-write">Tegenmaatregel</th><th>Wie</th><th>Wanneer</th>
          </tr></thead>
          <tbody>
            ${items.map(({ type, entity, info }) => `
              <tr>
                <td><span class="pt-type">${TYPE_LABEL[type] || type}</span> <strong>${H.escapeHtml(entity.name || entity.title || '')}</strong><br><span class="pt-context">${H.escapeHtml(contextOf(info))}</span></td>
                <td>${H.escapeHtml(entity.owner || '')}</td>
                <td>${statusMark(entity.status, type, dataset)}${entity.flaggedForDiscussion ? '<br><span class="pt-context">gemarkeerd voor bespreking</span>' : ''}</td>
                <td></td><td></td><td></td><td></td>
              </tr>`).join('')}
            ${emptyRows(8, 7)}
          </tbody>
        </table>
        <p class="pt-fields pt-processed"><span class="pt-box" aria-hidden="true"></span> Verwerkt in de app (besluiten als notitie, nieuwe acties, statussen) door <span class="pt-line"></span> op <span class="pt-line"></span></p>
        ${legend(dataset)}
      </section>`;
  }

  function actionsSheet(dataset, opts) {
    const vandaag = opts.date || today();
    const acties = [];
    dataset.themes.forEach((t) => t.objectives.forEach((o) => {
      o.projects.forEach((p) => (p.actions || []).forEach((a) => acties.push({ a, ctx: `${p.name} › ${o.title}` })));
      (o.actions || []).forEach((a) => acties.push({ a, ctx: o.title }));
    }));
    acties.sort((x, y) => (x.a.dueDate || '9999').localeCompare(y.a.dueDate || '9999'));
    const klaar = (s) => s === 'done' || s === 'green';
    return `
      <section class="sheet sheet--flow sheet--actions">
        ${sheetHeader(dataset, 'Actielijst', 'Alle acties, vroegste deadline eerst. Vink af wat klaar is; schrijf erbij wat er veranderd is.', opts)}
        <table class="pt-table">
          <thead><tr>
            <th class="pt-col-check" aria-label="Klaar"></th><th class="pt-col-item">Actie</th><th>Hoort bij</th><th>Eigenaar</th><th>Deadline</th><th>Status</th><th class="pt-col-write">Update</th>
          </tr></thead>
          <tbody>
            ${acties.map(({ a, ctx }) => {
              const verlopen = a.dueDate && a.dueDate < vandaag && !klaar(a.status);
              return `
              <tr>
                <td class="pt-col-check"><span class="pt-box">${klaar(a.status) ? '✔' : ''}</span></td>
                <td><strong>${H.escapeHtml(a.title)}</strong></td>
                <td class="pt-context">${H.escapeHtml(ctx)}</td>
                <td>${H.escapeHtml(a.owner || '')}</td>
                <td>${a.dueDate ? H.escapeHtml(H.formatDate(a.dueDate)) : ''}${verlopen ? '<br><strong class="pt-late">verlopen</strong>' : ''}</td>
                <td>${statusMark(a.status, 'action', dataset)}</td>
                <td></td>
              </tr>`;
            }).join('')}
            ${emptyRows(8, 7)}
          </tbody>
        </table>
        ${legend(dataset)}
      </section>`;
  }

  // opts: { sheets: ['wall', 'results', 'themeWall', 'session', 'actions'], format, themeId, date }
  function render(dataset, opts) {
    const o = opts || {};
    const naam = o.format && FORMATS[o.format] ? o.format : 'A1';
    const fmt = FORMATS[naam];
    const gekozen = (o.sheets && o.sheets.length ? o.sheets : Object.keys(SHEETS)).filter((s) => SHEETS[s]);
    const maak = (s, opts2) => ({ wall: wallSheet, results: resultsSheet, themeWall: themeWallSheets, session: sessionSheet, actions: actionsSheet })[s](dataset, opts2);
    const doc = (f, dataFormat, inhoud, klasse) => `<div class="print-doc${klasse || ''}" data-format="${dataFormat}" style="--k:${f.k};--page-w:${f.w - 2 * f.margin}mm;--page-h:${f.h - 2 * f.margin}mm">${inhoud}</div>`;
    if (!fmt.tegels) return doc(fmt, naam, gekozen.map((s) => maak(s, o)).join(''));
    // Mozaïek: de muurvellen op A1-maat in vier delen, de rest gewoon op het papier.
    const papier = FORMATS[fmt.tegels];
    const groot = gekozen.filter((s) => MUURVELLEN.includes(s)).map((s) => maak(s, { ...o, tegels: tegelMaat(fmt, papier) })).join('');
    const klein = gekozen.filter((s) => !MUURVELLEN.includes(s)).map((s) => maak(s, o)).join('');
    return (groot ? doc(fmt, naam, groot, ' print-doc--tiles') : '') + (klein ? doc(papier, fmt.tegels, klein) : '');
  }

  function pageCss(format) {
    const gekozen = FORMATS[format] || FORMATS.A1;
    const fmt = gekozen.tegels ? FORMATS[gekozen.tegels] : gekozen;
    return `@page { size: ${fmt.w}mm ${fmt.h}mm; margin: ${fmt.margin}mm; }`;
  }

  // --- in de browser --------------------------------------------------------

  // Zet de vellen klaar in #print-root (buiten #app, zodat opnieuw renderen ze
  // niet weggooit). Er wordt niets geschaald: de kaartjes hebben een vaste maat.
  // pageCssText: een eigen paginaformaat, zoals de dia's van js/deck.js.
  function prepare(html, format, pageCssText) {
    cleanup();
    const style = document.createElement('style');
    style.id = 'print-page-size';
    style.textContent = pageCssText || pageCss(format);
    document.head.appendChild(style);
    const rootEl = document.createElement('div');
    rootEl.id = 'print-root';
    rootEl.innerHTML = html;
    document.body.appendChild(rootEl);
    document.body.classList.add('is-printing');

    return rootEl;
  }

  function cleanup() {
    const oud = document.getElementById('print-root');
    if (oud) oud.remove();
    const style = document.getElementById('print-page-size');
    if (style) style.remove();
    document.body.classList.remove('is-printing');
  }

  return { render, pageCss, prepare, cleanup, tegelMaat, FORMATS, SHEETS, sessionItems, statusMark, statusText, inkOn };
})();
