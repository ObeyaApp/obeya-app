// js/deck.js
// Het teamplan als presentatie (idee 61): dia's in breedbeeld (16:9), uit
// dezelfde data als het bord. De browser maakt er via "Afdrukken → Opslaan
// als PDF" een PDF van, net als de muurvellen (js/print.js). Indeling op
// advies van de product owner (20 oktober 2026): titel, waarom (visie en
// principes), richting (thema's en doelen), per thema de doelen met hun
// deelproducten en projecten, en tot slot wat aandacht vraagt. Alleen wat in
// het teamplan staat; geen acties, notities of betrokkenen. Status altijd als
// symbool én tekst, en de peildatum op elke dia.

const ObeyaDeck = (function () {
  'use strict';

  const H = ObeyaUI;
  const P = ObeyaPrint;

  const REGELS_PER_DIA = 10; // een doel telt als één regel, elk deelproduct en project ook
  const PROJECTEN_PER_DOEL = 3;

  const esc = (s) => H.escapeHtml(s == null ? '' : String(s));

  function voet(dataset, nummer) {
    const meta = dataset.meta || {};
    return `
      <footer class="slide__foot">
        <span>${esc(meta.name || 'Obeya')} · Teamplan</span>
        <span>${meta.lastUpdated ? `Peildatum ${esc(H.formatDate(meta.lastUpdated))} · ` : ''}${nummer}</span>
      </footer>`;
  }

  function dia(dataset, nummer, inhoud, extraClass, stijl) {
    return `<section class="sheet slide${extraClass ? ` ${extraClass}` : ''}"${stijl ? ` style="${stijl}"` : ''}>${inhoud}${voet(dataset, nummer)}</section>`;
  }

  function titelDia(dataset, plan) {
    const meta = dataset.meta || {};
    return `
      <div class="slide__title-block">
        <p class="slide__kicker">Teamplan</p>
        <h1 class="slide__title">${esc(meta.name || 'Obeya')}</h1>
        <p class="slide__sub">${plan.themes.length} thema's · ${plan.themes.reduce((n, t) => n + t.objectives.length, 0)} doelen · ${plan.count} deelproducten en projecten in het teamplan</p>
      </div>`;
  }

  function waaromDia(dataset, plan) {
    const meta = dataset.meta || {};
    const principes = ObeyaData.getPrinciples(dataset);
    const doelen = plan.themes.flatMap((t) => t.objectives.map((o) => o.objective));
    return `
      <h2 class="slide__heading">Waarom</h2>
      ${meta.vision ? `<blockquote class="slide__vision">${esc(meta.vision)}</blockquote>` : ''}
      ${principes.length ? `
      <ul class="slide__principles">
        ${principes.map((p) => {
          const n = doelen.filter((o) => ObeyaData.objectivePrinciples(o).has(p.id)).length;
          return `<li><strong>${esc(p.name)}</strong>${p.description ? `<span>${esc(p.description)}</span>` : ''}<em>${n} doel${n === 1 ? '' : 'en'} in het teamplan</em></li>`;
        }).join('')}
      </ul>` : ''}`;
  }

  function richtingDia(dataset, plan) {
    return `
      <h2 class="slide__heading">Richting in één oogopslag</h2>
      <div class="slide__themes" style="grid-template-columns:repeat(${Math.max(1, plan.themes.length)}, minmax(0, 1fr))">
        ${plan.themes.map(({ theme, objectives }) => `
          <section class="slide__theme" style="--theme-color:${esc(ObeyaData.themeColor(theme))};--theme-ink:${P.inkOn(ObeyaData.themeColor(theme))}">
            <h3>${esc(theme.name)}</h3>
            <ul>${objectives.map(({ objective }) => `<li><span>${esc(objective.title)}</span>${P.statusMark(objective.status, 'objective', dataset)}</li>`).join('')}</ul>
          </section>`).join('')}
      </div>`;
  }

  // Per thema de doelen, in stukken van hooguit REGELS_PER_DIA regels.
  function themaStukken(objectives) {
    const stukken = [[]];
    let regels = 0;
    objectives.forEach((o) => {
      const n = 1 + o.results.length + Math.min(o.projects.length, PROJECTEN_PER_DOEL) + (o.projects.length > PROJECTEN_PER_DOEL ? 1 : 0);
      if (regels > 0 && regels + n > REGELS_PER_DIA) { stukken.push([]); regels = 0; }
      stukken[stukken.length - 1].push(o);
      regels += n;
    });
    return stukken;
  }

  function doelBlok(dataset, { objective, results, projects }) {
    const zichtbaar = projects.slice(0, PROJECTEN_PER_DOEL);
    return `
      <article class="slide__goal">
        <header><h3>${esc(objective.title)}</h3><span class="slide__meta">${P.statusMark(objective.status, 'objective', dataset)}${objective.owner ? `<span>${esc(objective.owner)}</span>` : '<span class="slide__noowner">geen eigenaar</span>'}</span></header>
        <ul>
          ${results.map((m) => `<li class="slide__item"><span class="slide__type">Deelproduct</span><span class="slide__name">${esc(m.name)}${m.doneCriterion ? `<small>Klaar als: ${esc(m.doneCriterion)}</small>` : ''}</span><span class="slide__meta">${P.statusMark(m.status, 'measurableResult', dataset)}${m.periodYear ? `<span>${esc(ObeyaData.formatPeriod(m.periodYear, m.periodQuarter))}</span>` : ''}${ObeyaData.isLate(m) ? '<strong class="slide__late">⏰ te laat</strong>' : ''}</span></li>`).join('')}
          ${zichtbaar.map((p) => `<li class="slide__item"><span class="slide__type">Project</span><span class="slide__name">${esc(p.name)}</span><span class="slide__meta">${P.statusMark(p.status, 'project', dataset)}${p.owner ? `<span>${esc(p.owner)}</span>` : ''}</span></li>`).join('')}
          ${projects.length > zichtbaar.length ? `<li class="slide__item slide__more"><span></span><span>+ ${projects.length - zichtbaar.length} project${projects.length - zichtbaar.length === 1 ? '' : 'en'} in het teamplan</span><span></span></li>` : ''}
        </ul>
      </article>`;
  }

  // Wat aandacht vraagt: amber, rood of te laat, binnen het teamplan, met de
  // laatste notitie bij het item als toelichting.
  function aandachtItems(dataset, plan) {
    const uit = [];
    plan.themes.forEach(({ theme, objectives }) => objectives.forEach(({ objective, results, projects }) => {
      [...results.map((x) => ['measurableResult', x]), ...projects.map((x) => ['project', x])].forEach(([type, x]) => {
        const laat = type === 'measurableResult' && ObeyaData.isLate(x);
        if (x.status !== 'red' && x.status !== 'amber' && !laat) return;
        const notities = (objective.notes || []).filter((n) => n.relatedItemId === x.id).sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
        uit.push({ theme, type, item: x, laat, reden: notities[0] ? notities[0].text : '' });
      });
    }));
    const gewicht = (i) => (i.item.status === 'red' ? 0 : i.laat ? 1 : 2);
    return uit.sort((a, b) => gewicht(a) - gewicht(b));
  }

  function aandachtDia(dataset, items) {
    return `
      <h2 class="slide__heading">Wat aandacht vraagt</h2>
      ${items.length ? `
      <table class="slide__table">
        <thead><tr><th>Wat</th><th>Status</th><th>Eigenaar</th><th>Toelichting</th></tr></thead>
        <tbody>${items.map((i) => `
          <tr>
            <td><span class="slide__swatch" style="background:${esc(ObeyaData.themeColor(i.theme))}" aria-hidden="true"></span>${esc(i.item.name)}</td>
            <td>${P.statusMark(i.item.status, i.type, dataset)}${i.laat ? ' <strong class="slide__late">⏰ te laat</strong>' : ''}</td>
            <td>${esc(i.item.owner || '')}</td>
            <td>${esc(i.reden)}</td>
          </tr>`).join('')}</tbody>
      </table>` : '<p class="slide__empty">Niets in het teamplan staat op aandacht nodig, buiten koers of te laat.</p>'}`;
  }

  // 16:9 in millimeters, zoals een breedbeeld-dia in PowerPoint (13,33 × 7,5 inch).
  const PAGE = { w: 338.67, h: 190.5 };

  function render(dataset) {
    const plan = ObeyaData.teamPlan(dataset);
    const dias = [];
    const nr = () => dias.length + 1;
    dias.push(dia(dataset, nr(), titelDia(dataset, plan), 'slide--title'));
    dias.push(dia(dataset, nr(), waaromDia(dataset, plan)));
    if (!plan.count) {
      dias.push(dia(dataset, nr(), '<h2 class="slide__heading">Teamplan</h2><p class="slide__empty">Er staat nog niets in het teamplan. Zet bij meetbare resultaten en projecten het vinkje "In teamplan".</p>'));
    } else {
      dias.push(dia(dataset, nr(), richtingDia(dataset, plan)));
      plan.themes.forEach(({ theme, objectives }) => {
        const stukken = themaStukken(objectives);
        stukken.forEach((stuk, i) => {
          const kleur = ObeyaData.themeColor(theme);
          dias.push(dia(dataset, nr(), `
            <h2 class="slide__heading slide__heading--theme">${esc(theme.name)}${stukken.length > 1 ? ` <span>(${i + 1}/${stukken.length})</span>` : ''}</h2>
            <div class="slide__goals">${stuk.map((o) => doelBlok(dataset, o)).join('')}</div>`, 'slide--theme', `--theme-color:${esc(kleur)};--theme-ink:${P.inkOn(kleur)}`));
        });
      });
      dias.push(dia(dataset, nr(), aandachtDia(dataset, aandachtItems(dataset, plan))));
    }
    return `<div class="print-doc deck" data-format="DECK" style="--k:0.9;--page-w:${PAGE.w}mm;--page-h:${PAGE.h}mm">${dias.join('')}</div>`;
  }

  function pageCss() {
    return `@page { size: ${PAGE.w}mm ${PAGE.h}mm; margin: 0; }`;
  }

  return { render, pageCss, aandachtItems, themaStukken, PROJECTEN_PER_DOEL };
})();
