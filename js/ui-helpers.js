// js/ui-helpers.js
// Small, stateless rendering helpers shared by the board, modal and toolbar
// renderers: HTML escaping, status pills, owner badges, filtering logic.

const ObeyaUI = (function () {
  'use strict';

  // Kleine module-cache van de actieve dataset, ververst door app.js aan het
  // begin van elke render() — zodat statusPill/statusSelect bij
  // ObeyaData.statusLabelFor kunnen zonder dataset door elke tussenliggende
  // renderfunctie heen te hoeven doorgeven. ui-helpers.js blijft daarmee
  // stateless in de zin dat dit binnen één render nooit verandert; het is
  // puur een gecontroleerde uitzondering op het anders overal expliciet
  // doorgeven van dataset, voor precies dit ene cross-cutting stukje config.
  let activeDataset = null;
  function setActiveDataset(dataset) {
    activeDataset = dataset;
  }

  function escapeHtml(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  function nl2br(str) {
    return escapeHtml(str).replace(/\n/g, '<br>');
  }

  // Status pill: always shows a colored dot AND a text label, per the
  // requirement that status is never communicated by color alone.
  // opts.entityType laat het label per entiteitstype verschillen (bv.
  // "groen" is bij een project "Klaar", bij een doel "Op koers") zonder de
  // onderliggende waarde/kleur te veranderen — zie ObeyaData.statusLabelFor.
  // Een eigen vorm per status, ook zonder kleur te onderscheiden; dezelfde
  // symbolen als op de muurvellen.
  // Klaar is een vinkje in een gevuld vakje (CSS: .status-done .status-sym),
  // zodat het niet op het losse vinkje van Op koers lijkt.
  const STATUS_SYMBOL = { green: '✓', amber: '▲', red: '✖', grey: '?', blue: '▶', done: '✓' };
  // Wat geen aandacht vraagt: bij een rustige status alleen het symbool.
  const QUIET_STATUSES = ['green', 'blue', 'done'];

  function quietStatusOn() {
    return !!(activeDataset && ObeyaData.getDisplaySettings(activeDataset).quietStatus);
  }

  // opts.card: een kaart op Bord of Samenhang. Staat "Rustige status" aan,
  // dan krijgt daar elke status een symbool in plaats van het bolletje, en
  // verdwijnt het woord bij wat op koers, bezig of klaar is (advies Obeya-
  // coach: alleen de afwijking valt op). Het woord blijft voor schermlezers
  // en in de tooltip.
  function statusPill(status, opts) {
    opts = opts || {};
    const meta = ObeyaData.STATUS_META[status] || ObeyaData.STATUS_META.grey;
    const key = ObeyaData.STATUS_META[status] ? status : 'grey';
    const label = ObeyaData.statusLabelFor(opts.entityType, key, activeDataset);
    const size = opts.compact ? ' status-pill--compact' : '';
    if (opts.card && quietStatusOn()) {
      const sym = `<span class="status-sym" aria-hidden="true">${STATUS_SYMBOL[key]}</span>`;
      return QUIET_STATUSES.includes(key)
        ? `<span class="status-pill status-pill--quiet status-${key}" title="${escapeHtml(label)}">${sym}<span class="sr-only">${escapeHtml(label)}</span></span>`
        : `<span class="status-pill status-pill--sym status-${key}${size}" title="${escapeHtml(label)}">${sym}${escapeHtml(label)}</span>`;
    }
    return `<span class="status-pill status-${key}${size}" title="${escapeHtml(label)} — ${escapeHtml(meta.en)} (${key})">
      <span class="status-dot" aria-hidden="true"></span>${escapeHtml(label)}
    </span>`;
  }

  // De legenda bij een rustige status: de symbolen met hun woord, één keer.
  // Een <details>, zodat hij geen ruimte kost; in de kamermodus staat hij open.
  function statusLegend() {
    if (!quietStatusOn()) return '';
    const regels = ['green', 'blue', 'done', 'amber', 'red', 'grey'].map((k) => {
      // Eén woord per status: Bezig en Klaar zoals bij werk, de rest zoals bij een doel.
      const woorden = ObeyaData.statusLabelFor(['blue', 'done'].includes(k) ? 'project' : 'objective', k, activeDataset);
      return `<li><span class="status-pill ${QUIET_STATUSES.includes(k) ? 'status-pill--quiet' : 'status-pill--sym status-pill--compact'} status-${k}"><span class="status-sym" aria-hidden="true">${STATUS_SYMBOL[k]}</span></span> ${escapeHtml(woorden)}</li>`;
    });
    return `<details class="status-legend" id="status-legend"><summary>Legenda</summary><ul class="status-legend__list" aria-label="Betekenis van de statussymbolen">${regels.join('')}</ul></details>`;
  }

  // De punaise: op de agenda van het volgende overleg (idee 26). Op een kaart
  // alleen het icoon, met een vaste naam en aria-pressed; in het detailscherm
  // zegt de knop in woorden of het item op de agenda staat. Aan en uit
  // verschillen ook in vorm (gevuld met rand tegenover grijs en vaag), niet
  // alleen in kleur.
  function flagButton(entity, opts) {
    const on = !!entity.flaggedForDiscussion;
    const id = escapeHtml(entity.id);
    if (opts && opts.compact) {
      return `<button class="icon-btn flag-btn${on ? ' flag-btn--active' : ''}${opts.className ? ` ${opts.className}` : ''}" data-action="toggle-flag" data-id="${id}" title="${on ? 'Staat op de agenda — klik om eraf te halen' : 'Op de agenda zetten'}" aria-label="Op de agenda" aria-pressed="${on}">📌</button>`;
    }
    return `<button class="flag-toggle${on ? ' flag-toggle--on' : ''}" data-action="toggle-flag" data-id="${id}" title="${on ? 'Klik om van de agenda te halen' : 'Zet dit op de agenda van het volgende overleg'}"><span class="flag-toggle__icon" aria-hidden="true">📌</span> ${on ? 'Staat op de agenda' : 'Op de agenda zetten'}</button>`;
  }

  // entityType bepaalt zowel welke waarden aangeboden worden
  // (ObeyaData.statusValuesFor) als de getoonde labels (statusLabelFor).
  // Zonder entityType: de 4 kernwaarden, ongewijzigd gedrag.
  function statusSelect(id, currentStatus, extraAttrs, entityType) {
    const values = ObeyaData.statusValuesFor(entityType);
    const options = values.map((s) => {
      const label = ObeyaData.statusLabelFor(entityType, s, activeDataset);
      return `<option value="${s}" ${s === currentStatus ? 'selected' : ''}>${escapeHtml(label)}</option>`;
    }).join('');
    return `<select id="${id}" class="status-select" ${extraAttrs || ''}>${options}</select>`;
  }

  // Gedeeld door de doel-detailweergave en de Uitvoering-weergave: een
  // project toont een label per gekoppeld meetbaar resultaat (veel-op-veel,
  // zie measurableResultIds), of een "nog te koppelen"-signaal als dat nog
  // ontbreekt en dat niet bewust is afgemeld — zie ROADMAP.md ideeën 38/41.
  // Een resultaat in een ander doel (via een relatie) telt ook, en krijgt
  // dat in de tooltip mee zodat duidelijk is waar het staat.
  function relationTags(objective, p) {
    const linked = (p.measurableResultIds || [])
      .map((mrId) => objective.measurableResults.find((m) => m.id === mrId))
      .filter(Boolean);
    const elders = ObeyaData.relatedMeasurableResults(activeDataset, p.id)
      .filter((m) => !linked.some((l) => l.id === m.id));
    if (linked.length || elders.length) {
      const tag = (m, extra) => `<span class="relation-tag" title="Draagt bij aan: ${escapeHtml(m.name)}${extra}">↳ ${escapeHtml(m.name)}</span>`;
      return `<span class="relation-tags">${linked.map((m) => tag(m, '')).join('')}${elders.map((m) => tag(m, ' (in een ander doel, via een relatie)')).join('')}</span>`;
    }
    if (p.noMeasurableResultNeeded) {
      return `<span class="relation-tag relation-tag--muted" title="Bewust niet gekoppeld aan een meetbaar resultaat">geen resultaat nodig</span>`;
    }
    return `<span class="relation-tag relation-tag--unmapped" title="Nog niet gekoppeld aan een meetbaar resultaat — verschijnt daarom op de agenda">Nog te koppelen</span>`;
  }

  // "Hoeveel weten we hier eigenlijk van." Staat naast de statusbol, omdat een
  // kleur anders volledigheid suggereert die er niet is: een doel kan groen
  // zijn terwijl maar twee van de vijf onderdelen zijn beoordeeld. Alleen
  // getoond zodra er iets ontbreekt — bij volledige dekking zou het ruis zijn.
  // Zie ObeyaData.objectiveCoverage/themeCoverage en besluit 2 in
  // docs/plan-naar-v1.md.
  function coverageLabel(coverage, opts) {
    if (!coverage || !coverage.total || coverage.assessed >= coverage.total) return '';
    const compact = opts && opts.compact;
    const ontbreekt = coverage.total - coverage.assessed;
    const uitleg = `${ontbreekt} van de ${coverage.total} onderliggende items heeft nog geen status; de kleur gaat alleen over de rest`;
    const tekst = compact
      ? `${coverage.assessed}/${coverage.total} beoordeeld`
      : `${coverage.assessed} van ${coverage.total} beoordeeld`;
    return `<span class="coverage" title="${escapeHtml(uitleg)}">${tekst}</span>`;
  }

  // Dezelfde informatie als volzin, voor het detailscherm waar ruimte is en de
  // toelichting bij de automatische status toch al staat.
  function coverageSentence(coverage, wat) {
    if (!coverage || !coverage.total) return '';
    if (coverage.assessed >= coverage.total) return `Alle ${coverage.total} ${wat} hebben een status.`;
    if (coverage.assessed === 0) return `Nog geen van de ${coverage.total} ${wat} heeft een status, dus er valt nog niets over de stand te zeggen.`;
    return `${coverage.assessed} van de ${coverage.total} ${wat} hebben een status; de kleur hierboven gaat alleen over die ${coverage.assessed}.`;
  }

  // Thema-accent: een klein vierkant swatch, bewust een andere vorm dan de
  // ronde status-dot zodat de twee kanalen (thema-herkenning vs. status) niet
  // door elkaar heen gelezen worden. Puur herkenning, geen betekenis anders
  // dan "dit hoort bij dit thema" — zie IDEAS.md idee 45.
  function themeSwatch(theme) {
    return `<span class="theme-swatch" style="background:${escapeHtml(ObeyaData.themeColor(theme))}" title="Thema: ${escapeHtml(theme.name)}" aria-hidden="true"></span>`;
  }

  const ENTITY_TYPE_BADGE_LABELS = {
    theme: 'THEMA', objective: 'DOEL', measurableResult: 'MR', project: 'PRJ', action: 'ACT',
  };
  const ENTITY_TYPE_FULL_NAMES = {
    theme: 'Thema', objective: 'Doel', measurableResult: 'Meetbaar resultaat', project: 'Project', action: 'Actie',
  };

  // Entiteitstype als tekstbadge, bewust monochroom (geen kleur per type) —
  // kleur is al bezet door status én thema, een derde kleursysteem zou de
  // eerste twee juist minder scanbaar maken. Vooral zinvol in vlakke
  // weergaven (Uitvoering) waar positie/nesting het type niet meer verraadt.
  function entityTypeBadge(type) {
    return `<span class="type-badge" title="${escapeHtml(ENTITY_TYPE_FULL_NAMES[type] || type)}">${escapeHtml(ENTITY_TYPE_BADGE_LABELS[type] || type)}</span>`;
  }

  // Foutcodes van js/git-backend.js vertaald naar begrijpelijke tekst —
  // gedeeld door het configuratiescherm (test) en de toolbar (ophalen/delen).
  const GIT_ERROR_MESSAGES = {
    'issues-forbidden': 'Je token mag de issues van het data-repo niet lezen of schrijven. Zet bij het token op GitHub de rechten "Issues: Read and write" aan voor het data-repo (zie de werkinstructie).',
    'review-open': 'Sluit eerst de beoordelingsronde.',
    'not-configured': 'Nog niet verbonden — vul eerst de gegevens hieronder in.',
    'invalid-token': 'Het token werd geweigerd — controleer of het klopt en nog geldig is.',
    forbidden: 'Geen toegang — controleer of het token schrijfrechten heeft tot precies dit repo.',
    'not-found': 'Repo of bestand niet gevonden — controleer eigenaar/repo/branch/pad.',
    'stale-tab': 'Dit bord is in een ander tabblad gewijzigd. Herlaad dit tabblad om met die versie verder te werken; hier wordt niets meer opgeslagen of gedeeld.',
    'pull-first': 'Haal eerst de laatste versie van het team op ("Ophalen van team"). Je eigen wijzigingen blijven daarbij staan en worden samengevoegd; daarna kun je delen.',
    'needs-resolution': 'Er wacht een keuze: jij en het team hebben hetzelfde verschillend aangepast.',
    'no-repo-access': 'Je token heeft geen toegang tot dit repo (of het repo bestaat niet). Voeg het repo toe aan je token onder "Repository access", of vraag de eigenaar om toegang. Staat het repo op het persoonlijke account van iemand anders, dan werkt een fine-grained token niet; zie de werkinstructie.',
    'branch-not-found': 'Het repo is bereikbaar, maar de branch bestaat niet — controleer de branch onder "Geavanceerd".',
    'file-not-found': 'Het repo is bereikbaar, maar het databestand staat er (nog) niet — controleer het pad onder "Geavanceerd". Is het repo nieuw, dan maakt "Delen met team" het bestand aan.',
    network: 'Geen verbinding kunnen maken — controleer je internetverbinding.',
    conflict: 'Iemand anders bleef tegelijk delen; samenvoegen lukte na drie pogingen nog niet. Probeer het over een moment opnieuw — je wijzigingen staan nog gewoon in de app.',
    'invalid-json': 'Het bestand in het repo bevat geen geldige Obeya-data.',
    'invalid-data': 'Het bestand in het repo is wel leesbaar, maar mist onderdelen die een Obeya nodig heeft. De huidige data in de app is ongewijzigd gebleven.',
    'unexpected-format': 'Onverwacht antwoord van GitHub — probeer het later opnieuw.',
    unknown: 'Er ging iets onverwachts mis.',
  };
  function gitErrorMessage(code, detail) {
    const base = GIT_ERROR_MESSAGES[code] || GIT_ERROR_MESSAGES.unknown;
    return detail ? `${base} (GitHub zegt: "${detail}")` : base;
  }

  // "Te bevestigen" (stap 3 van docs/wijzigingslog-plan.md): neutraal, met een
  // donkere rand en zonder statuskleur, en altijd als tekst.
  function pendingBadge(id) {
    if (!activeDataset || typeof ObeyaHistory === 'undefined') return '';
    if (ObeyaHistory.pendingItemIds(activeDataset.changeLog).has(id)) {
      return '<span class="pending-badge" title="Deze wijziging aan de opbouw van het bord wacht op bevestiging in het overleg (zie de Agenda)">⏳ Te bevestigen</span>';
    }
    if (ObeyaHistory.rejectedItemIds(activeDataset.changeLog).has(id)) {
      return '<span class="pending-badge pending-badge--rejected" title="Afgewezen in het overleg; op de Agenda kun je het terugdraaien">✕ Afgewezen</span>';
    }
    return '';
  }

  function ownerBadge(owner) {
    if (!owner) return '<span class="owner-badge owner-badge--empty">geen eigenaar</span>';
    return `<span class="owner-badge">${escapeHtml(owner)}</span>`;
  }

  // Betrokkenen: wie meewerkt, naast de ene eigenaar. Vinkjes uit dezelfde
  // eigenarenlijst; de eigenaar zelf staat er niet bij, en een naam die niet
  // (meer) in de lijst staat blijft zichtbaar zolang hij is aangevinkt.
  // opts.open: altijd open (het paneel achter de knop Betrokken, dat je juist
  // opent om te kiezen).
  function involvedPicker(dataset, entity, opts) {
    const huidig = Array.isArray(entity.involved) ? entity.involved : [];
    const namen = ObeyaData.getOwnerOptions(dataset);
    const eigenaar = entity.owner || '';
    const vinkje = (n) => `<label class="involved-picker__item"><input type="checkbox" data-involved value="${escapeHtml(n)}" ${huidig.includes(n) ? 'checked' : ''}> ${escapeHtml(n)}${namen.includes(n) ? '' : ' <span class="muted">(niet in beheerlijst)</span>'}</label>`;
    // Per rol, zoals de keuzelijst voor de eigenaar; namen die niet (meer) in
    // de lijst staan maar wel aangevinkt zijn, achteraan.
    const groepen = ObeyaData.ownersByRole(dataset)
      .map((g) => ({ ...g, names: g.names.filter((n) => n !== eigenaar) }))
      .filter((g) => g.names.length);
    const los = huidig.filter((n) => !namen.includes(n) && n !== eigenaar);
    if (los.length) groepen.push({ label: groepen.some((g) => g.label) ? 'Niet in de lijst' : '', names: los });
    if (!groepen.length) return '';
    // Ingeklapt (idee 88): betrokkenen zijn optioneel; de kop zegt wie er al
    // betrokken is. Een knop per groep van rollen vinkt iedereen daarvan aan.
    const zonderEigenaar = huidig.filter((n) => n !== eigenaar);
    const kop = zonderEigenaar.length
      ? `<span class="muted">(${zonderEigenaar.length}): ${escapeHtml(zonderEigenaar.join(', '))}</span>`
      : '<span class="muted">— nog niemand</span>';
    const snel = ObeyaData.roleGroups(dataset)
      .map((g) => ({ ...g, names: g.names.filter((n) => n !== eigenaar) }))
      .filter((g) => g.names.length);
    return `
      <details class="involved-picker" id="involved-picker"${opts && opts.open ? ' open' : ''}>
        <summary class="involved-picker__summary">Betrokkenen ${kop}</summary>
        <p class="field-hint">Wie meewerkt. De eigenaar blijft de enige die aanspreekbaar is.</p>
        ${snel.length ? `<p class="involved-picker__quick"><span class="muted">In één keer:</span> ${snel.map((g) => `<button type="button" class="btn btn--ghost btn--small" data-action="involved-group" data-names="${escapeHtml(JSON.stringify(g.names))}" title="Vink iedereen aan met een rol in de groep ${escapeHtml(g.name)}; nog een keer klikken haalt ze weer weg">${escapeHtml(g.name)} (${g.names.length})</button>`).join(' ')}</p>` : ''}
        ${groepen.map((g) => `${g.label ? `<p class="involved-picker__group">${escapeHtml(g.label)}</p>` : ''}
        <div class="involved-picker__list">
          ${g.names.map(vinkje).join('')}
        </div>`).join('')}
      </details>`;
  }

  // De bevestiging bij "Eigenaar verwijderen": noemt wat er werkelijk
  // verandert, ook waar de persoon alleen betrokken is.
  function removeOwnerWarning(dataset, name) {
    const eigenaar = ObeyaData.countOwnerUsage(dataset, name);
    const betrokken = ObeyaData.countInvolvement(dataset, name);
    if (!eigenaar && !betrokken) return `Eigenaar "${name}" uit de lijst verwijderen?`;
    const delen = [];
    if (eigenaar) delen.push(`bij ${eigenaar} item${eigenaar === 1 ? '' : 's'} ingesteld als eigenaar (die worden eigenaarloos)`);
    if (betrokken) delen.push(`bij ${betrokken} item${betrokken === 1 ? '' : 's'} betrokken (daar verdwijnt de naam)`);
    return `"${name}" is ${delen.join(' en ')}. Verwijderen haalt de naam uit de lijst en uit deze items. Doorgaan?`;
  }

  // Principes uit de visie op een doel of project. Op een kaart (compact)
  // één naam en "+n" voor de rest, zodat het geen rij labels wordt; de volle
  // lijst staat in de title en in het detailscherm.
  function principleNames(entity) {
    const ids = entity && Array.isArray(entity.principleIds) ? entity.principleIds : [];
    const lijst = ObeyaData.getPrinciples(activeDataset);
    return ids.map((id) => (lijst.find((p) => p.id === id) || {}).name).filter(Boolean);
  }

  function principleBadge(entity, opts) {
    const namen = principleNames(entity);
    if (!namen.length) return '';
    const compact = opts && opts.compact;
    const tekst = compact && namen.length > 1 ? `${namen[0]} +${namen.length - 1}` : namen.join(' · ');
    return `<span class="principle-badge" title="Draagt bij aan: ${escapeHtml(namen.join(', '))}">${escapeHtml(tekst)}</span>`;
  }

  // Vinkjes voor de principes van het bord. Zonder principes geen veld, zodat
  // opslaan dan ook niets aan de principes van het item verandert.
  function principlePicker(dataset, entity) {
    const lijst = ObeyaData.getPrinciples(dataset);
    if (!lijst.length) return '';
    const huidig = Array.isArray(entity.principleIds) ? entity.principleIds : [];
    return `
      <fieldset class="involved-picker principle-picker" data-principle-picker>
        <legend>Principes</legend>
        <p class="field-hint">Aan welk principe uit de visie draagt dit bij? Kies wat het meest van toepassing is.</p>
        <div class="involved-picker__list">
          ${lijst.map((p) => `<label class="involved-picker__item"${p.description ? ` title="${escapeHtml(p.description)}"` : ''}><input type="checkbox" data-principle value="${escapeHtml(p.id)}" ${huidig.includes(p.id) ? 'checked' : ''}> ${escapeHtml(p.name)}</label>`).join('')}
        </div>
      </fieldset>`;
  }

  function workTypeBadge(project) {
    const label = project && ObeyaData.WORK_TYPES[project.workType];
    return label ? `<span class="work-type-badge" title="Soort werk">${escapeHtml(label)}</span>` : '';
  }

  function involvedLine(entity) {
    const lijst = entity && Array.isArray(entity.involved) ? entity.involved : [];
    if (!lijst.length) return '';
    return `<span class="involved-line muted">Betrokken: ${lijst.map(escapeHtml).join(', ')}</span>`;
  }

  // Owner dropdown backed by the managed owners list (Configuratie ->
  // Eigenaren beheren). The item's current owner is always included as an
  // option even if it isn't (or no longer is) on that list, so opening an
  // edit form never silently changes or hides existing data.
  // De namen als <option>s, per rol onder een kopje (<optgroup>) zodra
  // iemand een rol heeft (ObeyaData.ownersByRole).
  function ownerOptionsHtml(dataset, value) {
    return ObeyaData.ownersByRole(dataset).map((g) => {
      const opties = g.names.map((o) => `<option value="${escapeHtml(o)}" ${o === value ? 'selected' : ''}>${escapeHtml(o)}</option>`).join('');
      return g.label ? `<optgroup label="${escapeHtml(g.label)}">${opties}</optgroup>` : opties;
    }).join('');
  }

  function ownerSelect(id, dataset, currentOwner, extraAttrs) {
    const options = ObeyaData.getOwnerOptions(dataset);
    const value = currentOwner || '';
    const inList = value === '' || options.includes(value);
    const optionsHtml = ['<option value="">Geen eigenaar</option>', ownerOptionsHtml(dataset, value)];
    if (!inList) {
      optionsHtml.push(`<option value="${escapeHtml(value)}" selected>${escapeHtml(value)} (niet in beheerlijst)</option>`);
    }
    return `<select id="${id}" class="owner-select" ${extraAttrs || ''}>${optionsHtml.join('')}</select>`;
  }

  // Wie een notitie schrijft, kies je uit dezelfde eigenarenlijst, zodat
  // namen overal hetzelfde gespeld zijn. De laatst gekozen naam staat bij
  // de volgende notitie al klaar (alleen in deze sessie).
  let lastAuthor = '';
  function setLastAuthor(name) { lastAuthor = name || ''; }

  function authorSelect(id, dataset, currentAuthor, extraAttrs) {
    const options = ObeyaData.getOwnerOptions(dataset);
    const value = currentAuthor == null ? (options.includes(lastAuthor) ? lastAuthor : '') : currentAuthor;
    const html = ['<option value="">Wie schrijft dit?</option>']
      .concat(options.map((o) => `<option value="${escapeHtml(o)}" ${o === value ? 'selected' : ''}>${escapeHtml(o)}</option>`));
    if (value && !options.includes(value)) html.push(`<option value="${escapeHtml(value)}" selected>${escapeHtml(value)} (niet in beheerlijst)</option>`);
    return `<select id="${id}" class="owner-select" ${extraAttrs || ''}>${html.join('')}</select>`;
  }

  function teamPlanBadge(inTeamPlan) {
    if (!inTeamPlan) return '';
    return '<span class="tp-badge" title="Opgenomen in het teamplan voor het huidige/aankomende jaar">TP</span>';
  }

  function formatDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('nl-NL', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  // Meetbare resultaten als deelproduct (besluit 12 oktober 2026): het
  // streefkwartaal, en "Te laat" als het voorbij is zonder dat het klaar is —
  // als tekst met een symbool, nooit alleen kleur. Alleen een signaal: de
  // status blijft het oordeel van het team.
  function lateBadge(mr) {
    return ObeyaData.isLate(mr) ? '<span class="late-badge" title="Het streefkwartaal is voorbij en het is nog niet klaar">⏰ Te laat</span>' : '';
  }

  function deliverableMeta(mr) {
    const periode = mr.periodYear ? `<span class="muted" title="Streefkwartaal">${escapeHtml(ObeyaData.formatPeriod(mr.periodYear, mr.periodQuarter))}</span>` : '';
    return `${periode} ${lateBadge(mr)}`;
  }

  function doneCriterionLine(mr) {
    return mr.doneCriterion ? `<p class="done-criterion">Klaar als: ${escapeHtml(mr.doneCriterion)}</p>` : '';
  }

  function noteTypeLabel(type) {
    return ObeyaData.NOTE_TYPES[type] || type;
  }

  function debounce(fn, wait) {
    let t = null;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), wait);
    };
  }

  // --- filtering ---------------------------------------------------------

  function textMatches(haystackParts, needle) {
    if (!needle) return true;
    const n = needle.toLowerCase();
    return haystackParts.some((p) => p && String(p).toLowerCase().includes(n));
  }

  function objectiveOwners(objective) {
    const owners = new Set();
    if (objective.owner) owners.add(objective.owner);
    objective.measurableResults.forEach((m) => m.owner && owners.add(m.owner));
    objective.projects.forEach((p) => {
      if (p.owner) owners.add(p.owner);
      (p.actions || []).forEach((a) => a.owner && owners.add(a.owner));
    });
    (objective.actions || []).forEach((a) => a.owner && owners.add(a.owner));
    return owners;
  }

  function objectiveInTeamPlan(objective) {
    return (
      objective.measurableResults.some((m) => m.inTeamPlan) ||
      objective.projects.some((p) => p.inTeamPlan)
    );
  }

  function objectiveSearchText(objective) {
    const parts = [objective.title, objective.description, objective.owner];
    objective.measurableResults.forEach((m) => parts.push(m.name));
    objective.projects.forEach((p) => parts.push(p.name));
    (objective.actions || []).forEach((a) => parts.push(a.title));
    return parts;
  }

  // Returns true if the objective should be visible given current filters.
  // Een doel valt binnen het gekozen jaar/kwartaal zodra minstens één
  // project (periodYear/periodQuarter) of actie (afgeleid uit dueDate)
  // erbinnen valt. Geen projecten/acties met periode-info -> valt buiten
  // een actief jaar/kwartaal-filter, net als bij de andere filters.
  function objectiveMatchesPeriod(objective, filters) {
    if (filters.year === null && filters.quarter === null) return true;
    const allActions = [
      ...(objective.actions || []),
      ...objective.projects.flatMap((p) => p.actions || []),
    ];
    const projectMatch = objective.projects.some((p) =>
      ObeyaData.periodMatches(p.periodYear, p.periodQuarter, filters.year, filters.quarter));
    const actionMatch = allActions.some((a) =>
      ObeyaData.periodMatches(ObeyaData.yearFromDate(a.dueDate), ObeyaData.quarterFromDate(a.dueDate), filters.year, filters.quarter));
    return projectMatch || actionMatch;
  }

  // Het principefilter: een id, of NO_PRINCIPLE voor werk dat nog aan geen
  // enkel principe is gekoppeld. Leeg = geen filter.
  function principleMatches(ids, filters) {
    if (!filters.principle) return true;
    if (filters.principle === ObeyaData.NO_PRINCIPLE) return ids.size === 0;
    return ids.has(filters.principle);
  }

  function objectivePassesFilters(objective, filters) {
    if (filters.status !== null && !filters.status.has(objective.status)) return false;
    if (filters.owner && !objectiveOwners(objective).has(filters.owner)) return false;
    if (filters.teamPlanOnly && !objectiveInTeamPlan(objective)) return false;
    if (!objectiveMatchesPeriod(objective, filters)) return false;
    if (filters.search && !textMatches(objectiveSearchText(objective), filters.search)) return false;
    if (!principleMatches(ObeyaData.objectivePrinciples(objective), filters)) return false;
    return true;
  }

  function visibleThemes(dataset, filters) {
    return dataset.themes.filter((t) => filters.themeIds === null || filters.themeIds.has(t.id));
  }

  // {theme, objective} pairs across visible themes that pass all filters.
  function visibleObjectivePairs(dataset, filters) {
    const out = [];
    visibleThemes(dataset, filters).forEach((theme) => {
      theme.objectives.forEach((objective) => {
        if (objectivePassesFilters(objective, filters)) out.push({ theme, objective });
      });
    });
    return out;
  }

  // De tabbladen, in volgorde: [weergave, naam]. Gedeeld door de tabbalk
  // (toolbar.js) en de instelling om tabbladen uit te zetten (modal.js).
  const TABS = [
    ['board', 'Bord'],
    ['canvas', 'Samenhang'],
    ['list', 'Lijst'],
    ['matrix', 'Verbindingen'],
    ['execution', 'Uitvoering'],
    ['timeline', 'Tijdlijn'],
    ['agenda', 'Agenda'],
    ['documents', 'Stukken'],
  ];

  return {
    TABS,
    setActiveDataset,
    setLastAuthor,
    involvedPicker,
    involvedLine,
    workTypeBadge,
    principleBadge,
    principleMatches,
    principlePicker,
    removeOwnerWarning,
    authorSelect,
    escapeHtml,
    nl2br,
    statusPill,
    statusLegend,
    statusSelect,
    coverageLabel,
    coverageSentence,
    relationTags,
    themeSwatch,
    entityTypeBadge,
    gitErrorMessage,
    ownerBadge,
    ownerSelect,
    ownerOptionsHtml,
    pendingBadge,
    teamPlanBadge,
    formatDate,
    lateBadge,
    flagButton,
    deliverableMeta,
    doneCriterionLine,
    noteTypeLabel,
    debounce,
    textMatches,
    objectiveOwners,
    objectiveInTeamPlan,
    objectivePassesFilters,
    visibleThemes,
    visibleObjectivePairs,
  };
})();
