// js/canvas.js
// Weergave "Samenhang": het bord als canvas, om te zien hoe alles met elkaar
// samenhangt in plaats van alleen hoe het ervoor staat. Zie
// docs/canvas-voorstel.md (idee 50).
//
// Twee lenzen:
//   - strategisch: visie, thema's en doelen, met de meetbare resultaten binnen
//     hun doel en lijnen voor wat over doel- en themagrenzen heen loopt;
//   - operationeel: dezelfde doelkaarten als ankers, met de projecten en acties
//     eronder in banen, te groeperen op doel, thema, eigenaar of status, en een
//     lijn van elk stuk werk naar het resultaat waar het aan bijdraagt.
//
// Bewust een vaste, uitgerekende indeling en geen zwevend netwerk: dezelfde
// data geeft altijd hetzelfde plaatje, zoals een fysieke Obeya-muur waar
// thema 3 altijd op dezelfde plek hangt.
//
// De kaarten zijn gewone HTML (tekst loopt dan vanzelf goed af, en elke knop
// is met het toetsenbord bereikbaar). De lijnen tekent drawConnections() na
// het renderen als SVG eronder, op basis van de werkelijke posities.
// Het uitrekenen van koppelingen en ketens staat los van het tekenen en is
// in Node te testen (tests/canvas.test.js).

