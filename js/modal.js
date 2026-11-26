// js/modal.js
// Detail / edit modal for every entity type (theme, objective, measurable
// result, project, action) plus the note quick-add/list UI embedded in the
// objective, measurable result, project and action detail views.
//
// Rendering is dispatched on selection = {type, id, mode, context}:
//   mode 'view' -> read-only detail with quick status/owner controls
//   mode 'edit' -> a form for an existing entity
//   mode 'new'  -> a form for a not-yet-created entity (id is null)
//
// All interactive elements carry data-* attributes; app.js owns the actual
// event handling via delegation, this module only produces markup.

const ObeyaModal = (function () {
  'use strict';
  const H = ObeyaUI;

  // extra: { me } — wie er in deze browser werkt (ObeyaState.getMe()).
  // --- instructies bij de velden ------------------------------------------
  // Bij elk veld van de bewerkformulieren één korte, altijd zichtbare zin
  // onder het veld (gekoppeld met aria-describedby); in een placeholder
  // alleen nog een voorbeeld. Teksten: Obeya-coach; vorm: UX-designer
  // (8 november 2026, op verzoek van David). Alles op één plek, zodat de
  // teksten gelijk blijven. alleenNieuw: bij bewerken van iets bestaands
  // overbodig (eigenaar, status, periode).
  const EIGENAAR = 'Eén persoon die aanspreekbaar is. Geen duo\'s of vraagtekens.';
  const FIELD_HINTS = {
    theme: {
      'f-name': { tekst: 'Een richting voor meerdere jaren, in een paar woorden.', voorbeeld: 'Bijv. Persoonlijke dienstverlening' },
      'f-description': { tekst: 'Waarom is dit belangrijk, en voor wie? Eén of twee zinnen.' },
      'f-owner': { tekst: `${EIGENAAR} Bewaakt het thema.`, alleenNieuw: true },
    },
    objective: {
      'f-title': { tekst: 'Schrijf wat er bereikt is, als toestand. Geen activiteit.', voorbeeld: 'Bijv. Inwoners regelen zaken online in hun eigen omgeving' },
      'f-description': { tekst: 'Wat merken inwoners of collega\'s als dit gelukt is, en waarom nu? Hoeveel en wanneer zet je in de meetbare resultaten.', voorbeeld: 'Bijv. Inwoners hoeven niet meer te bellen voor standaardzaken' },
      'f-owner': { tekst: `${EIGENAAR} Zorgt dat het doel gehaald wordt, ook als anderen het werk doen.` },
    },
    measurableResult: {
      'f-name': { tekst: 'Het deelproduct, kort: iets wat je oplevert of afleest.', voorbeeld: 'Bijv. Aanvragen parkeervergunning online' },
      'f-done-criterion': { tekst: 'Met een getal of een ja/nee-toets, zo concreet dat iemand die er niet bij was kan zien of het klaar is. Noem de nulmeting als die er is.', voorbeeld: 'Bijv. Inwoners vragen de parkeervergunning online aan, zonder papier' },
      'f-period-year': { tekst: 'In welk jaar moet het af zijn?', alleenNieuw: true },
      'f-period-quarter': { tekst: 'Eén kwartaal. Past het er niet in, splits het resultaat dan op.' },
      'f-owner': { tekst: `${EIGENAAR} Houdt de stand bij en licht die toe in het overleg.` },
      'f-status': { tekst: 'Je oordeel over de koers naar "Klaar als", niet of er gewerkt wordt.' },
      'f-source-status': { tekst: 'Waar het in de praktijk staat, in eigen woorden. Alleen als het helpt.', voorbeeld: 'Bijv. loopt, wacht op leverancier' },
      'f-team-plan': { tekst: 'Aanvinken als dit in het teamplan en de presentatie hoort.' },
      'f-monitoring-text': { tekst: 'Wat volg je, en wanneer? Bijvoorbeeld de laatste meting of een obstakel.', voorbeeld: 'Bijv. Meting mei: 40% van de aanvragen online' },
      'f-value-current': { tekst: 'Waar het nu staat, als getal.', voorbeeld: 'Bijv. 5' },
      'f-value-target': { tekst: 'Waar het naartoe moet. Samen geeft dat "5 van 9 (56%)".', voorbeeld: 'Bijv. 9' },
      'f-value-date': { tekst: 'Wanneer de stand gemeten is. Verander je de waarde, dan wordt dit vandaag.' },
    },
    project: {
      'f-name': { tekst: 'Werk met een begin en een eind dat bijdraagt aan een meetbaar resultaat.', voorbeeld: 'Bijv. Koppeling met het zaaksysteem' },
      'f-description': { tekst: 'Wat levert het project op, en wat bewust niet?' },
      'f-owner': { tekst: `${EIGENAAR} Zorgt dat het gebeurt, niet per se wie al het werk doet.`, alleenNieuw: true },
      'f-status': { tekst: 'Hoe het werk loopt: nog niet opgepakt, bezig, aandacht nodig, geblokkeerd of klaar.', alleenNieuw: true },
      'f-period-year': { tekst: 'In welk jaar is het project klaar?', alleenNieuw: true },
      'f-period-quarter': { tekst: 'En in welk kwartaal?', alleenNieuw: true },
      'f-source-status': { tekst: 'Wat er in de praktijk al te zien is, in eigen woorden.', voorbeeld: 'Bijv. loopt, wacht op leverancier' },
      'f-team-plan': { tekst: 'Aanvinken als dit in het teamplan en de presentatie hoort.' },
      'f-work-type': { tekst: 'Beheer, doorontwikkeling of vernieuwing. Helpt bij het kiezen van prioriteiten.' },
      'f-monitoring-text': { tekst: 'Wat moet het team volgen? Bijvoorbeeld een risico of een afhankelijkheid.', voorbeeld: 'Bijv. Wacht op de koppeling van de leverancier' },
      'f-no-mr-needed': { tekst: 'Zonder koppeling (hier of bij een ander doel) en zonder dit vinkje staat het project op de Agenda als "nog te koppelen".' },
    },
    action: {
      'f-title': { tekst: 'Eén taak die af of niet af is. Begin met een werkwoord.', voorbeeld: 'Bijv. Testplan schrijven voor het formulier' },
      'f-description': { tekst: 'Wat is het concrete resultaat, en wat heeft de actiehouder nodig?' },
      'f-owner': { tekst: 'Eén persoon die het doet of laat doen. Zonder naam is het een wens.', alleenNieuw: true },
      'f-status': { tekst: 'Hoe het loopt: nog niet opgepakt, bezig, aandacht nodig, geblokkeerd of klaar.', alleenNieuw: true },
      'f-due-date': { tekst: 'De datum waarop het klaar moet zijn.' },
      'f-project': { tekst: 'Bij welk project hoort de actie? Leeg laten als hij losstaat.' },
      'f-measurable-result': { tekst: 'Alleen voor een losse actie: aan welk resultaat draagt hij direct bij?' },
    },
  };

  // Een voorbeeld van niet en wel, met één zin over SMART, onder de titel van
  // een doel en onder "Klaar als" van een meetbaar resultaat; open bij iets
  // nieuws, één regel bij bewerken. SMART zit in de keten, niet in één veld
  // (David, 8 november 2026; advies Obeya-coach en UX-designer).
  const FORM_EXAMPLES = {
    objective: {
      na: 'f-title',
      kop: 'Voorbeeld van een goed doel',
      niet: ['Zaakgericht werken implementeren', 'een activiteit'],
      wel: ['Inwoners regelen zaken online in hun eigen omgeving', 'een toestand die bereikt is'],
      smart: 'Een doel is SMART via de keten: het doel zegt wat er bereikt is en voor wie, de meetbare resultaten eronder zeggen hoeveel en wanneer.',
    },
    measurableResult: {
      na: 'f-done-criterion',
      kop: 'Voorbeeld van een goed meetbaar resultaat',
      niet: ['Meer online aanvragen', 'niet te toetsen'],
      wel: ['70% van de aanvragen parkeervergunning komt online binnen (nu: 40%)', 'een getal en een nulmeting'],
      smart: 'Zonder getal of ja/nee-toets kun je in het overleg niet zien of je op koers ligt.',
    },
  };

  // Zachte signalen bij het verlaten van een veld (app.js, focusout): een
  // vraag, nooit een blokkade, met "Zo laten". Een kleine woordenlijst; een
  // valse melding is goedkoop omdat je hem wegklikt.
  const SIGNAL_FIELDS = { objective: { 'f-title': 'objective-title' }, measurableResult: { 'f-done-criterion': 'done-criterion' } };
  const ACTIVITEIT = /^(implementeren|invoeren|verbeteren|uitrollen|ontwikkelen|opzetten|bouwen|maken|starten|onderzoeken|realiseren|inrichten|organiseren|optimaliseren|digitaliseren|vernieuwen|uitvoeren|opstellen|aanpassen|vervangen|migreren|aanbesteden)$/;

  function formulationSignal(kind, value) {
    const tekst = String(value || '').trim();
    if (!tekst) return '';
    if (kind === 'objective-title') {
      const woorden = tekst.toLowerCase().replace(/[.!?]+$/, '').split(/\s+/);
      const randen = [woorden[0], woorden[woorden.length - 1]];
      const activiteit = randen.some((w) => ACTIVITEIT.test(w) || /(iseren|menteren)$/.test(w)) || /\bproject\b/i.test(tekst);
      return activiteit ? 'Dit leest als een activiteit. Wat is er bereikt als het klaar is?' : '';
    }
    if (kind === 'done-criterion') {
      return /\d/.test(tekst) ? '' : 'Hoe zie je dat dit klaar is? Een getal of een ja/nee-toets, bijvoorbeeld "live voor alle inwoners".';
    }
    return '';
  }

  function signalHtml(kind, value, fieldId) {
    const tekst = formulationSignal(kind, value);
    return tekst ? `<span>${H.escapeHtml(tekst)}</span> <button type="button" class="btn btn--small" data-action="dismiss-signal" data-for="${fieldId}">Zo laten</button>` : '';
  }

  // Het einde van het veld met dit id: na </textarea>, </select> of na de
  // <input>; voor een vinkje in een label na </label>.
  function eindVanVeld(html, start, id) {
    const tag = html.slice(start).match(/^<(\w+)/);
    const naam = tag ? tag[1] : '';
    if (naam === 'textarea' || naam === 'select') return html.indexOf(`</${naam}>`, start) + naam.length + 3;
    const sluit = html.indexOf('>', start) + 1;
    const label = html.slice(sluit).match(/^[^<]*<\/label>/);
    return label ? sluit + label[0].length : sluit;
  }

  function withHints(html, type, isNew) {
    let uit = html;
    Object.keys(FIELD_HINTS[type] || {}).forEach((id) => {
      const h = FIELD_HINTS[type][id];
      const hintId = `${id}-hint`;
      // Een bestaande hint met dit id vervangen we door de tekst van hier.
      uit = uit.replace(new RegExp(`<p class="field-hint" id="${hintId}">[\\s\\S]*?<\/p>`), '');
      uit = uit.replace(new RegExp(`\\s*aria-describedby="${hintId}"`), '');
      if (h.alleenNieuw && !isNew) return;
      const start = uit.search(new RegExp(`<\\w+[^>]*\\sid="${id}"`));
      if (start === -1) return;
      // aria-describedby en het voorbeeld op het veld zelf.
      const openEind = uit.indexOf('>', start);
      let open = uit.slice(start, openEind);
      open = open.replace(/\splaceholder="[^"]*"/, '');
      if (h.voorbeeld && /^<(input|textarea)/.test(open) && !/type="(checkbox|number|date)"/.test(open)) open += ` placeholder="${H.escapeHtml(h.voorbeeld)}"`;
      open += ` aria-describedby="${hintId}"`;
      uit = uit.slice(0, start) + open + uit.slice(openEind);
      const eind = eindVanVeld(uit, start, id);
      uit = `${uit.slice(0, eind)}<p class="field-hint" id="${hintId}">${H.escapeHtml(h.tekst)}</p>${uit.slice(eind)}`;
    });
    // Onder de instructie van een veld met signaal een lege live-regio; het
    // signaal zelf komt er pas bij het verlaten van het veld in.
    Object.entries(SIGNAL_FIELDS[type] || {}).forEach(([id, kind]) => {
      const hint = uit.indexOf(`id="${id}-hint"`);
      if (hint === -1) return;
      const na = uit.indexOf('</p>', hint) + 4;
      uit = `${uit.slice(0, na)}<p class="form-signal" id="${id}-signal" role="status" data-signal="${kind}"></p>${uit.slice(na)}`;
    });
    const vb = FORM_EXAMPLES[type];
    if (vb) {
      const plek = uit.indexOf(`id="${vb.na}-signal"`);
      const na = plek === -1 ? -1 : uit.indexOf('</p>', plek) + 4;
      if (na > 3) {
        const regel = (soort, [tekst, waarom]) => `<li class="form-check__${soort === 'Niet' ? 'niet' : 'wel'}"><span aria-hidden="true">${soort === 'Niet' ? '✗' : '✓'}</span> <strong>${soort}:</strong> ${H.escapeHtml(tekst)} <span class="muted">(${H.escapeHtml(waarom)})</span></li>`;
        uit = `${uit.slice(0, na)}<details class="form-check"${isNew ? ' open' : ''}><summary>${H.escapeHtml(vb.kop)}</summary><ul>${regel('Niet', vb.niet)}${regel('Wel', vb.wel)}</ul><p>${H.escapeHtml(vb.smart)}</p><p class="muted">Meer uitleg: Hulp (?) → De Obeya-methode → De keten in dit bord.</p></details>${uit.slice(na)}`;
      }
    }
    return uit;
  }

  function render(dataset, selection, editingNoteId, gitTestResult, pendingMerge, review, extra) {
    if (!selection) return '';
    const { type, id, mode } = selection;
    const context = selection.context || {};
    openChip = context.chip || null;
    historyOpen = !!context.history;
    reviewExtra = extra || {};
    let inner = '';
    try {
      if (type === 'theme') {
        inner = mode === 'view' ? viewTheme(dataset, id) : withHints(editTheme(dataset, id, context), 'theme', !id);
      } else if (type === 'objective') {
        inner = mode === 'view' ? viewObjective(dataset, id, editingNoteId) : withHints(editObjective(dataset, id, context), 'objective', !id);
      } else if (type === 'measurableResult') {
        inner = mode === 'view' ? viewMeasurableResult(dataset, id, editingNoteId) : withHints(editMeasurableResult(dataset, id, context), 'measurableResult', !id);
      } else if (type === 'project') {
        inner = mode === 'view' ? viewProject(dataset, id, editingNoteId) : withHints(editProject(dataset, id, context), 'project', !id);
      } else if (type === 'action') {
        inner = mode === 'view' ? viewAction(dataset, id, editingNoteId) : withHints(editAction(dataset, id, context), 'action', !id);
      } else if (type === 'bulkResults') {
        inner = viewBulkResults(dataset, context);
      } else if (type === 'ownersConfig') {
        inner = viewOwnersConfig(dataset);
      } else if (type === 'statusLabelsConfig') {
        inner = viewStatusLabelsConfig(dataset);
      } else if (type === 'gitConfig') {
        inner = viewGitConfig(gitTestResult);
      } else if (type === 'reviewRound') {
        inner = viewReviewRound(dataset, review);
      } else if (type === 'boardSettings') {
        inner = viewBoardSettings(dataset);
      } else if (type === 'displaySettings') {
        inner = viewDisplaySettings(dataset);
      } else if (type === 'settings') {
        inner = viewSettings(dataset, gitTestResult, context.section, context, (extra || {}).me || null, (extra || {}).gate || null);
      } else if (type === 'printSheets') {
        inner = viewPrintSheets(dataset);
      } else if (type === 'inboxNew') {
        inner = ObeyaInboxView.viewNew(context, context.inbox);
      } else if (type === 'inboxTriage') {
        inner = ObeyaInboxView.viewTriage(dataset, context.item, context);
      } else if (type === 'gitConflict') {
        inner = viewGitConflict(dataset, pendingMerge);
      } else {
        inner = '<p>Onbekend item.</p>';
      }
    } catch (err) {
      console.error(err);
      inner = `<p class="error-text">Er ging iets mis bij het tonen van dit item. Sluit het venster en probeer opnieuw.</p>`;
    }
    return `
      <div class="overlay" data-close-overlay>
        <div class="modal" role="dialog" aria-modal="true" data-stop-close>
          ${inner}
        </div>
      </div>`;
  }

  // Sluitknop en titel van een los venster; ingebed in Instellingen staan die
  // er al (één titel per sectie in het instellingenvenster).
  function titled(title, embedded) {
    return embedded ? '' : `${closeBtn()}
      <h2 class="modal__title">${title}</h2>`;
  }

  function closeBtn() {
    return `<button class="icon-btn modal__close" data-action="close-modal" aria-label="Sluiten">✕</button>`;
  }

  // parts[i].color (optioneel, alleen bij het thema-segment) tekent een
  // thema-swatch mee — zelfde herkenningspunt als elders in de app.
  function crumbs(parts) {
    return `<nav class="crumbs">${parts.map((p, i) => {
      const swatch = p.color ? `<span class="theme-swatch" style="background:${H.escapeHtml(p.color)}" aria-hidden="true"></span> ` : '';
      return i === parts.length - 1
        ? `<span class="crumbs__current">${swatch}${H.escapeHtml(p.label)}</span>`
        : `<button class="crumbs__link" data-open="${p.type}:${p.id}">${swatch}${H.escapeHtml(p.label)}</button><span class="crumbs__sep">/</span>`;
    }).join('')}</nav>`;
  }

  // Eén-klik markeren voor het volgende overleg (idee 26) — samen met
  // automatisch niet-gekoppelde projecten vormt dit de Agenda-weergave.
  function flagToggleBtn(entity) {
    return H.flagButton(entity);
  }

  // ---------------------------------------------------------------------
  // Theme
  // ---------------------------------------------------------------------

  // Eigenaar en betrokkenen als knoppen in de kopregel van elk detailscherm
  // (idee 74, stap 1 en 2, docs/bewerken-voorstel.md): een klik klapt eronder
  // een paneel open met de keuzelijst of de vinkjes, en elke keuze slaat
  // meteen op. Bewust een uitklappaneel met gewone formulierelementen en geen
  // zwevend menu: dat werkt zonder extra code met toetsenbord en schermlezer.
  // Welk paneel open is, staat in selection.context.chip (gezet in render).
  let openChip = null;
  let historyOpen = false;
  let reviewExtra = {};

  // Thema en doel kennen geen eigen status: die rekent de app uit (zie
  // ObeyaData, status roll-up). Daar de gewone statuspil, met eronder de
  // zichtbare zin "Status wordt automatisch bepaald…" als uitleg.
  const HAS_OWN_STATUS = ['measurableResult', 'project', 'action'];

  function statusChip(dataset, type, entity) {
    if (!HAS_OWN_STATUS.includes(type)) return H.statusPill(entity.status, { entityType: type });
    const key = ObeyaData.STATUS_META[entity.status] ? entity.status : 'grey';
    const label = ObeyaData.statusLabelFor(type, key, dataset);
    return `<button type="button" class="value-chip value-chip--status status-${key}" id="chip-status" data-action="toggle-chip" data-chip="status" aria-expanded="${openChip === 'status'}" aria-controls="chip-panel-status"><span class="value-chip__label">Status</span> <span class="status-dot" aria-hidden="true"></span><strong>${H.escapeHtml(label)}</strong> <span class="value-chip__caret" aria-hidden="true">▾</span></button>`;
  }

  function valueChips(dataset, type, entity) {
    const attrs = `data-type="${type}" data-id="${H.escapeHtml(entity.id)}"`;
    const betrokken = Array.isArray(entity.involved) ? entity.involved : [];
    const chip = (naam, label, waarde, leeg) => `<button type="button" class="value-chip${waarde ? '' : ' value-chip--empty'}" id="chip-${naam}" data-action="toggle-chip" data-chip="${naam}" aria-expanded="${openChip === naam}" aria-controls="chip-panel-${naam}"><span class="value-chip__label">${label}</span> ${waarde ? `<strong>${H.escapeHtml(waarde)}</strong>` : `<span>${leeg}</span>`} <span class="value-chip__caret" aria-hidden="true">▾</span></button>`;
    const paneel = openChip === 'status' && HAS_OWN_STATUS.includes(type)
      ? `<div class="chip-panel" id="chip-panel-status"><label for="chip-status-select">Status</label>${H.statusSelect('chip-status-select', entity.status, `data-quick-status ${attrs}`, type)}</div>`
      : openChip === 'owner'
      ? `<div class="chip-panel" id="chip-panel-owner"><label for="chip-owner-select">Eigenaar</label>${H.ownerSelect('chip-owner-select', dataset, entity.owner, `data-quick-owner ${attrs}`)}</div>`
      : openChip === 'involved'
        ? `<div class="chip-panel" id="chip-panel-involved" data-quick-involved-panel ${attrs}>${H.involvedPicker(dataset, entity, { open: true }) || '<p class="muted">Er zijn nog geen andere namen in de eigenarenlijst.</p>'}<button type="button" class="btn btn--small btn--ghost" data-action="toggle-chip" data-chip="involved">Klaar</button></div>`
        : '';
    // Ook het label "Te bevestigen" en de knoppen om te beslissen horen in
    // de kopregel (advies UX-designer: niemand hoeft te scrollen).
    return {
      chips: `${statusChip(dataset, type, entity)} ${H.pendingBadge(entity.id)} ${chip('owner', 'Eigenaar', entity.owner, 'geen eigenaar')} ${chip('involved', 'Betrokken', betrokken.join(', '), 'niemand')}`,
      panel: paneel + ObeyaHistoryView.detailBlock(dataset, entity.id, reviewExtra.me || null, reviewExtra.rejecting || null, reviewExtra.problems || null, reviewExtra.gate || null),
    };
  }

  function viewTheme(dataset, id) {
    const theme = ObeyaData.findTheme(dataset, id);
    if (!theme) return '<p>Thema niet gevonden.</p>';
    return `
      ${closeBtn()}
      ${crumbs([{ label: 'Obeya', type: '', id: '' }, { label: theme.name, color: ObeyaData.themeColor(theme) }])}
      <h2 class="modal__title">${H.escapeHtml(theme.name)}</h2>
      ${(() => { const c = valueChips(dataset, 'theme', theme); return `<div class="modal__row">${c.chips} ${flagToggleBtn(theme)}</div>${c.panel}`; })()}
      <p class="rollup-hint muted">Status wordt automatisch bepaald op basis van de doelen bij dit thema. ${H.coverageSentence(ObeyaData.themeCoverage(theme), 'doelen')}</p>
      <p class="modal__description">${theme.description ? H.nl2br(theme.description) : '<span class="muted">Geen beschrijving toegevoegd.</span>'}</p>
      <h3 class="modal__subtitle">${H.entityTypeBadge('objective')} Doelen (${theme.objectives.length})</h3>
      <ul class="chip-list">
        ${theme.objectives.map((o) => `<li><button class="chip" data-open="objective:${o.id}"><span class="status-dot status-dot--${o.status}"></span> ${H.escapeHtml(o.title)}</button></li>`).join('') || '<li class="muted">Nog geen doelen bij dit thema.</li>'}
      </ul>
      ${ObeyaHistoryView.itemHistory(dataset, theme.id, !!reviewExtra.showAll, historyOpen)}
      <div class="modal-actions">
        <button class="btn btn--ghost" data-action="delete" data-type="theme" data-id="${theme.id}">Verwijderen</button>
        <div class="modal-actions__right">
          <button class="btn" data-action="new-objective" data-theme-id="${theme.id}">+ Doel</button>
          <button class="btn btn--primary" data-action="edit" data-type="theme" data-id="${theme.id}">Bewerken</button>
        </div>
      </div>`;
  }

  // De kleur van een thema: een van de vaste kleuren, of een eigen kleur.
  // Rondjes om aan te klikken, met de naam erbij voor schermlezers.
  function themeColorPicker(huidig) {
    const vast = ObeyaData.THEME_COLOR_PALETTE;
    const eigen = !vast.some((k) => k.toLowerCase() === String(huidig).toLowerCase());
    return `
      <fieldset class="color-picker">
        <legend>Kleur</legend>
        <p class="field-hint">Op het bord, in Samenhang en op de muurvellen.</p>
        <div class="color-picker__list">
          ${vast.map((k) => `<label class="color-picker__swatch" title="${H.escapeHtml(ObeyaData.THEME_COLOR_NAMES[k] || k)}">
            <input type="radio" name="theme-color" value="${k}" ${!eigen && k.toLowerCase() === String(huidig).toLowerCase() ? 'checked' : ''}>
            <span class="color-picker__dot" style="background:${k}" aria-hidden="true"></span>
            <span class="sr-only">${H.escapeHtml(ObeyaData.THEME_COLOR_NAMES[k] || k)}</span>
          </label>`).join('')}
          <label class="color-picker__custom">
            <input type="radio" name="theme-color" value="custom" ${eigen ? 'checked' : ''}> Eigen kleur
            <input type="color" id="f-theme-color-custom" value="${H.escapeHtml(eigen ? huidig : '#3B6FA0')}" aria-label="Eigen kleur kiezen">
          </label>
        </div>
      </fieldset>`;
  }

  function editTheme(dataset, id, context) {
    const isNew = !id;
    const theme = isNew ? { name: '', description: '', owner: '', status: 'grey' } : ObeyaData.findTheme(dataset, id);
    if (!theme) return '<p>Thema niet gevonden.</p>';
    return `
      ${closeBtn()}
      <h2 class="modal__title">${isNew ? 'Nieuw strategisch thema' : 'Thema bewerken'}</h2>
      <div class="field">
        <label for="f-name">Naam</label>
        <input id="f-name" type="text" value="${H.escapeHtml(theme.name)}" placeholder="Bijv. Sturen op meetbare resultaten">
      </div>
      <div class="field">
        <label for="f-description">Beschrijving</label>
        <textarea id="f-description" placeholder="Waar staat dit thema voor?">${H.escapeHtml(theme.description)}</textarea>
      </div>
      ${themeColorPicker(isNew ? ObeyaData.nextThemeColor(dataset) : ObeyaData.themeColor(theme))}
      <div class="field">
        <label for="f-owner">Eigenaar</label>
        ${H.ownerSelect('f-owner', dataset, theme.owner)}
      </div>
      ${H.involvedPicker(dataset, theme)}
      ${!isNew ? `<p class="rollup-hint muted">Status: ${H.statusPill(theme.status, { compact: true, entityType: 'theme' })} — automatisch bepaald op basis van de doelen bij dit thema.</p>` : ''}
      <div class="modal-actions">
        ${!isNew ? `<button class="btn btn--ghost" data-action="delete" data-type="theme" data-id="${theme.id}">Verwijderen</button>` : '<span></span>'}
        <div class="modal-actions__right">
          <button class="btn btn--ghost" data-action="cancel-edit" data-type="theme" data-id="${id || ''}">Annuleren</button>
          <button class="btn btn--primary" data-action="save" data-type="theme" data-id="${id || ''}">Opslaan</button>
        </div>
      </div>`;
  }

  // ---------------------------------------------------------------------
  // Objective
  // ---------------------------------------------------------------------

  function projectRow(dataset, objective, p) {
    return `
      <li class="item-list__row" data-open="project:${p.id}" tabindex="0" role="button" aria-label="${H.escapeHtml(p.name)}">
        ${H.statusPill(p.status, { compact: true, entityType: 'project' })}
        <span class="item-list__name">${H.escapeHtml(p.name)}</span>
        ${H.relationTags(objective, p)}
        ${H.teamPlanBadge(p.inTeamPlan)}
        ${H.ownerBadge(p.owner)}
        ${p.actions && p.actions.length ? `<span class="muted item-list__extra">${p.actions.length} actie${p.actions.length === 1 ? '' : 's'}</span>` : ''}
      </li>`;
  }

  function actionRow(a) {
    return `
      <li class="item-list__row" data-open="action:${a.id}" tabindex="0" role="button" aria-label="${H.escapeHtml(a.title)}">
        ${H.statusPill(a.status, { compact: true, entityType: 'action' })}
        <span class="item-list__name">${H.escapeHtml(a.title)}</span>
        ${a.dueDate ? `<span class="muted">${H.formatDate(a.dueDate)}</span>` : ''}
        ${H.ownerBadge(a.owner)}
      </li>`;
  }

  // Losse acties in het doelscherm (idee 77, stap B): een telling, met in
  // beeld alleen wat aandacht vraagt; de rest klap je open. Samenhang en
  // Uitvoering tonen de acties al volledig.
  function needsAttention(a) {
    const overdue = a.dueDate && a.dueDate < new Date().toISOString().slice(0, 10) && a.status !== 'green';
    return a.status === 'red' || a.status === 'amber' || !!overdue;
  }

  function looseActionsSection(objective) {
    const acties = objective.actions || [];
    const aandacht = acties.filter(needsAttention);
    const rest = acties.filter((a) => !needsAttention(a));
    const telling = [
      aandacht.length ? `${aandacht.length} ${aandacht.length === 1 ? 'vraagt' : 'vragen'} aandacht` : '',
      rest.length ? `${rest.length} ${rest.length === 1 ? 'loopt' : 'lopen'} volgens plan` : '',
    ].filter(Boolean).join(', ');
    return `
      <section class="modal-section">
        <div class="modal-section__head">
          <h3>${H.entityTypeBadge('action')} Losse acties (${acties.length})</h3>
          <button class="btn btn--small" data-action="new-action" data-objective-id="${objective.id}">+ Actie</button>
        </div>
        ${acties.length ? `<p class="muted">${telling}.</p>` : '<p class="muted">Geen losse acties. Een actie hoort meestal bij een project.</p>'}
        ${aandacht.length ? `<ul class="item-list">${aandacht.map(actionRow).join('')}</ul>` : ''}
        ${rest.length ? `<details class="loose-actions"><summary>${rest.length} ${aandacht.length ? 'andere ' : ''}${rest.length === 1 ? 'actie' : 'acties'} tonen</summary><ul class="item-list">${rest.map(actionRow).join('')}</ul></details>` : ''}
      </section>`;
  }

  // Het doelscherm als keten (idee 77, stap A, docs/doelscherm-voorstel.md):
  // elk meetbaar resultaat met de projecten die eraan bijdragen eronder.
  // Een project staat onder elk resultaat waaraan het bijdraagt, ook vanuit
  // een ander doel (via een relatie). Wat op koers of klaar is, klapt in tot
  // één regel; van de acties van een project staat alleen een telling, plus
  // wat aandacht vraagt. Samenhang en Uitvoering tonen alles volledig.
  const CALM = ['green', 'blue', 'done'];

  // Een project dat nog gekoppeld moet worden, is een signaal: dat blijft open.
  function projectIsCalm(dataset, p) {
    return CALM.includes(p.status) && !(p.actions || []).some(needsAttention) && !ObeyaData.projectNeedsMapping(p, dataset);
  }

  function actionCount(p) {
    const acties = p.actions || [];
    if (!acties.length) return '';
    const aandacht = acties.filter(needsAttention).length;
    return `<span class="muted item-list__extra">${acties.length} actie${acties.length === 1 ? '' : 's'}${aandacht ? `, ${aandacht} ${aandacht === 1 ? 'vraagt' : 'vragen'} aandacht` : ''}</span>`;
  }

  // Eén project in de keten, met de acties die aandacht vragen eronder.
  // `elders` is het doel van een project dat via een relatie bijdraagt; in
  // de groep zonder resultaat (`tags`) staat waar het wél aan bijdraagt of
  // dat het nog gekoppeld moet worden.
  function chainProject(dataset, objective, p, elders, tags) {
    const acties = (p.actions || []).filter(needsAttention);
    return `
      <li class="chain__item">
        <div class="item-list__row" data-open="project:${p.id}" tabindex="0" role="button" aria-label="${H.escapeHtml(p.name)}">
          ${H.statusPill(p.status, { compact: true, entityType: 'project' })}
          <span class="item-list__name">${H.escapeHtml(p.name)}${elders ? ` <span class="muted">· uit doel ${H.escapeHtml(elders.title)}</span>` : ''}</span>
          ${tags ? H.relationTags(objective, p) : ''}
          ${H.teamPlanBadge(p.inTeamPlan)}
          ${H.ownerBadge(p.owner)}
          ${actionCount(p)}
        </div>
        ${acties.length ? `<ul class="item-list chain__actions">${acties.map(actionRow).join('')}</ul>` : ''}
      </li>`;
  }

  // Wat aandacht vraagt open, de rest achter één regel.
  function chainProjects(dataset, objective, items, tags) {
    const open = items.filter((i) => !projectIsCalm(dataset, i.p));
    const rustig = items.filter((i) => projectIsCalm(dataset, i.p));
    const rij = (i) => chainProject(dataset, objective, i.p, i.elders, tags);
    return `${open.length ? `<ul class="item-list chain__projects">${open.map(rij).join('')}</ul>` : ''}${rustig.length ? `<details class="chain__calm"><summary>${rustig.length} op koers of klaar</summary><ul class="item-list chain__projects">${rustig.map(rij).join('')}</ul></details>` : ''}`;
  }

  function chainSection(dataset, objective) {
    const results = objective.measurableResults;
    const blokken = results.map((m) => {
      const eigen = objective.projects.filter((p) => (p.measurableResultIds || []).includes(m.id)).map((p) => ({ p }));
      const elders = ObeyaData.incomingContributions(dataset, m.id)
        .map((r) => ObeyaData.findProject(dataset, r.from))
        .filter((p) => p && p.objectiveId !== objective.id && !eigen.some((e) => e.p.id === p.id))
        .map((p) => ({ p, elders: ObeyaData.findObjective(dataset, p.objectiveId) || { title: 'onbekend' } }));
      const items = eigen.concat(elders);
      return `
        <li class="chain" data-chain="${m.id}">
          <div class="item-list__row chain__result${ObeyaData.isLate(m) ? ' item-list__row--late' : ''}" data-open="measurableResult:${m.id}" tabindex="0" role="button" aria-label="${H.escapeHtml(m.name)}">
            ${H.entityTypeBadge('measurableResult')}
            ${H.statusPill(m.status, { compact: true, entityType: 'measurableResult' })}
            <span class="item-list__name">${H.escapeHtml(m.name)}</span>
            ${H.deliverableMeta(m)}
            ${H.teamPlanBadge(m.inTeamPlan)}
            ${H.ownerBadge(m.owner)}
          </div>
          ${items.length ? chainProjects(dataset, objective, items) : '<p class="muted chain__empty">Nog geen project draagt hieraan bij.</p>'}
        </li>`;
    }).join('');
    const zonder = objective.projects.filter((p) => !(p.measurableResultIds || []).length).map((p) => ({ p }));
    return `
      <section class="modal-section">
        <div class="modal-section__head">
          <h3>Meetbare resultaten en wat eraan bijdraagt</h3>
          <span class="modal-section__buttons">
            <button class="btn btn--small" data-action="new-measurableResult" data-objective-id="${objective.id}">+ Meetbaar resultaat</button>
            <button class="btn btn--small btn--ghost" data-action="bulk-measurableResults" data-objective-id="${objective.id}" title="Een lijst met één meetbaar resultaat per regel">+ Meerdere tegelijk</button>
            <button class="btn btn--small" data-action="new-project" data-objective-id="${objective.id}">+ Project</button>
          </span>
        </div>
        <p class="muted">${results.length} meetbare resultaten, ${objective.projects.length} projecten.</p>
        ${results.length ? `<ul class="chain-list">${blokken}</ul>` : '<p class="muted">Nog geen meetbare resultaten. Een doel wordt pas toetsbaar met minstens één.</p>'}
        ${zonder.length ? `
        <div class="chain chain--loose">
          <h4 class="chain__head">${H.entityTypeBadge('project')} Zonder meetbaar resultaat van dit doel (${zonder.length})</h4>
          ${chainProjects(dataset, objective, zonder, true)}
        </div>` : ''}
      </section>`;
  }

  function viewObjective(dataset, id, editingNoteId) {
    const objective = ObeyaData.findObjective(dataset, id);
    if (!objective) return '<p>Doel niet gevonden.</p>';
    const theme = ObeyaData.findObjectiveOwnerTheme(dataset, id);
    const otherThemes = (objective.themeIds || [objective.themeId])
      .map((tid) => ObeyaData.findTheme(dataset, tid))
      .filter(Boolean);
    return `
      ${closeBtn()}
      ${crumbs([{ label: theme.name, type: 'theme', id: theme.id, color: ObeyaData.themeColor(theme) }, { label: objective.title }])}
      <h2 class="modal__title">${H.escapeHtml(objective.title)}</h2>
      ${(() => { const c = valueChips(dataset, 'objective', objective); return `<div class="modal__row">
        ${c.chips} ${H.principleBadge(objective)}
        ${otherThemes.length > 1 ? `<span class="muted">raakt ${otherThemes.length} thema’s</span>` : ''}
        ${flagToggleBtn(objective)}
      </div>${c.panel}`; })()}
      ${otherThemes.length > 1 ? `<div class="theme-tags">${otherThemes.map((t) => `<span class="theme-tag">${H.themeSwatch(t)} ${H.escapeHtml(t.name)}</span>`).join('')}</div>` : ''}
      <p class="rollup-hint muted">Status wordt automatisch bepaald op basis van de meetbare resultaten, projecten en acties hieronder. ${H.coverageSentence(ObeyaData.objectiveCoverage(objective), 'onderdelen')}</p>
      <p class="modal__description">${objective.description ? H.nl2br(objective.description) : '<span class="muted">Geen beschrijving toegevoegd.</span>'}</p>

      ${chainSection(dataset, objective)}

      ${looseActionsSection(objective)}

      ${relationsSection(dataset, objective.id)}
      ${notesSection(dataset, objective, objective.id, editingNoteId)}
      ${levelRow(dataset, 'objective', objective)}

      ${ObeyaHistoryView.itemHistory(dataset, objective.id, !!reviewExtra.showAll, historyOpen)}
      <div class="modal-actions">
        <button class="btn btn--ghost" data-action="delete" data-type="objective" data-id="${objective.id}">Verwijderen</button>
        <div class="modal-actions__right">
          <button class="btn btn--primary" data-action="edit" data-type="objective" data-id="${objective.id}">Bewerken</button>
        </div>
      </div>`;
  }

  function editObjective(dataset, id, context) {
    const isNew = !id;
    const objective = isNew
      ? { title: '', description: '', owner: '', status: 'grey', themeIds: [context.themeId] }
      : ObeyaData.findObjective(dataset, id);
    if (!objective) return '<p>Doel niet gevonden.</p>';
    const themeIds = objective.themeIds || [objective.themeId];
    return `
      ${closeBtn()}
      <h2 class="modal__title">${isNew ? 'Nieuw doel' : 'Doel bewerken'}</h2>
      <div class="field">
        <label for="f-title">Titel</label>
        <textarea id="f-title" placeholder="Beschrijf het doel...">${H.escapeHtml(objective.title)}</textarea>
      </div>
      <div class="field">
        <label for="f-description">Toelichting</label>
        <textarea id="f-description" placeholder="Extra context (optioneel)">${H.escapeHtml(objective.description)}</textarea>
      </div>
      <div class="field">
        <label for="f-owner">Eigenaar</label>
        ${H.ownerSelect('f-owner', dataset, objective.owner)}
      </div>
      ${H.involvedPicker(dataset, objective)}
      ${H.principlePicker(dataset, objective)}
      <div class="field">
        <label>Strategische thema’s (meerdere mogelijk)</label>
        <div class="theme-picker">
          ${dataset.themes.map((t) => `
            <label class="theme-opt ${themeIds.includes(t.id) ? 'theme-opt--checked' : ''}">
              <input type="checkbox" data-theme-toggle value="${t.id}" ${themeIds.includes(t.id) ? 'checked' : ''}>
              ${H.themeSwatch(t)} ${H.escapeHtml(t.name)}
            </label>`).join('')}
        </div>
        <p class="field-hint">Een doel moet aan minimaal één thema gekoppeld blijven.</p>
      </div>
      <div class="modal-actions">
        ${!isNew ? `<button class="btn btn--ghost" data-action="delete" data-type="objective" data-id="${objective.id}">Verwijderen</button>` : '<span></span>'}
        <div class="modal-actions__right">
          <button class="btn btn--ghost" data-action="cancel-edit" data-type="objective" data-id="${id || ''}">Annuleren</button>
          <button class="btn btn--primary" data-action="save" data-type="objective" data-id="${id || ''}" data-theme-id="${context.themeId || themeIds[0]}">Opslaan</button>
        </div>
      </div>`;
  }

  // ---------------------------------------------------------------------
  // Measurable result (meetbaar resultaat / KPI)
  // ---------------------------------------------------------------------

  function viewMeasurableResult(dataset, id, editingNoteId) {
    const mr = ObeyaData.findMeasurableResult(dataset, id);
    if (!mr) return '<p>Meetbaar resultaat niet gevonden.</p>';
    const objective = ObeyaData.findObjective(dataset, mr.objectiveId);
    const theme = ObeyaData.findObjectiveOwnerTheme(dataset, mr.objectiveId);
    return `
      ${closeBtn()}
      ${crumbs([{ label: theme.name, type: 'theme', id: theme.id, color: ObeyaData.themeColor(theme) }, { label: objective.title, type: 'objective', id: objective.id }, { label: mr.name }])}
      <h2 class="modal__title">${H.escapeHtml(mr.name)}</h2>
      ${(() => { const c = valueChips(dataset, 'measurableResult', mr); return `<div class="modal__row">${c.chips} ${H.teamPlanBadge(mr.inTeamPlan)} ${flagToggleBtn(mr)}</div>${c.panel}`; })()}
      <dl class="detail-grid">
        <dt>Klaar als</dt><dd>${mr.doneCriterion ? H.nl2br(mr.doneCriterion) : '<span class="muted">nog niet bepaald</span>'}</dd>
        <dt>Streefkwartaal</dt><dd>${mr.periodYear ? H.escapeHtml(ObeyaData.formatPeriod(mr.periodYear, mr.periodQuarter)) : '<span class="muted">nog niet bepaald</span>'} ${H.lateBadge(mr)}</dd>
        ${ObeyaData.valueText(mr) ? `<dt>Stand</dt><dd>${H.escapeHtml(ObeyaData.valueText(mr))}</dd>` : ''}
        ${mr.sourceStatus ? `<dt>Praktijkstatus</dt><dd>${H.escapeHtml(mr.sourceStatus)}</dd>` : ''}
        <dt>In teamplan</dt><dd>${mr.inTeamPlan ? 'Ja' : 'Nee'}</dd>
      </dl>
      ${mr.monitoringText ? `<div class="callout"><strong>Monitoren:</strong> ${H.nl2br(mr.monitoringText)}</div>` : ''}


      ${(() => {
        const { projects, actions } = ObeyaData.contributingItems(objective, mr.id);
        const total = projects.length + actions.length;
        return `
          <section class="modal-section">
            <div class="modal-section__head"><h3>Draagt bij: projecten &amp; acties (${total})</h3>
              <span class="modal-section__buttons"><button class="btn btn--small btn--ghost" data-action="bulk-actions" data-mr-id="${H.escapeHtml(mr.id)}" data-objective-id="${H.escapeHtml(objective.id)}" title="Een lijst met één actie per regel, gekoppeld aan dit resultaat">+ Meerdere acties</button></span></div>
            ${total
              ? `<ul class="item-list">${projects.map((p) => projectRow(dataset, objective, p)).join('')}${actions.map((a) => actionRow(a)).join('')}</ul>`
              : '<p class="muted">Nog geen project of actie hieraan gekoppeld.</p>'}
          </section>`;
      })()}

      ${relationsSection(dataset, mr.id)}
      ${notesSection(dataset, objective, mr.id, editingNoteId)}
      ${levelRow(dataset, 'measurableResult', mr)}

      ${ObeyaHistoryView.itemHistory(dataset, mr.id, !!reviewExtra.showAll, historyOpen)}
      <div class="modal-actions">
        <button class="btn btn--ghost" data-action="delete" data-type="measurableResult" data-id="${mr.id}">Verwijderen</button>
        <div class="modal-actions__right">
          <button class="btn btn--ghost" data-action="duplicate" data-type="measurableResult" data-id="${mr.id}" title="Een kopie direct hierna, nog niet beoordeeld, om aan te passen">Dupliceren</button>
          <button class="btn btn--primary" data-action="edit" data-type="measurableResult" data-id="${mr.id}">Bewerken</button>
        </div>
      </div>`;
  }

  // Meerdere meetbare resultaten tegelijk (idee 84): één per regel. Alleen de
  // naam per resultaat; eigenaar en streefkwartaal gelden voor allemaal. "Klaar
  // als" vul je daarna per resultaat in (de Agenda toont wat nog ontbreekt).
  // Bestaande namen, zodat het voorbeeld kan zeggen wat wordt overgeslagen:
  // de resultaten van het doel, of de acties die al aan het resultaat hangen.
  function bestaandeNamen(dataset, objectiveId, mrId) {
    const objective = ObeyaData.findObjective(dataset, objectiveId);
    if (!objective) return new Set();
    const lijst = mrId ? ObeyaData.contributingItems(objective, mrId).actions.map((a) => a.title) : objective.measurableResults.map((m) => m.name);
    return new Set(lijst.map((n) => String(n).trim().toLowerCase()));
  }

  function bulkPreview(dataset, objectiveId, text, mrId) {
    const namen = ObeyaData.splitResultNames(text);
    if (!namen.length) return 'Nog niets ingevuld.';
    const bestaand = bestaandeNamen(dataset, objectiveId, mrId);
    const dubbel = namen.filter((n) => bestaand.has(n.toLowerCase()));
    const n = namen.length - dubbel.length;
    const [een, meer] = mrId ? ['actie', 'acties'] : ['meetbaar resultaat', 'meetbare resultaten'];
    const telling = n === 1 ? `Dit wordt 1 ${een}.` : `Dit worden ${n} ${meer}.`;
    const waar = mrId ? 'Hangt al aan dit resultaat' : 'Al bij dit doel';
    return dubbel.length ? `${telling} ${waar}, dus overgeslagen: ${dubbel.join(', ')}.` : telling;
  }

  // Meerdere tegelijk: meetbare resultaten bij een doel (idee 84), of acties
  // bij een meetbaar resultaat (idee 86, context.measurableResultId).
  function viewBulkResults(dataset, context) {
    const objective = ObeyaData.findObjective(dataset, context.objectiveId);
    if (!objective) return '<p>Doel niet gevonden.</p>';
    const mr = context.measurableResultId ? ObeyaData.findMeasurableResult(dataset, context.measurableResultId) : null;
    if (context.measurableResultId && !mr) return '<p>Meetbaar resultaat niet gevonden.</p>';
    const mrAttr = mr ? ` data-mr-id="${H.escapeHtml(mr.id)}"` : '';
    return `
      ${closeBtn()}
      <h2 class="modal__title">${mr ? 'Meerdere acties' : 'Meerdere meetbare resultaten'}</h2>
      <p class="modal__description">${mr
        ? `Bij het meetbaar resultaat <strong>${H.escapeHtml(mr.name)}</strong>, van het doel ${H.escapeHtml(objective.title)}.`
        : `Bij het doel <strong>${H.escapeHtml(objective.title)}</strong>.`}</p>
      <div class="field">
        <label for="f-bulk-names">${mr ? 'Acties' : 'Meetbare resultaten'}</label>
        <textarea id="f-bulk-names" rows="8" aria-describedby="f-bulk-names-hint" placeholder="${mr ? 'Bijv.&#10;Taakomschrijving webredacteur&#10;Taakomschrijving productowner' : 'Bijv.&#10;Checklist beleid online dienstverlening&#10;Websites voldoen aan WCAG AA'}">${H.escapeHtml(context.text || '')}</textarea>
        <p class="field-hint" id="f-bulk-names-hint">${mr
          ? 'Eén actie per regel. Een lijst uit Word of een mail kun je zo plakken: streepjes en nummers vooraan vallen weg. De eigenaar kies je daarna per actie.'
          : 'Eén meetbaar resultaat per regel. Een lijst uit Word of een mail kun je zo plakken: streepjes en nummers vooraan vallen weg. "Klaar als" vul je daarna per resultaat in.'}</p>
      </div>
      <p class="bulk-preview" id="f-bulk-preview" aria-live="polite">${H.escapeHtml(bulkPreview(dataset, objective.id, context.text || '', mr ? mr.id : null))}</p>
      ${mr ? '' : `<fieldset class="print-form__group">
        <legend>Voor allemaal (optioneel)</legend>
        <div class="field-row">
          <div class="field"><label for="f-owner">Eigenaar</label>${H.ownerSelect('f-owner', dataset, '')}</div>
          <div class="field"><label for="f-period-year">Streefjaar</label><input id="f-period-year" type="number" inputmode="numeric" min="2000" max="2100" placeholder="2026"></div>
          <div class="field"><label for="f-period-quarter">Streefkwartaal</label>
            <select id="f-period-quarter">
              <option value="">Heel jaar</option>
              ${[1, 2, 3, 4].map((q) => `<option value="${q}">Q${q}</option>`).join('')}
            </select>
          </div>
        </div>
      </fieldset>`}
      <div class="modal-actions">
        <span></span>
        <div class="modal-actions__right">
          <button class="btn btn--ghost" data-action="cancel-bulk-results" data-objective-id="${H.escapeHtml(objective.id)}"${mrAttr}>Annuleren</button>
          <button class="btn btn--primary" data-action="save-bulk-results" data-objective-id="${H.escapeHtml(objective.id)}"${mrAttr}>Toevoegen</button>
        </div>
      </div>`;
  }

  function editMeasurableResult(dataset, id, context) {
    const isNew = !id;
    const mr = isNew
      ? { name: '', doneCriterion: '', owner: '', status: 'grey', sourceStatus: '', inTeamPlan: false, monitoringText: '', objectiveId: context.objectiveId }
      : ObeyaData.findMeasurableResult(dataset, id);
    if (!mr) return '<p>Meetbaar resultaat niet gevonden.</p>';
    const linkProject = isNew && context.linkProjectId ? ObeyaData.findProject(dataset, context.linkProjectId) : null;
    return `
      ${closeBtn()}
      <h2 class="modal__title">${isNew ? 'Nieuw meetbaar resultaat' : 'Meetbaar resultaat bewerken'}</h2>
      ${linkProject ? `<p class="modal__description">Na opslaan wordt dit resultaat gekoppeld aan het project <strong>${H.escapeHtml(linkProject.name)}</strong>.</p>` : ''}
      <div class="field">
        <label for="f-name">Naam</label>
        <textarea id="f-name" placeholder="Wat leveren we op?" aria-describedby="f-name-hint">${H.escapeHtml(mr.name)}</textarea>
        <p class="field-hint" id="f-name-hint">Een meetbaar resultaat is een deelproduct: iets wat af is of niet, met een moment waarop het af moet zijn.</p>
      </div>
      <div class="field">
        <label for="f-done-criterion">Klaar als …</label>
        <textarea id="f-done-criterion" rows="2" placeholder="Bijv. het formulier staat live en tien inwoners hebben het getest" aria-describedby="f-done-criterion-hint">${H.escapeHtml(mr.doneCriterion || '')}</textarea>
        <p class="field-hint" id="f-done-criterion-hint">Eén zin waaraan iedereen kan zien dat het klaar is.</p>
      </div>
      <div class="field-row">
        <div class="field"><label for="f-period-year">Streefjaar</label><input id="f-period-year" type="number" inputmode="numeric" min="2000" max="2100" value="${H.escapeHtml(mr.periodYear ?? '')}" placeholder="2026"></div>
        <div class="field"><label for="f-period-quarter">Streefkwartaal</label>
          <select id="f-period-quarter">
            <option value="">Heel jaar</option>
            ${[1, 2, 3, 4].map((q) => `<option value="${q}" ${mr.periodQuarter === q ? 'selected' : ''}>Q${q}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="field-row">
        <div class="field"><label for="f-owner">Eigenaar</label>${H.ownerSelect('f-owner', dataset, mr.owner)}</div>
        <div class="field"><label for="f-status">Status</label>${H.statusSelect('f-status', mr.status, undefined, 'measurableResult')}</div>
      </div>
      <fieldset class="print-form__group">
        <legend>Stand (optioneel)</legend>
        <p class="muted">Hoe ver het is, bijvoorbeeld 5 van 9 taakomschrijvingen. De status blijft je eigen oordeel: 5 van 9 kan op koers zijn of niet.</p>
        <div class="field-row">
          <div class="field"><label for="f-value-current">Huidige waarde</label><input id="f-value-current" type="text" inputmode="decimal" value="${H.escapeHtml(mr.valueCurrent ?? '')}" data-value-was="${H.escapeHtml(mr.valueCurrent ?? '')}"></div>
          <div class="field"><label for="f-value-target">Doelwaarde</label><input id="f-value-target" type="text" inputmode="decimal" value="${H.escapeHtml(mr.valueTarget ?? '')}"></div>
          <div class="field"><label for="f-value-date">Peildatum</label><input id="f-value-date" type="date" value="${H.escapeHtml(mr.valueDate || '')}"></div>
        </div>
      </fieldset>
      ${H.involvedPicker(dataset, mr)}
      <div class="field-row">
        <div class="field"><label for="f-source-status">Praktijkstatus (optioneel)</label><input id="f-source-status" type="text" value="${H.escapeHtml(mr.sourceStatus || '')}" placeholder="bijv. loopt, wacht, afgerond"></div>
        <div class="field field--checkbox"><label><input id="f-team-plan" type="checkbox" ${mr.inTeamPlan ? 'checked' : ''}> Opgenomen in teamplan</label></div>
      </div>
      <div class="field">
        <label for="f-monitoring-text">Monitoren / toelichting</label>
        <textarea id="f-monitoring-text" placeholder="Wat volgen we, of waarom deze status?">${H.escapeHtml(mr.monitoringText)}</textarea>
      </div>
      <div class="modal-actions">
        ${!isNew ? `<button class="btn btn--ghost" data-action="delete" data-type="measurableResult" data-id="${mr.id}">Verwijderen</button>` : '<span></span>'}
        <div class="modal-actions__right">
          <button class="btn btn--ghost" data-action="cancel-edit" data-type="measurableResult" data-id="${id || ''}" data-objective-id="${mr.objectiveId}"${linkProject ? ` data-project-id="${linkProject.id}"` : ''}>Annuleren</button>
          <button class="btn btn--primary" data-action="save" data-type="measurableResult" data-id="${id || ''}" data-objective-id="${mr.objectiveId}"${linkProject ? ` data-link-project-id="${linkProject.id}"` : ''}>Opslaan</button>
        </div>
      </div>`;
  }

  // ---------------------------------------------------------------------
  // Project
  // ---------------------------------------------------------------------

  function viewProject(dataset, id, editingNoteId) {
    const project = ObeyaData.findProject(dataset, id);
    if (!project) return '<p>Project niet gevonden.</p>';
    const objective = ObeyaData.findObjective(dataset, project.objectiveId);
    const theme = ObeyaData.findObjectiveOwnerTheme(dataset, project.objectiveId);
    return `
      ${closeBtn()}
      ${crumbs([{ label: theme.name, type: 'theme', id: theme.id, color: ObeyaData.themeColor(theme) }, { label: objective.title, type: 'objective', id: objective.id }, { label: project.name }])}
      <h2 class="modal__title">${H.escapeHtml(project.name)}</h2>
      ${(() => { const c = valueChips(dataset, 'project', project); return `<div class="modal__row">${c.chips} ${H.teamPlanBadge(project.inTeamPlan)} ${H.workTypeBadge(project)} ${H.principleBadge(project)} ${project.periodYear ? `<span class="muted">${H.escapeHtml(ObeyaData.formatPeriod(project.periodYear, project.periodQuarter))}</span>` : ''} ${flagToggleBtn(project)}</div>${c.panel}`; })()}
      <div class="modal__row">${H.relationTags(objective, project)}</div>
      <p class="modal__description">${project.description ? H.nl2br(project.description) : ''}</p>
      ${project.sourceStatus ? `<p class="muted">Praktijkstatus: ${H.escapeHtml(project.sourceStatus)}</p>` : ''}
      ${project.monitoringText ? `<div class="callout"><strong>Monitoren:</strong> ${H.nl2br(project.monitoringText)}</div>` : ''}


      <section class="modal-section">
        <div class="modal-section__head">
          <h3>${H.entityTypeBadge('action')} Acties (${project.actions.length})</h3>
          <button class="btn btn--small" data-action="new-action" data-objective-id="${objective.id}" data-project-id="${project.id}">+ Actie</button>
        </div>
        ${project.actions.length
          ? `<ul class="item-list">${project.actions.map((a) => `
              <li class="item-list__row" data-open="action:${a.id}" tabindex="0" role="button" aria-label="${H.escapeHtml(a.title)}">
                ${H.statusPill(a.status, { compact: true, entityType: 'action' })}
                <span class="item-list__name">${H.escapeHtml(a.title)}</span>
                ${a.dueDate ? `<span class="muted">${H.formatDate(a.dueDate)}</span>` : ''}
                ${H.ownerBadge(a.owner)}
              </li>`).join('')}</ul>`
          : '<p class="muted">Nog geen acties.</p>'}
      </section>

      ${relationsSection(dataset, project.id)}
      ${notesSection(dataset, objective, project.id, editingNoteId)}
      ${convertRow(dataset, 'project', project)}

      ${ObeyaHistoryView.itemHistory(dataset, project.id, !!reviewExtra.showAll, historyOpen)}
      <div class="modal-actions">
        <button class="btn btn--ghost" data-action="delete" data-type="project" data-id="${project.id}">Verwijderen</button>
        <div class="modal-actions__right">
          <button class="btn btn--ghost" data-action="duplicate" data-type="project" data-id="${project.id}" title="Een kopie direct hierna, nog niet beoordeeld, om aan te passen">Dupliceren</button>
          <button class="btn btn--primary" data-action="edit" data-type="project" data-id="${project.id}">Bewerken</button>
        </div>
      </div>`;
  }

  // Omzetten naar het andere niveau (idee 65), met in één zin het verschil
  // (Obeya-coach). Alleen in het detailscherm, zodat er geen niet-opgeslagen
  // wijzigingen verloren gaan; in de keten kan het ook door te slepen.
  function convertRow(dataset, type, entity) {
    const naar = type === 'project' ? 'actie' : 'project';
    const blokkade = ObeyaData.conversionBlocker(dataset, type, entity.id);
    return `
      <section class="modal-section convert-row">
        <p class="convert-row__text"><strong>Dit is ${type === 'project' ? 'een project' : 'een actie'}.</strong> Een actie is één taak voor één persoon, met "klaar" als vinkje; een project heeft eigen acties en een tussenstand.${blokkade ? ` <span class="muted">${H.escapeHtml(blokkade)}</span>` : ''}</p>
        <button class="btn btn--ghost btn--small" data-action="convert-item" data-type="${type}" data-id="${H.escapeHtml(entity.id)}" ${blokkade ? 'disabled' : ''}>Omzetten naar ${naar}</button>
      </section>`;
  }

  // Doel ↔ meetbaar resultaat (idee 71). Een doel dat een resultaat wordt,
  // komt onder een ander doel; dat kies je hier.
  function levelRow(dataset, type, entity) {
    const blokkade = ObeyaData.levelBlocker(dataset, type, entity.id);
    if (type === 'objective') {
      const doelen = dataset.themes.map((t) => {
        const opties = t.objectives.filter((o) => o.id !== entity.id).map((o) => `<option value="${H.escapeHtml(o.id)}">${H.escapeHtml(o.title)}</option>`).join('');
        return opties ? `<optgroup label="${H.escapeHtml(t.name)}">${opties}</optgroup>` : '';
      }).join('');
      return `
      <section class="modal-section convert-row convert-row--stacked">
        <p class="convert-row__text"><strong>Dit is een doel.</strong> Een meetbaar resultaat is wat je kunt opleveren of aflezen om te zien of een doel dichterbij komt.${entity.measurableResults.length ? ` De ${entity.measurableResults.length === 1 ? 'eigen resultaat verhuist' : `${entity.measurableResults.length} eigen resultaten verhuizen`} mee naar het doel dat je kiest.` : ''}${blokkade ? ` <span class="muted">${H.escapeHtml(blokkade)}</span>` : ''}</p>
        <div class="convert-row__controls">
          ${blokkade ? '' : `<label class="convert-row__label" for="f-convert-target">Wordt een meetbaar resultaat van</label>
          <select id="f-convert-target">${doelen}</select>`}
          <button class="btn btn--ghost btn--small" data-action="convert-item" data-type="objective" data-id="${H.escapeHtml(entity.id)}" ${blokkade ? 'disabled' : ''}>Omzetten naar meetbaar resultaat</button>
        </div>
      </section>`;
    }
    return `
      <section class="modal-section convert-row">
        <p class="convert-row__text"><strong>Dit is een meetbaar resultaat.</strong> Is het eigenlijk een eigen doel, met eigen resultaten eronder? Dan wordt het een doel in hetzelfde thema, en het werk eraan gaat mee.</p>
        <button class="btn btn--ghost btn--small" data-action="convert-item" data-type="measurableResult" data-id="${H.escapeHtml(entity.id)}">Omzetten naar doel</button>
      </section>`;
  }

  // Bijdragen aan resultaten elders (idee 64): vinkjes voor wat er al is, en
  // een keuzelijst met de resultaten van de andere doelen om er een bij te
  // zetten. Bij opslaan worden het relaties "Draagt bij aan".
  function elsewhereChip(dataset, mr, note) {
    const objective = ObeyaData.findObjective(dataset, mr.objectiveId);
    const theme = objective ? ObeyaData.findObjectiveOwnerTheme(dataset, objective.id) : null;
    return `
      <label class="theme-opt theme-opt--checked elsewhere-opt">
        <input type="checkbox" data-mr-elsewhere value="${H.escapeHtml(mr.id)}" checked>
        <span>${H.escapeHtml(mr.name)}${objective ? ` <span class="muted">· ${theme ? `${H.escapeHtml(theme.name)} › ` : ''}${H.escapeHtml(objective.title)}</span>` : ''}${note ? ` <span class="muted">— ${H.escapeHtml(note)}</span>` : ''}</span>
      </label>`;
  }

  function elsewherePicker(dataset, project, isNew) {
    const eigen = new Set((ObeyaData.findObjective(dataset, project.objectiveId) || { measurableResults: [] }).measurableResults.map((m) => m.id));
    const huidig = isNew ? [] : ObeyaData.relatedMeasurableResults(dataset, project.id).filter((m) => !eigen.has(m.id));
    const opties = ObeyaData.measurableResultsElsewhere(dataset, project.objectiveId);
    if (!opties.length && !huidig.length) return '';
    // Per doel een groep (thema › doel), en als optie alleen de naam van het
    // resultaat, zodat de opties niet worden afgekapt.
    const perDoel = new Map();
    opties.forEach((o) => {
      if (!perDoel.has(o.objective.id)) perDoel.set(o.objective.id, { label: `${o.theme.name} › ${o.objective.title}`, items: [] });
      perDoel.get(o.objective.id).items.push(o);
    });
    const notitie = (m) => (ObeyaData.outgoingContributions(dataset, project.id).find((r) => r.to === m.id) || {}).note;
    return `
      <div class="elsewhere">
        <p class="elsewhere__sub">Van andere doelen</p>
        <div class="theme-picker elsewhere__list" data-elsewhere-list>${huidig.map((m) => elsewhereChip(dataset, m, notitie(m))).join('')}</div>
        <select id="f-mr-elsewhere" aria-label="Resultaat van een ander doel toevoegen" data-mr-elsewhere-pick>
          <option value="">+ Resultaat van een ander doel…</option>
          ${Array.from(perDoel.values()).map(({ label, items }) => `<optgroup label="${H.escapeHtml(label)}">${items.map((o) => `<option value="${H.escapeHtml(o.mr.id)}">${H.escapeHtml(o.mr.name)}</option>`).join('')}</optgroup>`).join('')}
        </select>
        <p class="field-hint">Het project blijft bij dit doel; in Samenhang loopt er een lijn naar dat resultaat.</p>
      </div>`;
  }

  function editProject(dataset, id, context) {
    const isNew = !id;
    const project = isNew
      ? { name: '', description: '', owner: '', status: 'grey', sourceStatus: '', inTeamPlan: false, monitoringText: '', periodYear: new Date().getFullYear(), periodQuarter: null, measurableResultIds: context.measurableResultId ? [context.measurableResultId] : [], noMeasurableResultNeeded: false, objectiveId: context.objectiveId }
      : ObeyaData.findProject(dataset, id);
    if (!project) return '<p>Project niet gevonden.</p>';
    const objective = ObeyaData.findObjective(dataset, project.objectiveId);
    return `
      ${closeBtn()}
      <h2 class="modal__title">${isNew ? 'Nieuw project / initiatief' : 'Project bewerken'}</h2>
      <div class="field">
        <label for="f-name">Naam</label>
        <textarea id="f-name" placeholder="Naam van het project of initiatief">${H.escapeHtml(project.name)}</textarea>
      </div>
      <div class="field">
        <label for="f-description">Beschrijving</label>
        <textarea id="f-description" placeholder="Wat is het doel van dit project? (optioneel)">${H.escapeHtml(project.description)}</textarea>
      </div>
      <div class="field-row field-row--3">
        <div class="field"><label for="f-owner">Eigenaar</label>${H.ownerSelect('f-owner', dataset, project.owner)}</div>
        <div class="field"><label for="f-status">Status</label>${H.statusSelect('f-status', project.status, undefined, 'project')}</div>
        <div class="field"><label for="f-period-year">Jaar</label><input id="f-period-year" type="number" value="${H.escapeHtml(project.periodYear ?? '')}" placeholder="2026"></div>
      </div>
      <div class="field-row field-row--3">
        <div class="field"><label for="f-period-quarter">Kwartaal</label>
          <select id="f-period-quarter">
            <option value="">Heel jaar</option>
            ${[1, 2, 3, 4].map((q) => `<option value="${q}" ${project.periodQuarter === q ? 'selected' : ''}>Q${q}</option>`).join('')}
          </select>
        </div>
        <div class="field"><label for="f-source-status">Praktijkstatus (optioneel)</label><input id="f-source-status" type="text" value="${H.escapeHtml(project.sourceStatus || '')}" placeholder="bijv. loopt, wacht, afgerond"></div>
        <div class="field field--checkbox"><label><input id="f-team-plan" type="checkbox" ${project.inTeamPlan ? 'checked' : ''}> Opgenomen in teamplan</label></div>
      </div>
      <div class="field"><label for="f-work-type">Soort werk</label>
        <select id="f-work-type">
          <option value="">Nog niet ingedeeld</option>
          ${Object.entries(ObeyaData.WORK_TYPES).map(([k, l]) => `<option value="${k}" ${project.workType === k ? 'selected' : ''}>${H.escapeHtml(l)}</option>`).join('')}
        </select>
      </div>
      ${H.involvedPicker(dataset, project)}
      ${H.principlePicker(dataset, project)}
      <div class="field">
        <label for="f-monitoring-text">Monitoren / toelichting</label>
        <textarea id="f-monitoring-text" placeholder="Wat volgen we, of waarom deze status?">${H.escapeHtml(project.monitoringText)}</textarea>
      </div>
      <div class="field">
        <label>Draagt bij aan meetbaar resultaat (meerdere mogelijk)</label>
        <div class="theme-picker">
          ${(objective ? objective.measurableResults : []).map((m) => `
            <label class="theme-opt ${(project.measurableResultIds || []).includes(m.id) ? 'theme-opt--checked' : ''}">
              <input type="checkbox" data-mr-toggle value="${m.id}" ${(project.measurableResultIds || []).includes(m.id) ? 'checked' : ''}>
              ${H.escapeHtml(m.name)}
            </label>`).join('') || '<p class="muted">Dit doel heeft nog geen meetbare resultaten.</p>'}
        </div>
        ${elsewherePicker(dataset, project, isNew)}
        ${isNew
          ? '<p class="field-hint">Ontbreekt het juiste meetbare resultaat? Sla het project eerst op; daarna kun je er hier een toevoegen.</p>'
          : `<button class="btn btn--ghost btn--small" type="button" data-action="new-mr-for-project" data-project-id="${project.id}" data-objective-id="${project.objectiveId}">+ Meetbaar resultaat voor dit doel</button>
        <p class="field-hint">Slaat eerst je wijzigingen hierboven op, en koppelt het nieuwe resultaat daarna meteen aan dit project.</p>`}
        <div class="field field--checkbox">
          <label><input id="f-no-mr-needed" type="checkbox" ${project.noMeasurableResultNeeded ? 'checked' : ''}> Dit project hoeft niet aan een specifiek meetbaar resultaat gekoppeld te worden</label>
        </div>
      </div>
      <div class="modal-actions">
        ${!isNew ? `<button class="btn btn--ghost" data-action="delete" data-type="project" data-id="${project.id}">Verwijderen</button>` : '<span></span>'}
        <div class="modal-actions__right">
          <button class="btn btn--ghost" data-action="cancel-edit" data-type="project" data-id="${id || ''}" data-objective-id="${project.objectiveId}">Annuleren</button>
          <button class="btn btn--primary" data-action="save" data-type="project" data-id="${id || ''}" data-objective-id="${project.objectiveId}">Opslaan</button>
        </div>
      </div>`;
  }

  // ---------------------------------------------------------------------
  // Action
  // ---------------------------------------------------------------------

  function viewAction(dataset, id, editingNoteId) {
    const action = ObeyaData.findAction(dataset, id);
    if (!action) return '<p>Actie niet gevonden.</p>';
    const objective = ObeyaData.findObjective(dataset, action.objectiveId);
    const theme = ObeyaData.findObjectiveOwnerTheme(dataset, action.objectiveId);
    const project = action.projectId ? ObeyaData.findProject(dataset, action.projectId) : null;
    const crumbParts = [{ label: theme.name, type: 'theme', id: theme.id, color: ObeyaData.themeColor(theme) }, { label: objective.title, type: 'objective', id: objective.id }];
    if (project) crumbParts.push({ label: project.name, type: 'project', id: project.id });
    crumbParts.push({ label: action.title });
    return `
      ${closeBtn()}
      ${crumbs(crumbParts)}
      <h2 class="modal__title">${H.escapeHtml(action.title)}</h2>
      ${(() => { const c = valueChips(dataset, 'action', action); return `<div class="modal__row">${c.chips} ${action.dueDate ? `<span class="muted">Deadline: ${H.formatDate(action.dueDate)}</span>` : ''} ${flagToggleBtn(action)}</div>${c.panel}`; })()}
      <p class="modal__description">${action.description ? H.nl2br(action.description) : '<span class="muted">Geen beschrijving toegevoegd.</span>'}</p>


      ${relationsSection(dataset, action.id)}
      ${notesSection(dataset, objective, action.id, editingNoteId)}
      ${convertRow(dataset, 'action', action)}

      ${ObeyaHistoryView.itemHistory(dataset, action.id, !!reviewExtra.showAll, historyOpen)}
      <div class="modal-actions">
        <button class="btn btn--ghost" data-action="delete" data-type="action" data-id="${action.id}">Verwijderen</button>
        <div class="modal-actions__right">
          <button class="btn btn--ghost" data-action="duplicate" data-type="action" data-id="${action.id}" title="Een kopie direct hierna, nog niet beoordeeld, om aan te passen">Dupliceren</button>
          <button class="btn btn--primary" data-action="edit" data-type="action" data-id="${action.id}">Bewerken</button>
        </div>
      </div>`;
  }

  function editAction(dataset, id, context) {
    const isNew = !id;
    const action = isNew
      ? { title: '', description: '', owner: '', status: 'grey', dueDate: '', objectiveId: context.objectiveId, projectId: context.projectId || '', measurableResultId: context.measurableResultId || null }
      : ObeyaData.findAction(dataset, id);
    if (!action) return '<p>Actie niet gevonden.</p>';
    const objective = ObeyaData.findObjective(dataset, action.objectiveId);
    return `
      ${closeBtn()}
      <h2 class="modal__title">${isNew ? 'Nieuwe actie' : 'Actie bewerken'}</h2>
      <div class="field">
        <label for="f-title">Titel</label>
        <textarea id="f-title" placeholder="Korte omschrijving van de actie">${H.escapeHtml(action.title)}</textarea>
      </div>
      <div class="field">
        <label for="f-description">Toelichting</label>
        <textarea id="f-description" placeholder="Optioneel">${H.escapeHtml(action.description)}</textarea>
      </div>
      <div class="field-row">
        <div class="field"><label for="f-owner">Actiehouder</label>${H.ownerSelect('f-owner', dataset, action.owner)}</div>
        <div class="field"><label for="f-status">Status</label>${H.statusSelect('f-status', action.status, undefined, 'action')}</div>
        <div class="field"><label for="f-due-date">Deadline</label><input id="f-due-date" type="date" value="${action.dueDate || ''}"></div>
      </div>
      ${H.involvedPicker(dataset, action)}
      <div class="field">
        <label for="f-project">Gekoppeld project (optioneel)</label>
        <select id="f-project">
          <option value="">Geen — direct gekoppeld aan het doel</option>
          ${objective.projects.map((p) => `<option value="${p.id}" ${p.id === action.projectId ? 'selected' : ''}>${H.escapeHtml(p.name)}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label for="f-measurable-result">Draagt bij aan meetbaar resultaat (optioneel)</label>
        <select id="f-measurable-result">
          <option value="">Geen specifiek meetbaar resultaat</option>
          ${objective.measurableResults.map((m) => `<option value="${m.id}" ${action.measurableResultId === m.id ? 'selected' : ''}>${H.escapeHtml(m.name)}</option>`).join('')}
        </select>
      </div>
      <div class="modal-actions">
        ${!isNew ? `<button class="btn btn--ghost" data-action="delete" data-type="action" data-id="${action.id}">Verwijderen</button>` : '<span></span>'}
        <div class="modal-actions__right">
          <button class="btn btn--ghost" data-action="cancel-edit" data-type="action" data-id="${id || ''}" data-objective-id="${action.objectiveId}" data-project-id="${action.projectId || ''}">Annuleren</button>
          <button class="btn btn--primary" data-action="save" data-type="action" data-id="${id || ''}" data-objective-id="${action.objectiveId}">Opslaan</button>
        </div>
      </div>`;
  }

  // ---------------------------------------------------------------------
  // Owners configuration (Configuratie -> Eigenaren beheren)
  // ---------------------------------------------------------------------

  // Eén persoon bewerken, onder zijn regel in Eigenaren: naam, rollen en
  // GitHub-login in één formulier (zo wilde David het, 7 november 2026).
  function personForm(dataset, name) {
    const p = ObeyaData.getPerson(dataset, name);
    return `
      <form class="person-form" data-action="person-form" data-owner="${H.escapeHtml(name)}">
        <label class="person-form__field">Naam
          <input id="f-person-name" type="text" name="name" value="${H.escapeHtml(name)}" required autocomplete="off">
        </label>
        <fieldset class="person-form__roles">
          <legend>Rollen</legend>
          ${ObeyaData.getRoles(dataset).map((r) => `<label class="field-checkbox"><input type="checkbox" name="role" value="${H.escapeHtml(r.id)}" ${p.roles.includes(r.id) ? 'checked' : ''}> ${H.escapeHtml(r.name)}</label>`).join('')}
        </fieldset>
        <label class="person-form__field">GitHub-login <span class="muted">(optioneel: dan herkent de app ${H.escapeHtml(name)} als die met het team verbonden is)</span>
          <input id="f-person-github" type="text" name="github" value="${H.escapeHtml(p.github)}" autocomplete="off" spellcheck="false" placeholder="bijv. daan-leiden">
        </label>
        <div class="person-form__actions">
          <button class="btn btn--small btn--primary" type="submit">Opslaan</button>
          <button class="btn btn--small btn--ghost" type="button" data-action="edit-person" data-owner="${H.escapeHtml(name)}">Annuleren</button>
        </div>
      </form>`;
  }

  // Rollen en login onder de naam; de rol van de groep waar hij al onder
  // staat niet nog eens.
  function personSummary(dataset, name, groupRole) {
    const rollen = ObeyaData.rolesOf(dataset, name).filter((r) => !groupRole || r.id !== groupRole.id).map((r) => r.name);
    const login = ObeyaData.getPerson(dataset, name).github;
    return [rollen.length ? `${groupRole ? 'ook ' : ''}${rollen.join(', ')}` : '', login ? `@${login}` : ''].filter(Boolean).join(' · ');
  }

  function viewOwnersConfig(dataset, embedded, openPerson) {
    const owners = ObeyaData.getOwnerOptions(dataset);
    return `
      ${titled('Eigenaren beheren', embedded)}
      <p class="modal__description">Deze lijst bepaalt welke namen je kunt kiezen als eigenaar bij thema's, doelen, meetbare resultaten, projecten en acties. Met ✎ bewerk je de naam, de rollen en de GitHub-login van een persoon. Een naam wijzigen of verwijderen werkt ook door in items die deze eigenaar al hebben.</p>
      <ul class="item-list">
        ${owners.length ? ObeyaData.ownersByRole(dataset).map((g) => `${g.label ? `<li class="item-list__group" role="presentation">${H.escapeHtml(g.label)} <span class="muted">(${g.names.length})</span></li>` : ''}${g.names.map((o) => {
          const count = ObeyaData.countOwnerUsage(dataset, o);
          const betrokken = ObeyaData.countInvolvement(dataset, o);
          const gebruik = [count ? `eigenaar van ${count} item${count === 1 ? '' : 's'}` : '', betrokken ? `betrokken bij ${betrokken}` : ''].filter(Boolean).join(' · ');
          const open = openPerson === o;
          return `<li class="item-list__row item-list__row--person" style="cursor:default;">
            <span class="item-list__name">${H.escapeHtml(o)}</span>
            <span class="muted item-list__extra">${gebruik || 'niet in gebruik'}</span>
            ${personSummary(dataset, o, g.role) ? `<span class="item-list__roles">${H.escapeHtml(personSummary(dataset, o, g.role))}</span>` : ''}
            <button class="icon-btn" data-action="edit-person" data-owner="${H.escapeHtml(o)}" aria-expanded="${open}" title="Bewerken: naam, rollen en GitHub-login" aria-label="Bewerk ${H.escapeHtml(o)}">✎</button>
            <button class="icon-btn" data-action="remove-owner" data-owner="${H.escapeHtml(o)}" title="Verwijderen" aria-label="Verwijder ${H.escapeHtml(o)}">✕</button>
            ${open ? personForm(dataset, o) : ''}
          </li>`;
        }).join('')}`).join('') : '<li class="muted">Nog geen eigenaren toegevoegd.</li>'}
      </ul>
      <form class="owner-add-form" data-action="add-owner-form">
        <input id="f-new-owner" type="text" placeholder="Naam van nieuwe eigenaar" aria-label="Naam van nieuwe eigenaar" required>
        <button class="btn btn--small" type="submit">Toevoegen</button>
      </form>
      <div class="modal-actions">
        <span></span>
        <div class="modal-actions__right">
          <button class="btn btn--primary" data-action="close-modal">Sluiten</button>
        </div>
      </div>`;
  }

  // Groepen van rollen (idee 88): per groep welke rollen erbij horen. Bij
  // Betrokkenen in een formulier vink je dan iedereen uit de groep in één keer aan.
  function viewRoleGroupsConfig(dataset) {
    const groepen = ObeyaData.getRoleGroups(dataset);
    const rollen = ObeyaData.getRoles(dataset);
    const mensen = Object.fromEntries(ObeyaData.roleGroups(dataset).map((g) => [g.name, g.names]));
    return `
      <p class="modal__description">Rollen die bij elkaar horen, bijvoorbeeld <strong>Sturing</strong> voor de senioren en de teamcoördinator. Bij <strong>Betrokkenen</strong> in een formulier vink je dan iedereen uit de groep in één keer aan. Een rol mag in meer groepen staan. Welke rollen er zijn, staat bij <button type="button" class="doc-link" data-action="settings-section" data-section="roles">Rollen</button>; wie welke rol heeft bij <button type="button" class="doc-link" data-action="settings-section" data-section="owners">Eigenaren</button>.</p>
      ${groepen.length ? groepen.map((g) => `
        <fieldset class="print-form__group role-group">
          <legend>${H.escapeHtml(g.name)} <span class="muted">${(mensen[g.name] || []).length ? `— ${H.escapeHtml(mensen[g.name].join(', '))}` : '— nog niemand met deze rollen'}</span></legend>
          <div class="involved-picker__list">
            ${rollen.map((r) => `<label class="involved-picker__item"><input type="checkbox" data-group-role="${H.escapeHtml(g.id)}" value="${H.escapeHtml(r.id)}" ${g.roleIds.includes(r.id) ? 'checked' : ''}> ${H.escapeHtml(r.name)}</label>`).join('')}
          </div>
          <p class="role-group__buttons">
            <button class="btn btn--ghost btn--small" type="button" data-action="rename-role-group" data-group="${H.escapeHtml(g.id)}" aria-label="Naam wijzigen van de groep ${H.escapeHtml(g.name)}">Naam wijzigen</button>
            <button class="btn btn--ghost btn--small" type="button" data-action="remove-role-group" data-group="${H.escapeHtml(g.id)}" aria-label="Verwijder de groep ${H.escapeHtml(g.name)}">Verwijderen</button>
          </p>
        </fieldset>`).join('') : '<p class="muted">Nog geen groepen.</p>'}
      <form class="owner-add-form" data-action="add-role-group-form">
        <input id="f-new-role-group" type="text" placeholder="Naam van nieuwe groep, bijv. Sturing" aria-label="Naam van nieuwe groep" maxlength="60" required>
        <button class="btn btn--small" type="submit">Toevoegen</button>
      </form>`;
  }

  // Rollen (stap 2 van docs/wijzigingslog-plan.md): de lijst, en per rol of
  // die structuurwijzigingen mag bevestigen. Het mandaat per niveau komt met
  // idee 67.
  function viewRolesConfig(dataset, gate) {
    const rollen = ObeyaData.getRoles(dataset);
    // Met het GitHub-team beslist GitHub wie mag bevestigen: de vinkjes
    // gelden dan niet en staan uit, zodat niemand zichzelf het recht geeft.
    const viaGitHub = !!gate;
    const owners = ObeyaData.getOwnerOptions(dataset);
    const aantal = (id) => owners.filter((o) => ObeyaData.getPerson(dataset, o).roles.includes(id)).length;
    return `
      ${viaGitHub
    ? `<p class="modal__description">De rollen in het team. Wie welke rol heeft, leg je vast bij <button type="button" class="doc-link" data-action="settings-section" data-section="owners">Eigenaren</button>.</p>
      <p class="settings__note" id="roles-confirm-note"><strong>Wie mag bevestigen, regelt GitHub:</strong> de leden van het team <strong>${H.escapeHtml(gate.team)}</strong> in de organisatie van het data-repo. Een eigenaar van de organisatie voegt mensen toe of haalt ze weg. De vinkjes hieronder gelden alleen voor het demobord.</p>`
    : `<p class="modal__description">De rollen in het team. Wie een rol heeft met <strong>mag bevestigen</strong>, kan in het overleg wijzigingen aan de opbouw van het bord bevestigen (nieuw, verwijderd, verplaatst of omgezet). Dat is een afspraak, geen beveiliging. Wie welke rol heeft, leg je vast bij <button type="button" class="doc-link" data-action="settings-section" data-section="owners">Eigenaren</button>.</p>`}
      <ul class="item-list role-list">
        ${rollen.map((r) => `<li class="item-list__row" style="cursor:default;">
            <span class="item-list__name">${H.escapeHtml(r.name)}</span>
            <span class="muted item-list__extra">${aantal(r.id) ? `${aantal(r.id)} ${aantal(r.id) === 1 ? 'persoon' : 'personen'}` : 'nog niemand'}</span>
            <label class="field-checkbox role-list__confirm"><input type="checkbox" data-role-confirm="${H.escapeHtml(r.id)}" ${r.canConfirm ? 'checked' : ''}${viaGitHub ? ' disabled aria-describedby="roles-confirm-note"' : ''}> mag bevestigen</label>
            <button class="icon-btn" data-action="rename-role" data-role="${H.escapeHtml(r.id)}" title="Naam wijzigen" aria-label="Naam wijzigen van de rol ${H.escapeHtml(r.name)}">✎</button>
            <button class="icon-btn" data-action="remove-role" data-role="${H.escapeHtml(r.id)}" title="Verwijderen" aria-label="Verwijder de rol ${H.escapeHtml(r.name)}">✕</button>
          </li>`).join('') || '<li class="muted">Nog geen rollen.</li>'}
      </ul>
      ${viaGitHub || rollen.some((r) => r.canConfirm) ? '' : '<p class="settings__warning">Geen enkele rol mag bevestigen: dan kan niemand wijzigingen bevestigen.</p>'}
      <form class="owner-add-form" data-action="add-role-form">
        <input id="f-new-role" type="text" placeholder="Naam van nieuwe rol" aria-label="Naam van nieuwe rol" maxlength="60" required>
        <button class="btn btn--small" type="submit">Toevoegen</button>
      </form>`;
  }

  // "Jij bent": alleen voor deze browser, bovenaan Team en opslag.
  function meFieldset(dataset, me, gate) {
    const owners = ObeyaData.getOwnerOptions(dataset);
    const gekozen = me && me.source === 'chosen' ? me.name : '';
    const uitleg = !me
      ? 'Nog niet gekozen. Wijzigingen worden vastgelegd als "onbekend (deze browser)", en bevestigen kan dan niet.'
      : me.source === 'github'
        ? `Herkend als <strong>${H.escapeHtml(me.name)}</strong> via je GitHub-login. Kies hieronder als dat niet klopt.`
        : `Wijzigingen in deze browser worden vastgelegd op naam van <strong>${H.escapeHtml(me.name)}</strong>.`;
    const rollen = me ? ObeyaData.rolesOf(dataset, me.name).map((r) => r.name) : [];
    return `
      <div class="field me-field">
        <label for="f-me">Jij bent</label>
        <select id="f-me" data-me-pick>
          <option value="">${me && me.source === 'github' ? `Automatisch: ${H.escapeHtml(me.name)}` : 'Kies je naam…'}</option>
          ${owners.map((o) => `<option value="${H.escapeHtml(o)}" ${o === gekozen ? 'selected' : ''}>${H.escapeHtml(o)}</option>`).join('')}
        </select>
        <p class="field-hint">${uitleg}${me ? ` ${rollen.length ? `Rol: ${H.escapeHtml(rollen.join(', '))}.` : 'Nog geen rol; die leg je vast bij Eigenaren.'}${!gate && ObeyaData.canConfirm(dataset, me.name) ? ' Je mag wijzigingen bevestigen.' : ''}` : ''} Alleen voor deze browser.</p>
        ${gate ? `<p class="field-hint" id="confirm-team-status">${ObeyaHistoryView.gateText(dataset, gate)}</p>` : ''}
      </div>`;
  }

  // ---------------------------------------------------------------------
  // Statuslabels configuration (Configuratie -> Statuslabels beheren)
  // ---------------------------------------------------------------------

  const STATUS_LABEL_ENTITY_NAMES = {
    theme: 'Thema', objective: 'Doel', measurableResult: 'Meetbaar resultaat', project: 'Project', action: 'Actie',
  };
  // Neutrale kleurnaam als bijschrift bij elk veld — los van STATUS_META's
  // .label, want dat ís juist het (per entiteitstype overschrijfbare) label
  // dat hier bewerkt wordt, niet een vaste naam voor de waarde zelf.
  const STATUS_COLOR_NAMES = {
    grey: 'Grijs', blue: 'Blauw', green: 'Groen', amber: 'Amber', red: 'Rood', done: 'Klaar (alleen MR)',
  };

  function viewStatusLabelsConfig(dataset, embedded) {
    const config = ObeyaData.getStatusLabelConfig(dataset);
    return `
      ${titled('Statuslabels beheren', embedded)}
      <p class="modal__description">De statuswaarden en hun kleuren liggen vast (dat bepaalt de rollup naar thema/doel) — alleen de getoonde tekst is hier per entiteitstype aan te passen. Veld leegmaken en opslaan herstelt het standaardlabel. Achtergrond: <a href="docs/statusmodel-voorstel.md" target="_blank" rel="noopener">docs/statusmodel-voorstel.md</a>.</p>
      <form data-action="save-status-labels">
        ${ObeyaData.STATUS_LABEL_ENTITY_TYPES.map((type) => `
          <fieldset class="status-label-group">
            <legend>${H.escapeHtml(STATUS_LABEL_ENTITY_NAMES[type] || type)}</legend>
            <div class="field-row status-label-row">
              ${ObeyaData.statusValuesFor(type).map((key) => `
                <div class="field">
                  <label for="f-status-label-${type}-${key}"><span class="status-dot status-dot--${key}" aria-hidden="true"></span> ${H.escapeHtml(STATUS_COLOR_NAMES[key] || key)}</label>
                  <input id="f-status-label-${type}-${key}" type="text" data-status-label data-entity-type="${type}" data-status-key="${key}" value="${H.escapeHtml(config[type][key])}">
                </div>`).join('')}
            </div>
          </fieldset>`).join('')}
        <div class="modal-actions">
          <span></span>
          <div class="modal-actions__right">
            <button class="btn btn--ghost" type="button" data-action="close-modal">Annuleren</button>
            <button class="btn btn--primary" type="submit">Opslaan</button>
          </div>
        </div>
      </form>`;
  }

  // ---------------------------------------------------------------------
  // Git-databackend configuratie (Configuratie -> Verbinden met GitHub)
  // Zie js/git-backend.js en ROADMAP.md idee 4+49.
  // ---------------------------------------------------------------------

  function gitTestResultHtml(test) {
    if (!test) return '';
    if (test.busy) return '<p class="muted">Bezig met testen…</p>';
    if (test.ok) {
      return `<div class="callout" style="border-left-color:var(--green)">Verbonden als <strong>${H.escapeHtml(test.name)}</strong> (${H.escapeHtml(test.username)}).</div>`;
    }
    const tokenWerkt = test.username ? `Je token werkt (${H.escapeHtml(test.name)}, @${H.escapeHtml(test.username)}), maar: ` : '';
    return `<div class="callout" style="border-left-color:var(--red)">${tokenWerkt}${H.escapeHtml(H.gitErrorMessage(test.error, test.detail))}</div>`;
  }

  // Formulier bewust als echt <form> met autocomplete-attributen: een
  // wachtwoordbeheerder herkent een geheim aan de combinatie van een
  // password-veld, een gebruikersnaamveld ernaast en een omsluitend formulier.
  // Zonder dat biedt hij niets aan en typ je het token elke keer over.
  //
  // Instellingen en token komen uit twee bronnen (zie js/git-backend.js): de
  // eigenaar en repo staan er ook als het token ontbreekt, zodat dit scherm
  // altijd zo veel mogelijk ingevuld opent.
  function viewGitConfig(gitTestResult, embedded) {
    const s = ObeyaGitBackend.getSettings();
    const token = ObeyaGitBackend.getToken();
    const onthouden = ObeyaGitBackend.isTokenRemembered();
    const standaard = s.branch === 'main' && s.path === 'data/obeya.json';
    return `
      ${titled('Verbinden met GitHub', embedded)}
      <p class="modal__description">Deelt de Obeya-data met een los GitHub-repo, zodat het team via commits kan samenwerken: elke opslag wordt een commit, dus wie wat wanneer wijzigde blijft altijd terug te vinden. Het token gaat rechtstreeks naar GitHub en nergens anders heen.</p>
      <form class="git-config-form" data-action="git-save-config-form">
        <div class="field">
          <label for="f-git-owner">Eigenaar (gebruiker of organisatie)</label>
          <input id="f-git-owner" name="username" type="text" autocomplete="username" value="${H.escapeHtml(s.owner)}" placeholder="bijv. jouw-organisatie">
        </div>
        <div class="field">
          <label for="f-git-repo">Repo</label>
          <input id="f-git-repo" name="obeya-repo" type="text" autocomplete="off" value="${H.escapeHtml(s.repo)}" placeholder="obeya-data">
          ${s.isTeamRepo ? '<p class="field-hint">Eigenaar en repo van het team staan al ingevuld; alleen je eigen token hoeft er nog bij.</p>' : ''}
        </div>
        <div class="field">
          <label for="f-git-token">Personal access token</label>
          <div class="input-with-button">
            <input id="f-git-token" name="password" type="password" autocomplete="current-password" value="${H.escapeHtml(token)}" placeholder="github_pat_...">
            <button class="btn btn--ghost btn--small" type="button" data-action="toggle-token-visibility">Tonen</button>
          </div>
          <label class="field-checkbox">
            <input id="f-git-remember" type="checkbox" ${onthouden ? 'checked' : ''}> Token onthouden op dit apparaat
          </label>
          <p class="field-hint">Zonder dit vinkje geldt het token alleen zolang deze browser openstaat en vult je wachtwoordbeheerder het daarna opnieuw in — veiliger op een gedeeld of publiek bereikbaar adres. Fine-grained token, rechten beperkt tot precies dit repo, met "Contents: Read and write". <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">Token aanmaken op GitHub ↗</a></p>
        </div>
        <details class="advanced" ${standaard ? '' : 'open'}>
          <summary>Geavanceerd — branch en bestandspad</summary>
          <p class="field-hint">Deze staan voor vrijwel elk team vast; aanpassen hoeft alleen als jullie data ergens anders staat.</p>
          <div class="field-row">
            <div class="field"><label for="f-git-branch">Branch</label><input id="f-git-branch" name="obeya-branch" type="text" autocomplete="off" value="${H.escapeHtml(s.branch)}" placeholder="main"></div>
            <div class="field"><label for="f-git-path">Bestandspad in het repo</label><input id="f-git-path" name="obeya-path" type="text" autocomplete="off" value="${H.escapeHtml(s.path)}" placeholder="data/obeya.json"></div>
          </div>
        </details>
        ${gitTestResultHtml(gitTestResult)}
        <div class="modal-actions">
          ${token ? '<button class="btn btn--ghost" type="button" data-action="git-disconnect">Verbinding verwijderen</button>' : '<span></span>'}
          <div class="modal-actions__right">
            <button class="btn btn--ghost" type="button" data-action="close-modal">Sluiten</button>
            <button class="btn btn--primary" type="submit">Opslaan &amp; testen</button>
          </div>
        </div>
      </form>
      ${token ? `<section class="modal-section git-reset">
        <div class="modal-section__head"><h3>Herstellen</h3></div>
        <p class="field-hint">Klopt de data in deze browser niet meer, bijvoorbeeld doordat er een ander bord doorheen is geraakt? Vervang hem dan door de laatste versie van het team. Wat je nog niet gedeeld hebt, gaat daarbij verloren; exporteer eerst als je dat wilt bewaren.</p>
        <button class="btn btn--ghost btn--small" type="button" data-action="git-replace-with-team">Teamversie overnemen</button>
      </section>` : ''}`;
  }


  // ---------------------------------------------------------------------
  // Weergave van de muur: lens Keten in Samenhang en het ketenvel
  // ---------------------------------------------------------------------

  // ---------------------------------------------------------------------
  // Beoordelingsronde (stap 1.4, js/state.js startReview). Elk veld slaat
  // meteen op, net als de snelle bediening op de detailschermen; de knoppen
  // gaan alleen over de ronde zelf.
  // ---------------------------------------------------------------------

  function viewReviewRound(dataset, review) {
    if (!review) return viewReviewStart(dataset);
    if (review.index >= review.items.length) return viewReviewSummary(dataset, review);
    const item = review.items[review.index];
    const found = ObeyaData.findAny(dataset, item.id);
    const voortgang = `Item ${review.index + 1} van ${review.items.length}`;
    const kop = `
      ${closeBtn()}
      <h2 class="modal__title">Beoordelingsronde</h2>
      <p class="review__progress" aria-hidden="true"><strong>${voortgang}</strong>${review.scope.themeId || review.scope.owner ? ` <span class="muted">· ${H.escapeHtml(reviewScopeLabel(dataset, review.scope))}</span>` : ''}</p>
      <progress class="review__bar" max="${review.items.length}" value="${review.index}" aria-hidden="true"></progress>`;
    if (!found) {
      return `${kop}<p class="sr-only" aria-live="polite">${voortgang}</p><p>Dit item bestaat niet meer; het is tijdens de ronde verwijderd.</p>
        <div class="modal-actions"><div class="modal-actions__right"><button class="btn btn--primary" id="rv-next" data-action="review-next">Volgende →</button></div></div>`;
    }
    const e = found.entity;
    const type = item.type;
    const objectiveId = type === 'objective' ? e.id : e.objectiveId;
    const objective = ObeyaData.findObjective(dataset, objectiveId);
    const theme = ObeyaData.findObjectiveOwnerTheme(dataset, objectiveId);
    const naam = type === 'objective' ? e.title : e.name;
    const open = ObeyaData.reviewReasons(dataset, type, e);
    const oorspronkelijk = ObeyaData.reviewQueue(dataset).find((i) => i.id === item.id);
    const redenen = Object.keys(ObeyaData.REVIEW_REASONS).filter((r) => open.includes(r) || (oorspronkelijk && oorspronkelijk.reasons.includes(r)));
    const onduidelijk = open.includes('owner-unclear');
    const attrs = `data-type="${type}" data-id="${H.escapeHtml(e.id)}"`;
    const notities = review.notes[item.id] || 0;
    const context = [theme && theme.name, type !== 'objective' && objective && objective.title, naam].filter(Boolean).join(' / ');
    return `
      ${kop}
      <p class="sr-only" aria-live="polite">${H.escapeHtml(`${voortgang}: ${context}`)}</p>
      <p class="crumbs">${theme ? `<span class="theme-swatch" style="background:${H.escapeHtml(ObeyaData.themeColor(theme))}" aria-hidden="true"></span> ${H.escapeHtml(theme.name)}` : ''}${type !== 'objective' && objective ? ` <span class="crumbs__sep">/</span> ${H.escapeHtml(objective.title)}` : ''}</p>
      <h3 class="review__title">${H.entityTypeBadge(type)} ${H.escapeHtml(naam)}</h3>
      <ul class="review__reasons" aria-label="Wat hier nog ontbreekt">
        ${(redenen.length ? redenen : []).map((r) => `<li class="${open.includes(r) ? '' : 'review__reason--done'}">${open.includes(r) ? '○' : '✓'} ${H.escapeHtml(ObeyaData.REVIEW_REASONS[r])}${open.includes(r) ? '' : ' <span class="sr-only">(opgelost)</span>'}</li>`).join('')}
      </ul>
      <div class="field-row">
        ${type !== 'objective' ? `<div class="field"><label for="rv-status">Status</label>${H.statusSelect('rv-status', e.status, `data-quick-status ${attrs}`, type)}</div>` : ''}
        <div class="field"><label for="rv-owner">Eigenaar</label>${H.ownerSelect('rv-owner', dataset, e.owner, `data-quick-owner ${attrs}`)}
          ${onduidelijk ? '<p class="field-hint">Niet zeker wie dit oppakt? Kies niet zelf, maar markeer het voor de teamsessie: eigenaarschap is een besluit van het team.</p>' : ''}
        </div>
      </div>
      ${type === 'measurableResult' ? `
      <div class="field"><label for="rv-criterion">Klaar als …</label><input id="rv-criterion" type="text" data-review-field="doneCriterion" ${attrs} value="${H.escapeHtml(e.doneCriterion || '')}" placeholder="Eén zin waaraan iedereen kan zien dat het klaar is"></div>
      <div class="field-row">
        <div class="field"><label for="rv-year">Streefjaar</label><input id="rv-year" type="number" inputmode="numeric" min="2000" max="2100" data-review-field="periodYear" ${attrs} value="${H.escapeHtml(e.periodYear ?? '')}" placeholder="2026"></div>
        <div class="field"><label for="rv-quarter">Streefkwartaal</label>
          <select id="rv-quarter" data-review-field="periodQuarter" ${attrs}>
            <option value="">Heel jaar</option>
            ${[1, 2, 3, 4].map((q) => `<option value="${q}" ${e.periodQuarter === q ? 'selected' : ''}>Q${q}</option>`).join('')}
          </select>
        </div>
      </div>` : ''}
      <form class="field review__note" data-action="review-note">
        <label for="rv-note">Notitie of reden${notities ? ` <span class="muted">· ${notities} toegevoegd</span>` : ''}</label>
        <div class="review__note-row">
          ${H.authorSelect('rv-note-author', dataset, null, 'aria-label="Wie schrijft dit"')}
          <input id="rv-note" type="text" autocomplete="off" placeholder="Waarom deze status, of wat er nog moet gebeuren" ${review.error ? 'aria-invalid="true" aria-describedby="rv-error"' : ''}>
          <button class="btn" type="submit">Toevoegen</button>
        </div>
        <p id="rv-error" class="error-text" role="alert">${review.error === 'reason-required' ? 'Geef bij Aandacht nodig of Buiten koers kort de reden, dan kun je door.' : ''}</p>
      </form>
      <p class="field-hint">Alles wat je hier invult, is meteen opgeslagen. Overslaan of sluiten gooit niets weg.</p>
      <div class="modal-actions">
        <button class="btn btn--ghost" data-action="review-back" ${review.index === 0 ? 'disabled' : ''}>← Vorige</button>
        <div class="modal-actions__right">
          <button class="btn btn--ghost" data-action="review-skip">Overslaan</button>
          <button class="btn btn--ghost" data-action="review-flag" title="Komt op de Agenda voor het volgende overleg">${e.flaggedForDiscussion ? 'Staat al op de agenda · verder' : 'Markeer voor teamsessie'}</button>
          <button class="btn btn--primary" id="rv-next" data-action="review-next">Volgende →</button>
        </div>
      </div>`;
  }

  function reviewScopeLabel(dataset, scope) {
    const theme = scope.themeId && dataset.themes.find((t) => t.id === scope.themeId);
    return [theme ? `thema ${theme.name}` : '', scope.owner ? `eigenaar ${scope.owner}` : ''].filter(Boolean).join(', ');
  }

  function viewReviewStart(dataset) {
    const alles = ObeyaData.reviewQueue(dataset);
    const eigenaren = Array.from(new Set(alles.map((i) => (ObeyaData.findAny(dataset, i.id) || { entity: {} }).entity.owner).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'nl'));
    const telling = (reden) => alles.filter((i) => i.reasons.includes(reden)).length;
    return `
      ${closeBtn()}
      <h2 class="modal__title">Beoordelingsronde</h2>
      <p class="modal__description">Eén voor één langs wat nog aandacht vraagt, per thema. Samen voor één scherm; wat je invult is meteen opgeslagen, twijfel markeer je voor de teamsessie.</p>
      ${alles.length ? `
      <ul class="review__counts">
        ${Object.keys(ObeyaData.REVIEW_REASONS).filter((r) => telling(r)).map((r) => `<li><strong>${telling(r)}</strong> ${H.escapeHtml(ObeyaData.REVIEW_REASONS[r].toLowerCase())}</li>`).join('')}
      </ul>
      <form data-action="review-start">
        <div class="field-row">
          <div class="field"><label for="rv-scope-theme">Thema</label>
            <select id="rv-scope-theme"><option value="">Alle thema's</option>${dataset.themes.map((t) => `<option value="${H.escapeHtml(t.id)}">${H.escapeHtml(t.name)}</option>`).join('')}</select>
          </div>
          <div class="field"><label for="rv-scope-owner">Eigenaar</label>
            <select id="rv-scope-owner"><option value="">Alle eigenaren</option>${eigenaren.map((o) => `<option value="${H.escapeHtml(o)}">${H.escapeHtml(o)}</option>`).join('')}</select>
          </div>
        </div>
        <div class="modal-actions"><div class="modal-actions__right">
          <button class="btn btn--ghost" type="button" data-action="close-modal">Annuleren</button>
          <button class="btn btn--primary" type="submit">Start de ronde (${alles.length})</button>
        </div></div>
      </form>` : '<p><strong>Niets te doen:</strong> alles heeft een oordeel, een "Klaar als" met streefkwartaal en één duidelijke eigenaar, en niets is te laat.</p>'}`;
  }

  function viewReviewSummary(dataset, review) {
    const c = { done: 0, skipped: 0, flagged: 0 };
    Object.values(review.outcomes).forEach((o) => { if (o in c) c[o] += 1; });
    const overgeslagen = review.items.filter((i) => review.outcomes[i.id] === 'skipped');
    const nogOpen = ObeyaData.reviewQueue(dataset, review.scope).length;
    return `
      ${closeBtn()}
      <h2 class="modal__title">Ronde klaar</h2>
      <p class="sr-only" aria-live="polite">Ronde klaar</p>
      <ul class="review__reasons">
        <li>${c.done} doorgenomen</li>
        <li>${c.flagged} gemarkeerd voor de teamsessie</li>
        <li>${c.skipped} overgeslagen</li>
      </ul>
      <p>${nogOpen ? `Er ${nogOpen === 1 ? 'staat' : 'staan'} nog ${nogOpen} item${nogOpen === 1 ? '' : 's'} open${review.scope.themeId || review.scope.owner ? ' in deze selectie' : ''}.` : 'In deze selectie staat niets meer open.'}</p>
      ${overgeslagen.length ? `
      <h3>Overgeslagen</h3>
      <ul class="item-list">${overgeslagen.map((i) => {
        const f = ObeyaData.findAny(dataset, i.id);
        return f ? `<li>${H.entityTypeBadge(i.type)} ${H.escapeHtml(i.type === 'objective' ? f.entity.title : f.entity.name)}</li>` : '';
      }).join('')}</ul>` : ''}
      <div class="modal-actions">
        <button class="btn btn--ghost" data-action="review-restart">Nieuwe ronde</button>
        <div class="modal-actions__right">
          ${overgeslagen.length ? `
          <button class="btn btn--ghost" data-action="review-skipped-again">Overgeslagen nog eens langs</button>
          <button class="btn btn--ghost" data-action="review-flag-skipped">Overgeslagen markeren voor teamsessie</button>` : ''}
          <button class="btn btn--primary" data-action="review-end">Afsluiten</button>
        </div>
      </div>`;
  }

  function viewBoardSettings(dataset, embedded) {
    const b = ObeyaData.getBoardSettings(dataset);
    const max = ObeyaData.BOARD_LIMITS;
    return `
      ${titled('Bord instellen', embedded)}
      <p class="modal__description">Wat dit bord van jullie team maakt. De naam staat bovenaan het bord en op de muurvellen; de visie staat in de kop, bovenaan Samenhang, in het midden van de mindmap en op de muurvellen. Ze gaan mee met delen en exporteren.</p>
      <form class="board-form" data-action="save-board-settings">
        <div class="field"><label for="f-board-name">Naam van het bord</label>
          <input id="f-board-name" type="text" required maxlength="${max.name}" value="${H.escapeHtml(b.name)}" placeholder="Obeya — Team …">
        </div>
        <div class="field"><label for="f-board-vision">Visie</label>
          <textarea id="f-board-vision" rows="4" maxlength="${max.vision}" aria-describedby="f-board-vision-hint">${H.escapeHtml(b.vision)}</textarea>
          <p class="field-hint" id="f-board-vision-hint">Waar het team naartoe werkt, in een of twee zinnen. Alles op het bord hoort hieraan bij te dragen. Laat leeg als er nog geen visie is.</p>
        </div>
        ${principlesFieldset(dataset)}
        ${embedded ? faviconFieldset(dataset) : ''}
        <div class="modal-actions">
          <div class="modal-actions__right">
            <button class="btn btn--ghost" type="button" data-action="close-modal">Annuleren</button>
            <button class="btn btn--primary" type="submit">Opslaan</button>
          </div>
        </div>
      </form>`;
  }

  // De principes uit de visie: een label op doelen en projecten, geen thema.
  // Bestaande principes zijn hier te hernoemen of te verwijderen. Nieuwe
  // komen in lege regels (data-principle-new); "+ Nog een principe" voegt er
  // een toe zonder het venster op te bouwen, zodat je er meerdere tegelijk
  // invult en één keer opslaat.
  function principleRowNew() {
    const max = ObeyaData.PRINCIPLE_LIMITS;
    return `<div class="principle-row" data-principle-new>
        <input type="text" maxlength="${max.name}" data-principle-field="name" aria-label="Naam van een nieuw principe" placeholder="Nieuw principe">
        <input type="text" maxlength="${max.description}" data-principle-field="description" aria-label="Uitleg bij het nieuwe principe" placeholder="Wat betekent het voor ons werk? (optioneel)">
        <span aria-hidden="true"></span>
      </div>`;
  }

  function principlesFieldset(dataset) {
    const lijst = ObeyaData.getPrinciples(dataset);
    const max = ObeyaData.PRINCIPLE_LIMITS;
    const rij = (p) => `
      <div class="principle-row">
        <input id="f-principle-name-${H.escapeHtml(p.id)}" type="text" maxlength="${max.name}" value="${H.escapeHtml(p.name || '')}" aria-label="Naam van het principe">
        <input id="f-principle-desc-${H.escapeHtml(p.id)}" type="text" maxlength="${max.description}" value="${H.escapeHtml(p.description || '')}" aria-label="Uitleg bij ${H.escapeHtml(p.name)}" placeholder="Wat betekent het voor ons werk? (optioneel)">
        <button class="btn btn--ghost btn--small" type="button" data-action="remove-principle" data-principle-id="${H.escapeHtml(p.id)}" aria-label="${H.escapeHtml(p.name)} verwijderen">Verwijderen</button>
      </div>`;
    return `
      <fieldset class="print-form__group principles-form">
        <legend>Principes uit de visie</legend>
        <p class="field-hint">Wat voor al het werk geldt, zoals persoonlijk, toegankelijk en betrouwbaar. Geen thema, maar een label op doelen en projecten, zodat zichtbaar wordt aan welk principe het werk bijdraagt. Kies bij een item het principe waar het het meest aan bijdraagt.</p>
        ${lijst.map(rij).join('')}
        ${principleRowNew()}
        <button class="btn btn--ghost btn--small principles-form__add" type="button" data-action="add-principle-row">+ Nog een principe</button>
      </fieldset>`;
  }

  function viewDisplaySettings(dataset, embedded) {
    const d = ObeyaData.getDisplaySettings(dataset);
    const soorten = [['objective', 'Doel'], ['measurableResult', 'Meetbaar resultaat'], ['project', 'Project'], ['action', 'Actie']];
    const radio = (v, l, uitleg) => `<label class="field-checkbox"><input type="radio" name="display-colors" value="${v}" ${d.stickyColors === v ? 'checked' : ''}> <span><strong>${l}</strong> <span class="muted">${uitleg}</span></span></label>`;
    return `
      ${titled('Weergave van de muur', embedded)}
      <p class="modal__description">Hoe de lens Keten in Samenhang eruitziet, en welke tabbladen er zijn. Deze instellingen horen bij het bord: iedereen in het team ziet dezelfde muur, en ze gaan mee met delen en exporteren.</p>
      <form class="display-form" data-action="save-display-settings">
        <fieldset class="print-form__group">
          <legend>Kleur van de geeltjes</legend>
          ${radio('type', 'Per soort', '— elk soort briefje een eigen kleur, zoals op een fysieke muur')}
          ${radio('theme', 'Per thema', '— de kleur van het thema, licht')}
          ${radio('none', 'Wit', '— rustig, alleen de lijnen en de status vallen op')}
          <div class="display-form__colors">
            ${soorten.map(([k, l]) => `<label class="display-form__color"><input type="color" id="f-display-color-${k}" value="${H.escapeHtml(d.typeColors[k])}"> ${l}</label>`).join('')}
          </div>
          <p class="field-hint">De kleuren per soort gelden bij "Per soort". Kleur zegt welk soort briefje het is, niet hoe het ervoor staat: de status staat altijd als label met tekst op het briefje.</p>
        </fieldset>
        <div class="field-row">
          <div class="field"><label for="f-display-detail">Detailniveau bij openen</label>
            <select id="f-display-detail">
              <option value="head" ${d.defaultDetail === 'head' ? 'selected' : ''}>Kop: alleen titel en status</option>
              <option value="standard" ${d.defaultDetail === 'standard' ? 'selected' : ''}>Standaard: titel, status en eigenaar</option>
              <option value="detail" ${d.defaultDetail === 'detail' ? 'selected' : ''}>Detail: ook omschrijving, toelichting en de laatste notitie</option>
            </select>
          </div>
          <div class="field"><label for="f-display-layout">Indeling van Keten</label>
            <select id="f-display-layout">
              <option value="rows" ${d.chainLayout === 'rows' ? 'selected' : ''}>Onder elkaar: de keten van links naar rechts</option>
              <option value="org" ${d.chainLayout === 'org' ? 'selected' : ''}>Organogram: van boven naar beneden, elk niveau op één hoogte</option>
              <option value="mindmap" ${d.chainLayout === 'mindmap' ? 'selected' : ''}>Mindmap: de visie in het midden, elk niveau een ring verder</option>
            </select>
          </div>
        </div>
        <div class="field field--checkbox"><label><input type="checkbox" id="f-display-tilt" ${d.tilt ? 'checked' : ''}> Briefjes iets scheef, als op een muur</label></div>
        <fieldset class="print-form__group">
          <legend>Tabbladen</legend>
          <p class="field-hint" id="f-display-views-hint">Zet een tabblad tijdelijk uit als het team het (nog) niet gebruikt. Er gaat niets verloren: zet het vinkje terug en het tabblad is er weer. Het Bord staat altijd aan.</p>
          <div class="display-form__views">
            ${H.TABS.map(([id, label]) => `<label class="field-checkbox"><input type="checkbox" name="display-view" value="${id}" aria-describedby="f-display-views-hint" ${id === 'board' || !d.hiddenViews.includes(id) ? 'checked' : ''}${id === 'board' ? ' disabled' : ''}> ${H.escapeHtml(label)}</label>`).join('')}
          </div>
        </fieldset>
        <div class="modal-actions">
          <button class="btn btn--ghost" type="button" data-action="reset-display">Standaardwaarden</button>
          <div class="modal-actions__right">
            <button class="btn btn--ghost" type="button" data-action="close-modal">Annuleren</button>
            <button class="btn btn--primary" type="submit">Opslaan</button>
          </div>
        </div>
      </form>`;
  }

  // ---------------------------------------------------------------------
  // Muurvellen afdrukken (js/print.js, docs/muurvellen.md)
  // ---------------------------------------------------------------------

  function viewPrintSheets(dataset) {
    const sheets = ObeyaPrint.SHEETS;
    const uitleg = {
      wall: "De visie en per thema de doelen, als een muur met geeltjes. Eén vel, voor permanent in de teamruimte.",
      results: 'Per doel de meetbare resultaten: wanneer het klaar is, de status en een vak om de stand bij te schrijven. Hier zie je de afwijking.',
      themeWall: 'Per thema de doelen met de projecten eronder. Een vol thema komt op meer vellen in plaats van kleiner.',
      session: 'Wat rood of aandacht nodig is, met lege vakken voor afwijking, tegenmaatregel, wie en wanneer.',
      actions: 'Alle acties met eigenaar, deadline en status, om af te vinken en bij te schrijven.',
    };
    return `
      ${closeBtn()}
      <h2 class="modal__title">Muurvellen afdrukken</h2>
      <p class="modal__description">Het bord op papier, om op te hangen voor een fysieke sessie of permanent in de teamruimte. Je krijgt een PDF op groot formaat die een drukker of plotter zo kan afdrukken. Alle vellen tonen de peildatum en de datum van afdrukken.</p>
      <form class="print-form" data-action="print-sheets-form">
        <fieldset class="print-form__group">
          <legend>Vellen</legend>
          ${Object.keys(sheets).map((k) => `
            <label class="field-checkbox"><input type="checkbox" name="print-sheet" value="${k}" ${['wall', 'results', 'themeWall'].includes(k) ? 'checked' : ''}> <span><strong>${H.escapeHtml(sheets[k])}</strong><br><span class="muted">${H.escapeHtml(uitleg[k])}</span></span></label>`).join('')}
          <p class="print-form__presets">Snel kiezen:
            <button class="btn btn--ghost btn--small" type="button" data-action="print-preset" data-sheets="wall,results,themeWall">Muur</button>
            <button class="btn btn--ghost btn--small" type="button" data-action="print-preset" data-sheets="session,actions">Sessie</button>
            <button class="btn btn--ghost btn--small" type="button" data-action="print-preset" data-sheets="wall,results,themeWall,session,actions">Alles</button>
          </p>
        </fieldset>
        <div class="field-row">
          <div class="field"><label for="f-print-format">Formaat (liggend)</label>
            <select id="f-print-format" aria-describedby="f-print-format-hint">
              ${Object.keys(ObeyaPrint.FORMATS).map((f) => `<option value="${f}" ${f === 'A1' ? 'selected' : ''}>${H.escapeHtml(ObeyaPrint.FORMATS[f].label)}</option>`).join('')}
            </select>
            <p class="field-hint" id="f-print-format-hint">Alleen een A3-printer? Kies het mozaïek: elk muurvel komt op vier A3's die je aan elkaar plakt tot één A1. Druk af op ware grootte (100%).</p>
          </div>
          <div class="field"><label for="f-print-theme">Muur per thema voor</label>
            <select id="f-print-theme">
              <option value="">Alle thema's</option>
              ${dataset.themes.map((t) => `<option value="${H.escapeHtml(t.id)}">${H.escapeHtml(t.name)}</option>`).join('')}
            </select>
          </div>
        </div>
        <fieldset class="print-form__group">
          <legend>Teamplan als presentatie</legend>
          <p class="field-hint">Dia's in breedbeeld met alles wat in het teamplan staat: titel, waarom, richting, per thema de doelen met hun deelproducten en projecten, en wat aandacht vraagt. Kies in het afdrukvenster <strong>Opslaan als PDF</strong>.</p>
          <span class="print-form__presets">
            <button class="btn btn--small" type="button" data-action="print-deck">Presentatie maken (PDF)</button>
            <button class="btn btn--ghost btn--small" type="button" data-action="download-deck-pptx">PowerPoint downloaden</button>
          </span>
        </fieldset>
        <p class="field-hint">Kies in het afdrukvenster <strong>Opslaan als PDF</strong>; het papierformaat staat al goed. Laat die PDF afdrukken bij een drukker of op een plotter. Met A3 kun je eerst een proefdruk maken op een gewone printer.</p>
        <div class="modal-actions">
          <span></span>
          <div class="modal-actions__right">
            <button class="btn btn--ghost" type="button" data-action="close-modal">Sluiten</button>
            <button class="btn btn--primary" type="submit">Afdrukken / PDF maken</button>
          </div>
        </div>
      </form>`;
  }

  // ---------------------------------------------------------------------
  // Instellingen (idee 59): alles wat het bord en deze browser instelt op één
  // plek, met links de onderdelen en rechts het gekozen onderdeel. De
  // formulieren zijn die van de losse schermen, ingebed; na opslaan blijft
  // het venster open. Elk onderdeel zegt of het voor het hele bord geldt of
  // alleen voor deze browser. Ontwerp: UX-designer, 12 oktober 2026.
  // ---------------------------------------------------------------------

  const SETTINGS_SECTIONS = [
    { id: 'board', label: 'Bord', scope: 'board' },
    { id: 'owners', label: 'Eigenaren', scope: 'board' },
    { id: 'roles', label: 'Rollen', scope: 'board' },
    { id: 'roleGroups', label: 'Groepen', scope: 'board' },
    { id: 'statusLabels', label: 'Statuslabels', scope: 'board' },
    { id: 'display', label: 'Weergave van de muur', scope: 'board' },
    { id: 'team', label: 'Team en opslag', scope: 'browser' },
    { id: 'data', label: 'Data', scope: 'browser' },
  ];
  const SCOPE_LABELS = { board: 'Voor het hele bord', browser: 'Alleen deze browser' };

  function faviconFieldset(dataset) {
    const huidig = ObeyaData.getFavicon(dataset);
    const keuze = (kind, label, href, extra) => `
      <label class="favicon-choice ${huidig.kind === kind ? 'favicon-choice--on' : ''}">
        <input type="radio" name="favicon" value="${kind}" ${huidig.kind === kind ? 'checked' : ''}>
        <span class="favicon-choice__preview" aria-hidden="true" data-favicon-preview="${kind}">${href ? `<img src="${H.escapeHtml(href)}" width="32" height="32" alt=""><img src="${H.escapeHtml(href)}" width="16" height="16" alt="">` : '<span class="favicon-choice__empty">?</span>'}</span>
        <span>${H.escapeHtml(label)}${extra || ''}</span>
      </label>`;
    return `
      <fieldset class="print-form__group favicon-form">
        <legend>Pictogram in het browsertabblad</legend>
        <p class="field-hint">Zo herken je het bord tussen je andere tabbladen. Geldt voor iedereen met dit bord.</p>
        <div class="favicon-choices">
          ${keuze('obeya', ObeyaData.FAVICONS.obeya.label, ObeyaData.FAVICONS.obeya.href, ' <span class="muted">(standaard)</span>')}
          ${keuze('leiden', ObeyaData.FAVICONS.leiden.label, ObeyaData.FAVICONS.leiden.href)}
          ${keuze('custom', 'Eigen afbeelding', huidig.kind === 'custom' ? huidig.href : null)}
        </div>
        <input type="hidden" id="f-favicon-data" value="">
        <div class="favicon-upload">
          <label class="btn btn--ghost btn--small" for="f-favicon-file">Afbeelding kiezen…</label>
          <input id="f-favicon-file" type="file" accept="image/png,image/jpeg,image/gif,image/webp" class="sr-only">
          <span class="muted">PNG, JPG, GIF of WebP; wordt verkleind tot 64 × 64.</span>
        </div>
      </fieldset>`;
  }

  function settingsDataSection() {
    return `
      <div class="settings-data">
        <div class="settings-data__item">
          <div><strong>Exporteren</strong><p class="muted">Het hele bord als JSON-bestand, om te bewaren of door te geven.</p></div>
          <button class="btn btn--small" data-action="export">Exporteren</button>
        </div>
        <div class="settings-data__item">
          <div><strong>Importeren</strong><p class="muted">Een eerder geëxporteerd bord inlezen. Het huidige bord wordt pas vervangen als het bestand klopt, en ongedaan maken kan.</p></div>
          <button class="btn btn--small" data-action="import">Importeren…</button>
        </div>
        <div class="settings-data__item settings-data__item--danger">
          <div><strong>Terug naar voorbeelddata</strong><p class="muted">Vervangt het bord in deze browser door de voorbeelddata. Je krijgt eerst een vraag om te bevestigen.</p></div>
          <button class="btn btn--ghost btn--small settings-data__danger" data-action="reset-data">Terug naar voorbeelddata</button>
        </div>
      </div>`;
  }

  function viewSettings(dataset, gitTestResult, sectionId, context, me, gate) {
    const actief = SETTINGS_SECTIONS.find((s) => s.id === sectionId) || SETTINGS_SECTIONS[0];
    const inhoud = {
      board: () => viewBoardSettings(dataset, true),
      owners: () => viewOwnersConfig(dataset, true, (context || {}).person),
      roles: () => viewRolesConfig(dataset, gate),
      roleGroups: () => viewRoleGroupsConfig(dataset),
      statusLabels: () => viewStatusLabelsConfig(dataset, true),
      display: () => viewDisplaySettings(dataset, true),
      team: () => meFieldset(dataset, me, gate) + viewGitConfig(gitTestResult, true),
      data: () => settingsDataSection(),
    }[actief.id]();
    return `
      ${closeBtn()}
      <h2 class="modal__title">Instellingen</h2>
      <div class="settings">
        <div class="settings__nav" role="tablist" aria-orientation="vertical" aria-label="Onderdelen">
          ${SETTINGS_SECTIONS.map((s) => `<button class="settings__tab" role="tab" id="settings-tab-${s.id}" aria-selected="${s.id === actief.id}" aria-controls="settings-panel" tabindex="${s.id === actief.id ? '0' : '-1'}" data-action="settings-section" data-section="${s.id}">${H.escapeHtml(s.label)}</button>`).join('')}
        </div>
        <section class="settings__panel" id="settings-panel" role="tabpanel" aria-labelledby="settings-tab-${actief.id}">
          <header class="settings__head">
            <h3>${H.escapeHtml(actief.label)}</h3>
            <span class="settings__scope settings__scope--${actief.scope}">${SCOPE_LABELS[actief.scope]}</span>
          </header>
          <p class="settings__notice" role="status" aria-live="polite"></p>
          ${inhoud}
        </section>
      </div>`;
  }

  // ---------------------------------------------------------------------
  // Botsing bij samenvoegen met het team (zie js/merge.js en
  // docs/samenvoegen.md). Eén regel per punt waarop jij en het team
  // hetzelfde verschillend aanpasten; per regel kies je welke versie blijft.
  // ---------------------------------------------------------------------

  function mergeValueText(dataset, conflict, value) {
    if (conflict.field === '__exists') {
      return value === 'deleted' ? 'Verwijderd' : 'Behouden';
    }
    if (conflict.field === '__place') {
      const parentKey = String(value || '').split('/')[0];
      const parentId = parentKey.slice(parentKey.indexOf(':') + 1);
      const info = ObeyaData.describeItem(dataset, parentId);
      return info ? `Onder: ${info.label}` : 'Op een andere plek';
    }
    if (conflict.field === 'status') return ObeyaData.statusLabelFor(conflict.kind, value, dataset);
    // Het pictogram: alleen welk soort, nooit de afbeeldingsdata zelf.
    if (conflict.field === 'favicon') {
      const kind = value && value.kind;
      return kind === 'custom' ? 'Eigen afbeelding' : (ObeyaData.FAVICONS[kind] || ObeyaData.FAVICONS.leiden).label;
    }
    if (value === null || value === undefined || value === '') return '(leeg)';
    if (value === true) return 'Ja';
    if (value === false) return 'Nee';
    if (Array.isArray(value)) {
      return value.map((v) => { const info = ObeyaData.describeItem(dataset, v); return info ? info.label : v; }).join(', ') || '(leeg)';
    }
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  }

  function viewGitConflict(dataset, pending) {
    if (!pending) return '<p>Er wacht geen botsing op een keuze.</p>';
    const n = pending.conflicts.length;
    const intro = pending.mode === 'push'
      ? 'Iemand anders heeft gedeeld terwijl jij werkte.'
      : 'De teamversie is gewijzigd sinds je die het laatst ophaalde, en jij had zelf ook wijzigingen.';
    const kind = (k) => (ObeyaMerge.KIND_LABELS[k] || k);
    const rij = (c, i) => {
      const extra = c.field === '__exists'
        ? `<p class="field-hint">${c.deletedBy === 'mine' ? 'Jij hebt dit verwijderd' : 'Het team heeft dit verwijderd'}${c.reason === 'children' ? ', terwijl er aan de andere kant iets onder is toegevoegd of aangepast' : ', terwijl het aan de andere kant is aangepast'}.</p>`
        : '';
      return `
        <fieldset class="merge-conflict">
          <legend><span class="muted">${H.escapeHtml(kind(c.kind))}</span> ${H.escapeHtml(c.label)} — ${H.escapeHtml(c.fieldLabel)}</legend>
          ${extra}
          <label class="merge-conflict__option"><input type="radio" name="merge-${i}" value="mine" data-conflict-id="${H.escapeHtml(c.id)}" required> <span><strong>Jouw versie</strong> ${H.escapeHtml(mergeValueText(dataset, c, c.mine))}</span></label>
          <label class="merge-conflict__option"><input type="radio" name="merge-${i}" value="theirs" data-conflict-id="${H.escapeHtml(c.id)}" required> <span><strong>Teamversie</strong> ${H.escapeHtml(mergeValueText(dataset, c, c.theirs))}</span></label>
        </fieldset>`;
    };
    return `
      ${closeBtn()}
      <h2 class="modal__title">Samenvoegen met het team</h2>
      <p class="modal__description">${intro} ${pending.theirsChanges ? `${pending.theirsChanges === 1 ? '1 wijziging' : `${pending.theirsChanges} wijzigingen`} van het team ${pending.theirsChanges === 1 ? 'gaat' : 'gaan'} vanzelf mee. ` : ''}Bij ${n === 1 ? 'één punt hebben' : `${n} punten hebben`} jullie hetzelfde verschillend aangepast; kies per punt welke versie blijft.</p>
      <form class="merge-form" data-action="resolve-merge">
        <div class="merge-form__all">
          <button class="btn btn--ghost btn--small" type="button" data-action="merge-choose-all" data-side="mine">Overal jouw versie</button>
          <button class="btn btn--ghost btn--small" type="button" data-action="merge-choose-all" data-side="theirs">Overal de teamversie</button>
        </div>
        ${pending.conflicts.map(rij).join('')}
        <div class="modal-actions">
          <button class="btn btn--ghost" type="button" data-action="cancel-merge">Afbreken</button>
          <div class="modal-actions__right">
            <button class="btn btn--primary" type="submit">${pending.mode === 'push' ? 'Samenvoegen en delen' : 'Samenvoegen'}</button>
          </div>
        </div>
      </form>`;
  }

  // ---------------------------------------------------------------------
  // Relations (embedded section, shared by objective/MR/project/action
  // detail views) — zie js/data.js en docs/relatiemodel-voorstel.md.
  //
  // "Draagt bij aan" en "Hangt samen met" zijn hier te bewerken: koppelen via
  // een select over het hele bord, en per rij weer los te maken. "Krijgt
  // bijdrage van" is alleen-lezen, net als de bestaande "Draagt bij:
  // projecten & acties"-sectie op een meetbaar resultaat — die koppeling leg
  // je vanaf het andere item, niet vanaf hier.
  // ---------------------------------------------------------------------

  const RELATION_TYPE_PREFIX = { objective: 'Doel', measurableResult: 'MR', project: 'Project', action: 'Actie' };

  // Eén <optgroup> per thema, met elk relateerbaar item eronder als optie —
  // de "zoekveld over alle items" uit het voorstel, in de vorm van een
  // gegroepeerde select zodat er geen los autocomplete-component nodig is
  // (blijft binnen de geen-dependencies/geen-build-stap-afspraak).
  function relationTargetOptions(dataset, excludeId) {
    return dataset.themes.map((theme) => {
      const items = [];
      theme.objectives.forEach((o) => {
        if (o.id !== excludeId) items.push({ id: o.id, label: `${RELATION_TYPE_PREFIX.objective}: ${o.title}` });
        o.measurableResults.forEach((m) => {
          if (m.id !== excludeId) items.push({ id: m.id, label: `${RELATION_TYPE_PREFIX.measurableResult}: ${m.name}` });
        });
        o.projects.forEach((p) => {
          if (p.id !== excludeId) items.push({ id: p.id, label: `${RELATION_TYPE_PREFIX.project}: ${p.name}` });
          (p.actions || []).forEach((a) => {
            if (a.id !== excludeId) items.push({ id: a.id, label: `${RELATION_TYPE_PREFIX.action}: ${a.title}` });
          });
        });
        (o.actions || []).forEach((a) => {
          if (a.id !== excludeId) items.push({ id: a.id, label: `${RELATION_TYPE_PREFIX.action}: ${a.title}` });
        });
      });
      if (!items.length) return '';
      return `<optgroup label="${H.escapeHtml(theme.name)}">${items.map((it) => `<option value="${it.id}">${H.escapeHtml(it.label)}</option>`).join('')}</optgroup>`;
    }).join('');
  }

  function relationRow(dataset, relation, itemId, opts) {
    const otherId = ObeyaData.otherRelationEndId(relation, itemId);
    const info = ObeyaData.describeItem(dataset, otherId);
    if (!info) return ''; // opgeruimd bij de volgende normalisatie, hier gewoon overslaan
    const crumbBits = [];
    if (info.theme) crumbBits.push(info.theme.name);
    if (info.objective && info.type !== 'objective') crumbBits.push(info.objective.title);
    const titel = relation.note ? `${info.label} — ${relation.note}` : info.label;
    return `
      <li class="item-list__row" data-open="${info.type}:${otherId}" tabindex="0" role="button" aria-label="${H.escapeHtml(titel)}" title="${H.escapeHtml(titel)}">
        ${H.entityTypeBadge(info.type)}
        ${H.statusPill(info.entity.status, { compact: true, entityType: info.type })}
        <span class="item-list__name">${H.escapeHtml(info.label)}</span>
        ${crumbBits.length ? `<span class="muted item-list__extra">${H.escapeHtml(crumbBits.join(' › '))}</span>` : ''}
        ${!(opts && opts.readOnly) ? `<button class="icon-btn" data-action="delete-relation" data-id="${relation.id}" title="Relatie verwijderen" aria-label="Relatie verwijderen van ${H.escapeHtml(titel)}">✕</button>` : ''}
      </li>`;
  }

  function relationGroup(dataset, itemId, type, relations, options) {
    const rows = relations.map((r) => relationRow(dataset, r, itemId)).filter(Boolean).join('');
    return `
      <section class="modal-section">
        <div class="modal-section__head"><h3>${H.escapeHtml(ObeyaData.RELATION_TYPES[type])} (${relations.length})</h3></div>
        ${relations.length ? `<ul class="item-list">${rows}</ul>` : '<p class="muted">Nog niets gekoppeld.</p>'}
        <form class="relation-form" data-action="add-relation" data-item-id="${itemId}" data-relation-type="${type}">
          <input id="f-relation-filter-${type}-${itemId}" class="relation-form__filter" type="search" data-relation-filter="f-relation-target-${type}-${itemId}" placeholder="Zoek… (bijv. MR, project of een woord)" aria-label="Keuzelijst filteren" autocomplete="off">
          <select id="f-relation-target-${type}-${itemId}" aria-label="Item om aan te koppelen" required>
            <option value="">Kies een item…</option>
            ${options}
          </select>
          <template data-relation-options="f-relation-target-${type}-${itemId}">${options}</template>
          <input id="f-relation-note-${type}-${itemId}" type="text" placeholder="Toelichting (optioneel)" aria-label="Toelichting">
          <button class="btn btn--small" type="submit">Koppelen</button>
        </form>
      </section>`;
  }

  function relationsSection(dataset, itemId) {
    const outgoing = ObeyaData.outgoingContributions(dataset, itemId);
    const incoming = ObeyaData.incomingContributions(dataset, itemId);
    const related = ObeyaData.relatedRelations(dataset, itemId);
    const options = relationTargetOptions(dataset, itemId);
    return `
      ${relationGroup(dataset, itemId, 'contributes', outgoing, options)}
      ${relationGroup(dataset, itemId, 'related', related, options)}
      ${incoming.length ? `
      <section class="modal-section">
        <div class="modal-section__head"><h3>Krijgt bijdrage van (${incoming.length})</h3></div>
        <ul class="item-list">${incoming.map((r) => relationRow(dataset, r, itemId, { readOnly: true })).filter(Boolean).join('')}</ul>
        <p class="field-hint">Zo'n koppeling voeg je toe vanaf het item dat bijdraagt, niet vanaf hier.</p>
      </section>` : ''}`;
  }

  // ---------------------------------------------------------------------
  // Notes (embedded section, shared by all detail views)
  // ---------------------------------------------------------------------

  function noteEditForm(dataset, n) {
    return `
      <form class="note-form note-form--edit" data-action="save-note-edit" data-id="${n.id}">
        <select id="f-note-edit-type-${n.id}" aria-label="Type notitie">
          ${Object.keys(ObeyaData.NOTE_TYPES).map((t) => `<option value="${t}" ${t === n.type ? 'selected' : ''}>${H.escapeHtml(ObeyaData.NOTE_TYPES[t])}</option>`).join('')}
        </select>
        ${H.authorSelect(`f-note-edit-author-${n.id}`, dataset, n.author || '', 'aria-label="Naam" required')}
        <input id="f-note-edit-text-${n.id}" type="text" value="${H.escapeHtml(n.text)}" placeholder="Notitietekst" aria-label="Notitietekst" required>
        <button class="btn btn--small" type="submit">Opslaan</button>
        <button class="btn btn--ghost btn--small" type="button" data-action="cancel-note-edit">Annuleren</button>
      </form>`;
  }

  function notesSection(dataset, objective, relatedItemId, editingNoteId) {
    const notes = (objective.notes || []).filter((n) => n.relatedItemId === relatedItemId);
    return `
      <section class="modal-section">
        <div class="modal-section__head"><h3>Notities &amp; voortgang (${notes.length})</h3></div>
        ${notes.length
          ? `<ul class="note-list">${notes.slice().reverse().map((n) => n.id === editingNoteId ? `
              <li class="note-list__item">${noteEditForm(dataset, n)}</li>`
              : `
              <li class="note-list__item">
                <div class="note-list__head">
                  <span class="note-type note-type--${n.type}">${H.escapeHtml(H.noteTypeLabel(n.type))}</span>
                  <span class="muted">${H.escapeHtml(n.author || 'Onbekend')} · ${H.formatDate(n.createdAt)}${n.updatedAt ? ` · bewerkt ${H.formatDate(n.updatedAt)}` : ''}</span>
                  <button class="icon-btn" data-action="edit-note" data-id="${n.id}" title="Notitie bewerken">✎</button>
                  <button class="icon-btn" data-action="delete-note" data-id="${n.id}" title="Notitie verwijderen">✕</button>
                </div>
                <p class="note-list__text">${H.nl2br(n.text)}</p>
              </li>`).join('')}</ul>`
          : '<p class="muted">Nog geen notities.</p>'}
        <form class="note-form" data-action="add-note" data-objective-id="${objective.id}" data-related-id="${relatedItemId}">
          <select id="f-note-type" aria-label="Type notitie">
            ${Object.keys(ObeyaData.NOTE_TYPES).map((t) => `<option value="${t}">${H.escapeHtml(ObeyaData.NOTE_TYPES[t])}</option>`).join('')}
          </select>
          ${H.authorSelect('f-note-author', dataset, null, 'aria-label="Jouw naam" required')}
          <input id="f-note-text" type="text" placeholder="Notitie of update toevoegen..." aria-label="Notitietekst" required>
          <button class="btn btn--small" type="submit">Toevoegen</button>
        </form>
      </section>`;
  }

  return { render, bulkPreview, viewDisplaySettings, principleRowNew, elsewhereChip, formulationSignal, signalHtml };
})();
