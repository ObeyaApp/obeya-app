// js/board.js
// Renders the three board-level views: Bord (theme columns), Lijst (table)
// and Verbindingen (theme x theme overlap matrix, based on themeIds so an
// objective that touches multiple strategic themes shows up in more than
// one column/row).

const ObeyaBoard = (function () {
  'use strict';
  const H = ObeyaUI;

  // opts.agendaTop / agendaBottom: HTML boven- en onderaan de Agenda (Te
  // bevestigen en de inbox; Overleg afgerond). opts.timeline: { mode:
  // 'notes' | 'changes' | 'both', changes: [{ at, html }], since: { at,
  // label }, toggleAll: HTML } voor de wijzigingen in de Tijdlijn.
  function render(dataset, filters, view, zoomLevel, matrixMode, opts) {
    const o = opts || {};
    if (view === 'list') return renderList(dataset, filters, zoomLevel);
    if (view === 'matrix') return renderMatrix(dataset, filters, matrixMode);
    if (view === 'timeline') return renderTimeline(dataset, filters, o.timeline);
    if (view === 'agenda') return renderAgenda(dataset, o.agendaTop, o.agendaBottom);
    if (view === 'execution') return renderExecution(dataset, filters);
    return renderBoard(dataset, filters, zoomLevel);
  }

  // --- Bord view -----------------------------------------------------------

  // True when a status/owner/teamplan/search filter is narrowing which
  // objectives show, as opposed to only the theme chips (which already hide
  // whole columns on their own via H.visibleThemes).
  function hasContentFilters(filters) {
    return filters.status !== null || !!filters.owner || filters.teamPlanOnly || !!filters.search
      || filters.year !== null || filters.quarter !== null || !!filters.principle;
  }

  function renderBoard(dataset, filters, zoomLevel) {
    const filtering = hasContentFilters(filters);
    let themes = H.visibleThemes(dataset, filters);
    if (filtering) {
      // Hide columns a status/owner/teamplan/search filter has emptied out,
      // but keep genuinely empty themes (no objectives at all yet) visible
      // so there is still a place to add the first doel.
      themes = themes.filter((theme) =>
        theme.objectives.length === 0 || theme.objectives.some((o) => H.objectivePassesFilters(o, filters))
      );
    }
    if (themes.length === 0) {
      return '<div class="empty-state">Geen thema’s zichtbaar. Pas de filters aan of voeg een strategisch thema toe.</div>';
    }
    // Een nieuw thema voeg je toe waar de thema's staan: achteraan het bord.
    return `<p id="board-drag-hint" class="sr-only">Sleep een doel of een thema om de volgorde te veranderen. Met het toetsenbord: Alt+pijl omhoog of omlaag verschuift een doel binnen zijn thema, Alt+pijl links of rechts zet het in het thema ernaast; op de kop van een thema verschuift Alt+pijl links of rechts het thema.</p>
      <div class="board" data-sort="board-themes">${themes.map((theme) => themeColumn(theme, filters, zoomLevel)).join('')}
      <div class="theme-col theme-col--add"><button class="btn btn--ghost theme-col__add" data-action="new-theme">+ Thema</button></div></div>`;
  }

  function themeColumn(theme, filters, zoomLevel) {
    const objectives = theme.objectives.filter((o) => H.objectivePassesFilters(o, filters));
    return `
      <section class="theme-col" data-theme-id="${H.escapeHtml(theme.id)}" style="--theme-accent:${H.escapeHtml(ObeyaData.themeColor(theme))}">
        <header class="theme-col__head" data-open="theme:${theme.id}" tabindex="0" role="button" aria-label="Thema bekijken: ${H.escapeHtml(theme.name)}" aria-describedby="board-drag-hint">
          <h2 class="theme-col__title" title="Klik om het thema te bekijken">${H.escapeHtml(theme.name)}</h2>
          <span class="theme-col__count">${objectives.length}</span>
        </header>
        <div class="theme-col__status">${H.statusPill(theme.status, { compact: true, entityType: 'theme' })}${H.coverageLabel(ObeyaData.themeCoverage(theme), { compact: true })}</div>
        <div class="theme-col__body" data-sort="board-objectives" data-theme-id="${H.escapeHtml(theme.id)}">
          ${objectives.length === 0
            ? '<p class="empty-col">Geen doelen zichtbaar met huidige filters.</p>'
            : objectives.map((o) => objectiveCard(o, zoomLevel)).join('')}
        </div>
        <button class="btn btn--ghost btn--small theme-col__add" data-action="new-objective" data-theme-id="${theme.id}" title="Nieuw doel bij dit thema">+ Doel</button>
      </section>`;
  }

  function objectiveCard(objective, zoomLevel) {
    const kpiCount = objective.measurableResults.length;
    const projectCount = objective.projects.length;
    const actionCount = objective.projects.reduce((n, p) => n + (p.actions || []).length, 0) + (objective.actions || []).length;
    const tp = H.objectiveInTeamPlan(objective);
    const noteCount = (objective.notes || []).length;
    const teLaat = objective.measurableResults.filter((m) => ObeyaData.isLate(m)).length;
    // "Overzicht": compacte kaart zonder aantallen, voor een bestuurlijke
    // blik op alleen status/titel/eigenaar. Zie ROADMAP idee 7/39.
    const overview = zoomLevel === 'overview';
    return `
      <article class="card objective-card" data-id="${H.escapeHtml(objective.id)}" data-open="objective:${objective.id}" tabindex="0" role="button" aria-label="${H.escapeHtml(objective.title)}" aria-roledescription="versleepbaar doel" aria-describedby="board-drag-hint">
        <div class="card__top">
          ${H.statusPill(objective.status, { compact: true, entityType: 'objective' })}
          ${tp ? '<span class="tp-badge" title="Bevat items uit het teamplan">TP</span>' : ''}
          ${H.pendingBadge(objective.id)}
          ${H.flagButton(objective, { compact: true, className: 'card__flag' })}
        </div>
        <p class="card__title">${H.escapeHtml(objective.title)}</p>
        <div class="card__meta">
          ${H.ownerBadge(objective.owner)}
          ${H.principleBadge(objective, { compact: true })}
          ${H.coverageLabel(ObeyaData.objectiveCoverage(objective), { compact: true })}
          ${teLaat ? `<span class="late-badge" title="Meetbare resultaten waarvan het streefkwartaal voorbij is en die nog niet klaar zijn">⏰ ${teLaat} te laat</span>` : ''}
          ${overview ? '' : `<span class="card__counts" title="${kpiCount} meetbare resultaten · ${projectCount} projecten · ${actionCount} acties · ${noteCount} notities">
            ${kpiCount} MR · ${projectCount} proj · ${actionCount} actie${actionCount === 1 ? '' : 's'}${noteCount ? ` · ${noteCount} notitie${noteCount === 1 ? '' : 's'}` : ''}
          </span>`}
        </div>
      </article>`;
  }

  // --- Lijst view ------------------------------------------------------------

  function renderList(dataset, filters, zoomLevel) {
    const overview = zoomLevel === 'overview';
    const pairs = H.visibleObjectivePairs(dataset, filters);
    if (pairs.length === 0) {
      return '<div class="empty-state">Geen doelen zichtbaar met de huidige filters.</div>';
    }
    return `
      <div class="table-wrap">
        <table class="obeya-table">
          <thead>
            <tr>
              <th>Thema</th>
              <th>Doel</th>
              <th>Status</th>
              <th>Eigenaar</th>
              ${overview ? '' : '<th>Meetbare resultaten</th><th>Projecten</th>'}
            </tr>
          </thead>
          <tbody>
            ${pairs.map(({ theme, objective }) => `
              <tr data-open="objective:${objective.id}" tabindex="0" role="button" aria-label="Doel bekijken: ${H.escapeHtml(objective.title)}">
                <td>${H.themeSwatch(theme)} <span class="status-dot status-dot--${theme.status}" aria-hidden="true"></span> ${H.escapeHtml(theme.name)}</td>
                <td class="obeya-table__title">${H.escapeHtml(objective.title)}</td>
                <td>${H.statusPill(objective.status, { compact: true, entityType: 'objective' })}${H.coverageLabel(ObeyaData.objectiveCoverage(objective), { compact: true })}</td>
                <td>${H.ownerBadge(objective.owner)}</td>
                ${overview ? '' : `
                <td>${objective.measurableResults.length
                  ? `<ul class="mini-list">${objective.measurableResults.slice(0, 4).map((m) => `<li>${H.statusPill(m.status, { compact: true, entityType: 'measurableResult' })} ${H.escapeHtml(m.name)}</li>`).join('')}${objective.measurableResults.length > 4 ? `<li class="mini-list__more">+${objective.measurableResults.length - 4} meer</li>` : ''}</ul>`
                  : '<span class="muted">—</span>'}</td>
                <td>${objective.projects.length
                  ? `<ul class="mini-list">${objective.projects.slice(0, 4).map((p) => `<li>${H.statusPill(p.status, { compact: true, entityType: 'project' })} ${H.escapeHtml(p.name)}</li>`).join('')}${objective.projects.length > 4 ? `<li class="mini-list__more">+${objective.projects.length - 4} meer</li>` : ''}</ul>`
                  : '<span class="muted">—</span>'}</td>`}
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  }

  // --- Verbindingen (matrix) view ---------------------------------------
  // Twee lenzen op "hoe hangt dit samen": gedeelde doelen tussen thema's
  // (structureel/strategisch), en items per eigenaar per thema (capaciteit/
  // spreiding — wie werkt breed over meerdere thema's, zichtbaar op een
  // fysieke muur maar niet vanzelf hier). Zie ROADMAP idee 47.

  function matrixModeToggle(mode) {
    const opt = (value, label, title) => `
      <button class="zoom-toggle__btn ${mode === value ? 'zoom-toggle__btn--active' : ''}" data-action="set-matrix-mode" data-matrix-mode="${value}" aria-pressed="${mode === value}" title="${title}">${label}</button>`;
    return `
      <div class="zoom-toggle matrix-mode-toggle" role="group" aria-label="Type verbinding">
        ${opt('theme', 'Thema × thema', 'Gedeelde doelen tussen thema’s')}
        ${opt('owner', 'Eigenaar × thema', 'Items per eigenaar per thema — capaciteit en spreiding')}
      </div>`;
  }

  function renderMatrix(dataset, filters, matrixMode) {
    const themes = H.visibleThemes(dataset, filters);
    if (themes.length < 2) {
      return '<div class="empty-state">Selecteer minimaal twee thema’s om verbindingen te zien.</div>';
    }
    const toggle = matrixModeToggle(matrixMode);
    return matrixMode === 'owner' ? renderOwnerMatrix(dataset, themes, toggle) : renderThemeMatrix(dataset, filters, themes, toggle);
  }

  function renderThemeMatrix(dataset, filters, themes, toggle) {
    function objectivesOf(themeId) {
      return H.visibleObjectivePairs(dataset, filters)
        .filter(({ objective }) => (objective.themeIds || [objective.themeId]).includes(themeId))
        .map(({ objective }) => objective);
    }
    function overlap(aId, bId) {
      const a = new Set(objectivesOf(aId).map((o) => o.id));
      return objectivesOf(bId).filter((o) => a.has(o.id)).length;
    }
    const max = Math.max(1, ...themes.flatMap((a) => themes.filter((b) => b.id !== a.id).map((b) => overlap(a.id, b.id))));
    const anyOverlap = max > 1 || themes.some((a) => themes.some((b) => b.id !== a.id && overlap(a.id, b.id) > 0));
    return `
      <div class="matrix-wrap">
        ${toggle}
        <p class="matrix-intro">Hoeveel doelen raken twee thema’s tegelijk? De diagonaal toont het totaal aantal doelen per thema.${anyOverlap
          ? ' Dit maakt in één oogopslag zichtbaar welke strategische thema’s inhoudelijk verweven zijn. Klik op een cel om te filteren.'
          : ' Op dit moment raakt geen enkel doel meer dan één thema — dat kan kloppen (thema’s zijn bewust gescheiden), of nog niet zo vastgelegd zijn. Probeer "Eigenaar × thema" hierboven voor een verband dat nu al gevuld is.'}</p>
        <div class="table-wrap">
        <table class="matrix">
          <thead><tr><th></th>${themes.map((t) => `<th title="${H.escapeHtml(t.name)}">${H.themeSwatch(t)} ${H.escapeHtml(abbr(t.name))}</th>`).join('')}</tr></thead>
          <tbody>
            ${themes.map((row) => `
              <tr>
                <th class="matrix__rowlabel">${H.themeSwatch(row)} ${H.escapeHtml(row.name)}</th>
                ${themes.map((col) => {
                  if (col.id === row.id) {
                    const n = objectivesOf(row.id).length;
                    return `<td><div class="mcell mcell--diag" data-action="filter-theme-pair" data-theme-a="${row.id}" tabindex="0" role="button" title="${n} doelen bij ${H.escapeHtml(row.name)} — klik om te filteren">${n}</div></td>`;
                  }
                  const n = overlap(row.id, col.id);
                  const alpha = n === 0 ? 0 : 0.2 + 0.8 * (n / max);
                  const interactive = n ? `data-action="filter-theme-pair" data-theme-a="${row.id}" data-theme-b="${col.id}" tabindex="0" role="button"` : '';
                  return `<td><div class="mcell ${n === 0 ? 'mcell--zero' : ''}" style="${n ? `--mcell-alpha:${alpha}` : ''}" ${interactive} title="${n} gedeelde doelen tussen ${H.escapeHtml(row.name)} en ${H.escapeHtml(col.name)}${n ? ' — klik om te filteren' : ''}">${n || ''}</div></td>`;
                }).join('')}
              </tr>`).join('')}
          </tbody>
        </table>
        </div>
      </div>`;
  }

  function renderOwnerMatrix(dataset, themes, toggle) {
    const perThemeCounts = themes.map((t) => ObeyaData.themeOwnerCounts(t));
    const owners = new Set();
    perThemeCounts.forEach((counts) => Object.keys(counts).forEach((o) => owners.add(o)));
    const ownerList = Array.from(owners);
    const totals = {};
    ownerList.forEach((o) => {
      totals[o] = perThemeCounts.reduce((sum, counts) => sum + (counts[o] || 0), 0);
    });
    ownerList.sort((a, b) => totals[b] - totals[a] || a.localeCompare(b, 'nl'));
    const max = Math.max(1, ...ownerList.flatMap((o) => perThemeCounts.map((counts) => counts[o] || 0)));

    if (ownerList.length === 0) {
      return `<div class="matrix-wrap">${toggle}<div class="empty-state">Geen eigenaren gevonden om te tonen.</div></div>`;
    }
    return `
      <div class="matrix-wrap">
        ${toggle}
        <p class="matrix-intro">Hoeveel items (thema/doel/meetbaar resultaat/project/actie) heeft elke eigenaar per thema? Wie breed verspreid is over meerdere thema’s valt hier in één oogopslag op — in een fysieke Obeya zie je dat vanzelf aan de muur, hier niet zonder dit overzicht. Gesorteerd op totale werklast. Klik op een cel om te filteren.</p>
        <div class="table-wrap">
        <table class="matrix">
          <thead><tr><th>Eigenaar</th>${themes.map((t) => `<th title="${H.escapeHtml(t.name)}">${H.themeSwatch(t)} ${H.escapeHtml(abbr(t.name))}</th>`).join('')}<th>Totaal</th></tr></thead>
          <tbody>
            ${ownerList.map((owner) => `
              <tr>
                <th class="matrix__rowlabel">${H.ownerBadge(owner)}</th>
                ${themes.map((t, i) => {
                  const n = perThemeCounts[i][owner] || 0;
                  const alpha = n === 0 ? 0 : 0.2 + 0.8 * (n / max);
                  const interactive = n ? `data-action="filter-owner-theme" data-owner="${H.escapeHtml(owner)}" data-theme-id="${t.id}" tabindex="0" role="button"` : '';
                  return `<td><div class="mcell ${n === 0 ? 'mcell--zero' : ''}" style="${n ? `--mcell-alpha:${alpha}` : ''}" ${interactive} title="${n} item${n === 1 ? '' : 's'} van ${H.escapeHtml(owner)} bij ${H.escapeHtml(t.name)}${n ? ' — klik om te filteren' : ''}">${n || ''}</div></td>`;
                }).join('')}
                <td><div class="mcell mcell--diag" title="${totals[owner]} items totaal voor ${H.escapeHtml(owner)}">${totals[owner]}</div></td>
              </tr>`).join('')}
          </tbody>
        </table>
        </div>
      </div>`;
  }

  function abbr(name) {
    return name.split(/\s+/).map((w) => w[0]).join('').slice(0, 4).toUpperCase();
  }

  // --- Tijdlijn view -----------------------------------------------------
  // Alle notities over de hele Obeya heen, chronologisch, filterbaar op
  // type. Maakt besluitvorming en andere notitietypes vindbaar zonder per
  // item te moeten zoeken — zie ROADMAP.md idee 32.

  function timelineEntries(dataset, filters) {
    const objectiveIds = new Set(H.visibleObjectivePairs(dataset, filters).map(({ objective }) => objective.id));
    const entries = [];
    dataset.themes.forEach((theme) => {
      theme.objectives.forEach((objective) => {
        if (!objectiveIds.has(objective.id)) return;
        (objective.notes || []).forEach((note) => {
          if (filters.noteTypes !== null && !filters.noteTypes.has(note.type)) return;
          const related = ObeyaData.findAny(dataset, note.relatedItemId);
          const relatedLabel = related ? (related.entity.name || related.entity.title || objective.title) : objective.title;
          entries.push({ note, theme, objective, relatedType: related ? related.type : 'objective', relatedLabel });
        });
      });
    });
    entries.sort((a, b) => (b.note.updatedAt || b.note.createdAt).localeCompare(a.note.updatedAt || a.note.createdAt));
    return entries;
  }

  // Notities · Wijzigingen · Beide (stap 5 van docs/wijzigingslog-plan.md),
  // met een scheidingsregel bij het vorige overleg.
  function timelineModeToggle(mode) {
    const opt = (value, label) => `<button class="zoom-toggle__btn ${mode === value ? 'zoom-toggle__btn--active' : ''}" type="button" data-action="set-timeline-mode" data-mode="${value}" aria-pressed="${mode === value}">${label}</button>`;
    return `<div class="zoom-toggle" role="group" aria-label="Wat de Tijdlijn toont">${opt('notes', 'Notities')}${opt('changes', 'Wijzigingen')}${opt('both', 'Beide')}</div>`;
  }

  function noteRow({ note, theme, objective, relatedLabel }) {
    return `
              <li class="timeline-item" data-open="${objective ? `objective:${objective.id}` : ''}" tabindex="0" role="button" aria-label="${H.escapeHtml(relatedLabel)} bekijken">
                <div class="timeline-item__date">${H.formatDate(note.createdAt)}${note.updatedAt ? `<span class="muted"> (bewerkt ${H.formatDate(note.updatedAt)})</span>` : ''}</div>
                <div class="timeline-item__body">
                  <div class="timeline-item__head">
                    <span class="note-type note-type--${note.type}">${H.escapeHtml(H.noteTypeLabel(note.type))}</span>
                    <span class="muted">${H.escapeHtml(note.author || 'Onbekend')} · ${H.themeSwatch(theme)} ${H.escapeHtml(theme.name)} / ${H.escapeHtml(relatedLabel)}</span>
                  </div>
                  <p class="timeline-item__text">${H.nl2br(note.text)}</p>
                </div>
              </li>`;
  }

  function renderTimeline(dataset, filters, tl) {
    const t = tl || {};
    const mode = ['notes', 'changes', 'both'].includes(t.mode) ? t.mode : 'notes';
    if (mode !== 'notes') return renderTimelineWithChanges(dataset, filters, t, mode);
    const entries = timelineEntries(dataset, filters);
    const typeChips = Object.keys(ObeyaData.NOTE_TYPES).map((t) => `
      <button class="chip filter-chip ${filters.noteTypes === null || filters.noteTypes.has(t) ? 'chip--on' : ''}" data-filter-note-type="${t}">
        <span class="note-type note-type--${t}">${H.escapeHtml(ObeyaData.NOTE_TYPES[t])}</span>
      </button>`).join('');
    return `
      <div class="timeline-wrap">
        ${timelineModeToggle(mode)}
        <p class="matrix-intro">Alle notities uit de hele Obeya, nieuwste eerst. Besluitvorming, obstakels en de rest van de kernlus zijn zo terug te vinden zonder per item te zoeken.</p>
        <div class="filter-group timeline-filters" aria-label="Filter op notitietype">${typeChips}</div>
        ${entries.length === 0
          ? '<div class="empty-state">Geen notities zichtbaar met de huidige filters.</div>'
          : `<ul class="timeline-list">${entries.map(noteRow).join('')}</ul>`}
      </div>`;
  }

  // Wijzigingen (en notities) door elkaar, nieuwste eerst, met "vorig
  // overleg" als scheidingsregel. De wijzigingen zijn niet gefilterd: ze
  // gaan over het hele bord.
  function renderTimelineWithChanges(dataset, filters, t, mode) {
    const regels = (t.changes || []).map((c) => ({ at: c.at, html: c.html }));
    if (mode === 'both') {
      timelineEntries(dataset, filters).forEach((e) => regels.push({ at: e.note.updatedAt || e.note.createdAt, html: noteRow(e) }));
    }
    regels.sort((a, b) => String(b.at).localeCompare(String(a.at)));
    const since = t.since;
    let gezet = false;
    const html = [];
    regels.forEach((r) => {
      if (since && !gezet && String(r.at) < String(since.at)) { html.push(sinceRow(since)); gezet = true; }
      html.push(r.html);
    });
    if (since && !gezet && regels.length) html.push(sinceRow(since));
    return `
      <div class="timeline-wrap">
        <div class="timeline-head">${timelineModeToggle(mode)}${t.toggleAll || ''}</div>
        <p class="matrix-intro">${mode === 'changes' ? 'Wat er op het bord veranderde' : 'Wijzigingen en notities'}, nieuwste eerst; de filters gelden alleen voor notities.</p>
        ${regels.length ? `<ul class="timeline-list history-list">${html.join('')}</ul>` : '<div class="empty-state">Nog geen wijzigingen vastgelegd.</div>'}
      </div>`;
  }

  function sinceRow(since) {
    return `<li class="history-since" role="separator" aria-label="${H.escapeHtml(since.label)}"><span>${H.escapeHtml(since.label)}</span></li>`;
  }

  // --- Agenda view ---------------------------------------------------------
  // Bespreekpunten voor het volgende overleg: handmatig gemarkeerde items
  // (elk type, via het 📌-icoon) plus automatisch elk project dat nog aan
  // geen enkel meetbaar resultaat is gekoppeld en dat ook niet bewust is
  // afgemeld — zie ROADMAP.md ideeën 13, 26, 37, 38.

  const AGENDA_TYPE_LABELS = {
    theme: 'Thema', objective: 'Doel', measurableResult: 'Meetbaar resultaat', project: 'Project', action: 'Actie',
  };

  // Geeft al veilige HTML terug (thema-swatch + geëscapete tekst), i.p.v.
  // platte tekst — de aanroeper mag het resultaat dus niet nogmaals escapen.
  function agendaContext(dataset, type, entity) {
    if (type === 'theme') return `${H.themeSwatch(entity)} ${H.escapeHtml(entity.name)}`;
    const objectiveId = type === 'objective' ? entity.id : entity.objectiveId;
    const objective = objectiveId ? ObeyaData.findObjective(dataset, objectiveId) : null;
    const theme = objective ? ObeyaData.findObjectiveOwnerTheme(dataset, objective.id) : null;
    if (!theme) return '';
    const swatch = H.themeSwatch(theme);
    if (objective && type !== 'objective') return `${swatch} ${H.escapeHtml(theme.name)} / ${H.escapeHtml(objective.title)}`;
    return `${swatch} ${H.escapeHtml(theme.name)}`;
  }

  // withOwner: de eigenaar erbij, want een gat in de keten is werk voor de
  // eigenaar, niet voor het hele overleg.
  function agendaRow(dataset, type, entity, reasonLabel, withOwner) {
    const label = entity.title || entity.name || '';
    const eigenaar = withOwner ? (entity.owner ? `Eigenaar: ${entity.owner}` : 'Geen eigenaar') : '';
    return `
      <li class="timeline-item" data-open="${type}:${entity.id}" tabindex="0" role="button" aria-label="${H.escapeHtml(eigenaar ? `${label}, ${eigenaar}` : label)}">
        <div class="timeline-item__date">${H.escapeHtml(AGENDA_TYPE_LABELS[type] || type)}</div>
        <div class="timeline-item__body">
          <div class="timeline-item__head">
            ${H.statusPill(entity.status, { compact: true, entityType: type })}
            <span class="muted">${agendaContext(dataset, type, entity)}</span>
            ${reasonLabel ? `<span class="relation-tag relation-tag--unmapped">${H.escapeHtml(reasonLabel)}</span>` : ''}
            ${eigenaar ? `<span class="agenda-owner">${H.escapeHtml(eigenaar)}</span>` : ''}
          </div>
          <p class="timeline-item__text">${H.escapeHtml(label)}</p>
        </div>
      </li>`;
  }

  // Gaten in de keten (idee 79): één blok, per soort ingeklapt tot een
  // telling; openklikken toont de items met hun eigenaar. Een lege soort
  // staat er niet. Volgorde: wat het zwaarst weegt eerst.
  const GAP_KINDS = [
    ['objectivesWithoutOwner', 'objective', 'doel zonder eigenaar', 'doelen zonder eigenaar'],
    ['objectivesWithoutResult', 'objective', 'doel zonder meetbaar resultaat', 'doelen zonder meetbaar resultaat'],
    ['resultsWithoutCriterion', 'measurableResult', 'meetbaar resultaat zonder "Klaar als"', 'meetbare resultaten zonder "Klaar als"'],
    ['projectsWithoutResult', 'project', 'project zonder meetbaar resultaat', 'projecten zonder meetbaar resultaat'],
  ];

  function gapsSection(dataset) {
    const gaps = ObeyaData.chainGaps(dataset);
    const totaal = GAP_KINDS.reduce((n, [key]) => n + gaps[key].length, 0);
    const groepen = GAP_KINDS.filter(([key]) => gaps[key].length).map(([key, type, een, meer]) => {
      const items = gaps[key];
      return `<details class="gap-group" id="gap-${key}"><summary>${items.length} ${H.escapeHtml(items.length === 1 ? een : meer)}</summary>
        <ul class="timeline-list">${items.map((e) => agendaRow(dataset, type, e, null, key !== 'objectivesWithoutOwner')).join('')}</ul></details>`;
    }).join('');
    return `
        <section class="modal-section" aria-labelledby="gaps-kop">
          <div class="modal-section__head"><h3 id="gaps-kop">Gaten in de keten (${totaal})</h3></div>
          ${totaal
            ? `<p class="muted">Werk voor de eigenaar, buiten het overleg. Bespreek het alleen als niemand het oppakt.</p>${groepen}`
            : '<p class="muted">Geen gaten: elk doel heeft een eigenaar en een meetbaar resultaat, elk resultaat een "Klaar als", en elk project draagt bij of is bewust afgemeld.</p>'}
        </section>`;
  }

  function renderAgenda(dataset, top, bottom) {
    const flagged = ObeyaData.allFlaggedItems(dataset);
    return `
      <div class="timeline-wrap">
        ${top || ''}
        <p class="matrix-intro">Bespreekpunten voor het volgende overleg: wat iemand expliciet heeft gemarkeerd (📌 op een item), plus de gaten in de keten.</p>
        <section class="modal-section">
          <div class="modal-section__head"><h3>Gemarkeerd voor bespreking (${flagged.length})</h3></div>
          ${flagged.length
            ? `<ul class="timeline-list">${flagged.map(({ type, entity }) => agendaRow(dataset, type, entity, null)).join('')}</ul>`
            : '<p class="muted">Nog niets gemarkeerd. Klik op 📌 bij een item om het hier te laten verschijnen.</p>'}
        </section>
${gapsSection(dataset)}
        ${bottom || ''}
      </div>`;
  }

  // --- Uitvoering-weergave ---------------------------------------------
  // Projecten, acties en meetbare resultaten centraal, los van de doel-
  // centrische Bord/Lijst-weergaven: vlakke, filterbare lijsten over de hele
  // Obeya heen, gesorteerd op wat het meest aandacht vraagt. Doel/thema en
  // gekoppelde meetbare resultaten staan er alleen bij ter oriëntatie —
  // waarheid, niet bewerkbaar op deze plek; bewerken doe je op de eigen
  // kaart. Zie ROADMAP.md idee 39.

  // Rood/amber vragen altijd het eerst om actie; daarna nog-niet-
  // gestart/niet-beoordeeld (er is nog geen beeld); dan bezig; klaar/op-
  // koers-of-behaald laatst, want daar hoeft nu niets meer te gebeuren.
  const EXECUTION_STATUS_ORDER = { red: 0, amber: 1, grey: 2, blue: 3, green: 4, done: 5 };

  function executionSort(entity) {
    return EXECUTION_STATUS_ORDER[entity.status] ?? 9;
  }

  // Wat te laat is, vraagt het eerst aandacht.
  function mrSort(mr) {
    return ObeyaData.isLate(mr) ? -1 : executionSort(mr);
  }

  function collectExecutionItems(dataset) {
    const mrs = [];
    const projects = [];
    const actions = [];
    dataset.themes.forEach((theme) => {
      theme.objectives.forEach((objective) => {
        objective.measurableResults.forEach((mr) => mrs.push({ theme, objective, mr }));
        objective.projects.forEach((p) => {
          projects.push({ theme, objective, project: p });
          (p.actions || []).forEach((a) => actions.push({ theme, objective, project: p, action: a }));
        });
        (objective.actions || []).forEach((a) => actions.push({ theme, objective, project: null, action: a }));
      });
    });
    return { mrs, projects, actions };
  }

  // De statusfilter bovenin kent alleen de rollup-waarden van een doel;
  // "klaar" heeft daar geen chip voor. Zulke items daarom nooit op
  // die filter uitsluiten — de sortering hierboven is de manier om ze terug
  // te vinden, niet de statuschips.
  function passesStatusChipFilter(filters, status) {
    if (filters.status === null) return true;
    if (!ObeyaData.STATUS_VALUES.includes(status)) return true;
    return filters.status.has(status);
  }

  // Een meetbaar resultaat draagt bij aan de principes van zijn doel (en de
  // projecten daaronder); het heeft zelf geen principe.
  function mrPassesExecutionFilters(theme, objective, mr, filters) {
    if (!H.principleMatches(ObeyaData.objectivePrinciples(objective), filters)) return false;
    if (filters.themeIds !== null && !filters.themeIds.has(theme.id)) return false;
    if (!passesStatusChipFilter(filters, mr.status)) return false;
    if (filters.owner && mr.owner !== filters.owner) return false;
    if (filters.teamPlanOnly && !mr.inTeamPlan) return false;
    if (filters.search && !H.textMatches([mr.name, mr.monitoringText], filters.search)) return false;
    return true;
  }

  function projectPassesExecutionFilters(project, theme, objective, filters) {
    if (!H.principleMatches(ObeyaData.projectPrinciples(project, objective), filters)) return false;
    if (filters.themeIds !== null && !filters.themeIds.has(theme.id)) return false;
    if (!passesStatusChipFilter(filters, project.status)) return false;
    if (filters.owner && project.owner !== filters.owner) return false;
    if (filters.teamPlanOnly && !project.inTeamPlan) return false;
    if ((filters.year !== null || filters.quarter !== null)
      && !ObeyaData.periodMatches(project.periodYear, project.periodQuarter, filters.year, filters.quarter)) return false;
    if (filters.search && !H.textMatches([project.name, project.description, project.monitoringText], filters.search)) return false;
    return true;
  }

  // Acties hebben geen eigen "in teamplan"-veld; bij dat filter valt een
  // actie terug op het teamplan-veld van haar project (rechtstreeks-onder-
  // doel-acties hebben dan geen signaal en tellen niet mee).
  // Acties krijgen geen eigen principe (besluit 12 oktober 2026): ze dragen
  // bij aan dat van hun project en doel.
  function actionPassesExecutionFilters(action, theme, objective, project, filters) {
    const principes = project ? ObeyaData.projectPrinciples(project, objective) : new Set(objective.principleIds || []);
    if (!H.principleMatches(principes, filters)) return false;
    if (filters.themeIds !== null && !filters.themeIds.has(theme.id)) return false;
    if (!passesStatusChipFilter(filters, action.status)) return false;
    if (filters.owner && action.owner !== filters.owner) return false;
    if (filters.teamPlanOnly && !(project && project.inTeamPlan)) return false;
    if ((filters.year !== null || filters.quarter !== null)
      && !ObeyaData.periodMatches(ObeyaData.yearFromDate(action.dueDate), ObeyaData.quarterFromDate(action.dueDate), filters.year, filters.quarter)) return false;
    if (filters.search && !H.textMatches([action.title, action.description], filters.search)) return false;
    return true;
  }

  function executionMrRow(theme, objective, mr) {
    const { projects, actions } = ObeyaData.contributingItems(objective, mr.id);
    const contributingCount = projects.length + actions.length;
    return `
      <li class="timeline-item" data-open="measurableResult:${mr.id}" tabindex="0" role="button" aria-label="${H.escapeHtml(mr.name)}">
        <div class="timeline-item__date">${H.statusPill(mr.status, { compact: true, entityType: 'measurableResult' })}</div>
        <div class="timeline-item__body">
          <div class="timeline-item__head">
            ${H.entityTypeBadge('measurableResult')}
            <span class="muted">${H.themeSwatch(theme)} ${H.escapeHtml(theme.name)} / ${H.escapeHtml(objective.title)}</span>
            ${H.ownerBadge(mr.owner)}
            ${contributingCount
              ? `<span class="relation-tag">↲ ${contributingCount} project${contributingCount === 1 ? '' : 'en'}/actie${contributingCount === 1 ? '' : 's'}</span>`
              : '<span class="relation-tag relation-tag--unmapped">Nog geen project/actie gekoppeld</span>'}
          </div>
          <p class="timeline-item__text">${H.escapeHtml(mr.name)} ${H.deliverableMeta(mr)}</p>
          ${H.doneCriterionLine(mr)}
        </div>
      </li>`;
  }

  function executionProjectRow(theme, objective, project) {
    return `
      <li class="timeline-item" data-open="project:${project.id}" tabindex="0" role="button" aria-label="${H.escapeHtml(project.name)}">
        <div class="timeline-item__date">${H.statusPill(project.status, { compact: true, entityType: 'project' })}</div>
        <div class="timeline-item__body">
          <div class="timeline-item__head">
            ${H.entityTypeBadge('project')}
            <span class="muted">${H.themeSwatch(theme)} ${H.escapeHtml(theme.name)} / ${H.escapeHtml(objective.title)}</span>
            ${H.ownerBadge(project.owner)}
            ${H.workTypeBadge(project)}
            ${H.principleBadge(project, { compact: true })}
            ${project.periodYear ? `<span class="muted">${H.escapeHtml(ObeyaData.formatPeriod(project.periodYear, project.periodQuarter))}</span>` : ''}
          </div>
          <p class="timeline-item__text">${H.escapeHtml(project.name)}</p>
          ${H.relationTags(objective, project)}
        </div>
      </li>`;
  }

  function executionActionRow(theme, objective, project, action) {
    const overdue = action.dueDate && action.dueDate < new Date().toISOString().slice(0, 10) && action.status !== 'green';
    const contextExtra = project ? project.name : 'rechtstreeks onder doel';
    return `
      <li class="timeline-item" data-open="action:${action.id}" tabindex="0" role="button" aria-label="${H.escapeHtml(action.title)}">
        <div class="timeline-item__date">${H.statusPill(action.status, { compact: true, entityType: 'action' })}</div>
        <div class="timeline-item__body">
          <div class="timeline-item__head">
            ${H.entityTypeBadge('action')}
            <span class="muted">${H.themeSwatch(theme)} ${H.escapeHtml(theme.name)} / ${H.escapeHtml(objective.title)} / ${H.escapeHtml(contextExtra)}</span>
            ${H.ownerBadge(action.owner)}
            ${action.dueDate ? `<span class="muted">${H.formatDate(action.dueDate)}</span>` : ''}
            ${overdue ? '<span class="relation-tag relation-tag--unmapped">Verlopen</span>' : ''}
          </div>
          <p class="timeline-item__text">${H.escapeHtml(action.title)}</p>
        </div>
      </li>`;
  }

  // Hoe het zichtbare werk over beheer, doorontwikkeling en vernieuwing
  // verdeeld is (proef, zie ObeyaData.WORK_TYPES).
  function workTypeSummary(projects) {
    const c = ObeyaData.workTypeCounts(projects);
    const delen = Object.keys(ObeyaData.WORK_TYPES).filter((k) => c[k]).map((k) => `${c[k]} ${ObeyaData.WORK_TYPES[k].toLowerCase()}`);
    if (c['']) delen.push(`${c['']} nog niet ingedeeld`);
    return `<p class="muted work-type-summary">Soort werk: ${delen.join(' · ')}</p>`;
  }

  // Dekking per principe uit de visie: hoeveel doelen en projecten er zelf
  // aan bijdragen en hoeveel daarvan aandacht vragen. Een principe zonder
  // werk is zelf het signaal. Een klik zet het principefilter.
  function principleSummary(dataset, filters) {
    const dekking = ObeyaData.principleCoverage(dataset);
    if (!dekking.rows.length) return '';
    const aantal = (n, een, meer) => `${n} ${n === 1 ? een : meer}`;
    // Eén regel compacte knoppen, zodat "wat vraagt aandacht" eronder het
    // startpunt van deze weergave blijft. De gekozen knop zegt "✓", niet
    // alleen een andere rand.
    const knop = (id, label, tekst, extraClass) => {
      const aan = filters.principle === id;
      return `
      <li><button id="principle-summary-${H.escapeHtml(id)}" class="principle-summary__item ${extraClass || ''} ${aan ? 'principle-summary__item--active' : ''}" data-action="set-principle-filter" data-principle-id="${H.escapeHtml(id)}" aria-pressed="${aan}" title="${aan ? 'Klik om het filter weer uit te zetten' : 'Klik om alleen dit te tonen'}">
        ${aan ? '✓ ' : ''}<strong>${H.escapeHtml(label)}</strong> ${tekst}
      </button></li>`;
    };
    return `
      <div class="principle-summary" role="group" aria-label="Principes uit de visie: dekking, klik om te filteren">
        <span class="muted principle-summary__label">Principes:</span>
        <ul class="principle-summary__list">
          ${dekking.rows.map((r) => knop(r.principle.id, r.principle.name,
            r.objectives || r.projects
              ? `${aantal(r.objectives, 'doel', 'doelen')} · ${aantal(r.projects, 'project', 'projecten')}${r.attention ? ` · <span class="principle-summary__attention">${r.attention} vraagt aandacht</span>` : ''}`
              : '<span class="principle-summary__attention">nog geen werk</span>')).join('')}
          ${knop(ObeyaData.NO_PRINCIPLE, 'zonder principe', `${aantal(dekking.unlabelledObjectives, 'doel', 'doelen')} · ${aantal(dekking.unlabelledProjects, 'project', 'projecten')}`, 'principle-summary__item--quiet')}
        </ul>
      </div>`;
  }

  function renderExecution(dataset, filters) {
    const { mrs, projects, actions } = collectExecutionItems(dataset);
    const visibleMrs = mrs.filter(({ theme, objective, mr }) => mrPassesExecutionFilters(theme, objective, mr, filters))
      .sort((a, b) => mrSort(a.mr) - mrSort(b.mr));
    const visibleProjects = projects.filter(({ theme, objective, project }) => projectPassesExecutionFilters(project, theme, objective, filters))
      .sort((a, b) => executionSort(a.project) - executionSort(b.project));
    const visibleActions = actions.filter(({ theme, objective, action, project }) => actionPassesExecutionFilters(action, theme, objective, project, filters))
      .sort((a, b) => executionSort(a.action) - executionSort(b.action));

    return `
      <div class="timeline-wrap">
        <p class="matrix-intro">Projecten, acties en meetbare resultaten uit de hele Obeya, los van de doel-indeling — gesorteerd op wat het meest aandacht vraagt. Doel/thema en gekoppelde resultaten staan er alleen bij ter oriëntatie; bewerken doe je op de eigen kaart.</p>
        ${principleSummary(dataset, filters)}
        <section class="modal-section">
          <div class="modal-section__head"><h3>Meetbare resultaten (${visibleMrs.length})</h3></div>
          ${visibleMrs.length
            ? `<ul class="timeline-list">${visibleMrs.map(({ theme, objective, mr }) => executionMrRow(theme, objective, mr)).join('')}</ul>`
            : '<p class="muted">Geen meetbare resultaten zichtbaar met de huidige filters.</p>'}
        </section>
        <section class="modal-section">
          <div class="modal-section__head"><h3>Projecten (${visibleProjects.length})</h3></div>
          ${visibleProjects.length ? workTypeSummary(visibleProjects.map(({ project }) => project)) : ''}
          ${visibleProjects.length
            ? `<ul class="timeline-list">${visibleProjects.map(({ theme, objective, project }) => executionProjectRow(theme, objective, project)).join('')}</ul>`
            : '<p class="muted">Geen projecten zichtbaar met de huidige filters.</p>'}
        </section>
        <section class="modal-section">
          <div class="modal-section__head"><h3>Acties (${visibleActions.length})</h3></div>
          ${visibleActions.length
            ? `<ul class="timeline-list">${visibleActions.map(({ theme, objective, project, action }) => executionActionRow(theme, objective, project, action)).join('')}</ul>`
            : '<p class="muted">Geen acties zichtbaar met de huidige filters.</p>'}
        </section>
      </div>`;
  }

  // De filterregels van de Uitvoering-weergave, ook gebruikt door de
  // canvasweergave (js/canvas.js) zodat filters overal hetzelfde betekenen.
  const passesFilters = {
    measurableResult: mrPassesExecutionFilters,
    project: projectPassesExecutionFilters,
    action: actionPassesExecutionFilters,
    statusChip: passesStatusChipFilter,
  };

  return { render, passesFilters };
})();