const ObeyaCanvas = (function () {
  'use strict';

  const H = ObeyaUI;
  const STATUS_LANE_ORDER = ['red', 'amber', 'blue', 'grey', 'green', 'done'];
  const GROUP_LABELS = { objective: 'Doel', theme: 'Thema', owner: 'Eigenaar', status: 'Status' };

  // --- model: wie hangt waaraan --------------------------------------------

  // Eén keer per render een index van de boom en de koppelingen: per item
  // zijn "omhoog" (waar het onder hangt of aan bijdraagt) en "omlaag" (wat
  // eronder hangt of eraan bijdraagt).
  function buildIndex(dataset) {
    const up = new Map();
    const down = new Map();
    const related = new Map();
    const add = (map, from, to) => {
      if (!map.has(from)) map.set(from, new Set());
      map.get(from).add(to);
    };
    const link = (child, parent) => { add(up, child, parent); add(down, parent, child); };
    const objectiveOf = new Map();
    const themeOf = new Map();

    dataset.themes.forEach((theme) => {
      theme.objectives.forEach((o) => {
        objectiveOf.set(o.id, o);
        themeOf.set(o.id, theme);
        const themeIds = new Set([theme.id, ...(o.themeIds || [])]);
        themeIds.forEach((tid) => link(o.id, tid));
        o.measurableResults.forEach((m) => { link(m.id, o.id); objectiveOf.set(m.id, o); themeOf.set(m.id, theme); });
        o.projects.forEach((p) => {
          link(p.id, o.id);
          objectiveOf.set(p.id, o); themeOf.set(p.id, theme);
          (p.measurableResultIds || []).forEach((mrId) => link(p.id, mrId));
          (p.actions || []).forEach((a) => {
            link(a.id, p.id);
            objectiveOf.set(a.id, o); themeOf.set(a.id, theme);
            if (a.measurableResultId) link(a.id, a.measurableResultId);
          });
        });
        (o.actions || []).forEach((a) => {
          link(a.id, o.id);
          objectiveOf.set(a.id, o); themeOf.set(a.id, theme);
          if (a.measurableResultId) link(a.id, a.measurableResultId);
        });
      });
    });
    ObeyaData.allRelations(dataset).forEach((r) => {
      if (r.type === 'contributes') link(r.from, r.to);
      else { add(related, r.from, r.to); add(related, r.to, r.from); }
    });
    return { up, down, related, objectiveOf, themeOf };
  }

  // De keten van een item: alles waar het onder hangt of aan bijdraagt
  // (omhoog, tot aan de thema's), alles wat eronder hangt of eraan bijdraagt
  // (omlaag), en de items waarmee het "samenhangt" (één stap opzij).
  function chain(dataset, id, index) {
    const idx = index || buildIndex(dataset);
    const out = new Set([id]);
    const walk = (start, map) => {
      const todo = [start];
      const seen = new Set([start]);
      while (todo.length) {
        const next = todo.pop();
        (map.get(next) || []).forEach((n) => {
          if (seen.has(n)) return;
          seen.add(n);
          out.add(n);
          todo.push(n);
        });
      }
    };
    walk(id, idx.up);
    walk(id, idx.down);
    (idx.related.get(id) || []).forEach((n) => out.add(n));
    return out;
  }

  // De meetbare resultaten waar een project of actie aan bijdraagt: via het
  // vinkjesveld binnen het eigen doel én via "draagt bij aan"-relaties naar
  // een resultaat elders.
  function workTargets(dataset, type, item) {
    const ids = new Set();
    if (type === 'project') (item.measurableResultIds || []).forEach((id) => ids.add(id));
    if (type === 'action' && item.measurableResultId) ids.add(item.measurableResultId);
    ObeyaData.outgoingContributions(dataset, item.id).forEach((r) => {
      if (ObeyaData.findMeasurableResult(dataset, r.to)) ids.add(r.to);
    });
    return Array.from(ids).filter((id) => ObeyaData.findMeasurableResult(dataset, id));
  }

  // Werkt er iets aan dit resultaat? Een project of actie via het vinkjesveld,
  // of iets van elders via een relatie.
  function mrHasWork(dataset, objective, mr) {
    const c = ObeyaData.contributingItems(objective, mr.id);
    return c.projects.length > 0 || c.actions.length > 0 || ObeyaData.incomingContributions(dataset, mr.id).length > 0;
  }

  // Verbanden tussen doelen voor de strategische lens: een relatie tussen twee
  // items in verschillende doelen wordt één lijn tussen die doelen. Plus een
  // lijn van een doel naar elk extra thema waar het ook bij hoort.
  function strategicLinks(dataset, visibleThemeIds, index) {
    const idx = index || buildIndex(dataset);
    const links = new Map();
    const add = (from, to, kind) => {
      const key = kind === 'related' ? [from, to].sort().join('|') + kind : `${from}|${to}|${kind}`;
      if (!links.has(key)) links.set(key, { from, to, kind });
    };
    dataset.themes.forEach((theme) => {
      theme.objectives.forEach((o) => {
        (o.themeIds || []).forEach((tid) => {
          if (tid !== theme.id && visibleThemeIds.has(tid)) add(o.id, tid, 'also-theme');
        });
      });
    });
    const objOf = (id) => {
      const o = idx.objectiveOf.get(id);
      if (o) return o;
      return ObeyaData.findObjective(dataset, id);
    };
    const projectLinks = [];
    ObeyaData.allProjects(dataset).forEach((p) => {
      workTargets(dataset, 'project', p).forEach((mrId) => projectLinks.push({ from: p.id, to: mrId, type: 'contributes' }));
    });
    [...ObeyaData.allRelations(dataset), ...projectLinks].forEach((r) => {
      const a = objOf(r.from);
      const b = objOf(r.to);
      if (!a || !b || a.id === b.id) return;
      add(a.id, b.id, r.type === 'related' ? 'related' : 'contributes');
    });
    return Array.from(links.values()).filter((l) => {
      const visible = (id) => {
        const t = idx.themeOf.get(id);
        return visibleThemeIds.has(id) || (t && visibleThemeIds.has(t.id));
      };
      return visible(l.from) && visible(l.to);
    });
  }

  // --- stukjes HTML -----------------------------------------------------------

  function nodeClass(id, chainSet) {
    if (!chainSet) return '';
    return chainSet.has(id) ? ' is-chain' : ' is-dimmed';
  }

  function focusButton(id, label, chainSet, focusId, extraClass, print) {
    if (print) return `<span class="cv-focus ${extraClass || ''}">${H.escapeHtml(label)}</span>`;
    const pressed = focusId === id;
    return `<button id="cvf-${H.escapeHtml(id)}" class="cv-focus ${extraClass || ''}" type="button" data-action="canvas-focus" data-id="${H.escapeHtml(id)}" aria-pressed="${pressed}" title="${pressed ? 'Lijn niet meer volgen' : 'Volg de lijn: laat zien waar dit mee samenhangt'}">${H.escapeHtml(label)}</button>`;
  }

  // In bulk wijzigen (idee 89): een vakje per meetbaar resultaat, project en
  // actie zolang "Selecteren" aan staat.
  function selectBox(type, id, name, ctx) {
    if (!ctx.selecting || ctx.print) return '';
    const sleutel = `${type}:${id}`;
    return `<label class="cv-select" title="Selecteren"><input type="checkbox" id="sel-${H.escapeHtml(type)}-${H.escapeHtml(id)}" data-canvas-select="${H.escapeHtml(sleutel)}" ${ctx.selected && ctx.selected.has(sleutel) ? 'checked' : ''}><span class="sr-only">Selecteer ${H.escapeHtml(name)}</span></label>`;
  }

  const BULK_STATUS_OPTIES = [
    ['done', 'Klaar'],
    ['blue', 'Bezig (project en actie)'],
    ['green', 'Op koers (meetbaar resultaat)'],
    ['amber', 'Aandacht nodig'],
    ['red', 'Buiten koers / geblokkeerd'],
    ['grey', 'Niet beoordeeld / nog niet opgepakt'],
  ];

  // De balk onderaan zolang er geselecteerd wordt: hoeveel, en wat je ermee doet.
  function bulkBar(dataset, ctx) {
    if (!ctx.selecting || ctx.print) return '';
    const n = ctx.selected ? ctx.selected.size : 0;
    const uit = n ? '' : ' disabled';
    return `
      <div class="bulk-bar" role="region" aria-label="Selectie">
        <button class="btn btn--primary btn--small" type="button" data-action="canvas-select-mode">Klaar</button>
        <strong class="bulk-bar__count">${n} geselecteerd</strong>
        <button class="btn btn--ghost btn--small" type="button" data-action="canvas-select-visible">Alles in beeld</button>
        <button class="btn btn--ghost btn--small" type="button" data-action="canvas-select-none"${uit}>Niets</button>
        <label class="bulk-bar__field">Status
          <select id="bulk-status" data-bulk="status"${uit}>
            <option value="">Kies…</option>
            ${BULK_STATUS_OPTIES.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}
          </select>
        </label>
        <label class="bulk-bar__field">Eigenaar
          <select id="bulk-owner" data-bulk="owner"${uit}>
            <option value="">Kies…</option>
            ${ObeyaData.getOwnerOptions(dataset).map((o) => `<option value="${H.escapeHtml(o)}">${H.escapeHtml(o)}</option>`).join('')}
            <option value="__geen__">Geen eigenaar</option>
          </select>
        </label>
        <button class="btn btn--ghost btn--small" type="button" data-action="bulk-flag" data-flag="on"${uit}>📌 Bespreken</button>
        <button class="btn btn--ghost btn--small" type="button" data-action="bulk-flag" data-flag="off"${uit}>Niet bespreken</button>
        <span class="bulk-bar__sep" aria-hidden="true"></span>
        <button class="btn btn--ghost btn--small bulk-bar__delete" type="button" data-action="bulk-delete"${uit}>Verwijderen</button>
        <span class="bulk-bar__notice" id="bulk-notice" aria-live="polite">${n || ctx.bulkNotice ? H.escapeHtml(ctx.bulkNotice || '') : 'Vink meetbare resultaten, projecten of acties aan, of klik op de kaart.'}${ctx.bulkUndo ? ' <button class="btn btn--ghost btn--small" type="button" data-action="bulk-undo">Ongedaan maken</button>' : ''}</span>
      </div>`;
  }

  function mrRow(dataset, objective, mr, ctx) {
    const geenWerk = !mrHasWork(dataset, objective, mr);
    return `
      <li class="cv-mr${geenWerk ? ' cv-mr--nowork' : ''}${nodeClass(mr.id, ctx.chainSet)}" data-node="${H.escapeHtml(mr.id)}">
        ${selectBox('measurableResult', mr.id, mr.name, ctx)}
        ${H.statusPill(mr.status, { compact: true, entityType: 'measurableResult', card: true })}
        ${focusButton(mr.id, mr.name, ctx.chainSet, ctx.focusId, 'cv-mr__name', ctx.print)}
        ${ObeyaData.valueText(mr) ? `<span class="cv-value" title="Stand: ${H.escapeHtml(ObeyaData.valueText(mr, { noDate: true }))}">${H.escapeHtml(ObeyaData.valueText(mr, { short: true }))}</span>` : ''}
        ${geenWerk ? '<span class="cv-tag cv-tag--gap">geen werk</span>' : ''}
        ${ctx.print && ObeyaData.deliverableSummary(mr) ? `<span class="cv-mr__value">${H.escapeHtml(ObeyaData.deliverableSummary(mr))}</span>` : ''}
      </li>`;
  }

  // --- de muur (lens Keten en het ketenvel) ----------------------------------

  // Een vaste, kleine scheefstand per briefje (-0,8° tot 0,8°), afgeleid van
  // het id: hetzelfde briefje hangt altijd even scheef, dus de muur blijft
  // rustig en herkenbaar.
  function tiltFor(id) {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 997;
    return ((h % 17) - 8) / 10;
  }

  // Kleur van het geeltje: per soort (instelbaar), per thema of wit.
  function stickyStyle(type, theme, id, ctx) {
    if (ctx.lens !== 'chain' || !ctx.display) return '';
    const d = ctx.display;
    let kleur = '#ffffff';
    if (d.stickyColors === 'type') kleur = d.typeColors[type] || kleur;
    if (d.stickyColors === 'theme') kleur = `color-mix(in srgb, ${ObeyaData.themeColor(theme)} 22%, #ffffff)`;
    const tilt = d.tilt && !ctx.print ? tiltFor(id) : 0;
    return `--sticky:${kleur};--tilt:${tilt}deg;`;
  }

  // Het detailniveau van één briefje: opengeklikt is altijd "detail".
  function levelOf(id, ctx) {
    if (ctx.lens !== 'chain') return 'standard';
    if (ctx.expanded && ctx.expanded.has(id)) return 'detail';
    return ctx.detail || 'standard';
  }

  function expandButton(id, ctx) {
    if (ctx.lens !== 'chain' || ctx.print) return '';
    const open = !!(ctx.expanded && ctx.expanded.has(id));
    return `<button class="cv-expand" type="button" data-action="canvas-expand" data-id="${H.escapeHtml(id)}" aria-expanded="${open}" aria-label="${open ? 'Minder details' : 'Meer details'}" title="${open ? 'Minder details' : 'Meer details'}">${open ? '▾' : '▸'}</button>`;
  }

  // De laatste notitie bij een item, voor het detailniveau.
  function latestNote(objective, id) {
    const notes = (objective.notes || []).filter((n) => n.relatedItemId === id);
    if (!notes.length) return null;
    return notes.slice().sort((a, b) => (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || ''))[0];
  }

  function detailList(rows) {
    const gevuld = rows.filter((r) => r && r[1]);
    if (!gevuld.length) return '';
    return `<dl class="cv-detail">${gevuld.map(([k, v]) => `<dt>${H.escapeHtml(k)}</dt><dd>${v}</dd>`).join('')}</dl>`;
  }

  function noteText(note) {
    if (!note) return '';
    const tekst = note.text.length > 160 ? `${note.text.slice(0, 157)}…` : note.text;
    return `${H.escapeHtml(tekst)} <span class="muted">(${H.escapeHtml(H.noteTypeLabel(note.type))}, ${H.escapeHtml(H.formatDate(note.updatedAt || note.createdAt))})</span>`;
  }

  // De resultaten in een doelkaart volgen dezelfde filters als Uitvoering
  // (status, eigenaar, teamplan, zoeken). Bij zoeken: past het doel zelf, dan
  // blijven al zijn resultaten staan. Gemeld door David, 12 november 2026.
  function zichtbareMrs(theme, objective, filters) {
    if (!filters) return objective.measurableResults;
    const doelPast = filters.search && H.textMatches([objective.title, objective.description], filters.search);
    const f = doelPast ? { ...filters, search: '' } : filters;
    return objective.measurableResults.filter((m) => ObeyaBoard.passesFilters.measurableResult(theme, objective, m, f));
  }

  function objectiveCard(dataset, theme, objective, ctx) {
    const geenMr = objective.measurableResults.length === 0;
    const mrs = zichtbareMrs(theme, objective, ctx.mrFilters);
    const verborgen = objective.measurableResults.length - mrs.length;
    const verborgenTekst = verborgen ? `<p class="muted cv-hidden-note">${verborgen} ${verborgen === 1 ? 'resultaat' : 'resultaten'} verborgen door de filters</p>` : '';
    const alsoThemes = (objective.themeIds || []).filter((tid) => tid !== theme.id)
      .map((tid) => ObeyaData.findTheme(dataset, tid)).filter(Boolean);
    const nProj = objective.projects.length;
    const nAct = objective.projects.reduce((n, p) => n + (p.actions || []).length, 0) + (objective.actions || []).length;
    const telwerk = [`${objective.measurableResults.length} MR`, `${nProj} ${nProj === 1 ? 'project' : 'projecten'}`, `${nAct} ${nAct === 1 ? 'actie' : 'acties'}`].join(' · ');
    const muur = ctx.lens === 'chain';
    const niveau = levelOf(objective.id, ctx);
    const kop = muur && niveau === 'head';
    const ingeklapt = !!(ctx.folded && ctx.folded.has(objective.id));
    // Inklappen per doel hoort bij "onder elkaar"; organogram en mindmap
    // hebben daarvoor hun eigen openklapknop.
    const foldBtn = muur && !ctx.print && (ctx.chainLayout || 'rows') === 'rows'
      ? `<button class="btn btn--ghost btn--small" type="button" data-action="canvas-fold" data-id="${H.escapeHtml(objective.id)}" aria-expanded="${!ingeklapt}">${ingeklapt ? 'Uitklappen' : 'Inklappen'}</button>`
      : '';
    return `
      <article class="cv-card cv-objective${muur ? ' cv-sticky' : ''}${geenMr ? ' cv-objective--gap' : ''}${nodeClass(objective.id, ctx.chainSet)}" data-node="${H.escapeHtml(objective.id)}" style="--theme-color:${H.escapeHtml(ObeyaData.themeColor(theme))};${stickyStyle('objective', theme, objective.id, ctx)}">
        <div class="cv-card__head">
          ${H.entityTypeBadge('objective')}
          ${focusButton(objective.id, objective.title, ctx.chainSet, ctx.focusId, 'cv-card__title', ctx.print)}
          ${expandButton(objective.id, ctx)}
        </div>
        <div class="cv-card__meta">
          ${H.statusPill(objective.status, { entityType: 'objective', compact: kop, card: true })}
          ${ctx.print ? '' : H.pendingBadge(objective.id)}
          ${kop ? '' : H.coverageLabel(ObeyaData.objectiveCoverage(objective), { compact: true })}
          ${!kop && objective.owner ? H.ownerBadge(objective.owner) : ''}
        </div>
        ${!kop && alsoThemes.length ? `<p class="cv-also">Ook bij: ${alsoThemes.map((t) => `${H.themeSwatch(t)} ${H.escapeHtml(t.name)}`).join(', ')}</p>` : ''}
        ${niveau === 'detail' ? detailList([
          ['Omschrijving', H.escapeHtml(objective.description || '')],
          ['Laatste notitie', noteText(latestNote(objective, objective.id))],
        ]) : ''}
        ${muur ? '' : geenMr
          ? '<p class="cv-tag cv-tag--gap cv-gap-line">Geen meetbaar resultaat</p>'
          : `${mrs.length ? `<ul class="cv-mrs" aria-label="Meetbare resultaten">${mrs.map((m) => mrRow(dataset, objective, m, ctx)).join('')}</ul>` : ''}${verborgenTekst}`}
        ${ctx.print || kop ? (kop && foldBtn ? `<div class="cv-card__foot"><span></span><span class="cv-card__buttons">${foldBtn}</span></div>` : '') : `<div class="cv-card__foot">
          <span class="muted">${telwerk}</span>
          <span class="cv-card__buttons">
            ${ctx.lens === 'strategic' ? `<button class="btn btn--ghost btn--small" type="button" data-action="canvas-zoom-in" data-id="${H.escapeHtml(objective.id)}" title="Naar de projecten en acties van dit doel">Inzoomen</button>` : ''}
            ${foldBtn}
            <button class="btn btn--ghost btn--small" type="button" data-open="objective:${H.escapeHtml(objective.id)}">Details</button>
          </span>
        </div>`}
      </article>`;
  }

  function targetNames(dataset, ids) {
    return ids.map((id) => { const m = ObeyaData.findMeasurableResult(dataset, id); return m ? m.name : null; }).filter(Boolean);
  }

  function workCard(dataset, w, ctx) {
    const item = w.entity;
    const name = w.type === 'project' ? item.name : item.title;
    const targets = targetNames(dataset, w.targets);
    const muur = ctx.lens === 'chain';
    const niveau = levelOf(item.id, ctx);
    const kop = muur && niveau === 'head';
    const acties = w.type === 'project' && !muur ? (item.actions || []).filter((a) => w.visibleActionIds.has(a.id)) : [];
    const periode = w.type === 'project' && item.periodYear ? ObeyaData.formatPeriod(item.periodYear, item.periodQuarter) : '';
    return `
      <article class="cv-card cv-work${muur ? ` cv-sticky cv-sticky--${w.type}` : ''}${w.unlinked ? ' cv-work--unlinked' : ''}${nodeClass(item.id, ctx.chainSet)}" data-node="${H.escapeHtml(item.id)}"${muur ? ` style="${stickyStyle(w.type, w.theme, item.id, ctx)}"` : ''}>
        <div class="cv-card__head">
          ${selectBox(w.type, item.id, name, ctx)}
          ${H.entityTypeBadge(w.type)}
          ${focusButton(item.id, name, ctx.chainSet, ctx.focusId, 'cv-card__title', ctx.print)}
          ${muur && !ctx.print ? `<button class="cv-connect" type="button" data-connect-from="${H.escapeHtml(item.id)}" aria-label="Verbinden met een meetbaar resultaat (slepen)" title="Sleep naar een meetbaar resultaat om te koppelen">⊕</button>` : ''}
          ${expandButton(item.id, ctx)}
        </div>
        <div class="cv-card__meta">
          ${H.statusPill(item.status, { entityType: w.type, compact: kop, card: true })}
          ${ctx.print ? '' : H.pendingBadge(item.id)}
          ${kop ? '' : H.ownerBadge(item.owner)}
          ${!kop && w.type === 'action' && item.dueDate ? `<span class="cv-due">deadline ${H.escapeHtml(H.formatDate(item.dueDate))}</span>` : ''}
          ${w.unlinked ? '<span class="relation-tag relation-tag--unmapped">Nog te koppelen</span>' : ''}
        </div>
        ${ctx.groupBy !== 'objective' && !muur ? `<p class="cv-context muted">${H.themeSwatch(w.theme)} ${H.escapeHtml(w.objective.title)}</p>` : ''}
        ${niveau === 'detail' ? detailList([
          ['Omschrijving', H.escapeHtml(item.description || '')],
          ['Monitoren', H.escapeHtml(item.monitoringText || '')],
          ['Periode', H.escapeHtml(periode)],
          ['Laatste notitie', noteText(latestNote(w.objective, item.id))],
        ]) : ''}
        <p class="sr-only">${targets.length ? `Draagt bij aan: ${H.escapeHtml(targets.join('; '))}.` : 'Draagt nog niet bij aan een meetbaar resultaat.'}</p>
        ${acties.length ? `<ul class="cv-actions" aria-label="Acties">${acties.map((a) => `
          <li class="cv-action${nodeClass(a.id, ctx.chainSet)}" data-node="${H.escapeHtml(a.id)}">
            ${selectBox('action', a.id, a.title, ctx)}
            ${H.statusPill(a.status, { compact: true, entityType: 'action', card: true })}
            ${focusButton(a.id, a.title, ctx.chainSet, ctx.focusId, 'cv-action__name')}
            ${a.owner ? `<span class="muted">${H.escapeHtml(a.owner)}</span>` : ''}
          </li>`).join('')}</ul>` : ''}
        ${ctx.print || kop ? '' : `<div class="cv-card__foot">
          <span></span>
          <span class="cv-card__buttons"><button class="btn btn--ghost btn--small" type="button" data-open="${w.type}:${H.escapeHtml(item.id)}">Details</button></span>
        </div>`}
      </article>`;
  }

  function linksAttr(links, chainSet) {
    const data = links.map((l) => ({ ...l, chain: !!(chainSet && chainSet.has(l.from) && chainSet.has(l.to)) }));
    return H.escapeHtml(JSON.stringify(data));
  }

  function stage(content, links, ctx) {
    if (ctx.print) {
      return `<div class="canvas-stage canvas-stage--print" data-zoom="1" data-links="${linksAttr(links, null)}"><svg class="canvas-links" aria-hidden="true" focusable="false"></svg>${content}</div>`;
    }
    return `
      <div class="canvas-viewport">
        <div class="canvas-sizer">
          <div class="canvas-stage${ctx.chainSet ? ' has-focus' : ''}"${ctx.lens === 'chain' && ['org', 'mindmap'].includes(ctx.chainLayout) ? ` data-orient="${ctx.chainLayout}"` : ''} data-zoom="${ctx.zoom}"${ctx.layoutWidth ? ` data-layout-width="${ctx.layoutWidth}"` : ''} style="transform:scale(${ctx.zoom})" data-links="${linksAttr(links, ctx.chainSet)}">
            <svg class="canvas-links" aria-hidden="true" focusable="false"></svg>
            ${content}
          </div>
        </div>
      </div>`;
  }

  // --- lenzen --------------------------------------------------------------------

  // Dezelfde doelfilters als het Bord (status, eigenaar, periode, teamplan,
  // zoeken): een doel dat er niet doorkomt, staat er niet.
  function themeBody(dataset, theme, filters, ctx) {
    if (!theme.objectives.length) return '<p class="muted">Nog geen doelen.</p>';
    const zichtbaar = theme.objectives.filter((o) => H.objectivePassesFilters(o, filters));
    if (!zichtbaar.length) return '<p class="muted">Geen doelen zichtbaar met de huidige filters.</p>';
    return zichtbaar.map((o) => objectiveCard(dataset, theme, o, { ...ctx, mrFilters: filters })).join('');
  }

  function renderStrategic(dataset, filters, ctx) {
    const themes = H.visibleThemes(dataset, filters);
    const visible = new Set(themes.map((t) => t.id));
    const vision = dataset.meta && dataset.meta.vision;
    const content = `
      ${vision ? `<div class="cv-vision"><span class="cv-vision__label">Visie</span><p>${H.escapeHtml(vision)}</p></div>` : ''}
      <div class="cv-themes">
        ${themes.map((t) => `
          <section class="cv-theme" style="--theme-color:${H.escapeHtml(ObeyaData.themeColor(t))}" aria-label="Thema ${H.escapeHtml(t.name)}">
            <header class="cv-theme__head${nodeClass(t.id, ctx.chainSet)}" data-node="${H.escapeHtml(t.id)}">
              ${H.themeSwatch(t)}
              ${focusButton(t.id, t.name, ctx.chainSet, ctx.focusId, 'cv-theme__title')}
              <span class="cv-theme__status">${H.statusPill(t.status, { entityType: 'theme' })} ${H.coverageLabel(ObeyaData.themeCoverage(t), { compact: true })}</span>
            </header>
            <div class="cv-theme__body">
              ${themeBody(dataset, t, filters, ctx)}
            </div>
          </section>`).join('')}
      </div>`;
    return stage(content, strategicLinks(dataset, visible, ctx.index), ctx);
  }

  // Alle projecten en losse acties die door de filters komen, met hun thema,
  // doel, de resultaten waar ze aan bijdragen en de baan waarin ze vallen.
  function collectWork(dataset, filters, themes, groupBy) {
    const F = ObeyaBoard.passesFilters;
    const work = [];
    themes.forEach((theme) => {
      theme.objectives.forEach((objective) => {
        objective.projects.forEach((p) => {
          const zichtbareActies = (p.actions || []).filter((a) => F.action(a, theme, objective, p, filters));
          if (!F.project(p, theme, objective, filters) && !zichtbareActies.length) return;
          const targets = workTargets(dataset, 'project', p);
          work.push({ type: 'project', entity: p, theme, objective, targets, unlinked: ObeyaData.projectNeedsMapping(p, dataset), visibleActionIds: new Set(zichtbareActies.map((a) => a.id)) });
        });
        (objective.actions || []).forEach((a) => {
          if (!F.action(a, theme, objective, null, filters)) return;
          const targets = workTargets(dataset, 'action', a);
          work.push({ type: 'action', entity: a, theme, objective, targets, unlinked: targets.length === 0, visibleActionIds: new Set() });
        });
      });
    });
    work.forEach((w) => {
      if (groupBy === 'theme') w.lane = w.theme.id;
      else if (groupBy === 'owner') w.lane = w.entity.owner || '';
      else if (groupBy === 'status') w.lane = w.entity.status || 'grey';
      else w.lane = w.objective.id;
    });
    return work;
  }

  function lanesFor(dataset, groupBy, themes, work) {
    if (groupBy === 'theme') {
      return themes.map((t) => ({ key: t.id, head: `${H.themeSwatch(t)} ${H.escapeHtml(t.name)}` }));
    }
    if (groupBy === 'owner') {
      const owners = Array.from(new Set(work.map((w) => w.lane))).sort((a, b) => {
        if (!a) return 1;
        if (!b) return -1;
        return a.localeCompare(b, 'nl');
      });
      return owners.map((o) => ({ key: o, head: o ? H.escapeHtml(o) : '<span class="muted">Geen eigenaar</span>' }));
    }
    if (groupBy === 'status') {
      const aanwezig = new Set(work.map((w) => w.lane));
      return STATUS_LANE_ORDER.filter((s) => aanwezig.has(s))
        .concat(Array.from(aanwezig).filter((s) => !STATUS_LANE_ORDER.includes(s)))
        .map((s) => ({ key: s, head: H.statusPill(s, { entityType: 'project' }) }));
    }
    return [];
  }

  function operationalLinks(dataset, work) {
    const links = [];
    const zichtbaar = new Set(work.map((w) => w.entity.id));
    work.forEach((w) => {
      if (w.targets.length) w.targets.forEach((mrId) => links.push({ from: w.entity.id, to: mrId, kind: 'contributes' }));
      else links.push({ from: w.entity.id, to: w.objective.id, kind: 'unlinked' });
    });
    ObeyaData.allRelations(dataset).forEach((r) => {
      if (r.type === 'related' && zichtbaar.has(r.from) && zichtbaar.has(r.to)) links.push({ from: r.from, to: r.to, kind: 'related' });
    });
    return links;
  }

  function renderOperational(dataset, filters, ctx) {
    const themes = H.visibleThemes(dataset, filters);
    const work = collectWork(dataset, filters, themes, ctx.groupBy);
    const cards = (list) => list.map((w) => workCard(dataset, w, ctx)).join('');
    let content;
    if (ctx.groupBy === 'objective') {
      // Per doel een baan: de doelkaart bovenaan, het werk eronder.
      content = `<div class="cv-groups">${themes.map((t) => `
        <section class="cv-group" style="--theme-color:${H.escapeHtml(ObeyaData.themeColor(t))}" aria-label="Thema ${H.escapeHtml(t.name)}">
          <h3 class="cv-group__head">${H.themeSwatch(t)} ${H.escapeHtml(t.name)}</h3>
          <div class="cv-lanes">
            ${t.objectives.map((o) => `
              <div class="cv-lane">
                ${objectiveCard(dataset, t, o, ctx)}
                <div class="cv-lane__work">${cards(work.filter((w) => w.lane === o.id))}</div>
              </div>`).join('')}
          </div>
        </section>`).join('')}</div>`;
    } else {
      // De doelkaarten als ankers bovenaan, het werk in banen eronder.
      const lanes = lanesFor(dataset, ctx.groupBy, themes, work);
      content = `
        <div class="cv-groups cv-anchors">${themes.map((t) => `
          <section class="cv-group" style="--theme-color:${H.escapeHtml(ObeyaData.themeColor(t))}" aria-label="Thema ${H.escapeHtml(t.name)}">
            <h3 class="cv-group__head">${H.themeSwatch(t)} ${H.escapeHtml(t.name)}</h3>
            <div class="cv-lanes">${t.objectives.map((o) => `<div class="cv-lane">${objectiveCard(dataset, t, o, ctx)}</div>`).join('')}</div>
          </section>`).join('')}</div>
        <div class="cv-worklanes">
          ${lanes.length ? lanes.map((l) => `
            <section class="cv-lane cv-lane--work" aria-label="${H.escapeHtml(GROUP_LABELS[ctx.groupBy])}">
              <h3 class="cv-lane__head">${l.head}</h3>
              <div class="cv-lane__work">${cards(work.filter((w) => w.lane === l.key))}</div>
            </section>`).join('') : '<p class="muted">Geen projecten of acties die door de filters komen.</p>'}
        </div>`;
    }
    return stage(content, operationalLinks(dataset, work), ctx);
  }

  // --- keten: thema → doel → meetbaar resultaat → project → actie -----------

  // Een meetbaar resultaat als eigen kaart in de keten: de stap tussen doel en
  // project, met zijn streefkwartaal ("2026 Q3 · te laat") en een gat als er
  // niets aan werkt.
  function mrCard(dataset, objective, mr, ctx, theme) {
    const geenWerk = !mrHasWork(dataset, objective, mr);
    const stand = ObeyaData.deliverableSummary(mr);
    const niveau = levelOf(mr.id, ctx);
    const kop = niveau === 'head';
    return `
      <article class="cv-card cv-mrcard cv-sticky${geenWerk ? ' cv-mrcard--nowork' : ''}${nodeClass(mr.id, ctx.chainSet)}" data-node="${H.escapeHtml(mr.id)}" style="${stickyStyle('measurableResult', theme, mr.id, ctx)}">
        <div class="cv-card__head">
          ${selectBox('measurableResult', mr.id, mr.name, ctx)}
          ${H.entityTypeBadge('measurableResult')}
          ${focusButton(mr.id, mr.name, ctx.chainSet, ctx.focusId, 'cv-card__title', ctx.print)}
          ${expandButton(mr.id, ctx)}
        </div>
        <div class="cv-card__meta">
          ${H.statusPill(mr.status, { entityType: 'measurableResult', compact: kop, card: true })}
          ${ctx.print ? '' : H.pendingBadge(mr.id)}
          ${!kop && mr.owner ? H.ownerBadge(mr.owner) : ''}
          ${ObeyaData.valueText(mr) ? `<span class="cv-value" title="Stand: ${H.escapeHtml(ObeyaData.valueText(mr, { noDate: true }))}">${H.escapeHtml(ObeyaData.valueText(mr, { short: true }))}</span>` : ''}
          ${stand ? `<span class="cv-stand">${H.escapeHtml(stand)}</span>` : ''}
          ${geenWerk ? '<span class="cv-tag cv-tag--gap">geen werk</span>' : ''}
        </div>
        ${niveau === 'detail' ? detailList([
          ['Klaar als', H.escapeHtml(mr.doneCriterion || '')],
          ['Monitoren', H.escapeHtml(mr.monitoringText || '')],
          ['Laatste notitie', noteText(latestNote(objective, mr.id))],
        ]) : ''}
        ${ctx.print || kop ? '' : `<div class="cv-card__foot"><span></span><span class="cv-card__buttons"><button class="btn btn--ghost btn--small" type="button" data-open="measurableResult:${H.escapeHtml(mr.id)}">Details</button></span></div>`}
      </article>`;
  }

  // Eén thema als band van links naar rechts: thema, doel, meetbaar
  // resultaat, project, actie. Elk project staat naast het eerste resultaat
  // van zijn eigen doel waar het aan bijdraagt; draagt het aan meer bij, dan
  // lopen er extra lijnen. Werk dat alleen bijdraagt aan een resultaat in een
  // ander doel, en werk zonder bijdrage, krijgt een eigen rij onder het doel.
  // Met ctx.print: zonder knoppen, voor papier. Dat gebruikte het ketenvel van
  // de muurvellen (vervallen 12 oktober 2026, zie docs/muurvellen.md); de modus
  // blijft staan zodat dat vel zonder herbouw terug kan.
  function chainBand(dataset, theme, filters, ctx, work) {
    const links = [];
    const kctx = { ...ctx, lens: 'chain' };
    const actionCard = (w, a) => workCard(dataset, { type: 'action', entity: a, theme, objective: w.objective, targets: [], unlinked: false, visibleActionIds: new Set() }, kctx);

    const rij = (w) => {
      const acties = w.type === 'project' ? (w.entity.actions || []).filter((a) => w.visibleActionIds.has(a.id)) : [];
      acties.forEach((a) => links.push({ from: a.id, to: w.entity.id, kind: 'tree', h: true }));
      return `
        <div class="kt-row" data-id="${H.escapeHtml(w.entity.id)}" data-kind="${w.type}">
          <div class="kt-cell kt-cell--project">${workCard(dataset, w, kctx)}</div>
          <div class="kt-cell kt-cell--actions"${w.type === 'project' ? ` data-sort="actions" data-project-id="${H.escapeHtml(w.entity.id)}"` : ''}>${acties.map((a) => actionCard(w, a)).join('')}</div>
        </div>`;
    };

    // mrId: het resultaat van deze groep, '' = niet gekoppeld, 'elders' =
    // bijdrage aan een resultaat in een ander doel (daar kun je niets in
    // neerzetten; koppelen aan een resultaat elders gaat met verbinden).
    const groep = (ankerHtml, rijen, leegTekst, o, mrId, extraClass) => `
      <div class="kt-mrgroup${mrId && mrId !== 'elders' ? '' : ' kt-mrgroup--fixed'}${extraClass ? ` ${extraClass}` : ''}"${mrId && mrId !== 'elders' ? ` data-id="${H.escapeHtml(mrId)}"` : ''}>
        <div class="kt-cell kt-cell--mr">${ankerHtml}</div>
        <div class="kt-rows" data-sort="work" data-objective-id="${H.escapeHtml(o.id)}" data-mr-id="${H.escapeHtml(mrId)}">${rijen.length ? rijen.join('') : `<div class="kt-row kt-row--empty"><p class="kt-none">${leegTekst}</p></div>`}</div>
      </div>`;

    const doelen = theme.objectives.map((o) => {
      links.push({ from: o.id, to: theme.id, kind: 'tree', h: true });
      const eigenMrIds = new Set(o.measurableResults.map((m) => m.id));
      const mijnWerk = work.filter((w) => w.objective.id === o.id);
      const perMr = new Map(o.measurableResults.map((m) => [m.id, []]));
      const elders = [];
      const zonder = [];
      mijnWerk.forEach((w) => {
        const eigen = w.targets.filter((id) => eigenMrIds.has(id));
        if (eigen.length) {
          perMr.get(eigen[0]).push(w);
          links.push({ from: w.entity.id, to: eigen[0], kind: 'tree', h: true });
          w.targets.filter((id) => id !== eigen[0]).forEach((id) => links.push({ from: w.entity.id, to: id, kind: 'contributes', h: true }));
        } else if (w.targets.length) {
          elders.push(w);
          w.targets.forEach((id) => links.push({ from: w.entity.id, to: id, kind: 'contributes', h: true }));
        } else {
          zonder.push(w);
          links.push({ from: w.entity.id, to: o.id, kind: 'unlinked', h: true });
        }
      });
      o.measurableResults.forEach((m) => links.push({ from: m.id, to: o.id, kind: 'tree', h: true }));

      const groepen = o.measurableResults.map((m) => groep(mrCard(dataset, o, m, kctx, theme), perMr.get(m.id).map(rij), 'Nog geen werk', o, m.id));
      if (!o.measurableResults.length) {
        // Op het scherm meteen een knop om het gat te dichten; daarna sleep je
        // het werk naar het nieuwe resultaat.
        const toevoegen = ctx.print ? '' : `<button class="btn btn--ghost btn--small kt-gap__add" type="button" data-action="new-measurableResult" data-objective-id="${H.escapeHtml(o.id)}" aria-label="Meetbaar resultaat toevoegen aan ${H.escapeHtml(o.title)}">+ Meetbaar resultaat</button>`;
        groepen.push(groep(`<div class="kt-gap">Geen meetbaar resultaat${toevoegen}</div>`, zonder.map(rij), 'Nog geen projecten of acties', o, ''));
      } else if (zonder.length || !ctx.print) {
        // Op het scherm altijd een plek om werk los te koppelen; op papier
        // alleen als er echt iets los staat.
        // Zonder losstaand werk alleen een landingsplek tijdens het slepen.
        groepen.push(groep('<p class="kt-gap">Nog niet gekoppeld aan een meetbaar resultaat</p>', zonder.map(rij), 'Sleep werk hierheen om het los te koppelen', o, '', zonder.length ? '' : 'kt-mrgroup--dropzone'));
      }
      if (elders.length) {
        groepen.push(groep('<p class="kt-none">Draagt bij aan een resultaat in een ander doel</p>', elders.map(rij), '', o, 'elders'));
      }
      if (ctx.folded && ctx.folded.has(o.id)) {
        // Ingeklapt: alleen de telling, geen kaarten en dus ook geen lijnen
        // naar wat eronder hangt.
        const n = (k) => mijnWerk.filter((w) => w.type === k).length;
        return `
        <div class="kt-doel kt-doel--folded" data-id="${H.escapeHtml(o.id)}">
          <div class="kt-cell kt-cell--doel">${objectiveCard(dataset, theme, o, kctx)}</div>
          <p class="kt-folded">Ingeklapt: ${o.measurableResults.length} ${o.measurableResults.length === 1 ? 'meetbaar resultaat' : 'meetbare resultaten'} · ${n('project')} project${n('project') === 1 ? '' : 'en'} · ${n('action')} losse actie${n('action') === 1 ? '' : 's'}</p>
        </div>`;
      }
      return `
        <div class="kt-doel" data-id="${H.escapeHtml(o.id)}">
          <div class="kt-cell kt-cell--doel">${objectiveCard(dataset, theme, o, kctx)}</div>
          <div class="kt-mrgroups" data-sort="mrs" data-objective-id="${H.escapeHtml(o.id)}">${groepen.join('')}</div>
        </div>`;
    });
    const html = `
      <section class="kt-band" style="--theme-color:${H.escapeHtml(ObeyaData.themeColor(theme))}" aria-label="Keten van thema ${H.escapeHtml(theme.name)}">
        <div class="kt-cell kt-cell--theme">
          <header class="cv-theme__head${nodeClass(theme.id, ctx.chainSet)}" data-node="${H.escapeHtml(theme.id)}">
            ${H.themeSwatch(theme)}
            ${focusButton(theme.id, theme.name, ctx.chainSet, ctx.focusId, 'cv-theme__title', ctx.print)}
            <span class="cv-theme__status">${H.statusPill(theme.status, { entityType: 'theme' })}${theme.owner ? ` ${H.ownerBadge(theme.owner)}` : ''}</span>
          </header>
        </div>
        <div class="kt-doelen" data-sort="objectives" data-theme-id="${H.escapeHtml(theme.id)}">${doelen.length ? doelen.join('') : '<p class="muted">Nog geen doelen.</p>'}</div>
      </section>`;
    return { html, links };
  }

  const CHAIN_HEADER = `
    <div class="kt-header" aria-hidden="true">
      <span>Thema</span><span>Doel</span><span>Meetbaar resultaat</span><span>Project</span><span>Actie</span>
    </div>`;

  // Voor het ketenvel: één thema, met de filters van het bord.
  function renderChainBand(dataset, theme, filters, opts) {
    const display = ObeyaData.getDisplaySettings(dataset);
    const ctx = { lens: 'chain', groupBy: 'objective', focusId: null, zoom: 1, chainSet: null, print: !!(opts && opts.print), index: buildIndex(dataset), display, detail: display.defaultDetail };
    const work = collectWork(dataset, filters, [theme], 'objective');
    const band = chainBand(dataset, theme, filters, ctx, work);
    return stage(`${CHAIN_HEADER}${band.html}`, band.links, ctx);
  }

  function renderChain(dataset, filters, ctx) {
    const themes = H.visibleThemes(dataset, filters);
    const work = collectWork(dataset, filters, themes, 'objective');
    if (ctx.chainLayout === 'org') return renderOrg(dataset, themes, work, ctx);
    if (ctx.chainLayout === 'mindmap') return renderMindmap(dataset, themes, work, ctx);
    // Thema's onder elkaar: de keten loopt van links naar rechts, met
    // kolomkoppen; alleen hier kun je verschuiven (de structuur staat dan
    // als lijsten op het scherm).
    const bands = themes.map((t) => chainBand(dataset, t, filters, ctx, work));
    const content = `${CHAIN_HEADER}<div class="kt-bands">${bands.map((b) => b.html).join('')}</div>`;
    return stage(content, bands.flatMap((b) => b.links), ctx);
  }

  // --- organogram en mindmap: de keten als boom ----------------------------------
  // Beide tonen dezelfde boom: visie → thema → doel → meetbaar resultaat →
  // project → actie. Werk zonder bijdrage, of met een bijdrage alleen elders,
  // hangt direct onder zijn doel. Alles klapt open vanaf de thema's: een knop
  // onder elk briefje met iets eronder ("+ 4 doelen"); in het begin staan
  // alleen visie en thema's er.

  const VISION_ID = '__visie';

  function chainTree(dataset, themes, work) {
    const node = (kind, id, extra) => ({ kind, id, children: [], ...extra });
    const root = node('vision', VISION_ID, {});
    themes.forEach((theme) => {
      const t = node('theme', theme.id, { entity: theme, theme });
      root.children.push(t);
      theme.objectives.forEach((o) => {
        const d = node('objective', o.id, { entity: o, theme, objective: o });
        t.children.push(d);
        const eigen = new Set(o.measurableResults.map((m) => m.id));
        const perMr = new Map();
        o.measurableResults.forEach((m) => {
          const mn = node('measurableResult', m.id, { entity: m, theme, objective: o });
          perMr.set(m.id, mn);
          d.children.push(mn);
        });
        work.filter((w) => w.objective.id === o.id).forEach((w) => {
          const wn = node('work', w.entity.id, { entity: w.entity, theme, objective: o, w });
          (w.type === 'project' ? (w.entity.actions || []).filter((a) => w.visibleActionIds.has(a.id)) : []).forEach((a) => {
            wn.children.push(node('work', a.id, {
              entity: a, theme, objective: o,
              w: { type: 'action', entity: a, theme, objective: o, targets: [], unlinked: false, visibleActionIds: new Set() },
            }));
          });
          const eerste = w.targets.find((id) => eigen.has(id));
          if (eerste) perMr.get(eerste).children.push(wn);
          else d.children.push(wn);
        });
      });
    });
    return root;
  }

  const KIND_CHILDREN = {
    vision: ['thema', "thema's"], theme: ['doel', 'doelen'], objective: ['item', 'items'],
    measurableResult: ['stuk werk', 'stukken werk'], work: ['actie', 'acties'],
  };

  function openToggle(n, ctx) {
    if (!n.children.length || n.kind === 'vision' || ctx.print) return '';
    const open = ctx.opened.has(n.id);
    const [een, meer] = KIND_CHILDREN[n.kind] || ['item', 'items'];
    const label = `${n.children.length} ${n.children.length === 1 ? een : meer}`;
    return `<button class="og-toggle" type="button" data-action="canvas-open" data-id="${H.escapeHtml(n.id)}" aria-expanded="${open}" title="${open ? 'Dichtklappen' : 'Openklappen'}">${open ? '−' : '+'} ${H.escapeHtml(label)}</button>`;
  }

  function treeCard(dataset, n, ctx) {
    if (n.kind === 'vision') {
      const v = (dataset.meta && dataset.meta.vision) || (dataset.meta && dataset.meta.name) || 'Visie';
      return `<div class="og-vision cv-card${nodeClass(VISION_ID, ctx.chainSet)}" data-node="${VISION_ID}"><span class="og-vision__label">Visie</span><p>${H.escapeHtml(v)}</p></div>`;
    }
    if (n.kind === 'theme') {
      const t = n.entity;
      return `
        <header class="cv-theme__head og-theme${nodeClass(t.id, ctx.chainSet)}" data-node="${H.escapeHtml(t.id)}" style="--theme-color:${H.escapeHtml(ObeyaData.themeColor(t))}">
          ${H.themeSwatch(t)}
          ${focusButton(t.id, t.name, ctx.chainSet, ctx.focusId, 'cv-theme__title', ctx.print)}
          <span class="cv-theme__status">${H.statusPill(t.status, { entityType: 'theme' })}${t.owner ? ` ${H.ownerBadge(t.owner)}` : ''}</span>
        </header>`;
    }
    if (n.kind === 'objective') return objectiveCard(dataset, n.theme, n.entity, ctx);
    if (n.kind === 'measurableResult') return mrCard(dataset, n.objective, n.entity, ctx, n.theme);
    return workCard(dataset, n.w, ctx);
  }

  // De lijnen in de boom: elk zichtbaar kind naar zijn ouder, plus een
  // bijdrage aan een tweede resultaat als dat ook zichtbaar is.
  function treeLinks(root, ctx, flag) {
    const links = [];
    const zichtbaar = new Set();
    const loop = (n, parent) => {
      zichtbaar.add(n.id);
      if (parent) {
        const kind = n.kind === 'work' && n.w && n.w.unlinked ? 'unlinked' : 'tree';
        links.push({ from: n.id, to: parent.id, kind, [flag]: true });
      }
      if (n.kind === 'vision' || ctx.opened.has(n.id)) n.children.forEach((c) => loop(c, n));
    };
    loop(root, null);
    const extra = [];
    const walk = (n) => {
      if (n.kind === 'work' && n.w && zichtbaar.has(n.id)) {
        n.w.targets.forEach((mrId) => {
          if (zichtbaar.has(mrId) && !links.some((l) => l.from === n.id && l.to === mrId)) extra.push({ from: n.id, to: mrId, kind: 'contributes', [flag]: true });
        });
      }
      n.children.forEach(walk);
    };
    walk(root);
    return links.concat(extra);
  }

  // Organogram: elk niveau op één hoogte, broers en zussen naast elkaar,
  // haakse lijnen van boven naar beneden.
  function renderOrg(dataset, themes, work, ctx) {
    const root = chainTree(dataset, themes, work);
    const tctx = { ...ctx, lens: 'chain' };
    const item = (n) => `<div class="og-item og-item--${n.kind}">${treeCard(dataset, n, tctx)}${openToggle(n, ctx)}</div>`;
    const tak = (n) => {
      const open = n.kind === 'vision' || ctx.opened.has(n.id);
      return `<div class="og-node">${item(n)}${open && n.children.length ? `<div class="og-children">${n.children.map(tak).join('')}</div>` : ''}</div>`;
    };
    return stage(`<div class="og-tree">${tak(root)}</div>`, treeLinks(root, ctx, 'org'), ctx);
  }

  // Mindmap: de visie in het midden, elke ring verder naar buiten een niveau
  // dieper. Elk thema krijgt een eigen sector, en elk kind een deel van de
  // sector van zijn ouder naar rato van wat er (open) onder hangt. De straal
  // van een ring groeit tot de briefjes erop elkaar niet raken. Puur
  // uitgerekend (geen meting), dus in Node te testen.
  const MM_CARD = 200;
  function mindmapLayout(root, opened) {
    const zicht = (n) => (n.kind === 'vision' || opened.has(n.id) ? n.children : []);
    const gewicht = (n) => {
      const k = zicht(n);
      return k.length ? k.reduce((s, c) => s + gewicht(c), 0) : 1;
    };
    const nodes = [];
    const plaats = (n, a0, a1, diepte) => {
      nodes.push({ n, hoek: (a0 + a1) / 2, diepte });
      const k = zicht(n);
      const totaal = k.reduce((s, c) => s + gewicht(c), 0) || 1;
      let a = a0;
      k.forEach((c) => {
        const deel = ((a1 - a0) * gewicht(c)) / totaal;
        plaats(c, a, a + deel, diepte + 1);
        a += deel;
      });
    };
    plaats(root, -Math.PI / 2, (3 * Math.PI) / 2, 0);
    // Straal per ring: minstens een vaste stap verder, en groot genoeg dat
    // naburige briefjes op de ring niet overlappen.
    const radii = [0];
    const maxDiepte = Math.max(...nodes.map((x) => x.diepte));
    for (let d = 1; d <= maxDiepte; d++) {
      const hoeken = nodes.filter((x) => x.diepte === d).map((x) => x.hoek).sort((p, q) => p - q);
      let minGat = 2 * Math.PI;
      for (let i = 0; i < hoeken.length; i++) {
        const volgende = i + 1 < hoeken.length ? hoeken[i + 1] : hoeken[0] + 2 * Math.PI;
        if (hoeken.length > 1) minGat = Math.min(minGat, volgende - hoeken[i]);
      }
      // Ruim genoeg voor de breedte én de hoogte van een briefje: links en
      // rechts in de ring staan de briefjes boven elkaar.
      const nodig = hoeken.length > 1 ? (MM_CARD + 90) / minGat : 0;
      radii[d] = Math.min(9000, Math.max(radii[d - 1] + (d === 1 ? 300 : 250), nodig));
    }
    const rand = (radii[maxDiepte] || 0) + 180;
    const maat = Math.max(900, Math.ceil(2 * rand));
    const c = maat / 2;
    nodes.forEach((x) => {
      x.r = radii[x.diepte];
      x.x = c + x.r * Math.cos(x.hoek);
      x.y = c + x.r * Math.sin(x.hoek);
    });
    return { nodes, maat, midden: c, radii };
  }

  function renderMindmap(dataset, themes, work, ctx) {
    const root = chainTree(dataset, themes, work);
    // Compact: op Kop, tenzij een briefje zelf is opengeklikt.
    const tctx = { ...ctx, lens: 'chain', detail: 'head' };
    const layout = mindmapLayout(root, ctx.opened);
    const pos = new Map(layout.nodes.map((x) => [x.n.id, x]));
    const ouder = new Map();
    const loop = (n) => (n.kind === 'vision' || ctx.opened.has(n.id) ? n.children : []).forEach((k) => { ouder.set(k.id, n); loop(k); });
    loop(root);
    const kleur = (x) => ObeyaData.themeColor(x.n.theme || (x.n.kind === 'theme' ? x.n.entity : null) || { color: '#234559' });
    const takken = layout.nodes.filter((x) => ouder.has(x.n.id)).map((x) => {
      const p = pos.get(ouder.get(x.n.id).id);
      const midR = (p.r + x.r) / 2;
      const c1x = layout.midden + midR * Math.cos(p.hoek);
      const c1y = layout.midden + midR * Math.sin(p.hoek);
      const c2x = layout.midden + midR * Math.cos(x.hoek);
      const c2y = layout.midden + midR * Math.sin(x.hoek);
      const breed = Math.max(1.5, 7 - x.diepte * 1.3);
      const chain = !!(ctx.chainSet && ctx.chainSet.has(x.n.id) && (ctx.chainSet.has(ouder.get(x.n.id).id) || ouder.get(x.n.id).id === VISION_ID));
      const stippel = x.n.kind === 'work' && x.n.w && x.n.w.unlinked ? ' mm-branch--unlinked' : '';
      return `<path class="mm-branch${stippel}${chain ? ' is-chain' : ''}" style="--branch:${H.escapeHtml(kleur(x))};stroke-width:${breed}" d="M${p.x.toFixed(1)},${p.y.toFixed(1)} C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${x.x.toFixed(1)},${x.y.toFixed(1)}"></path>`;
    }).join('');
    const kaarten = layout.nodes.map((x) => `
      <div class="mm-node mm-node--${x.n.kind}" style="left:${x.x.toFixed(1)}px;top:${x.y.toFixed(1)}px">
        ${treeCard(dataset, x.n, tctx)}${openToggle(x.n, ctx)}
      </div>`).join('');
    const content = `
      <div class="mm-canvas" style="width:${layout.maat}px;height:${layout.maat}px">
        <svg class="mm-lines" width="${layout.maat}" height="${layout.maat}" aria-hidden="true" focusable="false">${takken}</svg>
        ${kaarten}
      </div>`;
    return stage(content, [], { ...ctx, mindmapSize: layout.maat });
  }

  // --- bediening --------------------------------------------------------------

  function controls(dataset, cs) {
    const lensBtn = (value, label, title) => `<button class="zoom-toggle__btn ${cs.lens === value ? 'zoom-toggle__btn--active' : ''}" type="button" data-action="set-canvas-lens" data-lens="${value}" aria-pressed="${cs.lens === value}" title="${title}">${label}</button>`;
    const focusInfo = cs.focusId ? ObeyaData.describeItem(dataset, cs.focusId) || (ObeyaData.findTheme(dataset, cs.focusId) ? { label: ObeyaData.findTheme(dataset, cs.focusId).name } : null) : null;
    return `
      <div class="canvas-controls">
        <div class="zoom-toggle" role="group" aria-label="Niveau">
          ${lensBtn('strategic', 'Strategisch', "Visie, thema's en doelen (sneltoets 1)")}
          ${lensBtn('operational', 'Operationeel', 'Projecten en acties bij hun doelen (sneltoets 2)')}
          ${lensBtn('chain', 'Keten', 'Van thema via doel, meetbaar resultaat en project naar actie (sneltoets 3)')}
        </div>
        ${cs.lens === 'chain' ? `
          <div class="zoom-toggle" role="group" aria-label="Detailniveau">
            ${[['head', 'Kop', 'Alleen titel en status'], ['standard', 'Standaard', 'Titel, status en eigenaar'], ['detail', 'Detail', 'Ook omschrijving, toelichting en de laatste notitie']].map(([v, l, t]) => `<button class="zoom-toggle__btn ${cs.detail === v ? 'zoom-toggle__btn--active' : ''}" type="button" data-action="set-canvas-detail" data-detail="${v}" aria-pressed="${cs.detail === v}" title="${t}">${l}</button>`).join('')}
          </div>
          <div class="zoom-toggle" role="group" aria-label="Thema's">
            ${[['rows', 'Onder elkaar', 'Thema\'s onder elkaar, de keten van links naar rechts; hier kun je verschuiven'], ['org', 'Organogram', 'Van boven naar beneden, elk niveau op één hoogte'], ['mindmap', 'Mindmap', 'De visie in het midden, elk niveau een ring verder']].map(([v, l, t]) => `<button class="zoom-toggle__btn ${cs.chainLayout === v ? 'zoom-toggle__btn--active' : ''}" type="button" data-action="set-chain-layout" data-layout="${v}" aria-pressed="${cs.chainLayout === v}" title="${t}">${l}</button>`).join('')}
          </div>
          <span class="canvas-controls__group">${cs.chainLayout === 'rows' ? `
            <button class="btn btn--ghost btn--small" type="button" data-action="canvas-fold-all" data-mode="fold">Alle doelen inklappen</button>
            <button class="btn btn--ghost btn--small" type="button" data-action="canvas-fold-all" data-mode="unfold">Alles uitklappen</button>` : `
            <button class="btn btn--ghost btn--small" type="button" data-action="canvas-open-all" data-mode="themes">Thema's openklappen</button>
            <button class="btn btn--ghost btn--small" type="button" data-action="canvas-open-all" data-mode="all">Alles openklappen</button>
            <button class="btn btn--ghost btn--small" type="button" data-action="canvas-open-all" data-mode="none">Alles dichtklappen</button>`}
          </span>` : ''}
        ${cs.lens === 'operational' ? `
          <label class="canvas-controls__group">Groeperen op
            <select id="canvas-group-by" data-canvas-group>
              ${Object.keys(GROUP_LABELS).map((k) => `<option value="${k}" ${cs.groupBy === k ? 'selected' : ''}>${GROUP_LABELS[k]}</option>`).join('')}
            </select>
          </label>` : ''}
        <button class="btn btn--ghost btn--small${cs.selecting ? ' btn--active' : ''}" type="button" data-action="canvas-select-mode" aria-pressed="${!!cs.selecting}" title="Meetbare resultaten, projecten en acties aanvinken en in één keer de status, eigenaar of markering zetten">Selecteren</button>
        <div class="canvas-controls__zoom" role="group" aria-label="Zoomen">
          <button class="icon-btn" type="button" data-action="canvas-zoom" data-zoom="out" aria-label="Uitzoomen" title="Uitzoomen">−</button>
          <span class="muted canvas-controls__pct">${Math.round(cs.zoom * 100)}%</span>
          <button class="icon-btn" type="button" data-action="canvas-zoom" data-zoom="in" aria-label="Inzoomen" title="Inzoomen">+</button>
          <button class="btn btn--ghost btn--small" type="button" data-action="canvas-zoom" data-zoom="fit">Passend</button>
          <span class="muted canvas-controls__hint" title="Scrollwiel: zoomen op de plek van de muis. Sleep de achtergrond om te verschuiven.">wiel = zoomen · slepen = verschuiven</span>
        </div>
        ${focusInfo ? `<span class="canvas-controls__focus">Lijn van <strong>${H.escapeHtml(focusInfo.label)}</strong> <button class="btn btn--ghost btn--small" type="button" data-action="canvas-clear-focus">Wissen</button></span>` : '<span class="muted canvas-controls__hint">Klik op een naam om de lijn te volgen.</span>'}
        <span class="canvas-legend" aria-label="Legenda">
          ${H.statusLegend()}
          <span class="canvas-legend__item"><span class="canvas-legend__line"></span> draagt bij aan</span>
          <span class="canvas-legend__item"><span class="canvas-legend__line canvas-legend__line--dashed"></span> nog te koppelen / hangt samen met</span>
        </span>
      </div>`;
  }

  // cs = { lens: 'strategic' | 'operational', groupBy, focusId, zoom }
  function render(dataset, filters, cs) {
    const index = buildIndex(dataset);
    const chainSet = cs.focusId ? chain(dataset, cs.focusId, index) : null;
    const display = ObeyaData.getDisplaySettings(dataset);
    const ctx = {
      lens: cs.lens, groupBy: cs.groupBy || 'objective', focusId: cs.focusId, zoom: cs.zoom || 1, layoutWidth: cs.layoutWidth || null, chainSet, index,
      display, detail: ObeyaData.DETAIL_LEVELS.includes(cs.detail) ? cs.detail : display.defaultDetail,
      chainLayout: ['rows', 'org', 'mindmap'].includes(cs.chainLayout) ? cs.chainLayout : display.chainLayout,
      opened: new Set(cs.opened || []),
      expanded: new Set(cs.expanded || []), folded: new Set(cs.folded || []),
      selecting: !!cs.selecting, selected: new Set(cs.selected || []), bulkNotice: cs.bulkNotice || '', bulkUndo: !!cs.bulkUndo,
    };
    const lens = ['operational', 'chain'].includes(cs.lens) ? cs.lens : 'strategic';
    ctx.lens = lens;
    const body = lens === 'operational' ? renderOperational(dataset, filters, ctx)
      : lens === 'chain' ? renderChain(dataset, filters, ctx) : renderStrategic(dataset, filters, ctx);
    return `<div class="canvas canvas--${lens}${lens === 'chain' ? ` canvas--chain-${ctx.chainLayout}` : ''}${ctx.selecting ? ' canvas--selecting' : ''}">${controls(dataset, { ...cs, lens, zoom: ctx.zoom, detail: ctx.detail, chainLayout: ctx.chainLayout })}${body}${bulkBar(dataset, ctx)}</div>`;
  }

  // --- lijnen tekenen (alleen in de browser) -------------------------------------

  // Positie van een element binnen het podium, los van de zoomfactor: die zit
  // als transform op het podium en verandert offsetLeft/offsetTop niet.
  function positionIn(stageEl, el) {
    let x = 0;
    let y = 0;
    let e = el;
    while (e && e !== stageEl) {
      x += e.offsetLeft;
      y += e.offsetTop;
      e = e.offsetParent;
    }
    return { x, y, w: el.offsetWidth, h: el.offsetHeight };
  }

  // Het podium is even breed als het venster (op de huidige zoomfactor), zodat
  // thema's en banen doorlopen naar een volgende rij in plaats van opzij weg
  // te lopen.
  // Na zoomen met het muiswiel ligt de breedte vast (data-layout-width):
  // tijdens het zoomen opnieuw indelen zou alles onder de muis vandaan laten
  // springen. "Passend", een andere lens of een ander venster deelt opnieuw in.
  // De lijnenlaag gaat eerst naar nul, anders telt de vorige tekening mee
  // bij het meten van het podium.
  function sizeStage(rootEl, stageEl, zoom) {
    const svg = stageEl.querySelector('.canvas-links');
    if (svg) { svg.setAttribute('width', 0); svg.setAttribute('height', 0); }
    const vast = parseFloat(stageEl.dataset.layoutWidth);
    if (Number.isFinite(vast) && vast > 0) { stageEl.style.width = `${vast}px`; return; }
    const viewport = rootEl.querySelector('.canvas-viewport');
    if (viewport) stageEl.style.width = `${Math.floor((viewport.clientWidth - 2) / zoom)}px`;
  }

  // Zoomen rond een punt (de muis): het stuk canvas onder dat punt blijft
  // daar staan. Alleen in de DOM, zonder opnieuw te renderen, zodat het
  // vloeiend blijft bij elke tik van het wiel. Geeft de vastgelegde breedte
  // terug, zodat de app die (en de zoom) kan onthouden voor de volgende render.
  function zoomAt(rootEl, newZoom, clientX, clientY) {
    const viewport = rootEl.querySelector('.canvas-viewport');
    const stageEl = rootEl.querySelector('.canvas-stage');
    const sizer = rootEl.querySelector('.canvas-sizer');
    if (!viewport || !stageEl || !sizer) return null;
    const oud = parseFloat(stageEl.dataset.zoom) || 1;
    const z = Math.max(0.3, Math.min(1.5, Math.round(newZoom * 100) / 100));
    const r = viewport.getBoundingClientRect();
    const px = (clientX === undefined ? r.width / 2 : clientX - r.left);
    const py = (clientY === undefined ? r.height / 2 : clientY - r.top);
    const cx = (viewport.scrollLeft + px) / oud;
    const cy = (viewport.scrollTop + py) / oud;
    if (!stageEl.dataset.layoutWidth) stageEl.dataset.layoutWidth = String(stageEl.offsetWidth);
    stageEl.dataset.zoom = String(z);
    stageEl.style.transform = `scale(${z})`;
    sizer.style.width = `${Math.ceil(stageEl.scrollWidth * z)}px`;
    sizer.style.height = `${Math.ceil(stageEl.scrollHeight * z)}px`;
    viewport.scrollLeft = cx * z - px;
    viewport.scrollTop = cy * z - py;
    const pct = rootEl.querySelector('.canvas-controls__pct');
    if (pct) pct.textContent = `${Math.round(z * 100)}%`;
    return { zoom: z, layoutWidth: parseFloat(stageEl.dataset.layoutWidth) };
  }

  function drawConnections(rootEl) {
    const stageEl = rootEl.querySelector('.canvas-stage');
    if (!stageEl) return;
    const svg = stageEl.querySelector('.canvas-links');
    const sizer = rootEl.querySelector('.canvas-sizer');
    const zoom = parseFloat(stageEl.dataset.zoom) || 1;
    sizeStage(rootEl, stageEl, zoom);
    const w = stageEl.scrollWidth;
    const h = stageEl.scrollHeight;
    // De transform verandert de ruimte die het podium inneemt niet; de sizer
    // krijgt daarom de geschaalde maat, zodat scrollen klopt.
    if (sizer) {
      sizer.style.width = `${Math.ceil(w * zoom)}px`;
      sizer.style.height = `${Math.ceil(h * zoom)}px`;
    }
    svg.setAttribute('width', w);
    svg.setAttribute('height', h);
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);

    let links = [];
    try { links = JSON.parse(stageEl.dataset.links || '[]'); } catch (err) { links = []; }
    const find = (id) => stageEl.querySelector(`[data-node="${CSS.escape(id)}"]`);
    const paths = [];
    links.forEach((l) => {
      const a = find(l.from);
      const b = find(l.to);
      // Verborgen kaarten (zoals de themakolom op het ketenvel) hebben geen
      // plek; een lijn ernaartoe zou naar de hoek van het canvas wijzen.
      if (!a || !b || !a.offsetParent || !b.offsetParent) return;
      const pa = positionIn(stageEl, a);
      const pb = positionIn(stageEl, b);
      let sx; let sy; let ex; let ey; let d;
      if (l.org) {
        // Organogram: van de bovenkant van het kind omhoog tot halverwege,
        // horizontaal naar boven het midden van de ouder, en omhoog tot de
        // ouder. Broers en zussen delen zo één horizontale lijn.
        sx = pa.x + pa.w / 2; sy = pa.y;
        ex = pb.x + pb.w / 2; ey = pb.y + pb.h;
        const my = ey + Math.max(12, (sy - ey) / 2);
        d = l.kind === 'contributes'
          ? `M${sx},${sy} C${sx},${sy - 60} ${ex},${ey + 60} ${ex},${ey}`
          : `M${sx},${sy} V${my} H${ex} V${ey}`;
      } else if (l.h) {
        // Keten: altijd van zijkant naar zijkant, van links naar rechts.
        const naarRechts = pb.x > pa.x;
        sx = naarRechts ? pa.x + pa.w : pa.x; sy = pa.y + Math.min(pa.h / 2, 22);
        ex = naarRechts ? pb.x : pb.x + pb.w; ey = pb.y + Math.min(pb.h / 2, 22);
        const mx = (sx + ex) / 2;
        // De boom (thema → doel, project → actie) haaks: één verticale
        // ruggengraat halverwege, zodat elke tak zichtbaar bij zijn kaart
        // aankomt. Bijdragen aan een resultaat blijven een bocht.
        d = l.kind === 'tree'
          ? `M${sx},${sy} H${mx} V${ey} H${ex}`
          : `M${sx},${sy} C${mx},${sy} ${mx},${ey} ${ex},${ey}`;
      } else if (pb.y + pb.h <= pa.y) {
        // Doel ligt erboven: van de bovenkant van de bron omhoog.
        sx = pa.x + pa.w / 2; sy = pa.y;
        ex = pb.x + pb.w / 2; ey = pb.y + pb.h;
        const my = (sy + ey) / 2;
        d = `M${sx},${sy} C${sx},${my} ${ex},${my} ${ex},${ey}`;
      } else if (pa.y + pa.h <= pb.y) {
        sx = pa.x + pa.w / 2; sy = pa.y + pa.h;
        ex = pb.x + pb.w / 2; ey = pb.y;
        const my = (sy + ey) / 2;
        d = `M${sx},${sy} C${sx},${my} ${ex},${my} ${ex},${ey}`;
      } else {
        // Naast elkaar: van zijkant naar zijkant.
        const links_ = pb.x > pa.x;
        sx = links_ ? pa.x + pa.w : pa.x; sy = pa.y + Math.min(pa.h / 2, 24);
        ex = links_ ? pb.x : pb.x + pb.w; ey = pb.y + Math.min(pb.h / 2, 24);
        const mx = (sx + ex) / 2;
        d = `M${sx},${sy} C${mx},${sy} ${mx},${ey} ${ex},${ey}`;
      }
      paths.push(`<path class="cv-link cv-link--${l.kind}${l.chain ? ' is-chain' : ''}" d="${d}"></path>`);
    });
    svg.innerHTML = paths.join('');
  }

  // De grootste zoomfactor waarbij het hele canvas in beeld past. Omdat de
  // inhoud doorloopt naar een volgende rij, hangt de hoogte af van de
  // breedte en dus van de zoomfactor zelf; daarom proberen we van groot naar
  // klein. Normaal niet groter dan 100%; in de kamermodus tot 150%, zodat een
  // klein bord een groot vergaderscherm ook vult. Nooit kleiner dan 50%: een
  // groot bord dat daarop nog niet past, blijft leesbaar en scrolt verticaal.
  // De beschikbare hoogte is de maximale hoogte van het canvasvenster (uit de
  // CSS), niet zijn huidige hoogte: die krimpt mee met de inhoud. Ook niet
  // de afstand tot de onderkant van het scherm, want die hangt af van hoe ver
  // de pagina gescrold is.
  const MIN_FIT = 0.5;
  function fitZoom(rootEl, opts) {
    const viewport = rootEl.querySelector('.canvas-viewport');
    const stageEl = rootEl.querySelector('.canvas-stage');
    if (!viewport || !stageEl) return 1;
    const max = opts && opts.presentation ? 1.5 : 1;
    const maxHoogte = parseFloat(getComputedStyle(viewport).maxHeight);
    const hoogte = Math.max(200, (Number.isFinite(maxHoogte) ? maxHoogte : window.innerHeight) - 4);
    const oud = stageEl.style.width;
    const vast = stageEl.dataset.layoutWidth;
    delete stageEl.dataset.layoutWidth; // passend maken deelt opnieuw in
    let gekozen = MIN_FIT;
    for (let z = max; z >= MIN_FIT; z = Math.round((z - 0.05) * 100) / 100) {
      sizeStage(rootEl, stageEl, z);
      if (stageEl.scrollHeight * z <= hoogte && stageEl.scrollWidth * z <= viewport.clientWidth) { gekozen = z; break; }
    }
    stageEl.style.width = oud;
    if (vast) stageEl.dataset.layoutWidth = vast;
    return gekozen;
  }

  // Alle ids met iets eronder, voor "alles openklappen"; met themesOnly alleen
  // de thema's (dan staan de doelen open).
  function openableIds(dataset, filters, themesOnly) {
    const themes = H.visibleThemes(dataset, filters);
    if (themesOnly) return themes.filter((t) => t.objectives.length).map((t) => t.id);
    const ids = [];
    const loop = (n) => { if (n.kind !== 'vision' && n.children.length) ids.push(n.id); n.children.forEach(loop); };
    loop(chainTree(dataset, themes, collectWork(dataset, filters, themes, 'objective')));
    return ids;
  }

  return { render, renderChainBand, mindmapLayout, chainTree, openableIds, drawConnections, fitZoom, zoomAt, chain, buildIndex, workTargets, strategicLinks, mrHasWork };
})();
