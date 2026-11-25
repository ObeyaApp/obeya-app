// js/toolbar.js
// Header (title + vision + status legend), view tabs, filter bar and the
// import/export/reset toolbar.

const ObeyaToolbar = (function () {
  'use strict';
  const H = ObeyaUI;

  // Pictogrammen in de hoofdbalk: lijnen in de tekstkleur, verborgen voor
  // schermlezers; de knop zelf draagt de naam (aria-label) en een tooltip.
  const ICONS = {
    pull: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M4 17v3h16v-3"/></svg>',
    push: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V3"/><path d="m7 8 5-5 5 5"/><path d="M4 17v3h16v-3"/></svg>',
    print: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 14h10v7H7z"/></svg>',
    help: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 0 1 4.9.7c0 1.7-2.4 2.3-2.4 3.8"/><path d="M12 17h.01"/></svg>',
    settings: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  };

  // De kop (ontwerp UX-designer, 12 oktober 2026): een hoofdbalk met links de
  // teamnaam en klein het versienummer, rechts de status van het team als één
  // chip (met details in een paneel), Afdrukken en Instellingen; daaronder de
  // visie op één regel met rechts de peildatum. Zonder state (in tests en
  // waar alleen de naam telt) alleen naam, versie en visie.
  function renderHeader(dataset, state) {
    const meta = dataset.meta || {};
    return `
      <header class="app-header">
        <div class="app-topbar">
          <div class="app-topbar__brand">
            <span class="app-topbar__version" title="Versie van de app">v${H.escapeHtml(OBEYA_APP_VERSION)}</span>
            <h1 class="app-header__title">${H.escapeHtml(meta.name || 'Obeya')}</h1>
          </div>
          ${state ? `<div class="app-topbar__actions">
            ${state.getInbox ? ObeyaInboxView.topbarCounter(state.getInbox(), state.isGitConfigured()) : ''}
            ${renderTeamStatus(state)}
            <button class="topbar-btn topbar-btn--icon" data-action="open-print" title="Afdrukken: muurvellen om op te hangen" aria-label="Afdrukken">${ICONS.print}</button>
            <button class="topbar-btn topbar-btn--icon" data-action="open-settings" data-section="board" title="Instellingen: bord, eigenaren, statuslabels, weergave, team en data" aria-label="Instellingen">${ICONS.settings}</button>
            ${helpButton(state)}
          </div>` : ''}
        </div>
        <div class="app-visionbar">
          ${meta.vision ? `<p class="app-header__vision" title="${H.escapeHtml(meta.vision)}"><strong>Visie:</strong> ${H.escapeHtml(meta.vision)}</p>` : '<span></span>'}
          ${meta.lastUpdated ? `<p class="app-visionbar__date">Peildatum <strong>${H.formatDate(meta.lastUpdated)}</strong></p>` : ''}
        </div>
      </header>`;
  }

  const TABS = H.TABS;

  function viewLabel(view) {
    const tab = TABS.find(([id]) => id === view);
    return tab ? tab[1] : 'Bord';
  }

  // Hulp (idee 68): de "?" opent meteen het hoofdstuk van de weergave waar je
  // bent; de tooltip zegt welk. Op de pagina Hulp zelf is hij actief.
  function helpButton(state) {
    const view = state.getView ? state.getView() : 'board';
    const opHulp = view === 'help';
    const titel = opHulp ? 'Hulp (Escape: terug)' : `Hulp bij ${viewLabel(view)}: handleiding, de Obeya-methode en wat er nieuw is`;
    return `<button class="topbar-btn topbar-btn--icon ${opHulp ? 'topbar-btn--active' : ''}" data-action="open-help" title="${titel}" aria-label="Hulp"${opHulp ? ' aria-current="page"' : ''}>${ICONS.help}</button>`;
  }

  // Uitgezette tabbladen (Instellingen → Weergave, idee 83) staan niet in de
  // balk, behalve het tabblad waar je nu bent (bijvoorbeeld via een gedeeld adres).
  function renderTabs(view, dataset) {
    const verborgen = dataset ? ObeyaData.getDisplaySettings(dataset).hiddenViews : [];
    const tabs = TABS.filter(([id]) => id === view || !verborgen.includes(id));
    return `<div class="tabs" role="tablist">
      ${tabs.map(([id, label]) => `<button class="tab ${view === id ? 'tab--active' : ''}" role="tab" aria-selected="${view === id}" data-view="${id}">${label}</button>`).join('')}
    </div>`;
  }

  // Zelfde segmented-toggle-patroon/CSS als Overzicht/Detail. Bewust een
  // zichtbare, tekstueel gelabelde knop i.p.v. een verborgen modifier-klik —
  // dat laatste is minder ontdekbaar en riskeert een "mode error": klikken
  // en het tegenovergestelde krijgen van wat je verwachtte. Zie ROADMAP
  // idee 36.
  function renderChipModeToggle(mode) {
    const opt = (value, label, title) => `
      <button class="zoom-toggle__btn ${mode === value ? 'zoom-toggle__btn--active' : ''}" data-action="set-chip-mode" data-chip-mode="${value}" aria-pressed="${mode === value}" title="${title}">${label}</button>`;
    return `
      <span class="muted filter-chipmode-label">Klikken op een filterchip:</span>
      <div class="zoom-toggle" role="group" aria-label="Klikgedrag filterchips">
        ${opt('exclude', 'Uitsluiten', 'Klikken sluit dat item uit, de rest blijft zichtbaar')}
        ${opt('include', 'Insluiten', 'Klikken toont alleen dat item (en wat je verder aanklikt)')}
      </div>`;
  }

  // Welke filters een weergave werkelijk toepast. De filterbalk toont alleen
  // die, zodat er nooit een filter in beeld staat die niets doet.
  // tests/filters-per-view.test.js houdt deze lijst eerlijk: per weergave moet
  // elke getoonde filter de weergave veranderen, en elke verborgen niet.
  const ALLE_FILTERS = ['themes', 'status', 'owner', 'period', 'teamPlan', 'search', 'principle'];
  function filtersForView(view, opts) {
    const o = opts || {};
    // De eigenaar × thema-matrix telt per thema alle items op; alleen de
    // themakeuze verandert wat er staat.
    if (view === 'matrix' && o.matrixMode === 'owner') return new Set(['themes']);
    // De Agenda toont altijd alle bespreekpunten: wat gemarkeerd is plus alles
    // wat nog gekoppeld moet worden.
    if (view === 'agenda') return new Set();
    // Stukken zijn tekst, geen bord-items: filters doen daar niets.
    if (view === 'documents' || view === 'help') return new Set();
    return new Set(ALLE_FILTERS);
  }

  // De actieve filters in woorden, elk met de sleutel om alleen die weg te
  // halen. Zoeken staat al zichtbaar in het zoekveld en telt alleen mee.
  // Wat er nog te zien is, of (als dat korter is) wat er weggelaten is.
  function keuzeTekst(soort, aan, uit) {
    if (!aan.length) return `${soort}: geen`;
    return uit.length < aan.length ? `${soort}: zonder ${uit.join(', ')}` : `${soort}: ${aan.join(', ')}`;
  }

  function activeFilterChips(dataset, filters, toon) {
    const chips = [];
    if (toon.has('themes') && filters.themeIds !== null && filters.themeIds.size !== dataset.themes.length) {
      const naam = (t) => t.name;
      chips.push(['themes', keuzeTekst('Thema', dataset.themes.filter((t) => filters.themeIds.has(t.id)).map(naam), dataset.themes.filter((t) => !filters.themeIds.has(t.id)).map(naam))]);
    }
    if (toon.has('status') && filters.status !== null) {
      const label = (s) => ObeyaData.statusLabelFor('objective', s, dataset);
      chips.push(['status', keuzeTekst('Status', ObeyaData.STATUS_VALUES.filter((s) => filters.status.has(s)).map(label), ObeyaData.STATUS_VALUES.filter((s) => !filters.status.has(s)).map(label))]);
    }
    if (toon.has('owner') && filters.owner) chips.push(['owner', `Eigenaar: ${filters.owner}`]);
    if (toon.has('period') && filters.year !== null) chips.push(['year', `Jaar: ${filters.year}`]);
    if (toon.has('period') && filters.quarter !== null) chips.push(['quarter', `Kwartaal: Q${filters.quarter}`]);
    if (toon.has('teamPlan') && filters.teamPlanOnly) chips.push(['teamPlan', 'Alleen teamplan']);
    if (toon.has('principle') && filters.principle) {
      const p = ObeyaData.getPrinciples(dataset).find((x) => x.id === filters.principle);
      chips.push(['principle', filters.principle === ObeyaData.NO_PRINCIPLE ? 'Zonder principe' : `Principe: ${p ? p.name : 'onbekend'}`]);
    }
    return chips;
  }

  // Eén regel: de knop Filters (met het aantal actieve), zoeken, en de actieve
  // filters als chips die je los weghaalt. De chips zelf staan in een paneel
  // dat standaard dicht is, zodat het bord hoog op het scherm begint (idee 55).
  // Het paneel staat altijd in de HTML (hidden als het dicht is), zodat de
  // focus na een klik op een chip terugkomt op dezelfde chip.
  function renderFilterBar(dataset, filters, hasActive, chipMode, available, panelOpen) {
    const toon = new Set(available || ALLE_FILTERS);
    if (!ObeyaData.getPrinciples(dataset).length) toon.delete('principle');
    if (!toon.size) return '';
    const owners = ObeyaData.getOwnerOptions(dataset);
    const years = ObeyaData.getAvailableYears(dataset);
    const chipHint = chipMode === 'include' ? 'Klik om alleen dit te tonen' : 'Klik om dit uit te sluiten';
    const heeftChips = toon.has('themes') || toon.has('status');
    const overige = ['owner', 'period', 'teamPlan', 'principle'].some((k) => toon.has(k));
    const actief = activeFilterChips(dataset, filters, toon);
    const aantal = actief.length + (toon.has('search') && filters.search ? 1 : 0);
    const heeftPaneel = heeftChips || overige;
    return `
      <div class="filter-bar">
        <div class="filter-bar__row">
          ${heeftPaneel ? `<button class="btn btn--ghost btn--small filter-toggle" id="filter-toggle" data-action="toggle-filter-panel" aria-expanded="${panelOpen ? 'true' : 'false'}" aria-controls="filter-panel">Filters${aantal ? ` (${aantal})` : ''} ${panelOpen ? '▴' : '▾'}</button>` : ''}
          ${toon.has('search') ? `<input type="search" id="filter-search" placeholder="Zoeken..." value="${H.escapeHtml(filters.search)}" aria-label="Zoeken in de Obeya">` : ''}
          ${actief.length ? `<div class="filter-active" role="group" aria-label="Actieve filters">
            ${actief.map(([key, label]) => `<span class="filter-active__chip">${H.escapeHtml(label)}<button class="filter-active__remove" data-action="clear-filter" data-filter-key="${key}" aria-label="Filter ${H.escapeHtml(label)} weghalen" title="Weghalen">×</button></span>`).join('')}
          </div>` : ''}
          ${hasActive ? '<button class="btn btn--ghost btn--small" data-action="clear-filters">Filters wissen</button>' : ''}
        </div>
        ${heeftPaneel ? `<div class="filter-panel" id="filter-panel" ${panelOpen ? '' : 'hidden'}>
          ${heeftChips ? `<div class="filter-bar__row">${renderChipModeToggle(chipMode)}</div>` : ''}
          ${toon.has('themes') ? `<div class="filter-bar__row">
            <div class="filter-group" role="group" aria-label="Filter op thema">
              ${dataset.themes.map((t) => `
                <button class="chip filter-chip ${filters.themeIds === null || filters.themeIds.has(t.id) ? 'chip--on' : ''}" id="filter-theme-${H.escapeHtml(t.id)}" data-filter-theme="${t.id}" title="${chipHint}: ${H.escapeHtml(t.name)}">
                  ${H.themeSwatch(t)}<span class="status-dot status-dot--${t.status}" aria-hidden="true"></span>${H.escapeHtml(t.name)}
                </button>`).join('')}
            </div>
          </div>` : ''}
          ${toon.has('status') || overige ? `<div class="filter-bar__row">
            ${toon.has('status') ? `<div class="filter-group" role="group" aria-label="Filter op status">
              ${ObeyaData.STATUS_VALUES.map((s) => `
                <button class="chip filter-chip ${filters.status === null || filters.status.has(s) ? 'chip--on' : ''}" id="filter-status-${s}" data-filter-status="${s}" title="${chipHint}: ${H.escapeHtml(ObeyaData.statusLabelFor('objective', s, dataset))}">
                  ${H.statusPill(s, { compact: true, entityType: 'objective' })}
                </button>`).join('')}
            </div>` : ''}
            ${toon.has('owner') ? `<select id="filter-owner" aria-label="Filter op eigenaar">
              <option value="">Alle eigenaren</option>
              ${H.ownerOptionsHtml(dataset, filters.owner)}
            </select>` : ''}
            ${toon.has('period') ? `<select id="filter-year" aria-label="Filter op jaar">
              <option value="">Alle jaren</option>
              ${years.map((y) => `<option value="${y}" ${filters.year === y ? 'selected' : ''}>${y}</option>`).join('')}
            </select>
            <select id="filter-quarter" aria-label="Filter op kwartaal">
              <option value="">Alle kwartalen</option>
              ${[1, 2, 3, 4].map((q) => `<option value="${q}" ${filters.quarter === q ? 'selected' : ''}>Q${q}</option>`).join('')}
            </select>` : ''}
            ${toon.has('principle') ? `<select id="filter-principle" aria-label="Filter op principe">
              <option value="">Alle principes</option>
              ${ObeyaData.getPrinciples(dataset).map((p) => `<option value="${H.escapeHtml(p.id)}" ${filters.principle === p.id ? 'selected' : ''}>${H.escapeHtml(p.name)}</option>`).join('')}
              <option value="${ObeyaData.NO_PRINCIPLE}" ${filters.principle === ObeyaData.NO_PRINCIPLE ? 'selected' : ''}>Zonder principe</option>
            </select>` : ''}
            ${toon.has('teamPlan') ? `<label class="filter-checkbox">
              <input type="checkbox" id="filter-teamplan" ${filters.teamPlanOnly ? 'checked' : ''}>
              Alleen teamplan
            </label>` : ''}
          </div>` : ''}
        </div>` : ''}
      </div>`;
  }

  const SOURCE_LABELS = {
    seed: () => 'Voorbeelddata uit data/obeya.json',
    storage: () => 'Hersteld uit een eerdere sessie in deze browser',
    import: (detail) => (detail ? `Geïmporteerd bestand: ${H.escapeHtml(detail)}` : 'Geïmporteerd bestand'),
    git: () => 'Van het team (GitHub)',
  };

  // Een ander tabblad heeft de data gewijzigd: dit tabblad is verouderd.
  function renderStaleTabNotice(state) {
    if (!(state.isStaleTab && state.isStaleTab())) return '';
    return `
      <div class="callout callout--version" role="alert">
        <strong>Dit bord is in een ander tabblad gewijzigd.</strong>
        Wat je hier ziet is verouderd; om te voorkomen dat het het andere werk overschrijft, wordt er in dit tabblad niets meer opgeslagen of gedeeld.
        <span class="callout__actions"><button class="btn btn--small" data-action="reload-page">Herladen</button></span>
      </div>`;
  }

  // Melding bij een bord waar voorbeelddata tussen de eigen data staat.
  function renderDemoMixNotice(state) {
    const info = state.getDemoMix ? state.getDemoMix() : null;
    if (!info) return '';
    return `
      <div class="callout callout--version" role="status">
        <strong>Er staan ${info.demoItems} items uit de voorbeelddata tussen de ${info.ownItems} items van dit bord.</strong>
        Waarschijnlijk zijn die er bij het ophalen van het team per ongeluk in gekomen. Verwijderen haalt precies die items weg (ook als je er iets aan hebt veranderd); wat je zelf hebt toegevoegd, blijft staan. Ongedaan maken kan.
        <span class="callout__actions">
          <button class="btn btn--small" data-action="remove-demo-items">Voorbeelddata verwijderen</button>
          <button class="btn btn--ghost btn--small" data-action="dismiss-demo-mix">Niet nu</button>
        </span>
      </div>`;
  }

  function renderVersionNotice(state) {
    const info = state.getVersionInfo();
    if (!info.mismatch) return '';
    return `
      <div class="callout callout--version" role="status">
        Deze data is bijgewerkt met app-versie ${H.escapeHtml(info.dataVersion)}; hier draait nog versie ${H.escapeHtml(info.appVersion)}. Haal de nieuwste versie van de app op (in VS Code: <em>Pull</em>, of <code>git pull</code>) en herlaad de pagina, anders mis je functies.
      </div>`;
  }

  // Weergave-dichtheid op Bord/Lijst — "Overzicht" laat aantallen/kolommen
  // weg voor een bestuurlijke blik, "Detail" is de volledige weergave. Regelt
  // geen toegang: alle tabbladen en detailschermen blijven in beide standen
  // bereikbaar. Zie ROADMAP idee 7/39.
  // Alleen op Bord en Lijst: daar regelt het de dichtheid; elders verandert
  // het niets en hoort het dus niet in beeld (net als de filters, zie
  // filtersForView).
  function renderZoomToggle(zoomLevel) {
    const level = zoomLevel === 'overview' ? 'overview' : 'detail';
    const opt = (value, label, title) => `
      <button class="zoom-toggle__btn ${level === value ? 'zoom-toggle__btn--active' : ''}" data-action="set-zoom" data-zoom="${value}" aria-pressed="${level === value}" title="${title}">${label}</button>`;
    return `
      <div class="zoom-toggle" role="group" aria-label="Weergaveniveau">
        ${opt('overview', 'Overzicht', 'Compacte kaarten en tabel, zonder aantallen — bestuurlijke blik')}
        ${opt('detail', 'Detail', 'Volledige kaarten en tabel, met aantallen — team/operationeel')}
      </div>`;
  }

  // De status van het team als één chip rechtsboven (idee 4+49, zie
  // js/git-backend.js): staat dit bord veilig en gedeeld? Symbool én tekst,
  // nooit alleen kleur. Een klik opent een paneel met de details en de
  // knoppen; op een breed scherm staan repo en knoppen er ook naast, op een
  // telefoon blijft alleen het symbool. De uitkomst van de laatste actie staat
  // in één live-regio die altijd in de pagina staat.
  function teamState(state) {
    if (!state.isGitConfigured()) return { key: 'local', sym: '○', text: 'Alleen in deze browser' };
    const status = state.getGitStatus();
    if (status.busy) return { key: 'busy', sym: '↻', text: 'Bezig…' };
    if (status.lastError) return { key: 'error', sym: '✕', text: 'Mislukt' };
    if (state.hasUnsharedChanges && state.hasUnsharedChanges()) return { key: 'unshared', sym: '▲', text: 'Niet gedeeld' };
    // Verbonden, maar nog nooit opgehaald: dan is er niets gedeeld om te melden.
    if (state.hasGitBase && !state.hasGitBase()) return { key: 'notfetched', sym: '●', text: 'Nog niet opgehaald' };
    const tijd = status.lastSyncedAt ? ` · ${status.lastSyncedAt.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}` : '';
    return { key: 'ok', sym: '✓', text: `Gedeeld${tijd}` };
  }

  function renderTeamStatus(state) {
    const t = teamState(state);
    const configured = state.isGitConfigured();
    const status = configured ? state.getGitStatus() : { busy: false };
    const cfg = configured ? ObeyaGitBackend.getConfig() : null;
    const identity = configured && state.getGitIdentity ? state.getGitIdentity() : null;
    const busy = status.busy;
    // "Jij bent" (stap 2 van docs/wijzigingslog-plan.md), alleen in deze browser.
    const me = state.getMe ? state.getMe() : null;
    const wie = me ? `${me.name} · ` : '';
    const repo = cfg ? `${H.escapeHtml(cfg.owner)}/${H.escapeHtml(cfg.repo)}${identity ? ` · als @${H.escapeHtml(identity.login)}` : ''}` : '';
    const syncLabel = configured ? (status.lastSyncedAt ? `laatst gesynchroniseerd ${status.lastSyncedAt.toLocaleTimeString('nl-NL')}` : 'nog niet gesynchroniseerd deze sessie') : '';
    const knoppen = configured ? `
          <button class="btn btn--ghost btn--small" data-action="git-pull" ${busy ? 'disabled' : ''}>${busy ? 'Bezig…' : 'Ophalen van team'}</button>
          <button class="btn btn--small" data-action="git-push" ${busy ? 'disabled' : ''}>${busy ? 'Bezig…' : 'Delen met team'}</button>` : '';
    return `
      <div class="team-status team-status--${t.key}">
        <details class="team-status__menu">
          <summary class="team-chip" aria-label="${H.escapeHtml(wie)}Team: ${H.escapeHtml(t.text)}" title="${H.escapeHtml(wie)}Team: ${H.escapeHtml(t.text)}">
            <span class="team-chip__sym" aria-hidden="true">${t.sym}</span>
            ${me ? `<span class="team-chip__who">${H.escapeHtml(me.name)}</span>` : ''}
            <span class="team-chip__text">${H.escapeHtml(t.text)}</span>
            ${repo ? `<span class="team-chip__repo">${repo}</span>` : ''}
          </summary>
          <div class="team-status__panel" role="group" aria-label="Team en opslag">
            ${configured ? `
            <p><strong>${repo}</strong> <span class="muted">(${H.escapeHtml(cfg.branch)})</span></p>
            <p class="muted">${H.escapeHtml(syncLabel)}${identity ? ` · delen gebeurt op naam van ${H.escapeHtml(identity.name)}` : ''}</p>
            ${state.hasUnsharedChanges && state.hasUnsharedChanges() ? '<p><strong class="git-unshared">niet gedeelde wijzigingen</strong></p>' : ''}
            ${status.lastError ? `<p class="team-status__error">Fout bij de laatste poging: ${H.escapeHtml(H.gitErrorMessage(status.lastError, status.lastErrorDetail))}</p>` : ''}` : '<p>Dit bord staat alleen in deze browser. Verbind met de data-repo van het team om samen te werken.</p>'}
            <p class="muted">${renderSaveIndicator(state)}</p>
            <p>${me ? `Jij bent <strong>${H.escapeHtml(me.name)}</strong>${me.source === 'github' ? ' (via je GitHub-login)' : ''}.` : 'Je hebt nog niet gekozen wie je bent.'} <button type="button" class="doc-link" data-action="open-settings" data-section="team">${me ? 'Wijzigen' : 'Kiezen'}</button></p>
            <div class="team-status__buttons">
              ${knoppen}
              <button class="btn ${configured ? 'btn--ghost' : ''} btn--small" data-action="git-configure">${configured ? 'Verbinding wijzigen' : 'Verbinden met team'}</button>
            </div>
          </div>
        </details>
        ${configured ? `<span class="team-status__quick">
          <button class="topbar-btn topbar-btn--icon" data-action="git-pull" ${busy ? 'disabled' : ''} aria-label="Ophalen van team" title="Ophalen van team: de laatste versie van het team binnenhalen">${ICONS.pull}</button>
          <button class="topbar-btn topbar-btn--icon${t.key === 'unshared' ? ' topbar-btn--strong' : ''}" data-action="git-push" ${busy ? 'disabled' : ''} aria-label="Delen met team${t.key === 'unshared' ? ' (er zijn niet gedeelde wijzigingen)' : ''}" title="Delen met team: jouw wijzigingen naar het team">${ICONS.push}</button>
        </span>` : ''}
        <span class="sr-only git-notice" role="status">${status.notice ? H.escapeHtml(status.notice) : ''}</span>
      </div>`;
  }

  // Waar de data vandaan komt en wanneer die lokaal is opgeslagen; staat in de kop.
  function renderSaveIndicator(state) {
    const saved = state.getLastSavedAt();
    const source = state.getDatasetSource();
    const sourceLabel = (SOURCE_LABELS[source.kind] || SOURCE_LABELS.seed)(source.detail);
    const savedLabel = saved ? `laatst lokaal opgeslagen ${saved.toLocaleTimeString('nl-NL')}` : 'nog niet lokaal opgeslagen';
    const fullExplanation = `Bron: ${sourceLabel}. ${savedLabel}. Wijzigingen worden automatisch lokaal in deze browser bewaard (niet gedeeld met anderen) totdat je bewust exporteert of deelt.`;
    return `
      <span class="save-indicator" title="${H.escapeHtml(fullExplanation)}">
        <span class="save-indicator__dot"></span>${sourceLabel} · ${savedLabel}
      </span>`;
  }

  // Meldingen die om een handeling vragen, boven de bediening.
  function renderNotices(state) {
    return `${renderVersionNotice(state)}${renderStaleTabNotice(state)}${renderDemoMixNotice(state)}`;
  }

  // Naast de tabbladen: wat je in een sessie met één klik nodig hebt
  // (weergave, beoordelen, ongedaan maken, kamermodus). Team, afdrukken en
  // instellingen staan in de hoofdbalk erboven.
  function renderToolbar(state) {
    return `
      <div class="toolbar">
        <div class="toolbar__group" role="group" aria-label="Weergave en sessie">
          ${['board', 'list'].includes(state.getView ? state.getView() : 'board') ? renderZoomToggle(state.getZoomLevel()) : ''}
          <button class="btn btn--ghost btn--small" data-action="open-review" title="Eén voor één langs wat nog geen oordeel, &quot;Klaar als&quot; of duidelijke eigenaar heeft, of te laat is">${state.getReview && state.getReview() ? 'Verder met beoordelen' : 'Beoordelingsronde'}</button>
          ${state.canUndo() ? `<button class="btn btn--ghost btn--small" data-action="undo" title="Ongedaan maken: ${H.escapeHtml(state.getUndoLabel())}. Werkt ook met Ctrl/Cmd+Z." aria-label="Ongedaan maken: ${H.escapeHtml(state.getUndoLabel())}">↶</button>` : ''}
          ${(() => { const aan = !!(state.isPresentationMode && state.isPresentationMode()); return `<button class="btn btn--small" data-action="toggle-presentation" aria-pressed="${aan}" title="${aan ? 'Terug naar de gewone weergave (ook met Escape)' : 'Vergrote weergave zonder bediening, voor een vergaderscherm'}">${aan ? 'Kamer-modus uit' : 'Kamer-modus'}</button>`; })()}
        </div>

        <input type="file" id="import-file" accept="application/json" hidden>
      </div>`;
  }

  return { renderHeader, renderTabs, renderFilterBar, renderToolbar, renderNotices, renderVersionNotice, filtersForView, viewLabel };
})();
