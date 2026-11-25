// js/deck-pptx.js
// Het teamplan als PowerPoint (idee 61): dezelfde dia's als de PDF van
// js/deck.js (titel, waarom, richting, per thema, wat aandacht vraagt), maar
// bewerkbaar. Gebouwd met PptxGenJS (vendor/pptxgen.bundle.js, zie
// vendor/README.md); die wordt pas geladen als iemand een PowerPoint maakt.
// build() krijgt het PptxGenJS-object mee, zodat het zonder browser te testen
// is.

const ObeyaDeckPptx = (function () {
  'use strict';

  const D = ObeyaDeck;
  const P = ObeyaPrint;

  const W = 13.333; // breedbeeld, inch
  const H = 7.5;
  const M = 0.6;
  const DONKER = '14263A';
  const GRIJS = '5A6672';
  const FONT = 'Calibri';
  const hex = (c) => String(c || '#234559').replace('#', '').toUpperCase();

  function voet(slide, dataset, nummer, opLicht) {
    const meta = dataset.meta || {};
    const kleur = opLicht ? 'B8C4D0' : GRIJS;
    slide.addText(`${meta.name || 'Obeya'} · Teamplan`, { x: M, y: H - 0.5, w: 7, h: 0.3, fontSize: 10, color: kleur, fontFace: FONT });
    slide.addText(`${meta.lastUpdated ? `Peildatum ${ObeyaUI.formatDate(meta.lastUpdated)} · ` : ''}${nummer}`, { x: W - M - 4, y: H - 0.5, w: 4, h: 0.3, fontSize: 10, color: kleur, align: 'right', fontFace: FONT });
  }

  function kop(slide, tekst) {
    slide.addText(tekst, { x: M, y: 0.4, w: W - 2 * M, h: 0.8, fontSize: 30, bold: true, color: DONKER, fontFace: FONT });
  }

  function build(pptx, dataset) {
    pptx.layout = 'LAYOUT_WIDE';
    const meta = dataset.meta || {};
    const plan = ObeyaData.teamPlan(dataset);
    let n = 0;
    const nieuw = () => { n += 1; return pptx.addSlide(); };

    // 1. Titel
    let s = nieuw();
    s.background = { color: DONKER };
    s.addText('TEAMPLAN', { x: M, y: 2.2, w: 8, h: 0.5, fontSize: 18, color: 'B8C4D0', charSpacing: 6, fontFace: FONT });
    s.addText(meta.name || 'Obeya', { x: M, y: 2.7, w: W - 2 * M, h: 1.2, fontSize: 44, bold: true, color: 'FFFFFF', fontFace: 'Georgia' });
    s.addText(`${plan.themes.length} thema's · ${plan.themes.reduce((t, x) => t + x.objectives.length, 0)} doelen · ${plan.count} deelproducten en projecten in het teamplan`, { x: M, y: 3.9, w: W - 2 * M, h: 0.5, fontSize: 18, color: 'DFE6EC', fontFace: FONT });
    voet(s, dataset, n, true);

    // 2. Waarom
    s = nieuw();
    kop(s, 'Waarom');
    if (meta.vision) s.addText(meta.vision, { x: M, y: 1.4, w: W - 2 * M, h: 1.4, fontSize: 20, color: '2B3A48', fontFace: FONT, valign: 'top' });
    const principes = ObeyaData.getPrinciples(dataset);
    const doelen = plan.themes.flatMap((t) => t.objectives.map((o) => o.objective));
    const breed = (W - 2 * M - 0.4 * (Math.max(principes.length, 1) - 1)) / Math.max(principes.length, 1);
    principes.forEach((p, i) => {
      const x = M + i * (breed + 0.4);
      const aantal = doelen.filter((o) => ObeyaData.objectivePrinciples(o).has(p.id)).length;
      s.addShape(pptx.ShapeType.rect, { x, y: 3.1, w: breed, h: 2.2, fill: { color: 'F4F2EC' }, line: { color: 'F4F2EC' } });
      s.addText([
        { text: p.name, options: { fontSize: 20, bold: true, color: DONKER, breakLine: true } },
        { text: p.description || '', options: { fontSize: 13, color: '2B3A48', breakLine: true } },
        { text: `${aantal} doel${aantal === 1 ? '' : 'en'} in het teamplan`, options: { fontSize: 12, color: GRIJS } },
      ], { x: x + 0.15, y: 3.2, w: breed - 0.3, h: 2, valign: 'top', fontFace: FONT });
    });
    voet(s, dataset, n);

    if (!plan.count) {
      s = nieuw();
      kop(s, 'Teamplan');
      s.addText('Er staat nog niets in het teamplan. Zet bij meetbare resultaten en projecten het vinkje "In teamplan".', { x: M, y: 1.5, w: W - 2 * M, h: 1, fontSize: 18, color: GRIJS, fontFace: FONT });
      voet(s, dataset, n);
      return pptx;
    }

    // 3. Richting
    s = nieuw();
    kop(s, 'Richting in één oogopslag');
    const kol = (W - 2 * M - 0.3 * (plan.themes.length - 1)) / plan.themes.length;
    plan.themes.forEach(({ theme, objectives }, i) => {
      const x = M + i * (kol + 0.3);
      const kleur = ObeyaData.themeColor(theme);
      s.addShape(pptx.ShapeType.rect, { x, y: 1.4, w: kol, h: 0.7, fill: { color: hex(kleur) }, line: { color: hex(kleur) } });
      s.addText(theme.name, { x: x + 0.1, y: 1.4, w: kol - 0.2, h: 0.7, fontSize: 14, bold: true, color: hex(P.inkOn(kleur)), fontFace: FONT, valign: 'middle' });
      s.addText(objectives.flatMap(({ objective }) => [
        { text: objective.title, options: { fontSize: 12, color: '111111', breakLine: true } },
        { text: P.statusText(objective.status, 'objective', dataset), options: { fontSize: 11, bold: true, color: GRIJS, breakLine: true, paraSpaceAfter: 6 } },
      ]), { x, y: 2.2, w: kol, h: 4.4, valign: 'top', fontFace: FONT });
    });
    voet(s, dataset, n);

    // 4. Per thema
    plan.themes.forEach(({ theme, objectives }) => {
      const stukken = D.themaStukken(objectives);
      stukken.forEach((stuk, i) => {
        s = nieuw();
        const kleur = ObeyaData.themeColor(theme);
        s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: W, h: 0.15, fill: { color: hex(kleur) }, line: { color: hex(kleur) } });
        kop(s, `${theme.name}${stukken.length > 1 ? ` (${i + 1}/${stukken.length})` : ''}`);
        const rijen = [];
        stuk.forEach(({ objective, results, projects }) => {
          rijen.push([
            { text: objective.title, options: { bold: true, colspan: 2, fill: { color: 'EEF1F3' } } },
            { text: P.statusText(objective.status, 'objective', dataset), options: { bold: true, fill: { color: 'EEF1F3' } } },
            { text: objective.owner || 'geen eigenaar', options: { fill: { color: 'EEF1F3' } } },
          ]);
          results.forEach((m) => rijen.push([
            'Deelproduct',
            `${m.name}${m.doneCriterion ? `\nKlaar als: ${m.doneCriterion}` : ''}`,
            `${P.statusText(m.status, 'measurableResult', dataset)}${ObeyaData.isLate(m) ? ' · ⏰ te laat' : ''}`,
            m.periodYear ? ObeyaData.formatPeriod(m.periodYear, m.periodQuarter) : (m.owner || ''),
          ]));
          projects.slice(0, D.PROJECTEN_PER_DOEL).forEach((p) => rijen.push(['Project', p.name, P.statusText(p.status, 'project', dataset), p.owner || '']));
          const meer = projects.length - D.PROJECTEN_PER_DOEL;
          if (meer > 0) rijen.push(['', `+ ${meer} project${meer === 1 ? '' : 'en'} in het teamplan`, '', '']);
        });
        s.addTable(rijen, { x: M, y: 1.35, w: W - 2 * M, colW: [1.5, 6.6, 2.5, 1.53], fontSize: 13, fontFace: FONT, color: '111111', border: { type: 'solid', pt: 0.5, color: 'D5DBE0' }, valign: 'middle', autoPage: false });
        voet(s, dataset, n);
      });
    });

    // 5. Wat aandacht vraagt
    s = nieuw();
    kop(s, 'Wat aandacht vraagt');
    const items = D.aandachtItems(dataset, plan);
    if (items.length) {
      s.addTable([
        ['Wat', 'Status', 'Eigenaar', 'Toelichting'].map((t) => ({ text: t, options: { bold: true, color: GRIJS, fill: { color: 'EEF1F3' } } })),
        ...items.map((it) => [it.item.name, `${P.statusText(it.item.status, it.type, dataset)}${it.laat ? ' · ⏰ te laat' : ''}`, it.item.owner || '', it.reden || '']),
      ], { x: M, y: 1.35, w: W - 2 * M, colW: [4.6, 2.8, 1.8, 2.93], fontSize: 13, fontFace: FONT, color: '111111', border: { type: 'solid', pt: 0.5, color: 'D5DBE0' }, autoPage: false });
    } else {
      s.addText('Niets in het teamplan staat op aandacht nodig, buiten koers of te laat.', { x: M, y: 1.5, w: W - 2 * M, h: 1, fontSize: 18, color: GRIJS, fontFace: FONT });
    }
    voet(s, dataset, n);
    return pptx;
  }

  // PptxGenJS pas laden als het nodig is (scheelt ~470 kB bij elke start).
  function laadBibliotheek() {
    if (typeof PptxGenJS !== 'undefined') return Promise.resolve();
    return new Promise((resolve, reject) => {
      const el = document.createElement('script');
      el.src = 'vendor/pptxgen.bundle.js';
      el.onload = () => resolve();
      el.onerror = () => reject(new Error('PptxGenJS kon niet worden geladen'));
      document.head.appendChild(el);
    });
  }

  async function download(dataset) {
    await laadBibliotheek();
    // eslint-disable-next-line no-undef
    const pptx = build(new PptxGenJS(), dataset);
    const naam = `${(dataset.meta && dataset.meta.name) || 'Obeya'} - Teamplan ${new Date().toISOString().slice(0, 10)}`.replace(/[\\/:*?"<>|]/g, '-');
    await pptx.writeFile({ fileName: `${naam}.pptx` });
  }

  return { build, download };
})();
