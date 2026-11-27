// js/app.js
// Application bootstrap: renders the app shell from state on every change,
// and owns a single delegated event listener that turns data-* attributes
// produced by toolbar.js / board.js / modal.js into ObeyaState calls.
//
// The whole #app subtree is re-rendered (innerHTML) on every state change,
// which keeps this PoC simple (no virtual DOM / diffing). Focus + text
// selection on the currently focused field are restored after each render
// so typing in the search box isn't interrupted.

(function () {
  'use strict';

  const root = document.getElementById('app');
  // Waar je op de vorige weergave was toen je Hulp opende (idee 68).
  let helpReturnScroll = 0;

  // Terug van Hulp naar de weergave waar je was, op dezelfde plek, met de
  // focus op de "?" (knop "← …" of Escape).
  function closeHelp() {
    ObeyaState.closeHelp();
    window.scrollTo(0, helpReturnScroll);
    const knop = root.querySelector('[data-action="open-help"]');
    if (knop) knop.focus({ preventScroll: true });
  }
  const H = ObeyaUI;

  function val(id) {
    const el = document.getElementById(id);
    return el ? el.value : '';
  }

  // Laatste vangnet. Loopt zelfs het opstarten of het tekenen stuk, dan moet er
  // nog steeds een weg terug zijn: zonder werkend scherm is er anders geen knop
  // meer om de lokale data te wissen, en rest alleen browseropslag opruimen.
  function showFatalError(err) {
    console.error(err);
    root.innerHTML = `
      <div class="fatal-error">
        <h1>Kon de Obeya niet tonen</h1>
        <p>${H.escapeHtml(err && err.message ? err.message : String(err))}</p>
        <p>Meestal komt dit door data uit een eerdere sessie in deze browser. Exporteer eerst als je die wilt bewaren; anders kun je hieronder schoon opnieuw beginnen met de voorbeelddata.</p>
        <button class="btn btn--primary" data-action="hard-reset">Lokale data wissen en opnieuw beginnen</button>
      </div>`;
  }

  // Het hele scherm wordt bij elke wijziging opnieuw opgebouwd, dus alles wat
  // de gebruiker had weggescrold raakt zonder dit terug naar nul: een notitie
  // toevoegen onderin een lang detailscherm gooide je terug naar de titel, en
  // een vlag zetten op het bord verloor je plek tussen de kolommen. Elementen
  // worden per selector + volgorde teruggezocht, want de oude knopen bestaan na
  // het hertekenen niet meer.
  const SCROLL_CONTAINERS = ['.board', '.canvas-viewport', '.overlay', '.table-wrap', '.note-list'];

  function captureScroll() {
    const elements = [];
    SCROLL_CONTAINERS.forEach((selector) => {
      root.querySelectorAll(selector).forEach((el, index) => {
        if (el.scrollTop || el.scrollLeft) {
          elements.push({ selector, index, top: el.scrollTop, left: el.scrollLeft });
        }
      });
    });
    return { x: window.scrollX, y: window.scrollY, elements };
  }

  function restoreScroll(position) {
    position.elements.forEach(({ selector, index, top, left }) => {
      const el = root.querySelectorAll(selector)[index];
      if (!el) return;
      el.scrollTop = top;
      el.scrollLeft = left;
    });
    if (window.scrollX !== position.x || window.scrollY !== position.y) {
      window.scrollTo(position.x, position.y);
    }
  }

  function render() {
    try {
      renderApp();
      syncUrl(false);
    } catch (err) {
      showFatalError(err);
    }
  }

  // --- navigatie in de URL (idee 82) -------------------------------------
  // Het adres volgt het scherm (#/agenda, #/stukken/naam, #/hulp/pagina), zodat
  // je een link kunt delen en Vorige/Volgende van de browser werken. De
  // vertaling staat in js/router.js; hier alleen het lezen en schrijven.

  let adresActief = false; // pas na het opstarten, en niet tijdens het toepassen

  function huidigScherm() {
    return { view: ObeyaState.getView(), doc: ObeyaState.getOpenDocument(), helpPage: ObeyaState.getHelpPage() };
  }

  // vervangen: geen nieuwe stap in de geschiedenis (opstarten, een onbekend adres rechtzetten).
  function syncUrl(vervangen) {
    if (!adresActief) return;
    const hash = ObeyaRouter.toHash(huidigScherm());
    if (location.hash === hash) return;
    if (vervangen) location.replace(hash);
    else location.hash = hash;
  }

  function applyUrl() {
    const scherm = ObeyaRouter.fromHash(location.hash);
    if (!scherm) return;
    adresActief = false;
    try {
      if (scherm.view === 'help') {
        const pagina = scherm.helpPage && ObeyaHelpView.exists(scherm.helpPage) ? scherm.helpPage : ObeyaHelpView.METHODE;
        ObeyaState.openHelp(pagina);
      } else {
        if (scherm.view === 'documents') ObeyaState.openDocument(scherm.doc);
        ObeyaState.setView(scherm.view);
        // Een gedeelde link naar een stuk: de stukken ophalen als dat nog niet gebeurd is.
        const docs = ObeyaState.getDocuments();
        if (scherm.view === 'documents' && docs.configured && !docs.fetchedAt && !docs.busy) ObeyaState.fetchDocuments();
      }
    } finally {
      adresActief = true;
    }
  }

  function renderApp() {
    const dataset = ObeyaState.getDataset();
    if (!dataset) return;
    const filters = ObeyaState.getFilters();
    const view = ObeyaState.getView();
    const selection = ObeyaState.getSelection();
    // Zodat statusPill/statusSelect de statuslabels-configuratie van déze
    // dataset gebruiken zonder dat elke renderfunctie dataset moet
    // doorgeven — zie de toelichting bij setActiveDataset in ui-helpers.js.
    H.setActiveDataset(dataset);

    const focused = document.activeElement;
    const focusInfo = focused && focused.id ? {
      id: focused.id,
      selectionStart: 'selectionStart' in focused ? focused.selectionStart : null,
      selectionEnd: 'selectionEnd' in focused ? focused.selectionEnd : null,
    } : null;
    const scrollInfo = captureScroll();
    // Een opengeklapte <details> met een id blijft open na het opnieuw
    // tekenen (de gaten op de Agenda: open klikken, item bijwerken, terug).
    const openDetails = Array.from(root.querySelectorAll('details[open][id]'), (d) => d.id);

    // Kamer-modus is chrome-loos en vergroot — een <body>-klasse i.p.v. iets
    // binnen #app, zodat CSS de hele pagina kan aanpassen (zie css/styles.css).
    document.body.classList.toggle('presentation-mode', ObeyaState.isPresentationMode());
    // Het pictogram van dit bord in het browsertabblad.
    const icoon = document.getElementById('app-favicon');
    const favicon = ObeyaData.getFavicon(dataset);
    if (icoon && icoon.getAttribute('href') !== favicon.href) icoon.setAttribute('href', favicon.href);

    root.innerHTML = `
      ${ObeyaToolbar.renderHeader(dataset, ObeyaState)}
      ${ObeyaToolbar.renderNotices(ObeyaState)}
      <div class="app-bar">
        ${ObeyaToolbar.renderTabs(view, dataset)}
        ${ObeyaToolbar.renderToolbar(ObeyaState)}
      </div>
      ${ObeyaToolbar.renderFilterBar(dataset, filters, ObeyaState.hasActiveFilters(), ObeyaState.getChipFilterMode(),
        ObeyaToolbar.filtersForView(view, { matrixMode: ObeyaState.getMatrixMode(), canvasLens: ObeyaState.getCanvasState().lens }),
        ObeyaState.isFilterPanelOpen())}
      <main class="board-main">${view === 'canvas'
        ? ObeyaCanvas.render(dataset, filters, ObeyaState.getCanvasState())
        : view === 'documents'
          ? ObeyaDocsView.render(ObeyaState.getDocuments(), ObeyaState.getOpenDocument())
        : view === 'help'
          ? ObeyaHelpView.render(ObeyaState.getHelpPage(), { back: ObeyaToolbar.viewLabel(ObeyaState.getViewBeforeHelp()) })
          : ObeyaBoard.render(dataset, filters, view, ObeyaState.getZoomLevel(), ObeyaState.getMatrixMode(),
            { agendaTop: view === 'agenda' ? ObeyaHistoryView.agendaBlock(dataset, ObeyaState.getMe(), ObeyaState.getRejectingChange(), ObeyaState.getReviewNotice(), ObeyaState.getRevertProblems(), ObeyaState.getConfirmGate()) + ObeyaInboxView.block(ObeyaState.getInbox(), ObeyaState.isGitConfigured(), ObeyaState.landedFromInbox) : '',
              agendaBottom: view === 'agenda' ? ObeyaHistoryView.meetingButton(dataset) : '',
              timeline: view === 'timeline' && ObeyaState.getTimelineMode() !== 'notes' ? {
                mode: ObeyaState.getTimelineMode(),
                changes: ObeyaHistoryView.timelineChanges(dataset, ObeyaState.getShowAllChanges()),
                since: ObeyaHistoryView.since(dataset),
                toggleAll: ObeyaHistoryView.allToggle(ObeyaState.getShowAllChanges(), 'timeline'),
              } : { mode: 'notes' } })}</main>
      ${ObeyaModal.render(dataset, selection, ObeyaState.getEditingNoteId(), ObeyaState.getGitTestResult(), ObeyaState.getPendingMerge(), ObeyaState.getReview(), { me: ObeyaState.getMe(), gate: ObeyaState.getConfirmGate(), rejecting: ObeyaState.getRejectingChange(), problems: ObeyaState.getRevertProblems(), showAll: ObeyaState.getShowAllChanges() })}
    `;

    openDetails.forEach((id) => { const d = document.getElementById(id); if (d) d.open = true; });
    // In de kamermodus staat de legenda van de rustige status altijd open.
    if (ObeyaState.isPresentationMode()) { const legenda = document.getElementById('status-legend'); if (legenda) legenda.open = true; }

    let focusRestored = false;
    if (focusInfo) {
      const el = document.getElementById(focusInfo.id);
      if (el) {
        // preventScroll, want de scrollposities zetten we hieronder zelf terug;
        // anders springt de pagina alsnog naar het veld toe.
        el.focus({ preventScroll: true });
        focusRestored = true;
        if (focusInfo.selectionStart != null && typeof el.setSelectionRange === 'function') {
          try { el.setSelectionRange(focusInfo.selectionStart, focusInfo.selectionEnd); } catch (e) { /* not a text field */ }
        }
      }
    }
    // A modal that just opened (or whose previously focused control, e.g. a
    // theme-column header, no longer exists after re-render) gets focus
    // moved into it, so keyboard users land inside the dialog and Escape /
    // Tab keep working from there.
    if (!focusRestored && selection) {
      const modalEl = root.querySelector('.modal');
      if (modalEl) {
        modalEl.setAttribute('tabindex', '-1');
        modalEl.focus({ preventScroll: true });
      }
    }

    // De lijnen van het canvas kunnen pas getekend worden als de kaarten er
    // staan en hun maat hebben; daarna pas de scrollpositie terugzetten, want
    // die hangt af van de maat die drawConnections het canvas geeft.
    if (view === 'canvas') {
      ObeyaCanvas.drawConnections(root);
      // Verschuiven en verbinden op de muur (alleen in de lens Keten).
      ObeyaWall.attach(root, wallApi);
      const doel = ObeyaState.consumeCanvasScrollTarget();
      // De mindmap heeft zijn midden in het midden: daar beginnen met kijken.
      if (ObeyaState.consumeMindmapCenter()) {
        const vp = root.querySelector('.canvas-viewport');
        const visie = root.querySelector('.mm-node--vision');
        if (vp && visie) {
          restoreScroll(scrollInfo);
          visie.scrollIntoView({ block: 'center', inline: 'center' });
          return;
        }
      }
      restoreScroll(scrollInfo);
      const el = doel && root.querySelector(`.canvas-stage [data-node="${CSS.escape(doel)}"]`);
      if (el) el.scrollIntoView({ block: 'nearest', inline: 'center' });
      return;
    }
    // Slepen op het Bord (doelen en thema's).
    if (view === 'board') ObeyaWall.attachBoard(root, wallApi);
    restoreScroll(scrollInfo);
  }

  // Wat de muur (js/wall.js) mag doen: muteren via de state (dus met
  // ongedaan maken), opnieuw tekenen na afbreken, bevestiging vragen en
  // verbinden. Verbinden eerst op een kopie: bestaat de koppeling al, dan
  // geen lege stap in ongedaan maken.
  const wallApi = {
    mutate: (fn, label) => ObeyaState.mutate(fn, label),
    rerender: () => render(),
    // Na een verschuiving met het toetsenbord de focus terug op hetzelfde item.
    focus: (selector) => { const el = root.querySelector(selector); if (el) el.focus({ preventScroll: false }); },
    confirm: (msg) => confirmDialog(msg),
    convert: (type, id, opts) => convertItem(type, id, opts),
    // Een resultaat naar een ander doel: eerst zeggen wat er met het werk gebeurt.
    moveResult: (mrId, objectiveId, beforeId) => {
      const ds = ObeyaState.getDataset();
      const mr = ObeyaData.findMeasurableResult(ds, mrId);
      const naar = ObeyaData.findObjective(ds, objectiveId);
      if (!mr || !naar) { render(); return; }
      if (!confirmDialog(`"${mr.name}" naar het doel "${naar.title}" verplaatsen?\n\nWerk dat alleen aan dit resultaat hangt gaat mee; werk dat ook aan andere resultaten hangt blijft staan en draagt via een relatie bij. Ongedaan maken kan.`)) { render(); return; }
      ObeyaState.mutate((d) => ObeyaData.moveMeasurableResult(d, mrId, { objectiveId, beforeId }), 'meetbaar resultaat naar een ander doel');
    },
    connect: (fromId, mrId) => {
      const proef = ObeyaData.connectToMeasurableResult(JSON.parse(JSON.stringify(ObeyaState.getDataset())), fromId, mrId);
      if (proef === 'link' || proef === 'relation') {
        ObeyaState.mutate((ds) => ObeyaData.connectToMeasurableResult(ds, fromId, mrId), 'verbonden met meetbaar resultaat');
      } else {
        render();
      }
    },
  };

  // Lettertypes en vensterbreedte kunnen kaarten na het tekenen nog van maat
  // laten veranderen; dan kloppen de lijnen niet meer.
  window.addEventListener('resize', H.debounce(() => {
    if (ObeyaState.getView() !== 'canvas') return;
    ObeyaState.resetCanvasLayout();
    const stage = root.querySelector('.canvas-stage');
    if (stage) delete stage.dataset.layoutWidth;
    ObeyaCanvas.drawConnections(root);
  }, 150));

  // Samenhang: het scrollwiel zoomt op de plek van de muis (ook knijpen op
  // een trackpad, dat de browser als wiel met Ctrl doorgeeft). De lijnen
  // schalen mee met het podium, dus opnieuw tekenen is niet nodig.
  root.addEventListener('wheel', (e) => {
    if (!e.target.closest('.canvas-viewport')) return;
    e.preventDefault();
    const huidig = ObeyaState.getCanvasState().zoom;
    const stap = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
    const res = ObeyaCanvas.zoomAt(root, huidig * stap, e.clientX, e.clientY);
    if (res) ObeyaState.rememberCanvasZoom(res.zoom, res.layoutWidth);
  }, { passive: false });

  // Verschuiven door de lege achtergrond te slepen; kaarten en knoppen blijven
  // gewoon klikbaar.
  let pan = null;
  root.addEventListener('pointerdown', (e) => {
    const viewport = e.target.closest('.canvas-viewport');
    if (!viewport || e.button !== 0) return;
    if (e.target.closest('.cv-card, .cv-theme__head, .cv-group__head, .cv-lane__head, .cv-vision, button, a, select, input')) return;
    pan = { viewport, x: e.clientX, y: e.clientY, left: viewport.scrollLeft, top: viewport.scrollTop, id: e.pointerId };
    viewport.setPointerCapture(e.pointerId);
    viewport.classList.add('is-panning');
  });
  root.addEventListener('pointermove', (e) => {
    if (!pan || e.pointerId !== pan.id) return;
    pan.viewport.scrollLeft = pan.left - (e.clientX - pan.x);
    pan.viewport.scrollTop = pan.top - (e.clientY - pan.y);
  });
  const stopPan = (e) => {
    if (!pan || e.pointerId !== pan.id) return;
    pan.viewport.classList.remove('is-panning');
    pan = null;
  };
  root.addEventListener('pointerup', stopPan);
  root.addEventListener('pointercancel', stopPan);

  function confirmDialog(message) {
    return window.confirm(message);
  }

  // -----------------------------------------------------------------------
  // Save handlers (one per entity type). Each reads the currently rendered
  // edit form by known field ids, validates the minimum, applies the
  // mutation and switches the modal back to the view mode of the result.
  // -----------------------------------------------------------------------

  // Betrokkenen uit het formulier; opschonen (dubbelen, de eigenaar zelf)
  // doet de datalaag.
  // "Muur per thema voor" doet alleen iets als dat vel gekozen is.
  function syncPrintThemeChoice() {
    const vel = root.querySelector('.modal input[name="print-sheet"][value="themeWall"]');
    const keuze = document.getElementById('f-print-theme');
    if (vel && keuze) keuze.disabled = !vel.checked;
  }

  // Een venster sluiten en de focus terugzetten op de knop die het opende,
  // zodat wie met het toetsenbord werkt niet bovenaan de pagina begint.
  const OPENERS = { settings: '[data-action="open-settings"]', printSheets: '[data-action="open-print"]', reviewRound: '[data-action="open-review"]', inboxNew: '[data-action="inbox-new"]' };
  function closeModal() {
    const sel = ObeyaState.getSelection();
    flushReviewFields();
    ObeyaState.closeSelection();
    const opener = sel && (sel.type === 'inboxTriage'
      ? root.querySelector(`[data-issue="${sel.id}"]`) || root.querySelector('#inbox-kop')
      : OPENERS[sel.type] && root.querySelector(OPENERS[sel.type]));
    if (opener) opener.focus({ preventScroll: true });
  }

  // Project ↔ actie (idee 65). Een bevestiging alleen als er iets niet
  // meegaat; ongedaan maken kan altijd.
  // Per soort: waar het naartoe gaat, de functies uit de datalaag, en de
  // tekst voor de bevestiging en ongedaan maken (idee 65 en 71).
  const OMZETTEN = {
    project: { naar: 'action', zin: 'Dit project wordt een actie', label: 'project omgezet naar actie', losses: 'conversionLosses', blocker: 'conversionBlocker', doe: 'convertProjectToAction' },
    action: { naar: 'project', zin: 'Deze actie wordt een project', label: 'actie omgezet naar project', losses: 'conversionLosses', blocker: 'conversionBlocker', doe: 'convertActionToProject' },
    objective: { naar: 'measurableResult', zin: 'Dit doel wordt een meetbaar resultaat', label: 'doel omgezet naar meetbaar resultaat', losses: 'levelLosses', blocker: 'levelBlocker', doe: 'convertObjectiveToMeasurableResult' },
    measurableResult: { naar: 'objective', zin: 'Dit meetbare resultaat wordt een doel', label: 'meetbaar resultaat omgezet naar doel', losses: 'levelLosses', blocker: 'levelBlocker', doe: 'convertMeasurableResultToObjective' },
  };

  function convertWarning(type, id, opts) {
    const s = OMZETTEN[type];
    const ds = ObeyaState.getDataset();
    const weg = ObeyaData[s.losses](ds, type, id);
    // Een doel met eigen resultaten: zeggen welke er meeverhuizen, en waarheen.
    const doel = type === 'objective' ? ObeyaData.findObjective(ds, id) : null;
    const naar = doel && opts && opts.objectiveId ? ObeyaData.findObjective(ds, opts.objectiveId) : null;
    const mee = doel && naar && doel.measurableResults.length
      ? `De meetbare resultaten van dit doel verhuizen mee naar "${naar.title}":\n- ${doel.measurableResults.map((m) => m.name).join('\n- ')}\n\n`
      : '';
    if (!weg.length && !mee) return true;
    return confirmDialog(`${s.zin}.\n\n${mee}${weg.length ? `Niet mee gaat:\n- ${weg.join('\n- ')}\n\n` : ''}Naam, eigenaar, omschrijving, notities, relaties en het werk eronder gaan wel mee. Ongedaan maken kan.`);
  }

  function convertItem(type, id, opts) {
    const s = OMZETTEN[type];
    if (!s) return;
    const blokkade = ObeyaData[s.blocker](ObeyaState.getDataset(), type, id, opts);
    if (blokkade) { alert(blokkade); render(); return; }
    if (!convertWarning(type, id, opts)) { render(); return; }
    let nieuw = null;
    ObeyaState.mutate((ds) => { nieuw = ObeyaData[s.doe](ds, id, opts); }, s.label);
    if (!nieuw) { render(); return; }
    const sel = ObeyaState.getSelection();
    if (sel && sel.id === id) ObeyaState.select(s.naar, nieuw.id, 'view');
  }

  // Een resultaat elders bij het project zetten (idee 64): kiezen in de
  // keuzelijst zet het als vinkje erbij. Alleen in het formulier; pas bij
  // Opslaan wordt het een relatie.
  function addElsewhere() {
    const keuze = document.getElementById('f-mr-elsewhere');
    const lijst = root.querySelector('[data-elsewhere-list]');
    if (!keuze || !lijst || !keuze.value) return;
    const bestaand = lijst.querySelector(`[data-mr-elsewhere][value="${CSS.escape(keuze.value)}"]`);
    if (bestaand) {
      bestaand.checked = true;
    } else {
      const mr = ObeyaData.findMeasurableResult(ObeyaState.getDataset(), keuze.value);
      if (!mr) return;
      lijst.insertAdjacentHTML('beforeend', ObeyaModal.elsewhereChip(ObeyaState.getDataset(), mr));
    }
    keuze.value = '';
    keuze.focus();
  }

  // --- inbox -----------------------------------------------------------

  function inboxItem(number) {
    return ObeyaState.getInbox().items.find((i) => i.number === Number(number)) || null;
  }

  // Wat er in het besluitvenster is ingevuld, zodat wisselen van keuze of
  // soort niets weggooit.
  function inboxFields() {
    const uit = {};
    [['type', 'f-inbox-type'], ['parentId', 'f-inbox-parent'], ['name', 'f-inbox-name'], ['owner', 'f-inbox-owner'],
      ['targetId', 'f-inbox-target'], ['date', 'f-inbox-date'], ['reason', 'f-inbox-reason']].forEach(([k, id]) => {
      if (document.getElementById(id)) uit[k] = val(id);
    });
    return uit;
  }

  function focusFirstField() {
    const veld = root.querySelector('.modal .inbox-form input, .modal .inbox-form select, .modal .inbox-form textarea');
    if (veld) veld.focus({ preventScroll: true });
  }

  function openInbox() {
    ObeyaState.setView('agenda');
    const kop = document.getElementById('inbox-kop');
    if (kop) kop.focus({ preventScroll: true });
  }

  // Een stap in de inbox: het venster blijft open en zegt wat er misging, of
  // sluit als het gelukt is.
  async function inboxStep(stap) {
    ObeyaState.updateSelectionContext({ ...inboxFields(), busy: true, error: '' });
    let res;
    try {
      res = await stap();
    } catch (err) {
      console.error(err);
      res = { ok: false, error: 'network' };
    }
    if (res.ok) { closeModal(); return; }
    ObeyaState.updateSelectionContext({ busy: false, error: ObeyaInboxView.foutTekst(res) });
  }

  function handleInboxTriage(form) {
    const item = inboxItem(form.dataset.issue);
    if (!item) return;
    const f = inboxFields();
    const kind = form.dataset.kind;
    if (kind === 'land') {
      if (!f.parentId || !f.name.trim() || !f.owner) {
        ObeyaState.updateSelectionContext({ ...f, error: 'Kies waar het onder komt, geef het een naam en een eigenaar.' });
        return;
      }
      inboxStep(() => ObeyaState.landInboxItem(item, { type: f.type, parentId: f.parentId, name: f.name, owner: f.owner }));
    } else if (kind === 'merge') {
      if (!f.targetId) { ObeyaState.updateSelectionContext({ ...f, error: 'Kies het item om mee samen te voegen.' }); return; }
      inboxStep(() => ObeyaState.mergeInboxItem(item, f.targetId));
    } else if (kind === 'park') {
      if (!f.date) { ObeyaState.updateSelectionContext({ ...f, error: 'Kies de datum waarop het terugkomt.' }); return; }
      inboxStep(() => ObeyaState.parkInboxItem(item, f.date, f.reason));
    } else if (kind === 'reject') {
      if (!f.reason.trim()) { ObeyaState.updateSelectionContext({ ...f, error: 'Geef een reden; de melder ziet hem.' }); return; }
      inboxStep(() => ObeyaState.rejectInboxItem(item, f.reason));
    }
  }

  async function handleInboxFinish(number) {
    const item = inboxItem(number);
    if (!item) return;
    const res = await ObeyaState.finishLandedInboxItem(item);
    if (!res.ok) alert(ObeyaInboxView.foutTekst(res));
  }

  // --- instellingen -----------------------------------------------------

  // Opent het instellingenvenster op een onderdeel; de focus gaat naar dat
  // onderdeel in de zijbalk, zodat je met de pijltjes verder kunt.
  function openSettings(section) {
    ObeyaState.select('settings', null, 'view', { section: section || 'board' });
    const tab = document.getElementById(`settings-tab-${section || 'board'}`);
    if (tab) tab.focus({ preventScroll: true });
  }

  // Na opslaan in Instellingen blijft het venster open en zegt het dat het
  // gelukt is; een los scherm (oude ingang) sluit zoals voorheen.
  function afterSettingsSave(melding) {
    const sel = ObeyaState.getSelection();
    if (!sel || sel.type !== 'settings') { ObeyaState.closeSelection(); return; }
    const noticeEl = root.querySelector('.settings__notice');
    if (noticeEl) noticeEl.textContent = `${melding || 'Opgeslagen'}. Ongedaan maken kan met de knop ↶ of Ctrl/Cmd+Z.`;
  }

  const REVIEW_FOUT = {
    'no-me': 'Kies eerst wie je bent, bij Instellingen → Team en opslag.',
    'not-allowed': 'Jouw rol mag geen wijzigingen bevestigen.',
    'not-in-team': 'Je zit niet in het team Bevestigers op GitHub. Wie erin zit, regelt een eigenaar van de organisatie.',
    'team-unknown': 'De app kon bij GitHub niet nagaan of je mag bevestigen. Kijk bij Instellingen → Team en opslag.',
    'not-pending': 'Over deze wijziging is al beslist.',
    'not-rejected': 'Deze wijziging is niet (meer) afgewezen.',
    'no-reason': 'Geef een reden; de maker ziet hem.',
    'stale-tab': 'Dit bord is in een ander tabblad gewijzigd. Herlaad eerst de pagina.',
  };

  // Na een beslissing: naar de volgende open wijziging, anders naar de kop van
  // het blok; is het blok weg, dan naar het venster of het tabblad Agenda.
  function focusAfterReview() {
    const doel = root.querySelector('[data-action="confirm-change"]:not([aria-disabled]), [data-action="revert-change"]:not([aria-disabled])')
      || document.getElementById('confirm-kop')
      || root.querySelector('.modal')
      || root.querySelector('[data-view="agenda"]');
    if (doel) doel.focus();
  }

  // De knoppen status, eigenaar en betrokkenen in de kopregel van een detailscherm.
  const QUICK_UPDATE = {
    theme: ObeyaData.updateTheme,
    objective: ObeyaData.updateObjective,
    measurableResult: ObeyaData.updateMeasurableResult,
    project: ObeyaData.updateProject,
    action: ObeyaData.updateAction,
  };

  function openChipName() {
    const sel = ObeyaState.getSelection();
    return (sel && sel.context && sel.context.chip) || null;
  }

  function closeChip() {
    const naam = openChipName();
    if (!naam) return false;
    ObeyaState.updateSelectionContext({ chip: null });
    const knop = document.getElementById(`chip-${naam}`);
    if (knop) knop.focus();
    return true;
  }

  function focusPersonButton(naam) {
    const knop = Array.from(root.querySelectorAll('.item-list__row--person [data-action="edit-person"]')).find((b) => b.dataset.owner === naam);
    if (knop) knop.focus();
  }

  // Een eigen pictogram: verkleind tot 64 × 64 en als PNG in het bord bewaard.
  function readFaviconFile(file) {
    if (!file) return;
    if (!/^image\/(png|jpeg|gif|webp)$/.test(file.type) || file.size > 2000000) {
      alert('Kies een PNG, JPG, GIF of WebP van hooguit 2 MB.');
      return;
    }
    const lezer = new FileReader();
    lezer.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        const schaal = Math.min(64 / img.width, 64 / img.height);
        const w = img.width * schaal;
        const h = img.height * schaal;
        ctx.drawImage(img, (64 - w) / 2, (64 - h) / 2, w, h);
        const dataUrl = canvas.toDataURL('image/png');
        // Nog niet bewaren: eerst een voorbeeld, en pas bij Opslaan in het bord.
        if (dataUrl.length > ObeyaData.FAVICON_MAX) { alert('Deze afbeelding is na verkleinen nog te groot voor een pictogram.'); return; }
        document.getElementById('f-favicon-data').value = dataUrl;
        const radio = root.querySelector('.modal input[name="favicon"][value="custom"]');
        if (radio) radio.checked = true;
        const voorbeeld = root.querySelector('[data-favicon-preview="custom"]');
        if (voorbeeld) voorbeeld.innerHTML = `<img src="${dataUrl}" width="32" height="32" alt=""><img src="${dataUrl}" width="16" height="16" alt="">`;
      };
      img.onerror = () => alert('Deze afbeelding kon niet worden gelezen.');
      img.src = lezer.result;
    };
    lezer.readAsDataURL(file);
  }

  function readInvolved() {
    return Array.from(root.querySelectorAll('.modal [data-involved]:checked')).map((i) => i.value);
  }

  // Zonder principes op het bord staat er geen keuze in het formulier; dan
  // blijft het veld van het item ongemoeid.
  function withPrinciples(fields) {
    if (root.querySelector('.modal [data-principle-picker]')) {
      fields.principleIds = Array.from(root.querySelectorAll('.modal [data-principle]:checked')).map((i) => i.value);
    }
    return fields;
  }

  function saveTheme(id) {
    const keuze = root.querySelector('.modal input[name="theme-color"]:checked');
    const color = keuze ? (keuze.value === 'custom' ? val('f-theme-color-custom') : keuze.value) : undefined;
    const fields = { name: val('f-name').trim(), description: val('f-description').trim(), owner: val('f-owner').trim(), involved: readInvolved(), color };
    if (!fields.name) { alert('Geef het thema een naam.'); return; }
    let entity;
    ObeyaState.mutate((ds) => {
      entity = id ? ObeyaData.updateTheme(ds, id, fields) : ObeyaData.createTheme(ds, fields);
    });
    ObeyaState.select('theme', entity.id, 'view');
  }

  function saveObjective(id, defaultThemeId) {
    const themeIds = Array.from(document.querySelectorAll('[data-theme-toggle]:checked')).map((i) => i.value);
    if (themeIds.length === 0) { alert('Koppel het doel aan minstens één strategisch thema.'); return; }
    const fields = withPrinciples({ title: val('f-title').trim(), description: val('f-description').trim(), owner: val('f-owner').trim(), involved: readInvolved(), themeIds });
    if (!fields.title) { alert('Geef het doel een titel.'); return; }
    let entity;
    ObeyaState.mutate((ds) => {
      entity = id ? ObeyaData.updateObjective(ds, id, fields) : ObeyaData.createObjective(ds, defaultThemeId || themeIds[0], fields);
    });
    ObeyaState.select('objective', entity.id, 'view');
  }

  // Meerdere meetbare resultaten tegelijk (idee 84): in één stap, dus ook in
  // één keer ongedaan te maken.
  function saveBulkResults(objectiveId) {
    const namen = ObeyaData.splitResultNames(val('f-bulk-names'));
    const shared = { owner: val('f-owner').trim(), periodYear: val('f-period-year').trim() || null, periodQuarter: val('f-period-quarter') || null };
    const doel = ObeyaData.findObjective(ObeyaState.getDataset(), objectiveId);
    const bestaand = new Set((doel ? doel.measurableResults : []).map((m) => String(m.name).trim().toLowerCase()));
    const nieuw = namen.filter((n) => !bestaand.has(n.toLowerCase()));
    if (!nieuw.length) {
      alert(namen.length ? 'Deze meetbare resultaten staan al bij dit doel.' : 'Vul minstens één meetbaar resultaat in, één per regel.');
      const veld = document.getElementById('f-bulk-names');
      if (veld) veld.focus();
      return;
    }
    ObeyaState.mutate((ds) => ObeyaData.addMeasurableResults(ds, objectiveId, namen, shared),
      `${nieuw.length} ${nieuw.length === 1 ? 'meetbaar resultaat' : 'meetbare resultaten'} toegevoegd`);
    ObeyaState.select('objective', objectiveId, 'view');
  }

  // In bulk wijzigen in Samenhang (idee 89).
  let bulkPijltjes = false;
  function applyBulkSelect(el) {
    bulkPijltjes = false;
    const waarde = el.value;
    if (!waarde) return;
    if (el.dataset.bulk === 'status') {
      const label = el.options[el.selectedIndex].text.replace(/ \(.*\)$/, '');
      applyBulk({ status: waarde }, `op ${label}`);
    } else {
      const naam = waarde === '__geen__' ? '' : waarde;
      applyBulk({ owner: naam }, naam ? `eigenaar ${naam}` : 'zonder eigenaar');
    }
    const veld = document.getElementById(el.id);
    if (veld) veld.focus();
  }
  root.addEventListener('keydown', (e) => {
    if (!e.target.matches || !e.target.matches('[data-bulk]')) return;
    if (['ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(e.key)) bulkPijltjes = true;
    else if (e.key === 'Enter' && bulkPijltjes) { e.preventDefault(); applyBulkSelect(e.target); }
  });
  root.addEventListener('focusout', (e) => {
    if (bulkPijltjes && e.target.matches && e.target.matches('[data-bulk]')) applyBulkSelect(e.target);
  });

  function selectedItems() {
    return ObeyaState.getCanvasState().selected.map((k) => { const i = k.indexOf(':'); return { type: k.slice(0, i), id: k.slice(i + 1) }; });
  }

  function applyBulk(change, wat) {
    const items = selectedItems();
    if (!items.length) return;
    let r = null;
    ObeyaState.mutate((d) => { r = ObeyaData.bulkEdit(d, items, change); }, `${items.length} items: ${wat}`);
    const melding = r.changed
      ? `${r.changed} ${r.changed === 1 ? 'item' : 'items'} ${wat}${r.skipped ? `; ${r.skipped} niet, want die soort kent deze status niet` : ''}.`
      : 'Niets gewijzigd: de gekozen items kennen deze status niet.';
    ObeyaState.setCanvasSelected(ObeyaState.getCanvasState().selected, melding, r.changed > 0);
  }

  // Meerdere acties bij een meetbaar resultaat (idee 86), in één stap.
  function saveBulkActions(mrId) {
    const namen = ObeyaData.splitResultNames(val('f-bulk-names'));
    const ds = ObeyaState.getDataset();
    const mr = ObeyaData.findMeasurableResult(ds, mrId);
    const doel = mr && ObeyaData.findObjective(ds, mr.objectiveId);
    const bestaand = new Set(doel ? ObeyaData.contributingItems(doel, mrId).actions.map((a) => String(a.title).trim().toLowerCase()) : []);
    const nieuw = namen.filter((n) => !bestaand.has(n.toLowerCase()));
    if (!nieuw.length) {
      alert(namen.length ? 'Deze acties hangen al aan dit resultaat.' : 'Vul minstens één actie in, één per regel.');
      const veld = document.getElementById('f-bulk-names');
      if (veld) veld.focus();
      return;
    }
    ObeyaState.mutate((d) => ObeyaData.addActionsToResult(d, mrId, namen), `${nieuw.length} ${nieuw.length === 1 ? 'actie' : 'acties'} toegevoegd`);
    ObeyaState.select('measurableResult', mrId, 'view');
  }

  function saveMeasurableResult(id, objectiveId, linkProjectId) {
    const fields = {
      name: val('f-name').trim(),
      doneCriterion: val('f-done-criterion').trim(),
      periodYear: val('f-period-year').trim(),
      periodQuarter: val('f-period-quarter'),
      owner: val('f-owner').trim(),
      involved: readInvolved(),
      status: val('f-status'),
      sourceStatus: val('f-source-status').trim() || null,
      inTeamPlan: !!document.getElementById('f-team-plan').checked,
      monitoringText: val('f-monitoring-text').trim(),
      valueCurrent: val('f-value-current').trim(),
      valueTarget: val('f-value-target').trim(),
      valueDate: val('f-value-date'),
    };
    // Een nieuwe waarde zonder nieuwe peildatum: de peildatum wordt vandaag.
    const veldWas = document.getElementById('f-value-current');
    if (fields.valueCurrent && veldWas && fields.valueCurrent !== veldWas.dataset.valueWas && (!fields.valueDate || fields.valueDate === (ObeyaData.findMeasurableResult(ObeyaState.getDataset(), id || '') || {}).valueDate)) {
      fields.valueDate = new Date().toISOString().slice(0, 10);
    }
    if (!fields.name) { alert('Geef het meetbare resultaat een naam.'); return; }
    let entity;
    ObeyaState.mutate((ds) => {
      entity = id ? ObeyaData.updateMeasurableResult(ds, id, fields) : ObeyaData.createMeasurableResult(ds, objectiveId, fields);
      // Aangemaakt vanuit een project: in dezelfde stap koppelen, zodat één
      // keer ongedaan maken beide terugdraait.
      const project = !id && linkProjectId ? ObeyaData.findProject(ds, linkProjectId) : null;
      if (project) {
        ObeyaData.updateProject(ds, project.id, {
          measurableResultIds: [...(project.measurableResultIds || []), entity.id],
          noMeasurableResultNeeded: false,
        });
      }
    });
    if (!id && linkProjectId) { ObeyaState.select('project', linkProjectId, 'view'); return; }
    ObeyaState.select('measurableResult', entity.id, 'view');
  }

  // Leest het projectformulier uit; null (met melding) als het niet klopt.
  function readProjectForm() {
    const yearRaw = val('f-period-year').trim();
    const quarterRaw = val('f-period-quarter');
    const fields = {
      name: val('f-name').trim(),
      description: val('f-description').trim(),
      owner: val('f-owner').trim(),
      involved: readInvolved(),
      status: val('f-status'),
      periodYear: yearRaw ? parseInt(yearRaw, 10) : null,
      periodQuarter: quarterRaw ? parseInt(quarterRaw, 10) : null,
      sourceStatus: val('f-source-status').trim() || null,
      inTeamPlan: !!document.getElementById('f-team-plan').checked,
      monitoringText: val('f-monitoring-text').trim(),
      measurableResultIds: Array.from(document.querySelectorAll('[data-mr-toggle]:checked')).map((i) => i.value),
      workType: val('f-work-type'),
      noMeasurableResultNeeded: !!document.getElementById('f-no-mr-needed').checked,
    };
    // Alleen als het blok er staat: anders blijven bestaande bijdragen elders ongemoeid.
    const elders = document.querySelector('[data-elsewhere-list]');
    fields.elsewhere = elders ? {
      add: Array.from(elders.querySelectorAll('[data-mr-elsewhere]:checked')).map((i) => i.value),
      remove: Array.from(elders.querySelectorAll('[data-mr-elsewhere]:not(:checked)')).map((i) => i.value),
    } : null;
    withPrinciples(fields);
    if (!fields.name) { alert('Geef het project een naam.'); return null; }
    return fields;
  }

  function saveProject(id, objectiveId) {
    const fields = readProjectForm();
    if (!fields) return;
    let entity;
    const { elsewhere, ...rest } = fields;
    ObeyaState.mutate((ds) => {
      entity = id ? ObeyaData.updateProject(ds, id, rest) : ObeyaData.createProject(ds, objectiveId, rest);
      if (entity && elsewhere) ObeyaData.setContributionsElsewhere(ds, entity.id, elsewhere);
    });
    ObeyaState.select('project', entity.id, 'view');
  }

  // Vanuit het projectformulier een meetbaar resultaat voor het doel
  // toevoegen: eerst wat er in het formulier staat opslaan (anders gaat het
  // verloren), dan het nieuwe resultaat maken dat na opslaan aan dit project
  // gekoppeld wordt. Zonder deze route liep "nog te koppelen" dood op een
  // doel zonder meetbare resultaten.
  function newMeasurableResultForProject(target) {
    const fields = readProjectForm();
    if (!fields) return;
    const projectId = target.dataset.projectId;
    ObeyaState.mutate((ds) => ObeyaData.updateProject(ds, projectId, fields), 'project bewerken');
    ObeyaState.select('measurableResult', null, 'new', { objectiveId: target.dataset.objectiveId, linkProjectId: projectId });
  }

  function saveAction(id, objectiveId) {
    const projectId = val('f-project') || null;
    const fields = {
      title: val('f-title').trim(),
      description: val('f-description').trim(),
      owner: val('f-owner').trim(),
      involved: readInvolved(),
      status: val('f-status'),
      dueDate: val('f-due-date') || null,
      projectId,
      measurableResultId: val('f-measurable-result') || null,
    };
    if (!fields.title) { alert('Geef de actie een titel.'); return; }
    let entity;
    ObeyaState.mutate((ds) => {
      entity = id ? ObeyaData.updateAction(ds, id, fields) : ObeyaData.createAction(ds, objectiveId, projectId, fields);
    });
    ObeyaState.select('action', entity.id, 'view');
  }

  // -----------------------------------------------------------------------
  // Git-databackend (idee 4+49, zie js/git-backend.js)
  // -----------------------------------------------------------------------

  function saveGitConfig() {
    const rememberEl = document.getElementById('f-git-remember');
    const fields = {
      owner: val('f-git-owner'),
      repo: val('f-git-repo'),
      branch: val('f-git-branch'),
      path: val('f-git-path'),
      token: val('f-git-token'),
      remember: !!(rememberEl && rememberEl.checked),
    };
    if (!fields.owner || !fields.repo || !fields.token) {
      alert('Vul in elk geval eigenaar, repo en token in.');
      return;
    }
    ObeyaState.saveGitConfig(fields);
    ObeyaState.testGitConnection();
  }

  // Ophalen voegt samen met wat je zelf nog niet deelde. Alleen de eerste
  // keer, als het teambord een bord met eigen werk vervangt (bijv. wat je in
  // de voorbeelddata hebt aangepast), vraagt het eerst om bevestiging.
  // --- beoordelingsronde -----------------------------------------------
  // Keuzelijsten slaan meteen op; tekstvelden bij elke stap, bij sluiten en
  // bij Enter (zie de change-handler voor het waarom).
  function commitReviewField(input) {
    const { type, id, reviewField } = input.dataset;
    const found = ObeyaData.findAny(ObeyaState.getDataset(), id);
    if (!found || String(found.entity[reviewField] ?? '') === input.value.trim()) return;
    const fn = { measurableResult: ObeyaData.updateMeasurableResult, project: ObeyaData.updateProject }[type];
    if (fn) ObeyaState.mutate((ds) => fn(ds, id, { [reviewField]: input.value.trim() }), 'beoordelingsronde');
  }

  function flushReviewFields() {
    const sel = ObeyaState.getSelection();
    if (!sel || sel.type !== 'reviewRound') return;
    root.querySelectorAll('[data-review-field]').forEach(commitReviewField);
    const note = document.getElementById('rv-note');
    if (note && note.value.trim()) addReviewNote(note.value);
  }

  function addReviewNote(text) {
    const author = val('rv-note-author');
    if (author) H.setLastAuthor(author);
    ObeyaState.reviewAddNote(text, author);
  }

  // Na een stap staat de focus op het eerste veld van het volgende item, zodat
  // je met het toetsenbord meteen verder kunt.
  function focusReviewItem() {
    const el = document.getElementById('rv-status') || document.getElementById('rv-owner') || document.getElementById('rv-next')
      || root.querySelector('.modal .btn--primary');
    if (el) el.focus();
  }

  function reviewStep(outcome) {
    flushReviewFields();
    const res = ObeyaState.reviewAdvance(outcome);
    if (res.ok) focusReviewItem();
    else if (res.error === 'reason-required') { const n = document.getElementById('rv-note'); if (n) n.focus(); }
  }

  async function handleGitPull() {
    const result = await ObeyaState.pullFromGit({
      confirmReplace: (n) => confirmDialog(`Je haalt voor het eerst de teamdata op. Die vervangt het bord in deze browser, inclusief ${n === 1 ? '1 eigen wijziging' : `${n} eigen wijzigingen`} (bijvoorbeeld in de voorbeelddata). Die gaan niet mee naar het team.\n\nWil je ze bewaren? Kies Annuleren en exporteer eerst.\n\nDoorgaan met ophalen?`),
    });
    if (!result.ok && !['needs-resolution', 'cancelled'].includes(result.error)) alert('Ophalen mislukt: ' + H.gitErrorMessage(result.error, result.detail));
    // De stukken komen mee met de teamdata (idee 54).
    if (result.ok) ObeyaState.fetchDocuments();
  }

  async function handleResolveMerge(form) {
    const choices = {};
    form.querySelectorAll('input[type="radio"]:checked').forEach((r) => { choices[r.dataset.conflictId] = r.value; });
    const result = await ObeyaState.resolvePendingMerge(choices);
    if (!result.ok && result.error !== 'needs-resolution') alert('Samenvoegen mislukt: ' + H.gitErrorMessage(result.error, result.detail));
  }

  async function handleGitPush() {
    // Eerst zeker weten wie er deelt, zodat niemand ongemerkt op naam van
    // een ander token commit. Alleen stoppen als dat onbekend blijft
    // (ongeldig token, geen netwerk); een ontbrekend bestand lost delen
    // juist op, en andere repo-fouten meldt de poging zelf.
    let identity = ObeyaState.getGitIdentity();
    if (!identity) {
      const test = await ObeyaState.testGitConnection();
      identity = ObeyaState.getGitIdentity();
      if (!identity) {
        alert('Delen mislukt: ' + H.gitErrorMessage(test.error, test.detail));
        return;
      }
    }
    if (!ObeyaState.hasGitBase()) {
      alert(H.gitErrorMessage('pull-first'));
      return;
    }
    if (!ObeyaState.hasUnsharedChanges()) {
      await ObeyaState.pushToGit('');
      return;
    }
    const who = identity.name !== identity.login ? `${identity.name} (@${identity.login})` : `@${identity.login}`;
    const message = window.prompt(`Je deelt als ${who}.\n\nKorte omschrijving van je wijziging (komt in de geschiedenis van het team):`, '');
    if (message === null) return; // geannuleerd
    const result = await ObeyaState.pushToGit(message.trim() || 'Wijziging via Obeya-bord');
    if (!result.ok && result.error !== 'needs-resolution') alert('Delen mislukt: ' + H.gitErrorMessage(result.error, result.detail));
  }

  function handleSave(target) {
    const type = target.dataset.type;
    const id = target.dataset.id || null;
    if (type === 'theme') return saveTheme(id);
    if (type === 'objective') return saveObjective(id, target.dataset.themeId);
    if (type === 'measurableResult') return saveMeasurableResult(id, target.dataset.objectiveId, target.dataset.linkProjectId);
    if (type === 'project') return saveProject(id, target.dataset.objectiveId);
    if (type === 'action') return saveAction(id, target.dataset.objectiveId);
  }

  const DELETE_FNS = {
    theme: ObeyaData.deleteTheme,
    objective: ObeyaData.deleteObjective,
    measurableResult: ObeyaData.deleteMeasurableResult,
    project: ObeyaData.deleteProject,
    action: ObeyaData.deleteAction,
  };

  const ENTITY_NAMES = {
    theme: 'thema',
    objective: 'doel',
    measurableResult: 'meetbaar resultaat',
    project: 'project',
    action: 'actie',
  };

  const DELETE_LABELS = {
    theme: 'dit strategische thema (doelen die alleen hieraan hangen verdwijnen mee; doelen die ook bij een ander thema horen blijven bestaan)',
    objective: 'dit doel (inclusief meetbare resultaten, projecten en acties eronder)',
    measurableResult: 'dit meetbare resultaat',
    project: 'dit project (inclusief de acties eronder)',
    action: 'deze actie',
  };

  // After deleting a leaf item, land back on its parent's detail view
  // instead of just closing the modal, so the user keeps their place on
  // the board. Look the parent up before deleting since the entity (and
  // its parent references) won't exist anymore afterwards.
  function parentSelectionOf(dataset, type, id) {
    if (type === 'objective') {
      const theme = ObeyaData.findObjectiveOwnerTheme(dataset, id);
      return theme ? { type: 'theme', id: theme.id } : null;
    }
    if (type === 'measurableResult') {
      const mr = ObeyaData.findMeasurableResult(dataset, id);
      return mr ? { type: 'objective', id: mr.objectiveId } : null;
    }
    if (type === 'project') {
      const project = ObeyaData.findProject(dataset, id);
      return project ? { type: 'objective', id: project.objectiveId } : null;
    }
    if (type === 'action') {
      const action = ObeyaData.findAction(dataset, id);
      if (!action) return null;
      return action.projectId ? { type: 'project', id: action.projectId } : { type: 'objective', id: action.objectiveId };
    }
    return null; // theme has no owning parent to return to
  }

  function handleDelete(type, id) {
    const fn = DELETE_FNS[type];
    if (!fn) return;
    if (!confirmDialog(`Weet je zeker dat je ${DELETE_LABELS[type] || 'dit item'} wilt verwijderen? Dit kan niet ongedaan worden gemaakt.`)) return;
    const parent = parentSelectionOf(ObeyaState.getDataset(), type, id);
    ObeyaState.mutate((ds) => fn(ds, id), `${ENTITY_NAMES[type] || 'item'} verwijderen`);
    if (parent) ObeyaState.select(parent.type, parent.id, 'view');
    else ObeyaState.closeSelection();
  }

  function handleCancelEdit(target) {
    const type = target.dataset.type;
    const id = target.dataset.id;
    if (id) { ObeyaState.select(type, id, 'view'); return; }
    // cancelling a "new" form: fall back to the closest sensible parent view
    if (target.dataset.projectId) { ObeyaState.select('project', target.dataset.projectId, 'view'); return; }
    if (target.dataset.objectiveId) { ObeyaState.select('objective', target.dataset.objectiveId, 'view'); return; }
    if (target.dataset.themeId) { ObeyaState.select('theme', target.dataset.themeId, 'view'); return; }
    ObeyaState.closeSelection();
  }

  function handleOpen(raw) {
    const idx = raw.indexOf(':');
    const type = idx === -1 ? raw : raw.slice(0, idx);
    const id = idx === -1 ? '' : raw.slice(idx + 1);
    if (!type) { ObeyaState.closeSelection(); return; }
    ObeyaState.select(type, id, 'view');
  }

  function handleImportFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = ObeyaData.parseImport(String(reader.result));
      if (!parsed.ok) {
        alert('Import mislukt:\n\n' + parsed.errors.join('\n'));
        return;
      }
      if (!confirmDialog('Dit vervangt de huidige Obeya-data in de app. De huidige data ga je kwijt tenzij je die eerst hebt geëxporteerd. Doorgaan met importeren?')) {
        return;
      }
      const applied = ObeyaState.applyImportedDataset(parsed.dataset, file.name);
      if (!applied.ok) {
        const reden = applied.error ? applied.error.message : (applied.errors || []).join('\n');
        alert('Import mislukt: het bestand kon niet worden toegepast.\n\n' + reden + '\n\nJe huidige data is ongewijzigd gebleven.');
        return;
      }
      // Wat er bij het inlezen is bijgewerkt (ontbrekende lijsten, een oude
      // veldnaam) hoort de gebruiker te weten — stil repareren is net zo
      // misleidend als stil kapotgaan.
      const warnings = parsed.warnings || [];
      alert(warnings.length
        ? 'Import geslaagd. Het bestand is op deze punten bijgewerkt:\n\n- ' + warnings.join('\n- ')
        : 'Import geslaagd.');
    };
    reader.onerror = () => alert('Kon het bestand niet lezen.');
    reader.readAsText(file);
  }

  // -----------------------------------------------------------------------
  // Delegated event handling
  // -----------------------------------------------------------------------

  root.addEventListener('click', (e) => {
    // Theme picker checkboxes inside the objective edit form are purely
    // cosmetic until Save is pressed (their checked state is only read when
    // the form is submitted) — the browser handles the toggle natively and
    // CSS (:has()) reflects it, so no state/render round-trip is needed here.
    if (e.target.closest('.theme-opt')) return;

    // In de selectiestand van Samenhang: klikken op een kaart (niet op een
    // knop of link) vinkt hem aan of uit, een groter klikvlak dan het vakje.
    if (ObeyaState.getView() === 'canvas' && ObeyaState.getCanvasState().selecting && !e.target.closest('button, a, input, select, label, textarea')) {
      const kaart = e.target.closest('.cv-card, .cv-mr, .cv-action');
      const vakje = kaart && kaart.querySelector(':scope > .cv-card__head > .cv-select input, :scope > .cv-select input');
      if (vakje) { vakje.click(); return; }
    }
    const target = e.target.closest(
      '[data-action], [data-open], [data-view], [data-filter-theme], [data-filter-status], [data-filter-note-type], [data-close-overlay]'
    );
    if (!target) return;

    if (target.hasAttribute('data-close-overlay') && target === e.target) {
      closeModal();
      return;
    }

    if (target.dataset.view) {
      ObeyaState.setView(target.dataset.view);
      // Stukken de eerste keer vanzelf ophalen, als er een verbinding is.
      const docs = ObeyaState.getDocuments();
      if (target.dataset.view === 'documents' && docs.configured && !docs.fetchedAt && !docs.busy) ObeyaState.fetchDocuments();
      return;
    }
    if (target.dataset.filterTheme) {
      ObeyaState.toggleThemeFilter(target.dataset.filterTheme);
      return;
    }
    if (target.dataset.filterStatus) {
      ObeyaState.toggleStatusFilter(target.dataset.filterStatus);
      return;
    }
    if (target.dataset.filterNoteType) {
      ObeyaState.toggleNoteTypeFilter(target.dataset.filterNoteType);
      return;
    }
    if (target.dataset.open) {
      handleOpen(target.dataset.open);
      return;
    }

    const action = target.dataset.action;
    if (!action) return;

    switch (action) {
      case 'close-modal':
        closeModal();
        break;
      case 'clear-filters':
      case 'clear-filter': {
        if (action === 'clear-filters') ObeyaState.clearFilters();
        else ObeyaState.clearFilter(target.dataset.filterKey);
        // De knop die je gebruikte is na het opnieuw opbouwen weg; de focus naar
        // de knop Filters, zodat wie met het toetsenbord werkt niet bovenaan
        // de pagina terechtkomt.
        const knop = document.getElementById('filter-toggle');
        if (knop) knop.focus({ preventScroll: true });
        break;
      }
      case 'toggle-filter-panel':
        ObeyaState.toggleFilterPanel();
        break;
      case 'new-theme':
        ObeyaState.select('theme', null, 'new', {});
        break;
      case 'new-objective':
        ObeyaState.select('objective', null, 'new', { themeId: target.dataset.themeId });
        break;
      case 'new-measurableResult':
        ObeyaState.select('measurableResult', null, 'new', { objectiveId: target.dataset.objectiveId });
        break;
      case 'bulk-measurableResults':
        ObeyaState.select('bulkResults', null, 'edit', { objectiveId: target.dataset.objectiveId, text: '' });
        { const veld = document.getElementById('f-bulk-names'); if (veld) veld.focus(); }
        break;
      case 'canvas-select-mode':
        ObeyaState.toggleCanvasSelecting();
        // Aan: de focus op het eerste vakje; uit: terug naar de knop Selecteren.
        if (ObeyaState.getCanvasState().selecting) { const eerste = root.querySelector('[data-canvas-select]'); if (eerste) eerste.focus(); }
        else { const knop = root.querySelector('.canvas-controls [data-action="canvas-select-mode"]'); if (knop) knop.focus(); }
        break;
      case 'bulk-undo':
        ObeyaState.undo();
        ObeyaState.setCanvasSelected(ObeyaState.getCanvasState().selected, 'Ongedaan gemaakt.');
        { const s = document.getElementById('bulk-status'); if (s) s.focus(); }
        break;
      case 'canvas-select-visible': {
        const zichtbaar = Array.from(root.querySelectorAll('[data-canvas-select]'), (i) => i.dataset.canvasSelect);
        ObeyaState.setCanvasSelected([...ObeyaState.getCanvasState().selected, ...zichtbaar], `${zichtbaar.length} in beeld geselecteerd`);
        break;
      }
      case 'canvas-select-none':
        ObeyaState.setCanvasSelected([], 'Selectie gewist');
        break;
      case 'bulk-flag':
        applyBulk({ flag: target.dataset.flag === 'on' }, target.dataset.flag === 'on' ? 'gemarkeerd voor bespreking' : 'markering weggehaald');
        break;
      case 'bulk-delete': {
        const items = selectedItems();
        if (!items.length) break;
        const ds = ObeyaState.getDataset();
        const namen = items.map((i) => (ObeyaData.describeItem(ds, i.id) || {}).label).filter(Boolean);
        const acties = items.filter((i) => i.type === 'project').reduce((n, i) => n + ((ObeyaData.findProject(ds, i.id) || { actions: [] }).actions || []).length, 0);
        const vraag = `${items.length} ${items.length === 1 ? 'item' : 'items'} verwijderen?\n\n${namen.slice(0, 8).join('\n')}${namen.length > 8 ? `\n… en nog ${namen.length - 8}` : ''}${acties ? `\n\nDe ${acties} ${acties === 1 ? 'actie' : 'acties'} onder de projecten gaan mee.` : ''}\n\nOngedaan maken kan daarna nog.`;
        if (!confirmDialog(vraag)) break;
        let r = null;
        ObeyaState.mutate((d) => { r = ObeyaData.bulkDelete(d, items); }, `${items.length} items verwijderd`);
        ObeyaState.setCanvasSelected([], `${r ? r.removed : 0} verwijderd.`, true);
        break;
      }
      case 'involved-group': {
        // Iedereen uit de groep aanvinken; staan ze al allemaal aan, dan weer uit.
        const namen = JSON.parse(target.dataset.names || '[]');
        const vakjes = Array.from(root.querySelectorAll('[data-involved]')).filter((i) => namen.includes(i.value));
        const allesAan = vakjes.length && vakjes.every((i) => i.checked);
        vakjes.forEach((i) => { i.checked = !allesAan; });
        // In het paneel achter de knop Betrokken slaat een vinkje meteen op:
        // één change-event bewaart alles wat nu is aangevinkt.
        if (vakjes.length && vakjes[0].closest('[data-quick-involved-panel]')) vakjes[0].dispatchEvent(new Event('change', { bubbles: true }));
        break;
      }
      case 'bulk-actions':
        ObeyaState.select('bulkResults', null, 'edit', { objectiveId: target.dataset.objectiveId, measurableResultId: target.dataset.mrId, text: '' });
        { const veld = document.getElementById('f-bulk-names'); if (veld) veld.focus(); }
        break;
      case 'cancel-bulk-results':
        if (target.dataset.mrId) ObeyaState.select('measurableResult', target.dataset.mrId, 'view');
        else ObeyaState.select('objective', target.dataset.objectiveId, 'view');
        break;
      case 'save-bulk-results':
        if (target.dataset.mrId) saveBulkActions(target.dataset.mrId);
        else saveBulkResults(target.dataset.objectiveId);
        break;
      case 'cancel-merge':
        ObeyaState.cancelPendingMerge();
        break;
      case 'merge-choose-all':
        root.querySelectorAll(`.merge-form input[type="radio"][value="${target.dataset.side}"]`).forEach((r) => { r.checked = true; });
        break;
      case 'open-doc':
        ObeyaState.openDocument(target.dataset.path);
        { const t = document.getElementById('doc-title'); if (t) t.focus(); }
        window.scrollTo(0, 0);
        break;
      case 'close-doc': {
        const pad = ObeyaState.getOpenDocument();
        ObeyaState.openDocument(null);
        const kaart = Array.from(root.querySelectorAll('[data-action="open-doc"]')).find((b) => b.dataset.path === pad);
        if (kaart) kaart.focus();
        break;
      }
      case 'open-help': {
        // Zonder pagina: het hoofdstuk van de weergave waar je bent. De
        // scrollpositie van die weergave komt terug als je teruggaat.
        if (ObeyaState.getView() !== 'help') helpReturnScroll = window.scrollY;
        const pagina = target.dataset.page || ObeyaHelpView.pageForView(ObeyaState.getView());
        ObeyaState.openHelp(pagina);
        const anker = target.dataset.anchor && document.getElementById(`h-${target.dataset.anchor}`);
        if (anker) {
          anker.setAttribute('tabindex', '-1');
          anker.focus();
          anker.scrollIntoView({ block: 'start' });
        } else {
          const t = document.getElementById('help-title');
          if (t) t.focus();
          window.scrollTo(0, 0);
        }
        break;
      }
      case 'close-help':
        closeHelp();
        break;
      case 'fetch-docs':
        ObeyaState.fetchDocuments();
        break;
      case 'open-review':
        ObeyaState.select('reviewRound', null, 'view', {});
        break;
      case 'review-next':
        reviewStep('done');
        break;
      case 'review-skip':
        reviewStep('skipped');
        break;
      case 'review-flag':
        reviewStep('flagged');
        break;
      case 'review-back':
        flushReviewFields();
        ObeyaState.reviewBack();
        focusReviewItem();
        break;
      case 'review-flag-skipped':
        ObeyaState.reviewFlagSkipped();
        break;
      case 'review-skipped-again':
        ObeyaState.startReview({ onlySkipped: true });
        focusReviewItem();
        break;
      case 'review-restart':
        ObeyaState.endReview();
        ObeyaState.select('reviewRound', null, 'view', {});
        break;
      case 'review-end':
        ObeyaState.endReview();
        break;
      case 'set-principle-filter': {
        // Nog een keer op hetzelfde principe klikken zet het filter weer uit.
        const id = target.dataset.principleId;
        ObeyaState.setPrincipleFilter(ObeyaState.getFilters().principle === id ? '' : id);
        break;
      }
      case 'add-principle-row': {
        // Alleen in het formulier: er verandert nog niets aan het bord, dus
        // ook niet opnieuw opbouwen (dan zou wat er al getypt is verdwijnen).
        target.insertAdjacentHTML('beforebegin', ObeyaModal.principleRowNew());
        const nieuw = target.previousElementSibling.querySelector('input');
        if (nieuw) nieuw.focus();
        break;
      }
      case 'print-deck':
        handlePrintDeck();
        break;
      case 'download-deck-pptx':
        ObeyaDeckPptx.download(ObeyaState.getDataset()).catch((err) => {
          console.error(err);
          alert('De PowerPoint kon niet worden gemaakt. Probeer het opnieuw, of maak de PDF.');
        });
        break;
      case 'print-preset': {
        // Alleen de vinkjes in het formulier; er verandert niets aan het bord.
        const gekozen = (target.dataset.sheets || '').split(',');
        root.querySelectorAll('.modal input[name="print-sheet"]').forEach((i) => { i.checked = gekozen.includes(i.value); });
        syncPrintThemeChoice();
        break;
      }
      case 'remove-principle': {
        const ds = ObeyaState.getDataset();
        const id = target.dataset.principleId;
        const principle = ObeyaData.getPrinciples(ds).find((p) => p.id === id);
        if (!principle) break;
        const n = ObeyaData.countPrincipleUse(ds, id);
        const vraag = n
          ? `Principe "${principle.name}" verwijderen? Het staat nu op ${n} ${n === 1 ? 'doel of project' : 'doelen en projecten'}; daar verdwijnt het label. Ongedaan maken kan.`
          : `Principe "${principle.name}" verwijderen? Het wordt nog nergens gebruikt.`;
        if (!confirm(vraag)) break;
        ObeyaState.mutate((d) => ObeyaData.removePrinciple(d, id), `principe "${principle.name}" verwijderen`);
        break;
      }
      case 'open-settings':
      case 'settings-section':
        openSettings(target.dataset.section);
        break;
      case 'manage-board':
        openSettings('board');
        break;
      case 'manage-display':
        openSettings('display');
        break;
      case 'reset-display':
        ObeyaState.mutate((ds) => ObeyaData.resetDisplaySettings(ds), 'weergave van de muur');
        ObeyaState.setCanvasDetail(null);
        break;
      case 'reload-page':
        window.location.reload();
        break;
      case 'remove-demo-items':
        if (confirmDialog('De items uit de voorbeelddata uit dit bord verwijderen?\n\nWat je zelf hebt toegevoegd, blijft staan. Ongedaan maken kan.')) {
          ObeyaState.removeDemoItems();
        }
        break;
      case 'dismiss-demo-mix':
        ObeyaState.dismissDemoMix();
        break;
      case 'open-inbox':
        openInbox();
        break;
      case 'convert-item': {
        // Een doel dat een resultaat wordt, heeft een doel nodig om onder te komen.
        const keuze = document.getElementById('f-convert-target');
        convertItem(target.dataset.type, target.dataset.id, keuze ? { objectiveId: keuze.value } : undefined);
        break;
      }
      case 'inbox-new':
        ObeyaState.select('inboxNew', null, 'view', { inbox: ObeyaState.getInbox() });
        focusFirstField();
        break;
      case 'inbox-refresh':
        ObeyaState.loadInbox();
        break;
      case 'inbox-triage':
        ObeyaState.select('inboxTriage', Number(target.dataset.issue), 'view', { kind: 'land', item: inboxItem(target.dataset.issue) });
        focusFirstField();
        break;
      case 'inbox-kind':
        ObeyaState.updateSelectionContext({ ...inboxFields(), kind: target.dataset.kind, error: '' });
        break;
      case 'inbox-finish':
        handleInboxFinish(target.dataset.issue);
        break;
      case 'open-print':
        ObeyaState.select('printSheets', null, 'view', {});
        break;
      case 'new-mr-for-project':
        newMeasurableResultForProject(target);
        break;
      case 'new-project':
        ObeyaState.select('project', null, 'new', { objectiveId: target.dataset.objectiveId });
        break;
      case 'new-action':
        ObeyaState.select('action', null, 'new', { objectiveId: target.dataset.objectiveId, projectId: target.dataset.projectId || null });
        break;
      case 'edit':
        ObeyaState.select(target.dataset.type, target.dataset.id, 'edit', {});
        break;
      case 'cancel-edit':
        handleCancelEdit(target);
        break;
      case 'duplicate': {
        // Dupliceren (idee 85): de kopie opent meteen om aan te passen.
        let kopie = null;
        ObeyaState.mutate((ds) => { kopie = ObeyaData.duplicateItem(ds, target.dataset.type, target.dataset.id); }, 'dupliceren');
        if (kopie) {
          ObeyaState.select(target.dataset.type, kopie.id, 'edit');
          const veld = document.getElementById(target.dataset.type === 'action' ? 'f-title' : 'f-name');
          if (veld) { veld.focus(); if (veld.select) veld.select(); }
        }
        break;
      }
      case 'save':
        handleSave(target);
        break;
      case 'delete':
        handleDelete(target.dataset.type, target.dataset.id);
        break;
      case 'delete-note':
        if (confirmDialog('Deze notitie verwijderen?')) {
          ObeyaState.mutate((ds) => ObeyaData.deleteNote(ds, target.dataset.id), 'notitie verwijderen');
        }
        break;
      case 'delete-relation':
        if (confirmDialog('Deze relatie verwijderen?')) {
          ObeyaState.mutate((ds) => ObeyaData.deleteRelation(ds, target.dataset.id), 'relatie verwijderen');
        }
        break;
      case 'edit-note':
        ObeyaState.startEditNote(target.dataset.id);
        break;
      case 'cancel-note-edit':
        ObeyaState.stopEditNote();
        break;
      case 'import':
        document.getElementById('import-file').click();
        break;
      case 'export':
        ObeyaData.downloadDataset(ObeyaState.getDataset());
        break;
      case 'reset-data':
        ObeyaState.resetToExampleData(() =>
          confirmDialog('Dit vervangt de huidige data door de voorbeelddata uit data/obeya.json. Exporteer eerst als je wijzigingen wilt bewaren. Doorgaan?')
        );
        break;
      case 'undo':
        ObeyaState.undo();
        break;
      case 'hard-reset':
        if (confirmDialog('Alle lokaal in deze browser bewaarde Obeya-data wissen en opnieuw beginnen met de voorbeelddata? Dit kan niet ongedaan worden gemaakt.')) {
          ObeyaState.clearStoredData();
          window.location.reload();
        }
        break;
      case 'manage-owners':
        openSettings('owners');
        break;
      case 'manage-status-labels':
        openSettings('statusLabels');
        break;
      case 'git-configure':
        openSettings('team');
        break;
      case 'toggle-token-visibility': {
        // Even kunnen zien wat je geplakt hebt; puur in de DOM, want een
        // hertekening zou de knop toch weer op verborgen zetten.
        const veld = document.getElementById('f-git-token');
        if (!veld) break;
        const zichtbaar = veld.type === 'text';
        veld.type = zichtbaar ? 'password' : 'text';
        target.textContent = zichtbaar ? 'Tonen' : 'Verbergen';
        break;
      }
      case 'git-test':
        ObeyaState.testGitConnection();
        break;
      case 'git-replace-with-team':
        if (confirmDialog('Alles in deze browser vervangen door de laatste versie van het team?\n\nWijzigingen die je nog niet hebt gedeeld, gaan verloren. Ongedaan maken kan zolang je de pagina niet herlaadt; exporteer eerst als je ze wilt bewaren.')) {
          ObeyaState.replaceWithTeamVersion().then((res) => {
            if (!res.ok) alert('Overnemen mislukt: ' + H.gitErrorMessage(res.error, res.detail));
          });
        }
        break;
      case 'git-disconnect':
        if (confirmDialog('Verbinding met GitHub verwijderen? Het token wordt uit deze browser gewist.')) {
          ObeyaState.clearGitConfig();
        }
        break;
      case 'git-pull':
        handleGitPull();
        break;
      case 'git-push':
        handleGitPush();
        break;
      case 'set-canvas-lens':
        ObeyaState.setCanvasLens(target.dataset.lens);
        break;
      case 'canvas-focus':
        ObeyaState.toggleCanvasFocus(target.dataset.id);
        break;
      case 'canvas-open':
        ObeyaState.toggleCanvasOpen(target.dataset.id);
        break;
      case 'canvas-open-all': {
        const mode = target.dataset.mode;
        ObeyaState.setCanvasOpen(mode === 'none' ? [] : ObeyaCanvas.openableIds(ObeyaState.getDataset(), ObeyaState.getFilters(), mode === 'themes'));
        break;
      }
      case 'set-chain-layout':
        ObeyaState.setChainLayout(target.dataset.layout);
        break;
      case 'set-canvas-detail':
        ObeyaState.setCanvasDetail(target.dataset.detail);
        break;
      case 'canvas-expand':
        ObeyaState.toggleCanvasExpand(target.dataset.id);
        break;
      case 'canvas-fold':
        ObeyaState.toggleCanvasFold(target.dataset.id);
        break;
      case 'canvas-fold-all':
        ObeyaState.setCanvasFoldAll(target.dataset.mode === 'fold');
        break;
      case 'canvas-clear-focus':
        ObeyaState.toggleCanvasFocus(null);
        break;
      case 'canvas-zoom-in':
        ObeyaState.zoomIntoObjective(target.dataset.id);
        break;
      case 'canvas-zoom': {
        const z = ObeyaState.getCanvasState().zoom;
        if (target.dataset.zoom === 'in' || target.dataset.zoom === 'out') {
          // Rond het midden van het venster, net als het wiel rond de muis.
          const res = ObeyaCanvas.zoomAt(root, z + (target.dataset.zoom === 'in' ? 0.1 : -0.1));
          if (res) ObeyaState.rememberCanvasZoom(res.zoom, res.layoutWidth);
          ObeyaCanvas.drawConnections(root);
        } else ObeyaState.setCanvasZoom(ObeyaCanvas.fitZoom(root, { presentation: ObeyaState.isPresentationMode() }));
        break;
      }
      case 'toggle-presentation':
        ObeyaState.togglePresentationMode();
        // Op het canvas meteen passend maken voor het scherm waar het nu op
        // staat: groter in de kamermodus, terug naar normaal erbuiten.
        if (ObeyaState.getView() === 'canvas') {
          ObeyaState.setCanvasZoom(ObeyaState.isPresentationMode() ? ObeyaCanvas.fitZoom(root, { presentation: true }) : 1);
        }
        break;
      case 'set-zoom':
        ObeyaState.setZoomLevel(target.dataset.zoom);
        break;
      case 'set-chip-mode':
        ObeyaState.setChipFilterMode(target.dataset.chipMode);
        break;
      case 'set-matrix-mode':
        ObeyaState.setMatrixMode(target.dataset.matrixMode);
        break;
      case 'filter-theme-pair': {
        const ids = [target.dataset.themeA, target.dataset.themeB].filter(Boolean);
        ObeyaState.isolateThemes(ids);
        ObeyaState.setView('list');
        break;
      }
      case 'filter-owner-theme':
        ObeyaState.isolateThemes([target.dataset.themeId]);
        ObeyaState.setOwnerFilter(target.dataset.owner);
        ObeyaState.setView('list');
        break;
      case 'toggle-flag':
        ObeyaState.mutate((ds) => ObeyaData.toggleFlag(ds, target.dataset.id));
        break;
      // Wijzigingen bevestigen of afwijzen (stap 3 van het wijzigingslog).
      case 'confirm-change': {
        if (target.getAttribute('aria-disabled') === 'true') break;
        const res = ObeyaState.confirmChange(target.dataset.changeId);
        if (!res.ok) { alert(REVIEW_FOUT[res.error] || 'Bevestigen lukte niet.'); break; }
        focusAfterReview();
        break;
      }
      case 'toggle-history': {
        const sel = ObeyaState.getSelection();
        ObeyaState.updateSelectionContext({ history: !(sel && sel.context && sel.context.history) });
        const knop = document.getElementById('history-toggle');
        if (knop) knop.focus();
        break;
      }
      case 'set-timeline-mode':
        ObeyaState.setTimelineMode(target.dataset.mode);
        { const knop = root.querySelector(`[data-action="set-timeline-mode"][data-mode="${target.dataset.mode}"]`); if (knop) knop.focus(); }
        break;
      case 'finish-meeting': {
        const open = ObeyaHistory.pending(ObeyaState.getDataset().changeLog).length;
        if (open && !confirmDialog(`Er ${open === 1 ? 'staat nog 1 wijziging' : `staan nog ${open} wijzigingen`} te bevestigen. Toch afronden?`)) break;
        ObeyaState.finishMeeting();
        { const knop = root.querySelector('[data-action="finish-meeting"]'); if (knop) knop.focus(); }
        break;
      }
      case 'revert-change':
      case 'keep-change': {
        if (target.getAttribute('aria-disabled') === 'true') break;
        const id = target.dataset.changeId;
        const res = action === 'revert-change' ? ObeyaState.revertChange(id) : ObeyaState.keepRejectedChange(id);
        if (!res.ok && res.error !== 'changed-since') { alert(REVIEW_FOUT[res.error] || 'Dat lukte niet.'); break; }
        // Lukte terugdraaien niet, dan staat de uitleg bij de regel; anders door.
        if (!res.ok) { const k = root.querySelector(`[data-action="keep-change"][data-change-id="${id}"]`); if (k) k.focus(); break; }
        focusAfterReview();
        break;
      }
      case 'start-reject': {
        if (target.getAttribute('aria-disabled') === 'true') break;
        const id = target.dataset.changeId || null;
        const vorige = ObeyaState.getRejectingChange();
        ObeyaState.setRejectingChange(id);
        if (id) { const veld = document.getElementById('f-reject-reason'); if (veld) veld.focus(); }
        else { const knop = root.querySelector(`[data-action="start-reject"][data-change-id="${vorige}"]`); if (knop) knop.focus(); }
        break;
      }
      // Een signaal bij het formuleren wegklikken: stil zolang het formulier open is.
      case 'dismiss-signal': {
        const plek = document.getElementById(`${target.dataset.for}-signal`);
        if (plek) { plek.dataset.dismissed = '1'; plek.dataset.shown = ''; plek.innerHTML = ''; }
        const veld = document.getElementById(target.dataset.for);
        if (veld) veld.focus();
        break;
      }
      case 'toggle-chip': {
        if (openChipName() === target.dataset.chip) { closeChip(); break; }
        ObeyaState.updateSelectionContext({ chip: target.dataset.chip });
        const veld = root.querySelector(`#chip-panel-${target.dataset.chip} select, #chip-panel-${target.dataset.chip} input`);
        if (veld) veld.focus();
        break;
      }
      // Een eigenaar bewerken (naam, rollen, GitHub-login): open of dicht onder zijn regel.
      case 'edit-person': {
        const naam = target.dataset.owner;
        const open = (ObeyaState.getSelection().context || {}).person === naam;
        ObeyaState.updateSelectionContext({ person: open ? null : naam });
        if (open) focusPersonButton(naam);
        else { const veld = document.getElementById('f-person-name'); if (veld) veld.focus(); }
        break;
      }
      case 'rename-role': {
        const rol = ObeyaData.getRoles(ObeyaState.getDataset()).find((r) => r.id === target.dataset.role);
        if (!rol) break;
        const naam = window.prompt(`Nieuwe naam voor de rol "${rol.name}":`, rol.name);
        if (naam === null) break;
        let ok = null;
        ObeyaState.mutate((ds) => { ok = ObeyaData.updateRole(ds, rol.id, { name: naam }); }, 'rol hernoemd');
        if (!ok) alert('Geef een naam die nog niet als rol bestaat.');
        break;
      }
      case 'remove-role': {
        const ds0 = ObeyaState.getDataset();
        const rol = ObeyaData.getRoles(ds0).find((r) => r.id === target.dataset.role);
        if (!rol) break;
        const mensen = ObeyaData.getOwnerOptions(ds0).filter((o) => ObeyaData.getPerson(ds0, o).roles.includes(rol.id));
        const vraag = mensen.length
          ? `De rol "${rol.name}" verwijderen? ${mensen.join(', ')} ${mensen.length === 1 ? 'heeft' : 'hebben'} deze rol en ${mensen.length === 1 ? 'raakt hem' : 'raken hem'} kwijt.`
          : `De rol "${rol.name}" verwijderen?`;
        if (!confirmDialog(vraag)) break;
        ObeyaState.mutate((ds) => ObeyaData.removeRole(ds, rol.id), 'rol verwijderd');
        break;
      }
      case 'rename-role-group': {
        const groep = ObeyaData.getRoleGroups(ObeyaState.getDataset()).find((g) => g.id === target.dataset.group);
        if (!groep) break;
        const naam = window.prompt(`Nieuwe naam voor de groep "${groep.name}":`, groep.name);
        if (naam === null) break;
        let ok = null;
        ObeyaState.mutate((ds) => { ok = ObeyaData.updateRoleGroup(ds, groep.id, { name: naam }); }, 'groep hernoemd');
        if (!ok) alert('Geef een naam die nog niet als groep bestaat.');
        break;
      }
      case 'remove-role-group': {
        const groep = ObeyaData.getRoleGroups(ObeyaState.getDataset()).find((g) => g.id === target.dataset.group);
        if (!groep) break;
        if (!confirmDialog(`De groep "${groep.name}" verwijderen? De rollen zelf en wie al betrokken is, blijven staan.`)) break;
        ObeyaState.mutate((ds) => ObeyaData.removeRoleGroup(ds, groep.id), 'groep verwijderd');
        break;
      }
      case 'remove-owner': {
        const name = target.dataset.owner;
        if (!confirmDialog(H.removeOwnerWarning(ObeyaState.getDataset(), name))) break;
        ObeyaState.mutate((ds) => ObeyaData.removeOwner(ds, name, { clearFromItems: true }));
        break;
      }
      default:
        break;
    }
  });

  // Keyboard support: theme columns, board/list/matrix rows and item-list
  // rows are focusable (tabindex="0", role="button") but are not native
  // buttons, so Enter/Space need to trigger the same click behaviour.
  // Attached to document (not root) so Escape still works even if focus
  // ends up outside #app, e.g. on <body> right after a re-render.
  document.addEventListener('keydown', (e) => {
    // Ctrl/Cmd+Z draait de laatste wijziging terug — behalve in een tekstveld,
    // waar de browser zijn eigen ongedaan-maken heeft en die voorgaat.
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
      if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
      if (ObeyaState.canUndo()) {
        e.preventDefault();
        ObeyaState.undo();
      }
      return;
    }
    // De onderdelen van Instellingen: pijltjes omhoog/omlaag, Home en End.
    if (e.target.matches && e.target.matches('.settings__tab') && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
      const tabs = Array.from(root.querySelectorAll('.settings__tab'));
      const i = tabs.indexOf(e.target);
      const j = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : (i + (e.key === 'ArrowDown' ? 1 : -1) + tabs.length) % tabs.length;
      e.preventDefault();
      openSettings(tabs[j].dataset.section);
      return;
    }
    if (e.key === 'Escape') {
      // Het statuspaneel van het team sluit eerst, met de focus op de chip.
      const paneel = document.querySelector('.team-status__menu[open]');
      if (paneel) { paneel.open = false; paneel.querySelector('summary').focus(); return; }
      // De legenda van de rustige status, als de focus erin staat.
      const legenda = e.target.closest && e.target.closest('.status-legend[open]');
      if (legenda && !ObeyaState.isPresentationMode()) { legenda.open = false; legenda.querySelector('summary').focus(); return; }
      // Een open paneel onder een knop in de kopregel sluit eerst, en het veld
      // voor de reden van afwijzen ook.
      if (closeChip()) return;
      const afwijzen = ObeyaState.getRejectingChange();
      if (afwijzen) {
        ObeyaState.setRejectingChange(null);
        const knop = root.querySelector(`[data-action="start-reject"][data-change-id="${afwijzen}"]`);
        if (knop) knop.focus();
        return;
      }
      if (ObeyaState.getSelection()) { closeModal(); return; }
      if (ObeyaState.isFilterPanelOpen() && !ObeyaState.isPresentationMode()) {
        ObeyaState.toggleFilterPanel();
        const knop = document.getElementById('filter-toggle');
        if (knop) knop.focus({ preventScroll: true });
        return;
      }
      if (ObeyaState.getView() === 'canvas' && ObeyaState.getCanvasState().focusId) { ObeyaState.toggleCanvasFocus(null); return; }
      if (ObeyaState.getView() === 'canvas' && ObeyaState.getCanvasState().selecting) { ObeyaState.toggleCanvasSelecting(); const knop = root.querySelector('.canvas-controls [data-action="canvas-select-mode"]'); if (knop) knop.focus(); return; }
      if (ObeyaState.isPresentationMode()) { ObeyaState.togglePresentationMode(); return; }
      if (ObeyaState.getView() === 'help') { closeHelp(); return; }
      return;
    }
    // Op het Bord: Alt+pijltjes verschuiven een doel of een thema.
    if (e.altKey && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key) && ObeyaState.getView() === 'board' && !ObeyaState.getSelection()) {
      if (ObeyaWall.boardKeyMove(document.activeElement, e.key, wallApi)) e.preventDefault();
      return;
    }
    // Op de muur: Alt+↑ / Alt+↓ verschuift het briefje met de focus.
    if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown') && ObeyaState.getView() === 'canvas' && !ObeyaState.getSelection()) {
      if (ObeyaWall.keyMove(document.activeElement, e.key === 'ArrowUp' ? -1 : 1, wallApi)) e.preventDefault();
      return;
    }
    // Op het canvas: 1, 2 en 3 wisselen van lens, ook in de kamermodus.
    if (['1', '2', '3'].includes(e.key) && ObeyaState.getView() === 'canvas' && !ObeyaState.getSelection()
      && !['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) && !e.metaKey && !e.ctrlKey && !e.altKey) {
      ObeyaState.setCanvasLens({ 1: 'strategic', 2: 'operational', 3: 'chain' }[e.key]);
      return;
    }
    if (e.key === 'Enter' && e.target.matches && e.target.matches('[data-review-field]')) {
      commitReviewField(e.target);
      return;
    }
    if (e.key !== 'Enter' && e.key !== ' ') return;
    if (['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A'].includes(e.target.tagName)) return;
    const target = e.target.closest('[role="button"]');
    if (!target) return;
    e.preventDefault();
    target.click();
  });

  root.addEventListener('change', (e) => {
    if (e.target.matches('[data-canvas-group]')) {
      ObeyaState.setCanvasGroupBy(e.target.value);
      return;
    }
    if (e.target.matches('[data-show-all-changes]')) {
      const waar = e.target.dataset.showAllChanges;
      ObeyaState.setShowAllChanges(e.target.checked);
      const vinkje = root.querySelector(`[data-show-all-changes="${waar}"]`);
      if (vinkje) vinkje.focus();
      return;
    }
    if (e.target.matches('[data-me-pick]')) {
      ObeyaState.setMe(e.target.value || null);
      const veld = document.getElementById('f-me');
      if (veld) veld.focus();
      return;
    }
    if (e.target.matches('[data-canvas-select]')) {
      ObeyaState.toggleCanvasSelected(e.target.dataset.canvasSelect, e.target.checked);
      return;
    }
    if (e.target.matches('[data-bulk]')) {
      // Met de pijltjes door een dichte keuzelijst lopen geeft in sommige
      // browsers bij elke stap een change: dan pas bij Enter of bij verlaten.
      if (bulkPijltjes) return;
      applyBulkSelect(e.target);
      return;
    }
    if (e.target.matches('[data-group-role]')) {
      const id = e.target.dataset.groupRole;
      const rolId = e.target.value;
      const roleIds = Array.from(root.querySelectorAll(`[data-group-role="${CSS.escape(id)}"]:checked`), (i) => i.value);
      ObeyaState.mutate((ds) => ObeyaData.updateRoleGroup(ds, id, { roleIds }), 'rollen van een groep aangepast');
      const vinkje = root.querySelector(`[data-group-role="${CSS.escape(id)}"][value="${CSS.escape(rolId)}"]`);
      if (vinkje) vinkje.focus();
      return;
    }
    if (e.target.matches('[data-role-confirm]')) {
      const id = e.target.dataset.roleConfirm;
      const aan = e.target.checked;
      ObeyaState.mutate((ds) => ObeyaData.updateRole(ds, id, { canConfirm: aan }), aan ? 'rol mag bevestigen' : 'rol mag niet meer bevestigen');
      const vinkje = root.querySelector(`[data-role-confirm="${id}"]`);
      if (vinkje) vinkje.focus();
      return;
    }
    // Een resultaat van een ander doel: kiezen is toevoegen.
    if (e.target.matches('[data-mr-elsewhere-pick]')) {
      addElsewhere();
      return;
    }
    // Een andere soort: andere plekken om onder te hangen.
    if (e.target.matches('[data-inbox-type]')) {
      ObeyaState.updateSelectionContext({ ...inboxFields(), parentId: '' });
      return;
    }
    // Tekstvelden in de ronde slaan niet op bij "change": dan bouwt het
    // scherm opnieuw op tijdens het wegklikken en gaat de klik op "Volgende"
    // verloren. Ze worden weggeschreven bij elke stap, bij sluiten en hier,
    // vóórdat een keuzelijst het scherm opnieuw opbouwt.
    if (e.target.matches('[data-review-field], #rv-note')) return;
    if (e.target.id === 'rv-note-author') { H.setLastAuthor(e.target.value); return; }
    // (Ook als het scherm daarbij opnieuw wordt opgebouwd, houdt e.target
    // zijn gekozen waarde en data-attributen.)
    if (e.target.matches('[data-quick-status], [data-quick-owner]')) flushReviewFields();
    if (e.target.matches('[data-quick-status]')) {
      const { type, id } = e.target.dataset;
      const fns = {
        measurableResult: ObeyaData.updateMeasurableResult,
        project: ObeyaData.updateProject,
        action: ObeyaData.updateAction,
      };
      const fn = fns[type];
      // Gekozen in het paneel onder de knop: paneel dicht, focus terug op de knop.
      if (e.target.id === 'chip-status-select') {
        if (fn) ObeyaState.mutate((ds) => fn(ds, id, { status: e.target.value }), 'status aangepast');
        closeChip();
        return;
      }
      if (fn) ObeyaState.mutate((ds) => fn(ds, id, { status: e.target.value }));
      return;
    }
    // Betrokkenen via de knop in de kopregel (idee 74): elk vinkje slaat meteen op.
    if (e.target.matches('[data-quick-involved-panel] [data-involved]')) {
      const paneel = e.target.closest('[data-quick-involved-panel]');
      const { type, id } = paneel.dataset;
      const naam = e.target.value;
      const involved = Array.from(paneel.querySelectorAll('[data-involved]:checked')).map((i) => i.value);
      const fn = QUICK_UPDATE[type];
      if (fn) ObeyaState.mutate((ds) => fn(ds, id, { involved }), 'betrokkenen aangepast');
      const vinkje = Array.from(root.querySelectorAll('[data-quick-involved-panel] [data-involved]')).find((i) => i.value === naam);
      if (vinkje) vinkje.focus();
      return;
    }
    if (e.target.matches('[data-quick-owner]')) {
      const { type, id } = e.target.dataset;
      // Gekozen in het paneel onder de knop: paneel dicht, focus terug op de knop.
      if (e.target.id === 'chip-owner-select') {
        const fn = QUICK_UPDATE[type];
        if (fn) ObeyaState.mutate((ds) => fn(ds, id, { owner: e.target.value.trim() }), 'eigenaar aangepast');
        closeChip();
        return;
      }
      const fns = {
        objective: ObeyaData.updateObjective,
        measurableResult: ObeyaData.updateMeasurableResult,
        project: ObeyaData.updateProject,
        action: ObeyaData.updateAction,
      };
      const fn = fns[type];
      if (fn) ObeyaState.mutate((ds) => fn(ds, id, { owner: e.target.value.trim() }));
      return;
    }
    if (e.target.id === 'filter-owner') {
      ObeyaState.setOwnerFilter(e.target.value);
      return;
    }
    // Eigen afbeelding kiezen zonder dat er al een is: eerst een bestand.
    if (e.target.name === 'favicon' && e.target.value === 'custom'
      && !val('f-favicon-data') && ObeyaData.getFavicon(ObeyaState.getDataset()).kind !== 'custom') {
      document.getElementById('f-favicon-file').click();
      return;
    }
    if (e.target.id === 'f-favicon-file') {
      readFaviconFile(e.target.files && e.target.files[0]);
      e.target.value = '';
      return;
    }
    if (e.target.name === 'print-sheet') {
      syncPrintThemeChoice();
      return;
    }
    // Een eigen kleur kiezen betekent ook: de eigen kleur gebruiken.
    if (e.target.id === 'f-theme-color-custom') {
      const radio = root.querySelector('.modal input[name="theme-color"][value="custom"]');
      if (radio) radio.checked = true;
      return;
    }
    if (e.target.id === 'filter-principle') {
      ObeyaState.setPrincipleFilter(e.target.value);
      return;
    }
    if (e.target.id === 'filter-year') {
      ObeyaState.setYearFilter(e.target.value);
      return;
    }
    if (e.target.id === 'filter-quarter') {
      ObeyaState.setQuarterFilter(e.target.value);
      return;
    }
    if (e.target.id === 'filter-teamplan') {
      ObeyaState.setTeamPlanOnly(e.target.checked);
      return;
    }
    if (e.target.id === 'import-file' && e.target.files && e.target.files[0]) {
      handleImportFile(e.target.files[0]);
      e.target.value = '';
    }
  });

  // The board (theme columns) scrolls horizontally. A normal vertical mouse
  // wheel should keep scrolling the *page* as usual — trackpad users get
  // horizontal scroll natively from a two-finger swipe, and a mouse user
  // can drag the always-visible scrollbar added in css/styles.css. (An
  // earlier version of this hijacked every vertical wheel move over the
  // board into horizontal scroll, which broke scrolling the page — removed.)

  const debouncedSearch = H.debounce((value) => ObeyaState.setSearch(value), 200);
  // De relatiekeuze bevat elk item van het bord. Het zoekveld ernaast bouwt
  // de lijst opnieuw op uit het <template> met de volledige set, in plaats
  // van opties te verbergen: Safari negeert `hidden` op opties in een select.
  // Alle zoekwoorden moeten voorkomen, in het item of in de themanaam, dus
  // "mr wcag" geeft de meetbare resultaten over WCAG.
  function filterRelationOptions(input) {
    const select = document.getElementById(input.dataset.relationFilter);
    const template = document.querySelector(`template[data-relation-options="${input.dataset.relationFilter}"]`);
    if (!select || !template) return;
    const words = input.value.toLowerCase().split(/\s+/).filter(Boolean);
    const previous = select.value;
    const groups = [];
    let matches = 0;
    template.content.querySelectorAll('optgroup').forEach((group) => {
      const theme = group.label.toLowerCase();
      const options = Array.from(group.querySelectorAll('option'))
        .filter((o) => words.every((w) => o.textContent.toLowerCase().includes(w) || theme.includes(w)));
      if (!options.length) return;
      matches += options.length;
      const clone = group.cloneNode(false);
      options.forEach((o) => clone.appendChild(o.cloneNode(true)));
      groups.push(clone);
    });
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = words.length ? `${matches} gevonden — kies een item…` : 'Kies een item…';
    select.replaceChildren(placeholder, ...groups);
    if (matches === 1) select.value = select.querySelector('optgroup option').value;
    else if (previous && select.querySelector(`option[value="${CSS.escape(previous)}"]`)) select.value = previous;
  }

  // Zachte signalen bij het formuleren (ObeyaModal.formulationSignal), bij het
  // verlaten van het veld. Alleen bij een andere tekst opnieuw schrijven, anders
  // verdwijnt "Zo laten" onder de muis vandaan. Verlaat je het veld met een
  // klik, dan pas na die klik: anders schuift het formulier onder de muis en
  // valt een klik op bijv. Opslaan ernaast (review UX-designer).
  let muisIngedrukt = false;
  document.addEventListener('pointerdown', () => { muisIngedrukt = true; }, true);
  document.addEventListener('pointerup', () => { muisIngedrukt = false; }, true);
  root.addEventListener('focusout', (e) => {
    const plek = e.target.id ? document.getElementById(`${e.target.id}-signal`) : null;
    if (!plek || plek.dataset.dismissed) return;
    const html = ObeyaModal.signalHtml(plek.dataset.signal, e.target.value, e.target.id);
    if (plek.dataset.shown === html) return;
    const toon = () => { if (plek.dataset.dismissed) return; plek.dataset.shown = html; plek.innerHTML = html; };
    if (muisIngedrukt) document.addEventListener('pointerup', () => setTimeout(toon, 0), { once: true, capture: true });
    else toon();
  });

  root.addEventListener('input', (e) => {
    if (e.target.id === 'filter-search') {
      debouncedSearch(e.target.value);
    }
    if (e.target.matches('[data-relation-filter]')) {
      filterRelationOptions(e.target);
    }
    // Meerdere meetbare resultaten: de telling loopt mee. De tekst gaat stil
    // mee in het venster (zonder opnieuw te tekenen), zodat hij een
    // tussentijdse render overleeft.
    if (e.target.id === 'f-bulk-names') {
      const sel = ObeyaState.getSelection();
      if (sel && sel.type === 'bulkResults') {
        sel.context.text = e.target.value;
        const voorbeeld = document.getElementById('f-bulk-preview');
        if (voorbeeld) voorbeeld.textContent = ObeyaModal.bulkPreview(ObeyaState.getDataset(), sel.context.objectiveId, e.target.value, sel.context.measurableResultId || null);
      }
    }
  });

  // Muurvellen: de vellen buiten de app klaarzetten, het afdrukvenster openen
  // en daarna weer opruimen.
  // Het teamplan als dia's (js/deck.js), via dezelfde afdrukroute.
  function handlePrintDeck() {
    const html = ObeyaDeck.render(ObeyaState.getDataset());
    ObeyaState.closeSelection();
    ObeyaPrint.prepare(html, null, ObeyaDeck.pageCss());
    window.addEventListener('afterprint', () => ObeyaPrint.cleanup(), { once: true });
    window.print();
  }

  function handlePrintSheets(form) {
    const sheets = Array.from(form.querySelectorAll('input[name="print-sheet"]:checked')).map((i) => i.value);
    if (!sheets.length) { alert('Kies minstens één vel.'); return; }
    const format = val('f-print-format') || 'A1';
    const html = ObeyaPrint.render(ObeyaState.getDataset(), { sheets, format, themeId: val('f-print-theme') || null });
    ObeyaState.closeSelection();
    ObeyaPrint.prepare(html, format);
    window.addEventListener('afterprint', () => ObeyaPrint.cleanup(), { once: true });
    window.print();
  }

  // Een klik buiten het statuspaneel van het team sluit het.
  document.addEventListener('click', (e) => {
    const paneel = document.querySelector('.team-status__menu[open]');
    if (paneel && !paneel.contains(e.target)) paneel.open = false;
  });

  root.addEventListener('submit', (e) => {
    if (e.target.closest('[data-action="review-note"]')) {
      e.preventDefault();
      const note = document.getElementById('rv-note');
      if (note && note.value.trim()) addReviewNote(note.value);
      const n = document.getElementById('rv-note');
      if (n) n.focus();
      return;
    }
    if (e.target.closest('[data-action="review-start"]')) {
      e.preventDefault();
      ObeyaState.startReview({ themeId: val('rv-scope-theme'), owner: val('rv-scope-owner') });
      focusReviewItem();
      return;
    }

    const boardForm = e.target.closest('[data-action="save-board-settings"]');
    if (boardForm) {
      e.preventDefault();
      if (!val('f-board-name').trim()) { alert('Geef het bord een naam.'); return; }
      ObeyaState.mutate((ds) => {
        ObeyaData.setBoardSettings(ds, { name: val('f-board-name'), vision: val('f-board-vision') });
        // Alleen wat in het formulier stond: een principe dat intussen via het
        // team binnenkwam, staat er niet in en blijft zoals het is.
        ObeyaData.getPrinciples(ds).filter((p) => document.getElementById(`f-principle-name-${p.id}`)).forEach((p) => {
          ObeyaData.updatePrinciple(ds, p.id, { name: val(`f-principle-name-${p.id}`), description: val(`f-principle-desc-${p.id}`) });
        });
        root.querySelectorAll('.modal [data-principle-new]').forEach((rij) => {
          const veld = (naam) => (rij.querySelector(`[data-principle-field="${naam}"]`) || {}).value || '';
          ObeyaData.addPrinciple(ds, { name: veld('name'), description: veld('description') });
        });
        // Het pictogram, als dat in het formulier staat (in Instellingen).
        const icoon = root.querySelector('.modal input[name="favicon"]:checked');
        if (icoon && icoon.value !== ObeyaData.getFavicon(ds).kind || (icoon && icoon.value === 'custom' && val('f-favicon-data'))) {
          ObeyaData.setFavicon(ds, { kind: icoon.value, dataUrl: val('f-favicon-data') || ObeyaData.getFavicon(ds).href });
        }
      }, 'bord instellen');
      afterSettingsSave('Bord opgeslagen');
      return;
    }

    const displayForm = e.target.closest('[data-action="save-display-settings"]');
    if (displayForm) {
      e.preventDefault();
      const kleur = (k) => val(`f-display-color-${k}`);
      const fields = {
        stickyColors: (displayForm.querySelector('input[name="display-colors"]:checked') || {}).value,
        typeColors: { objective: kleur('objective'), measurableResult: kleur('measurableResult'), project: kleur('project'), action: kleur('action') },
        defaultDetail: val('f-display-detail'),
        tilt: !!document.getElementById('f-display-tilt').checked,
        chainLayout: val('f-display-layout'),
        hiddenViews: Array.from(displayForm.querySelectorAll('input[name="display-view"]:not(:checked)'), (i) => i.value),
        quietStatus: !!(document.getElementById('f-display-quiet') || {}).checked,
      };
      ObeyaState.mutate((ds) => ObeyaData.setDisplaySettings(ds, fields), 'weergave van de muur');
      // Het nieuwe standaardniveau en de nieuwe indeling meteen laten gelden.
      ObeyaState.setCanvasDetail(null);
      ObeyaState.setChainLayout(null);
      afterSettingsSave('Weergave opgeslagen');
      return;
    }

    if (e.target.closest('[data-action="inbox-new-form"]')) {
      e.preventDefault();
      const fields = { what: val('f-inbox-what'), why: val('f-inbox-why') };
      if (!fields.what.trim()) { ObeyaState.updateSelectionContext({ ...fields, error: 'Vul in wat het is.' }); return; }
      ObeyaState.updateSelectionContext({ ...fields, busy: true, error: '' });
      ObeyaState.addInboxItem(fields).then((res) => {
        if (res.ok) closeModal();
        else ObeyaState.updateSelectionContext({ busy: false, error: ObeyaInboxView.foutTekst(res) });
      });
      return;
    }
    const triageForm = e.target.closest('[data-action="inbox-triage-form"]');
    if (triageForm) {
      e.preventDefault();
      handleInboxTriage(triageForm);
      return;
    }

    const printForm = e.target.closest('[data-action="print-sheets-form"]');
    if (printForm) {
      e.preventDefault();
      handlePrintSheets(printForm);
      return;
    }
    const mergeForm = e.target.closest('[data-action="resolve-merge"]');
    if (mergeForm) {
      e.preventDefault();
      handleResolveMerge(mergeForm);
      return;
    }

    const noteForm = e.target.closest('[data-action="add-note"]');
    if (noteForm) {
      e.preventDefault();
      const text = val('f-note-text').trim();
      const author = val('f-note-author').trim();
      const type = val('f-note-type');
      if (!text || !author) return;
      H.setLastAuthor(author);
      const objectiveId = noteForm.dataset.objectiveId;
      const relatedItemId = noteForm.dataset.relatedId;
      ObeyaState.mutate((ds) => ObeyaData.createNote(ds, objectiveId, { text, author, type, relatedItemId }));
      return;
    }

    const relationForm = e.target.closest('[data-action="add-relation"]');
    if (relationForm) {
      e.preventDefault();
      const itemId = relationForm.dataset.itemId;
      const type = relationForm.dataset.relationType === 'related' ? 'related' : 'contributes';
      const select = relationForm.querySelector('select');
      const noteInput = relationForm.querySelector('input[type="text"]');
      const targetId = select ? select.value : '';
      if (!targetId) return;
      const note = noteInput ? noteInput.value.trim() : '';
      let created = null;
      ObeyaState.mutate((ds) => { created = ObeyaData.createRelation(ds, { from: itemId, to: targetId, type, note }); }, 'relatie toevoegen');
      if (!created) alert('Deze koppeling bestaat al.');
      return;
    }

    const statusLabelsForm = e.target.closest('[data-action="save-status-labels"]');
    if (statusLabelsForm) {
      e.preventDefault();
      const inputs = Array.from(statusLabelsForm.querySelectorAll('[data-status-label]'));
      ObeyaState.mutate((ds) => {
        inputs.forEach((inp) => {
          ObeyaData.setStatusLabel(ds, inp.dataset.entityType, inp.dataset.statusKey, inp.value);
        });
      });
      afterSettingsSave('Statuslabels opgeslagen');
      return;
    }

    const ownerForm = e.target.closest('[data-action="add-owner-form"]');
    if (ownerForm) {
      e.preventDefault();
      const name = val('f-new-owner').trim();
      if (!name) return;
      let ok = false;
      ObeyaState.mutate((ds) => { ok = ObeyaData.addOwner(ds, name); });
      if (!ok) alert('Deze eigenaar staat al in de lijst.');
      return;
    }

    const rejectForm = e.target.closest('[data-action="reject-change-form"]');
    if (rejectForm) {
      e.preventDefault();
      const res = ObeyaState.rejectChange(rejectForm.dataset.changeId, val('f-reject-reason'));
      if (!res.ok) {
        alert(REVIEW_FOUT[res.error] || 'Afwijzen lukte niet.');
        const veld = document.getElementById('f-reject-reason');
        if (veld) veld.focus();
        return;
      }
      focusAfterReview();
      return;
    }

    const roleForm = e.target.closest('[data-action="add-role-form"]');
    if (roleForm) {
      e.preventDefault();
      const name = val('f-new-role').trim();
      if (!name) return;
      let ok = null;
      ObeyaState.mutate((ds) => { ok = ObeyaData.addRole(ds, name); }, 'rol toegevoegd');
      if (!ok) alert('Deze rol staat al in de lijst.');
      else { const veld = document.getElementById('f-new-role'); if (veld) veld.focus(); }
      return;
    }

    const groupForm = e.target.closest('[data-action="add-role-group-form"]');
    if (groupForm) {
      e.preventDefault();
      const name = val('f-new-role-group').trim();
      if (!name) return;
      let ok = null;
      ObeyaState.mutate((ds) => { ok = ObeyaData.addRoleGroup(ds, name); }, 'groep toegevoegd');
      if (!ok) alert('Deze groep bestaat al.');
      else { const veld = document.getElementById('f-new-role-group'); if (veld) veld.focus(); }
      return;
    }

    const personForm = e.target.closest('[data-action="person-form"]');
    if (personForm) {
      e.preventDefault();
      const oud = personForm.dataset.owner;
      const naam = personForm.querySelector('input[name="name"]').value.trim();
      const roles = Array.from(personForm.querySelectorAll('input[name="role"]:checked')).map((i) => i.value);
      const github = personForm.querySelector('input[name="github"]').value;
      // Eerst controleren, zodat er niets half wordt opgeslagen.
      const ds0 = ObeyaState.getDataset();
      if (!naam) { alert('Geef een naam op.'); return; }
      if (naam !== oud && ObeyaData.getOwnerOptions(ds0).some((o) => o !== oud && o.toLowerCase() === naam.toLowerCase())) {
        alert('Er bestaat al een andere eigenaar met deze naam.');
        return;
      }
      const ander = ObeyaData.personForLogin(ds0, github);
      if (ander && ander !== oud) { alert(`Deze GitHub-login hoort al bij ${ander}.`); return; }
      const me = ObeyaState.getMe();
      ObeyaState.mutate((ds) => {
        if (naam !== oud) ObeyaData.renameOwner(ds, oud, naam);
        ObeyaData.setPerson(ds, naam, { roles, github });
      }, naam !== oud ? `eigenaar ${oud} wordt ${naam}` : `${naam} bewerkt`);
      // "Jij bent" gaat mee met de nieuwe naam.
      if (naam !== oud && me && me.source === 'chosen' && me.name === oud) ObeyaState.setMe(naam);
      ObeyaState.updateSelectionContext({ person: null });
      focusPersonButton(naam);
      afterSettingsSave(`${naam} opgeslagen`);
      return;
    }

    const gitConfigForm = e.target.closest('[data-action="git-save-config-form"]');
    if (gitConfigForm) {
      e.preventDefault();
      saveGitConfig();
      return;
    }

    const noteEditForm = e.target.closest('[data-action="save-note-edit"]');
    if (noteEditForm) {
      e.preventDefault();
      const id = noteEditForm.dataset.id;
      const text = val(`f-note-edit-text-${id}`).trim();
      const author = val(`f-note-edit-author-${id}`).trim();
      const type = val(`f-note-edit-type-${id}`);
      if (!text || !author) return;
      ObeyaState.mutate((ds) => ObeyaData.updateNote(ds, id, { text, author, type }));
      ObeyaState.stopEditNote();
      return;
    }
  });

  // -----------------------------------------------------------------------
  // Boot
  // -----------------------------------------------------------------------

  ObeyaState.subscribe(render);
  ObeyaState.init()
    .then(() => {
      applyUrl();
      adresActief = true;
      syncUrl(true);
      render();
      window.addEventListener('hashchange', () => {
        // Een adres dat de app zelf net zette, hoeft niet opnieuw te worden
        // toegepast (dat zou de focus van bijvoorbeeld een kop in Hulp wegnemen).
        if (location.hash === ObeyaRouter.toHash(huidigScherm())) return;
        applyUrl();
        syncUrl(true);
      });
    })
    .catch(showFatalError);
})();
