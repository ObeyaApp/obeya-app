// js/state.js
// Application state: holds the current dataset plus UI state (active view,
// filters, selection) that is not part of the domain model itself. Owns
// localStorage persistence so edits survive a page reload. Notifies
// subscribers (the render loop in app.js) after every change.
//
// UI code should read/mutate the Obeya dataset only through this module,
// never through ObeyaData directly, so persistence + re-render stay
// consistent.

const ObeyaState = (function () {
  'use strict';

  const STORAGE_KEY = 'obeya-poc-v1';
  const STORAGE_SAVED_AT_KEY = 'obeya-poc-v1-saved-at';

  let dataset = null;
  let listeners = [];
  let lastSavedAt = null;
  let restoredFromStorage = false;
  // Which dataset is currently active and why — shown in the toolbar so it's
  // never ambiguous whether you're looking at the example data, a restored
  // browser session, or a file you imported yourself.
  let source = { kind: 'seed', detail: null }; // kind: 'seed' | 'storage' | 'import' | 'git'
  // Git-databackend (idee 4+49, zie js/git-backend.js en docs/samenvoegen.md).
  // De "uitgangsversie" is de teamversie waar deze browser het laatst mee
  // gelijk liep: de sha (zodat GitHub een verouderde commit weigert) én de
  // inhoud (zodat bij een weigering per item kan worden samengevoegd). Die
  // staat in localStorage, naast de data zelf: stond hij alleen in het
  // geheugen, dan botste elke commit na het herladen van de pagina.
  const GIT_BASE_KEY = 'obeya-git-base';
  const MAX_PUSH_POGINGEN = 3;
  let gitStatus = { busy: false, lastError: null, lastSyncedAt: null, notice: null };
  // Een botsing die op een keuze wacht: { mode: 'pull' | 'push', base,
  // theirs, sha, conflicts, message }. Zolang die er is, toont de app het
  // keuzescherm (selection type 'gitConflict').
  let pendingMerge = null;
  let gitTestResult = null; // laatste testresultaat, alleen voor het configuratiescherm

  const filters = {
    themeIds: null, // null = all themes; otherwise a Set of theme ids
    status: null, // null = all statuses; otherwise a Set of status values
    owner: '', // '' = all owners
    teamPlanOnly: false,
    search: '',
    noteTypes: null, // null = all notitietypes; otherwise a Set (alleen relevant voor de Tijdlijn-weergave)
    year: null, // null = alle jaren; anders een getal
    quarter: null, // null = alle kwartalen; anders 1-4, los van year
    principle: '', // '' = alle; een principe-id; of NO_PRINCIPLE voor werk zonder principe
  };

  let view = 'board'; // 'board' | 'canvas' | 'list' | 'matrix' | 'execution' | 'timeline' | 'agenda' | 'documents' | 'help'
  // Bepaalt wat een eerste klik op een filterchip doet: 'exclude' (standaard,
  // huidig gedrag) start van "alles" en haalt het aangeklikte item weg;
  // 'include' start van "niets" en toont dan alleen wat je aanklikt (isoleren
  // in 1 klik i.p.v. N-1). Zie ROADMAP idee 36.
  let chipFilterMode = 'exclude';
  // Welke matrix de Verbindingen-weergave toont: 'theme' (gedeelde doelen
  // tussen thema's) of 'owner' (capaciteit: aantal items per eigenaar per
  // thema). Zie ROADMAP idee 47.
  let matrixMode = 'theme';
  let selection = null; // {type, id} of the item shown in the detail modal
  let editingNoteId = null; // id of the single note currently shown as an inline edit form
  let presentationMode = false; // "kamer-modus": chrome-loze, vergrote weergave
  let zoomLevel = 'detail'; // 'overview' | 'detail' — weergave-dichtheid op Bord/Lijst, zie ROADMAP idee 7/39
  // Weergave "Samenhang" (js/canvas.js): welke lens, hoe het werk gegroepeerd
  // is, welke keten oplicht en de zoomfactor. Net als het zoomniveau niet
  // bewaard: bij herladen weer het startbeeld.
  // detail: null = het standaardniveau uit de instellingen van het bord;
  // expanded/folded: opengeklikte briefjes en ingeklapte doelen in Keten.
  const canvas = { selecting: false, selected: new Set(), bulkNotice: '', bulkUndo: false, lens: 'strategic', groupBy: 'objective', focusId: null, zoom: 1, layoutWidth: null, scrollTo: null, detail: null, chainLayout: null, expanded: new Set(), folded: new Set(), opened: new Set(), centerMindmap: false };

  function subscribe(fn) {
    listeners.push(fn);
    return () => {
      listeners = listeners.filter((l) => l !== fn);
    };
  }

  function notify() {
    listeners.forEach((fn) => fn());
  }

  // De data onthoudt de hoogste app-versie die eraan werkte (nooit lager), en
  // neemt die mee bij delen en exporteren. Wie daarna met een oudere app de
  // teamdata ophaalt, krijgt de melding dat er een nieuwere versie is.
  // Samenvoegen neemt de hoogste en telt het niet als wijziging (merge.js).
  function stampAppVersion() {
    if (!dataset) return;
    dataset.meta = dataset.meta || {};
    if (ObeyaMerge.compareVersions(dataset.meta.version, OBEYA_APP_VERSION) < 0) dataset.meta.version = OBEYA_APP_VERSION;
  }

  function persist() {
    // Een ander tabblad heeft de opgeslagen data inmiddels gewijzigd: wat hier
    // staat is verouderd, en wegschrijven zou dat werk overschrijven.
    if (staleTab) return;
    stampAppVersion();
    try {
      lastSavedAt = new Date();
      localStorage.setItem(STORAGE_KEY, ObeyaData.exportDataset(dataset));
      // De uitgangsversie van déze pagina mee, zodat opgeslagen data en
      // uitgangsversie altijd bij elkaar horen (zie sessionBase).
      if (sessionBase !== undefined) storeGitBase();
      // Stored separately (not just kept in memory) so a reload can still
      // report an accurate "laatst lokaal opgeslagen" instead of wrongly
      // suggesting nothing has been saved yet.
      localStorage.setItem(STORAGE_SAVED_AT_KEY, lastSavedAt.toISOString());
    } catch (err) {
      console.warn('Kon wijzigingen niet lokaal opslaan (localStorage):', err);
    }
  }

  // Probeert de vorige sessie terug te halen. Lukt dat niet — onleesbaar,
  // afgekeurd door de validatie, of stuk bij het verwerken — dan geeft dit
  // false terug en start de app gewoon op de voorbeelddata. Vastlopen op oude
  // data zou de gebruiker opsluiten: zonder werkend scherm is er ook geen knop
  // meer om terug te zetten, en dan rest alleen nog browseropslag wissen.
  function restoreFromStorage() {
    let raw = null;
    try {
      raw = localStorage.getItem(STORAGE_KEY);
    } catch (err) {
      console.warn('Kon lokale opslag niet lezen:', err);
      return false;
    }
    if (!raw) return false;

    const parsed = ObeyaData.parseImport(raw);
    if (!parsed.ok) {
      console.warn('Opgeslagen data uit een eerdere sessie is niet bruikbaar; teruggevallen op de voorbeelddata:', parsed.errors);
      return false;
    }

    try {
      dataset = parsed.dataset;
      ObeyaData.recomputeRollups(dataset);
      ObeyaData.ensureConfig(dataset);
    } catch (err) {
      console.warn('Opgeslagen data uit een eerdere sessie kon niet worden verwerkt; teruggevallen op de voorbeelddata:', err);
      dataset = null;
      return false;
    }

    restoredFromStorage = true;
    source = { kind: 'storage', detail: null };
    try {
      const rawSavedAt = localStorage.getItem(STORAGE_SAVED_AT_KEY);
      const parsedSavedAt = rawSavedAt ? new Date(rawSavedAt) : null;
      if (parsedSavedAt && !isNaN(parsedSavedAt.getTime())) lastSavedAt = parsedSavedAt;
    } catch (err) {
      // no accurate timestamp available; save-indicator falls back to
      // "nog niet lokaal opgeslagen" until the next change, which is only
      // slightly misleading rather than wrong.
    }
    return true;
  }

  async function init() {
    stukken = leesStukken();
    if (ObeyaGitBackend.isConfigured()) loadInboxQuietly();
    if (!restoreFromStorage()) {
      restoredFromStorage = false;
      lastSavedAt = null;
      dataset = await ObeyaData.loadInitialDataset();
      source = { kind: 'seed', detail: null };
      ObeyaData.recomputeRollups(dataset);
      ObeyaData.ensureConfig(dataset);
    }
    filters.themeIds = null;
    filters.status = null;
    notify();
  }

  // Laatste redmiddel: alles wat deze browser lokaal bewaart weggooien, zodat
  // een volgende keer schoon wordt opgestart. Gebruikt door het foutscherm in
  // app.js wanneer zelfs het opstarten niet lukt.
  function clearStoredData() {
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(STORAGE_SAVED_AT_KEY);
    } catch (err) {
      console.warn('Kon lokale opslag niet wissen:', err);
    }
  }

  function getDataset() {
    return dataset;
  }

  function wasRestoredFromStorage() {
    return restoredFromStorage;
  }

  function getLastSavedAt() {
    return lastSavedAt;
  }

  function getDatasetSource() {
    return source;
  }

  // Werkte een nieuwere app al aan deze data (zie stampAppVersion), dan draait
  // hier een verouderde kopie van de app: die mist functies en kent misschien
  // niet alles wat er in de data staat. Oudere data is geen probleem, die zet
  // de app bij het inlezen om. Raakt de data niet aan, zie toolbar.js.
  function getVersionInfo() {
    const dataVersion = (dataset && dataset.meta && dataset.meta.version) || null;
    const mismatch = !!dataVersion && ObeyaMerge.compareVersions(dataVersion, OBEYA_APP_VERSION) > 0;
    return { mismatch, dataVersion, appVersion: OBEYA_APP_VERSION };
  }

  // --- ongedaan maken ------------------------------------------------------
  // Elke wijziging gaat direct naar de lokale opslag, dus zonder dit is een
  // per ongeluk verwijderd thema (met alle doelen, resultaten, projecten,
  // acties en notities eronder) definitief weg, ook na herladen. Een stapel
  // momentopnames in het geheugen is genoeg om dat op te vangen; ze overleven
  // bewust geen herladen — dan is de vorige stand immers al opgeslagen.

  const UNDO_LIMIT = 10;
  let undoStack = [];

  function pushUndo(label) {
    if (!dataset) return null;
    const stap = {
      snapshot: JSON.stringify(dataset),
      source: { kind: source.kind, detail: source.detail },
      label: label || 'laatste wijziging',
    };
    undoStack.push(stap);
    if (undoStack.length > UNDO_LIMIT) undoStack.shift();
    return stap;
  }

  function canUndo() {
    return undoStack.length > 0;
  }

  // Waar de knop "ongedaan maken" naar verwijst, zodat er staat wát er wordt
  // teruggedraaid in plaats van alleen dát er iets wordt teruggedraaid.
  function getUndoLabel() {
    return undoStack.length ? undoStack[undoStack.length - 1].label : null;
  }

  function undo() {
    // Tijdens de beoordelingsronde zou ongedaan maken stil een eerder item
    // terugdraaien en de ronde sluiten. Pas na het sluiten van de ronde.
    if (reviewOpen()) return false;
    const vorige = undoStack.pop();
    if (!vorige) return false;
    // Het log groeit alleen (besluit David, 6 nov 2026): ongedaan maken
    // haalt geen regels weg, maar wordt zelf een regel, en de regel die
    // ongedaan wordt gemaakt hoeft niet meer bevestigd te worden.
    const nu = dataset;
    const logNu = Array.isArray(nu.changeLog) ? nu.changeLog : [];
    dataset = JSON.parse(vorige.snapshot);
    // Het log van toen en van nu samen, op id (de versie van nu wint): ook
    // na het ongedaan maken van importeren of de voorbeelddata, die het
    // bord met log en al vervingen, komt het oude log terug.
    const samen = new Map();
    (Array.isArray(dataset.changeLog) ? dataset.changeLog : []).forEach((c) => { if (c && c.id) samen.set(c.id, c); });
    logNu.forEach((c) => { if (c && c.id) samen.set(c.id, c); });
    const teruggedraaid = vorige.entryId && samen.has(vorige.entryId) ? [samen.get(vorige.entryId)] : [];
    teruggedraaid.forEach((c) => { if (c.review && c.review.status === 'pending') c.review = { status: 'undone' }; });
    // Was de stap een terugdraai (stap 4), dan staat de afgewezen wijziging
    // weer op het bord: weer klaar om terug te draaien of te laten staan.
    teruggedraaid.forEach((c) => {
      const bron = c.revertOf && samen.get(c.revertOf);
      if (bron && bron.review) { const { reverted, ...rest } = bron.review; bron.review = rest; }
    });
    if (samen.size) dataset.changeLog = Array.from(samen.values()).sort((a, b) => String(a.at || '').localeCompare(String(b.at || '')));
    source = vorige.source;
    ObeyaData.recomputeRollups(dataset);
    ObeyaData.ensureConfig(dataset);
    const ongedaan = legVast(nu, `ongedaan gemaakt: ${vorige.label}`, { needsConfirmation: false });
    if (ongedaan && teruggedraaid.length) ongedaan.undoOf = teruggedraaid.map((c) => c.id);
    // Het item dat openstond kan net zijn verdwenen of teruggekomen; sluiten
    // is voorspelbaarder dan een detailscherm van iets dat er niet meer is.
    selection = null;
    editingNoteId = null;
    persist();
    notify();
    return true;
  }

  // "Jij bent" (stap 2 van docs/wijzigingslog-plan.md): wie er in deze
  // browser werkt, als naam uit de eigenarenlijst. Alleen in deze browser,
  // nooit in de bordgegevens. Zonder eigen keuze: de persoon die in
  // Instellingen bij je GitHub-login hoort.
  const ME_KEY = 'obeya-jij-bent';

  function gitLogin() {
    const id = typeof ObeyaGitBackend.getIdentity === 'function' ? ObeyaGitBackend.getIdentity() : null;
    return id && id.login ? id.login : '';
  }

  // { name, source: 'chosen' | 'github' } of null.
  function getMe() {
    let gekozen = '';
    try { gekozen = localStorage.getItem(ME_KEY) || ''; } catch (err) { /* geblokkeerd: dan niet gekozen */ }
    const owners = ObeyaData.getOwnerOptions(dataset);
    if (gekozen && owners.includes(gekozen)) return { name: gekozen, source: 'chosen' };
    const viaGit = ObeyaData.personForLogin(dataset, gitLogin());
    return viaGit ? { name: viaGit, source: 'github' } : null;
  }

  function setMe(name) {
    try {
      if (name) localStorage.setItem(ME_KEY, name);
      else localStorage.removeItem(ME_KEY);
    } catch (err) { /* geblokkeerd: dan alleen tot herladen niet bewaard */ }
    notify();
  }

  // Wie deze wijziging deed, voor het log: de persoon ("jij bent") en de
  // GitHub-login, voor zover bekend.
  function wieDoetHet() {
    const login = gitLogin();
    const me = getMe();
    if (!login && !me) return null;
    return { ...(login ? { login } : {}), ...(me ? { person: me.name } : {}) };
  }

  // Wrap a mutation: run it against the live dataset, recompute the theme
  // and objective status roll-ups, persist, then notify subscribers.

  // Eén regel in het log voor de stap van `voor` naar het huidige bord
  // (idee 70). Fouten in het vastleggen mogen een wijziging nooit tegenhouden.
  function legVast(voor, label, opts) {
    try {
      const regel = ObeyaHistory.makeEntry(voor, dataset, { label, by: wieDoetHet(), ...(opts || {}) });
      if (!regel) return null;
      dataset.changeLog = (Array.isArray(dataset.changeLog) ? dataset.changeLog : []).concat(regel);
      return regel;
    } catch (err) {
      console.warn('Wijziging kon niet in het log:', err);
      return null;
    }
  }

  // opts gaat naar het log (bijv. { needsConfirmation: false }).
  function mutate(fn, undoLabel, opts) {
    const stap = pushUndo(undoLabel);
    const result = fn(dataset);
    ObeyaData.recomputeRollups(dataset);
    ObeyaData.ensureConfig(dataset);
    // Eén regel per aanroep, ook als fn meerdere stappen deed. De stap
    // onthoudt welke regel erbij hoort, zodat ongedaan maken alleen die
    // markeert (en niet bijv. regels die een collega intussen deelde).
    if (stap) {
      const regel = legVast(JSON.parse(stap.snapshot), undoLabel, opts);
      if (regel) stap.entryId = regel.id;
    }
    // "Peildatum": de inhoudelijke actualiteit van de Obeya zelf, los van het
    // technische opslag-tijdstip in de save-indicator — zie ROADMAP.md idee 30.
    if (dataset.meta) dataset.meta.lastUpdated = new Date().toISOString().slice(0, 10);
    persist();
    notify();
    return result;
  }

  function resetToExampleData(confirmFn) {
    if (confirmFn && !confirmFn()) return false;
    ObeyaData.loadInitialDataset().then((fresh) => {
      pushUndo('terug naar voorbeelddata');
      dataset = fresh;
      source = { kind: 'seed', detail: null };
      ObeyaData.recomputeRollups(dataset);
      ObeyaData.ensureConfig(dataset);
      persist();
      notify();
    });
    return true;
  }

  function importDataset(jsonText) {
    const parsed = ObeyaData.parseImport(jsonText);
    if (!parsed.ok) return parsed;
    const applied = applyImportedDataset(parsed.dataset, null);
    return applied.ok ? parsed : { ok: false, errors: ['Het bestand kon niet worden toegepast: ' + applied.error.message] };
  }

  // Used once a to-be-imported dataset has already been parsed, validated
  // and confirmed by the user (see app.js) so import never silently
  // overwrites the current data. `detail` is the imported file's name, for
  // display in the toolbar.
  //
  // De dataset wordt pas definitief nadat de afgeleide bewerkingen zijn
  // gelukt. Gaat er iets mis, dan draaien we terug naar wat er stond: een
  // half toegepaste import liet de app eerder achter met data die nergens
  // meer mee te bewerken was, ook na herladen.
  // Eén veilige route om de hele dataset te vervangen, gebruikt door zowel
  // Importeren als Ophalen van team. De nieuwe versie wordt eerst
  // gecontroleerd en aangevuld, pas daarna toegewezen, en bij een fout gaat
  // alles terug naar wat er stond — een half toegepaste vervanging liet de
  // app eerder achter met data die nergens meer mee te bewerken was. Er komt
  // ook een ongedaan-maken-punt bij, zodat vervangen nooit eenrichtingsverkeer
  // is.
  function applyDataset(candidate, nextSource, undoLabel) {
    const errors = ObeyaData.validateDataset(candidate);
    if (errors.length) return { ok: false, errors };

    const genormaliseerd = ObeyaData.normalizeDataset(candidate);
    const previousDataset = dataset;
    const previousSource = source;
    pushUndo(undoLabel);
    try {
      dataset = genormaliseerd.dataset;
      source = nextSource;
      ObeyaData.recomputeRollups(dataset);
      ObeyaData.ensureConfig(dataset);
      persist();
    } catch (err) {
      dataset = previousDataset;
      source = previousSource;
      undoStack.pop(); // er valt niets terug te draaien: er is niets veranderd
      console.error('Nieuwe dataset kon niet worden toegepast:', err);
      return { ok: false, error: err, errors: [err.message] };
    }
    return { ok: true, warnings: genormaliseerd.warnings };
  }

  function applyImportedDataset(parsedDataset, detail) {
    const resultaat = applyDataset(parsedDataset, { kind: 'import', detail: detail || null }, 'importeren');
    notify();
    return resultaat;
  }

  // --- git-databackend (idee 4+49) ----------------------------------------

  function isGitConfigured() {
    return ObeyaGitBackend.isConfigured();
  }

  function getGitStatus() {
    return gitStatus;
  }

  function getGitTestResult() {
    return gitTestResult;
  }

  function saveGitConfig(fields) {
    ObeyaGitBackend.setConfig(fields);
    gitTestResult = null;
    notify();
  }

  function clearGitConfig() {
    clearGitBase();
    ObeyaGitBackend.clearConfig();
    gitTestResult = null;
    notify();
  }

  async function testGitConnection() {
    gitTestResult = { busy: true };
    notify();
    gitTestResult = await ObeyaGitBackend.testConnection();
    // Ook als het repo onbereikbaar is, is het token zelf geldig en weten we
    // dus wie er achter zit; bij een geweigerd token juist niet meer.
    if (gitTestResult.username) {
      ObeyaGitBackend.setIdentity({ login: gitTestResult.username, name: gitTestResult.name });
    } else if (gitTestResult.error === 'invalid-token') {
      ObeyaGitBackend.setIdentity(null);
    }
    notify();
    return gitTestResult;
  }

  // Wie er deelt: de GitHub-gebruiker achter het ingestelde token, of null
  // als dat (nog) niet bekend is. Commits komen via de API vanzelf op diens
  // naam; dit is er om dat vooraf te laten zien.
  function getGitIdentity() {
    return ObeyaGitBackend.getIdentity();
  }

  // --- uitgangsversie ---------------------------------------------------------

  // Per repo, branch en pad: wie van repo wisselt, begint niet met de
  // uitgangsversie van een ander repo.
  function repoKey() {
    const cfg = ObeyaGitBackend.getConfig();
    return cfg ? `${cfg.owner}/${cfg.repo}@${cfg.branch}:${cfg.path}` : null;
  }

  // De uitgangsversie hoort bij de data van déze pagina. Twee tabbladen in
  // dezelfde browser delen één localStorage: las elk tabblad de uitgangsversie
  // telkens opnieuw uit de opslag, dan kon tabblad A die verschuiven naar een
  // nieuwere teamversie terwijl tabblad B nog op de oudere werkte. B's commit
  // zag er dan uit als "voortbouwend op de laatste versie" en overschreef A's
  // wijziging stil. Daarom houdt elke pagina zijn eigen uitgangsversie in het
  // geheugen (sessionBase), leest hij de opslag alleen bij het opstarten, en
  // schrijft hij hem altijd samen met de eigen data weg (persist): na herladen
  // horen data en uitgangsversie dus bij elkaar.
  let sessionBase; // undefined = nog niet gelezen; null = geen uitgangsversie

  // Twee tabbladen in één browser delen de opslag; wie het laatst schrijft,
  // wint. Ziet dit tabblad (via het storage-event) dat een ander tabblad de
  // data of de uitgangsversie heeft gewijzigd, dan is wat hier staat
  // verouderd: niets meer wegschrijven, niet meer ophalen of delen, en om
  // herladen vragen (zie de melding in de toolbar).
  let staleTab = false;

  function noticeStorageChange(key) {
    if (staleTab || (key !== STORAGE_KEY && key !== GIT_BASE_KEY)) return;
    staleTab = true;
    notify();
  }

  function isStaleTab() {
    return staleTab;
  }

  if (typeof window !== 'undefined' && window && typeof window.addEventListener === 'function') {
    window.addEventListener('storage', (e) => noticeStorageChange(e.key));
  }

  // Meldingen van het controleren en aanvullen bij het inlezen (normalizeDataset)
  // tijdens ophalen, samenvoegen of delen; ze komen in de statusregel, net als
  // bij importeren.
  let gitWaarschuwingen = [];
  function gitApply(candidate, label) {
    const res = applyDataset(candidate, { kind: 'git', detail: null }, label);
    if (res.ok && res.warnings && res.warnings.length) gitWaarschuwingen = gitWaarschuwingen.concat(res.warnings);
    return res;
  }
  function metWaarschuwingen(tekst) {
    const w = gitWaarschuwingen;
    gitWaarschuwingen = [];
    return w.length ? `${tekst}. Let op: ${w.join(' ')}` : tekst;
  }
  const staleFout = () => gitFout({ ok: false, error: 'stale-tab' });

  function readGitBaseFromStorage() {
    try {
      const raw = localStorage.getItem(GIT_BASE_KEY);
      if (!raw) return null;
      const base = JSON.parse(raw);
      if (!base || !base.repo || !base.sha || !base.dataset) return null;
      return base;
    } catch (err) {
      return null;
    }
  }

  function readGitBase() {
    if (sessionBase === undefined) sessionBase = readGitBaseFromStorage();
    return sessionBase && sessionBase.repo === repoKey() ? sessionBase : null;
  }

  function storeGitBase() {
    try {
      if (sessionBase) localStorage.setItem(GIT_BASE_KEY, JSON.stringify(sessionBase));
      else localStorage.removeItem(GIT_BASE_KEY);
    } catch (err) {
      console.warn('Kon de uitgangsversie van het team niet bewaren:', err);
    }
  }

  function writeGitBase(sha, ds) {
    sessionBase = { repo: repoKey(), sha, dataset: ds };
    storeGitBase();
  }

  function clearGitBase() {
    sessionBase = null;
    storeGitBase();
  }

  // De teamversie in precies de vorm waarin de app hem zelf zou bewaren, zodat
  // vergelijken met de eigen data geen schijnverschillen oplevert.
  function canonical(candidate) {
    const errors = ObeyaData.validateDataset(candidate);
    if (errors.length) return { ok: false, errors };
    const norm = ObeyaData.normalizeDataset(candidate);
    const ds = norm.dataset;
    // Wat hier is aangevuld of opgeschoond, hoort in de melding (zie gitApply).
    if (norm.warnings.length) gitWaarschuwingen = gitWaarschuwingen.concat(norm.warnings);
    ObeyaData.recomputeRollups(ds);
    ObeyaData.ensureConfig(ds);
    return { ok: true, dataset: ds };
  }

  // Heeft deze browser wijzigingen die het team nog niet heeft? Zonder bekende
  // uitgangsversie valt dat niet te zeggen, en dan is het antwoord nee.
  function hasUnsharedChanges() {
    const base = readGitBase();
    return !!(base && dataset && ObeyaMerge.changesBetween(base.dataset, dataset) > 0);
  }

  // Hoeveel er op dit bord anders is dan in de voorbeelddata: eigen werk dat
  // verloren gaat als ophalen het bord vervangt. Zonder voorbeelddata om mee
  // te vergelijken telt elk bord als eigen werk.
  function eigenWerkTenOpzichteVanVoorbeeld() {
    const demo = demoDataset();
    if (!dataset) return 0;
    if (!demo) return 1;
    // Zoals de app een bord laadt, zodat alleen echte wijzigingen tellen.
    ObeyaData.recomputeRollups(demo);
    ObeyaData.ensureConfig(demo);
    return ObeyaMerge.changesBetween(demo, dataset);
  }

  function hasGitBase() {
    return !!readGitBase();
  }

  function getPendingMerge() {
    return pendingMerge;
  }

  function setGitStatus(fields) {
    gitStatus = { ...gitStatus, ...fields };
  }

  function gitFout(result) {
    setGitStatus({ busy: false, lastError: result.error, lastErrorDetail: result.detail, notice: null });
    notify();
    return result;
  }

  function teamwijzigingenTekst(n) {
    return n === 1 ? '1 wijziging van het team meegenomen' : `${n} wijzigingen van het team meegenomen`;
  }

  // Wacht op een keuze van de gebruiker: het keuzescherm gaat open.
  function wachtOpKeuze(info) {
    pendingMerge = info;
    selection = { type: 'gitConflict', id: null, mode: 'view', context: {} };
    setGitStatus({ busy: false, lastError: null, notice: null });
    notify();
    return { ok: false, error: 'needs-resolution', conflicts: info.conflicts.length };
  }

  // --- ophalen ---------------------------------------------------------------

  // Haalt de teamversie op. Heb je zelf niets gewijzigd sinds de vorige keer,
  // dan wordt die gewoon overgenomen. Heb je dat wel, dan wordt per item
  // samengevoegd: jouw niet-gedeelde wijzigingen blijven staan, die van het
  // team komen erbij, en alleen bij een echte botsing kies je zelf.
  //
  // opts.confirmReplace(n): wordt alleen aangeroepen als ophalen dit bord
  // helemaal vervangt (eerste keer, zonder uitgangsversie) terwijl er n eigen
  // wijzigingen op staan ten opzichte van de voorbeelddata. Geeft die false
  // terug, dan blijft alles zoals het was.
  async function pullFromGit(opts) {
    if (staleTab) return staleFout();
    if (reviewOpen()) return { ok: false, error: 'review-open' };
    setGitStatus({ busy: true, lastError: null, notice: null });
    notify();
    const result = await ObeyaGitBackend.loadRemoteDataset();
    if (!result.ok) return gitFout(result);
    const theirs = canonical(result.dataset);
    if (!theirs.ok) {
      return gitFout({ ok: false, error: 'invalid-data', detail: (theirs.errors || []).join(' ') });
    }

    const base = readGitBase();
    // Overnemen als er niets eigens te bewaren valt: geen eigen wijzigingen,
    // of zonder uitgangsversie een bord dat niets met het teambord gemeen
    // heeft (de voorbeelddata, ook als die na herladen "hersteld uit deze
    // browser" heet). Samenvoegen zou dan twee borden door elkaar halen.
    const zonderEigenWerk = base
      ? !hasUnsharedChanges()
      : source.kind === 'seed' || ObeyaMerge.sharedItems(dataset, theirs.dataset) === 0;
    if (zonderEigenWerk) {
      const eigen = base ? 0 : eigenWerkTenOpzichteVanVoorbeeld();
      if (eigen > 0 && opts && opts.confirmReplace && !opts.confirmReplace(eigen)) {
        setGitStatus({ busy: false });
        notify();
        return { ok: false, error: 'cancelled' };
      }
      const toegepast = gitApply(theirs.dataset, 'ophalen van team');
      if (!toegepast.ok) return gitFout({ ok: false, error: 'invalid-data', detail: (toegepast.errors || []).join(' ') });
      writeGitBase(result.sha, JSON.parse(JSON.stringify(dataset)));
      setGitStatus({ busy: false, lastError: null, lastSyncedAt: new Date(), notice: metWaarschuwingen('Laatste versie van het team opgehaald') });
      notify();
      loadInboxQuietly();
      return { ok: true, warnings: toegepast.warnings };
    }

    // Zonder uitgangsversie (data van vóór deze versie van de app, of een
    // import) wordt niets als verwijderd gezien en botst elk verschil: veilig.
    const samen = ObeyaMerge.merge3(base ? base.dataset : null, dataset, theirs.dataset);
    if (samen.conflicts.length) {
      return wachtOpKeuze({ mode: 'pull', base: base ? base.dataset : null, theirs: theirs.dataset, sha: result.sha, conflicts: samen.conflicts, theirsChanges: samen.theirsChanges });
    }
    const toegepast = gitApply(samen.dataset, 'ophalen van team (samengevoegd)');
    if (!toegepast.ok) return gitFout({ ok: false, error: 'invalid-data', detail: (toegepast.errors || []).join(' ') });
    writeGitBase(result.sha, theirs.dataset);
    setGitStatus({ busy: false, lastError: null, lastSyncedAt: new Date(), notice: metWaarschuwingen(`${teamwijzigingenTekst(samen.theirsChanges)}; jouw wijzigingen zijn nog niet gedeeld`) });
    notify();
    loadInboxQuietly();
    return { ok: true, mergedFromTeam: samen.theirsChanges, warnings: toegepast.warnings };
  }

  // Herstel: de data in deze browser vervangen door de teamversie, zonder
  // samenvoegen. Eigen niet-gedeelde wijzigingen verdwijnen (de UI vraagt om
  // bevestiging); ongedaan maken kan, zolang de pagina openstaat.
  async function replaceWithTeamVersion() {
    if (staleTab) return staleFout();
    setGitStatus({ busy: true, lastError: null, notice: null });
    notify();
    const result = await ObeyaGitBackend.loadRemoteDataset();
    if (!result.ok) return gitFout(result);
    const theirs = canonical(result.dataset);
    if (!theirs.ok) return gitFout({ ok: false, error: 'invalid-data', detail: (theirs.errors || []).join(' ') });
    const toegepast = gitApply(theirs.dataset, 'teamversie overgenomen');
    if (!toegepast.ok) return gitFout({ ok: false, error: 'invalid-data', detail: (toegepast.errors || []).join(' ') });
    writeGitBase(result.sha, JSON.parse(JSON.stringify(dataset)));
    pendingMerge = null;
    selection = null;
    setGitStatus({ busy: false, lastError: null, lastSyncedAt: new Date(), notice: metWaarschuwingen('Teamversie overgenomen') });
    notify();
    return { ok: true };
  }

  // --- delen -----------------------------------------------------------------

  // Committeert de huidige dataset. Weigert GitHub dat omdat iemand anders
  // ondertussen deelde, dan wordt diens versie opgehaald, per item
  // samengevoegd en opnieuw geprobeerd — en alleen bij een echte botsing
  // gevraagd wat er moet gebeuren.
  // --- de inbox voor nieuw werk (js/inbox.js) --------------------------------
  // Issues met het label "inbox" in het data-repo. Landen en samenvoegen
  // veranderen het bord: dat wordt eerst gedeeld, en pas als dat gelukt is
  // wordt het issue gesloten. Zo kan een issue nooit dicht zijn terwijl het
  // item alleen in deze browser staat. Parkeren en afwijzen raken alleen het
  // issue.

  let inbox = { items: [], loading: false, error: null, fetchedAt: null };

  function getInbox() {
    return inbox;
  }

  async function loadInbox() {
    if (!ObeyaGitBackend.isConfigured()) {
      inbox = { items: [], loading: false, error: null, fetchedAt: null };
      notify();
      return { ok: false, error: 'not-configured' };
    }
    inbox = { ...inbox, loading: true, error: null };
    notify();
    const res = await ObeyaGitBackend.listInboxIssues();
    inbox = res.ok
      ? { items: ObeyaInbox.fromIssues(res.issues), loading: false, error: null, fetchedAt: new Date() }
      : { ...inbox, loading: false, error: res.error };
    notify();
    return res;
  }

  // Op de achtergrond (na opstarten en ophalen): een fout komt in de inbox
  // terecht, nooit in het ophalen van het bord zelf.
  function loadInboxQuietly() {
    if (typeof ObeyaGitBackend.listInboxIssues !== 'function') return;
    loadInbox().catch((err) => {
      inbox = { ...inbox, loading: false, error: 'network' };
      console.warn('Inbox kon niet worden opgehaald:', err);
      notify();
    });
  }

  function wieBenIk() {
    const id = ObeyaGitBackend.getIdentity();
    return id ? id.login : '';
  }

  async function addInboxItem(fields) {
    const issue = ObeyaInbox.newIssue({ ...fields, login: wieBenIk() });
    if (!issue) return { ok: false, error: 'empty' };
    const res = await ObeyaGitBackend.createIssue(null, issue);
    if (res.ok) await loadInbox();
    return res;
  }

  // Het item (of de notitie, na samenvoegen) op het bord dat uit dit
  // inbox-issue is ontstaan, als het er al is.
  function landedFromInbox(number) {
    let gevonden = null;
    (dataset ? dataset.themes : []).forEach((t) => {
      if (t.inboxIssue === number) gevonden = gevonden || t;
      t.objectives.forEach((o) => {
        [o, ...o.measurableResults, ...o.projects, ...o.projects.flatMap((p) => p.actions || []), ...(o.actions || []), ...(o.notes || [])]
          .forEach((x) => { if (x.inboxIssue === number && !gevonden) gevonden = x; });
      });
    });
    return gevonden;
  }

  // Vlak vóór landen of samenvoegen: staat het issue nog open (niet al door
  // een collega besloten), en heeft het team het niet al op het bord gezet?
  // Daarvoor eerst de teamversie ophalen; zo ontstaat geen tweede kopie als
  // twee mensen tegelijk hetzelfde item landen.
  async function nogTeBesluiten(item) {
    if (typeof ObeyaGitBackend.getIssue === 'function') {
      const actueel = await ObeyaGitBackend.getIssue(null, item.number);
      if (!actueel.ok) return actueel;
      if (actueel.issue.state === 'closed') { await loadInbox(); return { ok: false, error: 'already-decided' }; }
    }
    const opgehaald = await pullFromGit();
    if (!opgehaald.ok) return { ok: false, error: 'pull-failed', shareError: opgehaald.error };
    if (landedFromInbox(item.number)) return { ok: false, error: 'already-landed' };
    return { ok: true };
  }

  async function closeWithComment(number, comment, reason) {
    const c = await ObeyaGitBackend.commentIssue(null, number, comment);
    if (!c.ok) return c;
    return ObeyaGitBackend.updateIssue(null, number, { state: 'closed', state_reason: reason || 'completed' });
  }

  async function shareThenClose(number, comment, message) {
    const gedeeld = await pushToGit(message);
    if (!gedeeld.ok) return { ok: false, error: 'share-failed', shareError: gedeeld.error };
    const dicht = await closeWithComment(number, comment, 'completed');
    await loadInbox();
    return dicht.ok ? { ok: true } : { ok: false, error: 'close-failed', closeError: dicht.error };
  }

  // decision: { type: objective|measurableResult|project|action, parentId, name, owner }
  // parentId: een thema (doel), een doel (deelproduct, project, losse actie)
  // of een project (actie onder een project).
  async function landInboxItem(item, decision) {
    const d = decision || {};
    const naam = String(d.name || item.title || '').trim();
    const eigenaar = String(d.owner || '').trim();
    if (!naam || !eigenaar || !d.parentId) return { ok: false, error: 'incomplete' };
    if (landedFromInbox(item.number)) return { ok: false, error: 'already-landed' };
    const vrij = await nogTeBesluiten(item);
    if (!vrij.ok) return vrij;
    let gemaakt = null;
    let waar = '';
    mutate((ds) => {
      const parent = ObeyaData.findAny(ds, d.parentId);
      if (!parent) return;
      if (d.type === 'objective' && parent.type === 'theme') {
        gemaakt = ObeyaData.createObjective(ds, parent.entity.id, { title: naam, owner: eigenaar, description: item.why, themeIds: [parent.entity.id] });
        waar = parent.entity.name;
      } else if (d.type === 'measurableResult' && parent.type === 'objective') {
        gemaakt = ObeyaData.createMeasurableResult(ds, parent.entity.id, { name: naam, owner: eigenaar });
        waar = parent.entity.title;
      } else if (d.type === 'project' && parent.type === 'objective') {
        gemaakt = ObeyaData.createProject(ds, parent.entity.id, { name: naam, owner: eigenaar, description: item.why });
        waar = parent.entity.title;
      } else if (d.type === 'action' && (parent.type === 'objective' || parent.type === 'project')) {
        const doelId = parent.type === 'project' ? parent.entity.objectiveId : parent.entity.id;
        gemaakt = ObeyaData.createAction(ds, doelId, parent.type === 'project' ? parent.entity.id : null, { title: naam, owner: eigenaar, description: item.why });
        waar = parent.type === 'project' ? parent.entity.name : parent.entity.title;
      }
      if (gemaakt) gemaakt.inboxIssue = item.number;
    }, `inbox #${item.number} landen`);
    if (!gemaakt) return { ok: false, error: 'invalid-parent' };
    return shareThenClose(item.number,
      ObeyaInbox.decisionComment({ kind: 'land', type: d.type, name: naam, where: waar, owner: eigenaar }),
      `Inbox #${item.number} geland: ${naam}`);
  }

  // Afronden: het item staat al op het bord (landen gelukt, delen niet).
  // Alsnog delen en dan het issue sluiten.
  async function finishLandedInboxItem(item) {
    const gemaakt = landedFromInbox(item.number);
    if (!gemaakt) return { ok: false, error: 'not-landed' };
    const naam = gemaakt.title || gemaakt.name;
    if (!naam) return shareThenClose(item.number, 'Samengevoegd met een item op het bord (als notitie).', `Inbox #${item.number} samengevoegd`);
    return shareThenClose(item.number, `Geland op het bord als "${naam}".`, `Inbox #${item.number} geland: ${naam}`);
  }

  // Samenvoegen: een notitie bij het gekozen item, met het waarom erbij.
  async function mergeInboxItem(item, targetId) {
    if (!dataset || !ObeyaData.findAny(dataset, targetId)) return { ok: false, error: 'invalid-parent' };
    if (landedFromInbox(item.number)) return { ok: false, error: 'already-landed' };
    const vrij = await nogTeBesluiten(item);
    if (!vrij.ok) return vrij;
    const doel = ObeyaData.findAny(dataset, targetId);
    if (!doel || doel.type === 'theme') return { ok: false, error: 'invalid-parent' };
    const objectiveId = doel.type === 'objective' ? doel.entity.id : doel.entity.objectiveId
      || (ObeyaData.findProject(dataset, doel.entity.projectId) || {}).objectiveId;
    const naam = doel.entity.title || doel.entity.name;
    mutate((ds) => {
      const notitie = ObeyaData.createNote(ds, objectiveId, {
        text: `Uit de inbox (#${item.number}): ${item.title}${item.why ? ` — ${item.why}` : ''}`,
        type: 'update', author: item.author || wieBenIk(), relatedItemId: targetId,
      });
      if (notitie) notitie.inboxIssue = item.number;
    }, `inbox #${item.number} samenvoegen`);
    return shareThenClose(item.number, ObeyaInbox.decisionComment({ kind: 'merge', name: naam }), `Inbox #${item.number} samengevoegd met ${naam}`);
  }

  async function parkInboxItem(item, date, reason) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) return { ok: false, error: 'incomplete' };
    const reden = String(reason || '').replace(/\s+/g, ' ').trim();
    // De tekst zoals die nu op GitHub staat, zodat een bewerking van de
    // melder sinds het ophalen van de inbox niet verloren gaat.
    let body = item.body;
    if (typeof ObeyaGitBackend.getIssue === 'function') {
      const actueel = await ObeyaGitBackend.getIssue(null, item.number);
      if (!actueel.ok) return actueel;
      if (actueel.issue.state === 'closed') { await loadInbox(); return { ok: false, error: 'already-decided' }; }
      body = actueel.issue.body || '';
    }
    const u = await ObeyaGitBackend.updateIssue(null, item.number, { body: ObeyaInbox.parkBody(body, date, reden) });
    if (!u.ok) return u;
    const c = await ObeyaGitBackend.commentIssue(null, item.number, ObeyaInbox.decisionComment({ kind: 'park', date, reason: reden }));
    await loadInbox();
    return c.ok ? { ok: true } : { ok: false, error: 'comment-failed', closeError: c.error };
  }

  async function rejectInboxItem(item, reason) {
    const r = String(reason || '').trim();
    if (!r) return { ok: false, error: 'incomplete' };
    if (typeof ObeyaGitBackend.getIssue === 'function') {
      const actueel = await ObeyaGitBackend.getIssue(null, item.number);
      if (!actueel.ok) return actueel;
      if (actueel.issue.state === 'closed') { await loadInbox(); return { ok: false, error: 'already-decided' }; }
    }
    const res = await closeWithComment(item.number, ObeyaInbox.decisionComment({ kind: 'reject', reason: r }), 'not_planned');
    await loadInbox();
    return res;
  }

  async function pushToGit(message) {
    if (staleTab) return staleFout();
    if (reviewOpen()) return { ok: false, error: 'review-open' };
    let base = readGitBase();
    if (!base) {
      // Zonder uitgangsversie zou de commit blind over de teamversie heen
      // gaan (of de voorbeelddata erin zetten). Eerst ophalen, dan delen.
      return gitFout({ ok: false, error: 'pull-first' });
    }
    if (!hasUnsharedChanges()) {
      setGitStatus({ lastError: null, notice: 'Niets te delen: het team heeft al jouw wijzigingen' });
      notify();
      return { ok: true, nothingToShare: true };
    }

    setGitStatus({ busy: true, lastError: null, notice: null });
    notify();
    let meegenomen = 0;
    for (let poging = 0; poging < MAX_PUSH_POGINGEN; poging++) {
      const res = await ObeyaGitBackend.saveRemoteDataset(null, dataset, base.sha, message);
      if (res.ok) {
        writeGitBase(res.sha, JSON.parse(JSON.stringify(dataset)));
        source = { kind: 'git', detail: null };
        const notice = metWaarschuwingen(meegenomen ? `Gedeeld, met ${teamwijzigingenTekst(meegenomen)}` : 'Gedeeld met het team');
        setGitStatus({ busy: false, lastError: null, lastSyncedAt: new Date(), notice });
        notify();
        return { ...res, mergedFromTeam: meegenomen };
      }
      if (res.error !== 'conflict') return gitFout(res);

      // Iemand anders was eerder: diens versie ophalen en samenvoegen.
      const remote = await ObeyaGitBackend.loadRemoteDataset();
      if (!remote.ok) return gitFout(remote);
      const theirs = canonical(remote.dataset);
      if (!theirs.ok) return gitFout({ ok: false, error: 'invalid-data', detail: (theirs.errors || []).join(' ') });
      const samen = ObeyaMerge.merge3(base.dataset, dataset, theirs.dataset);
      if (samen.conflicts.length) {
        return wachtOpKeuze({ mode: 'push', base: base.dataset, theirs: theirs.dataset, sha: remote.sha, conflicts: samen.conflicts, theirsChanges: samen.theirsChanges, message });
      }
      const toegepast = gitApply(samen.dataset, 'wijzigingen van het team samengevoegd');
      if (!toegepast.ok) return gitFout({ ok: false, error: 'invalid-data', detail: (toegepast.errors || []).join(' ') });
      base = { sha: remote.sha, dataset: theirs.dataset };
      writeGitBase(base.sha, base.dataset);
      meegenomen += samen.theirsChanges;
    }
    return gitFout({ ok: false, error: 'conflict' });
  }

  // --- botsing afhandelen -------------------------------------------------------

  // `choices` is { conflictId: 'mine' | 'theirs' }. Voegt opnieuw samen met de
  // keuzes (op de huidige data, voor het geval die intussen nog wijzigde),
  // neemt het resultaat over en deelt het als de botsing bij het delen
  // ontstond.
  async function resolvePendingMerge(choices) {
    if (staleTab) return staleFout();
    const p = pendingMerge;
    if (!p) return { ok: false, error: 'unknown' };
    const samen = ObeyaMerge.merge3(p.base, dataset, p.theirs, choices || {});
    const toegepast = gitApply(samen.dataset, 'botsing met het team opgelost');
    if (!toegepast.ok) return gitFout({ ok: false, error: 'invalid-data', detail: (toegepast.errors || []).join(' ') });
    writeGitBase(p.sha, p.theirs);
    pendingMerge = null;
    selection = null;
    if (p.mode === 'push') return pushToGit(p.message);
    setGitStatus({ busy: false, lastError: null, lastSyncedAt: new Date(), notice: metWaarschuwingen('Samengevoegd met de teamversie; jouw wijzigingen zijn nog niet gedeeld') });
    notify();
    return { ok: true };
  }

  function cancelPendingMerge() {
    pendingMerge = null;
    selection = null;
    setGitStatus({ busy: false, notice: 'Samenvoegen afgebroken; er is niets veranderd' });
    notify();
  }

  // --- filters -----------------------------------------------------------

  function getFilters() {
    return filters;
  }

  // Zet het thema-filter direct op precies deze set (i.p.v. toggelen) — voor
  // "klik op een matrixcel om te filteren" in Verbindingen, waar je altijd
  // precies dat ene thema of die twee thema's wil isoleren, ongeacht wat er
  // al aan filters actief stond.
  function isolateThemes(themeIds) {
    filters.themeIds = new Set(themeIds);
    notify();
  }

  // Startpunt van een klik-set, afhankelijk van chipFilterMode: bij
  // 'exclude' alles (zodat de eerste klik dat ene item wegneemt), bij
  // 'include' niets (zodat de eerste klik dat ene item juist isoleert).
  function chipModeStart(allValues) {
    return chipFilterMode === 'include' ? new Set() : new Set(allValues);
  }

  function getChipFilterMode() {
    return chipFilterMode;
  }

  function getMatrixMode() {
    return matrixMode;
  }

  function setMatrixMode(mode) {
    matrixMode = mode === 'owner' ? 'owner' : 'theme';
    notify();
  }

  function setChipFilterMode(mode) {
    chipFilterMode = mode === 'include' ? 'include' : 'exclude';
    // Een bestaande selectie betekent bij de andere modus het omgekeerde
    // (uitsluiten vs. alleen tonen) — reset in plaats van die verwarring
    // stilzwijgend te laten ontstaan.
    filters.themeIds = null;
    filters.status = null;
    filters.noteTypes = null;
    notify();
  }

  function toggleThemeFilter(themeId) {
    if (filters.themeIds === null) {
      filters.themeIds = chipModeStart(dataset.themes.map((t) => t.id));
    }
    if (filters.themeIds.has(themeId)) filters.themeIds.delete(themeId);
    else filters.themeIds.add(themeId);
    notify();
  }

  function isThemeActive(themeId) {
    return filters.themeIds === null || filters.themeIds.has(themeId);
  }

  function toggleStatusFilter(status) {
    if (filters.status === null) {
      filters.status = chipModeStart(ObeyaData.STATUS_VALUES);
    }
    if (filters.status.has(status)) filters.status.delete(status);
    else filters.status.add(status);
    notify();
  }

  function isStatusActive(status) {
    return filters.status === null || filters.status.has(status);
  }

  function toggleNoteTypeFilter(noteType) {
    if (filters.noteTypes === null) {
      filters.noteTypes = chipModeStart(Object.keys(ObeyaData.NOTE_TYPES));
    }
    if (filters.noteTypes.has(noteType)) filters.noteTypes.delete(noteType);
    else filters.noteTypes.add(noteType);
    notify();
  }

  function isNoteTypeActive(noteType) {
    return filters.noteTypes === null || filters.noteTypes.has(noteType);
  }

  function setOwnerFilter(owner) {
    filters.owner = owner;
    notify();
  }

  function setPrincipleFilter(id) {
    filters.principle = id || '';
    notify();
  }

  function setTeamPlanOnly(value) {
    filters.teamPlanOnly = !!value;
    notify();
  }

  function setSearch(text) {
    filters.search = text || '';
    notify();
  }

  function setYearFilter(year) {
    filters.year = year === null || year === '' ? null : Number(year);
    notify();
  }

  function setQuarterFilter(quarter) {
    filters.quarter = quarter === null || quarter === '' ? null : Number(quarter);
    notify();
  }

  function clearFilters() {
    filters.themeIds = null;
    filters.status = null;
    filters.owner = '';
    filters.teamPlanOnly = false;
    filters.search = '';
    filters.noteTypes = null;
    filters.year = null;
    filters.quarter = null;
    filters.principle = '';
    notify();
  }

  // Eén filter weghalen (een chip in de rij actieve filters), de rest blijft.
  function clearFilter(key) {
    if (key === 'themes') filters.themeIds = null;
    else if (key === 'status') filters.status = null;
    else if (key === 'owner') filters.owner = '';
    else if (key === 'teamPlan') filters.teamPlanOnly = false;
    else if (key === 'search') filters.search = '';
    else if (key === 'year') filters.year = null;
    else if (key === 'quarter') filters.quarter = null;
    else if (key === 'principle') filters.principle = '';
    notify();
  }

  // Het filterpaneel staat standaard dicht, zodat het bord hoog begint; wat
  // er actief is, staat als chips naast de knop. Net als de kamermodus niet
  // opgeslagen.
  let filterPanelOpen = false;

  function isFilterPanelOpen() {
    return filterPanelOpen;
  }

  function toggleFilterPanel() {
    filterPanelOpen = !filterPanelOpen;
    notify();
  }

  function hasActiveFilters() {
    return (
      (filters.themeIds !== null && filters.themeIds.size !== dataset.themes.length) ||
      filters.status !== null ||
      !!filters.owner ||
      filters.teamPlanOnly ||
      !!filters.search ||
      filters.noteTypes !== null ||
      filters.year !== null ||
      filters.quarter !== null ||
      !!filters.principle
    );
  }

  // --- view + selection ----------------------------------------------------

  function getView() {
    return view;
  }

  function setView(v) {
    view = v;
    // Een open filterpaneel duwt de inhoud omlaag; op een ander tabblad
    // begint het bord weer hoog. Wat er gefilterd is, blijft als chips staan.
    filterPanelOpen = false;
    notify();
  }

  function getSelection() {
    return selection;
  }

  function select(type, id, mode, context) {
    selection = { type, id, mode: mode || 'view', context: context || {} };
    notify();
  }

  // Velden van het open venster bijwerken (bijv. de keuze in de inbox),
  // zonder het venster opnieuw te openen.
  function updateSelectionContext(patch) {
    if (!selection) return;
    selection = { ...selection, context: { ...selection.context, ...patch } };
    notify();
  }

  function closeSelection() {
    // Het keuzescherm van een botsing sluiten (kruisje, Escape, ernaast
    // klikken) is afbreken: er verandert dan niets.
    if (pendingMerge) { cancelPendingMerge(); return; }
    selection = null;
    editingNoteId = null;
    notify();
  }

  // --- beoordelingsronde (stap 1.4) -----------------------------------
  // Alleen in het geheugen: de ronde zelf is een werkwijze, geen data. Wat
  // er tijdens de ronde wordt ingevuld, gaat wel meteen via mutate() in het
  // bord (per veld), zodat overslaan of sluiten nooit iets weggooit.

  let review = null;

  function startReview(scope) {
    const s = scope || {};
    const vorige = review;
    let items = ObeyaData.reviewQueue(dataset, s).map((i) => ({ type: i.type, id: i.id }));
    if (s.onlySkipped && vorige) {
      const overgeslagen = new Set(vorige.items.filter((i) => vorige.outcomes[i.id] === 'skipped').map((i) => i.id));
      items = vorige.items.filter((i) => overgeslagen.has(i.id)).map((i) => ({ type: i.type, id: i.id }));
    }
    review = { scope: { themeId: s.themeId || '', owner: s.owner || '' }, items, index: 0, outcomes: {}, notes: {}, statusAtStart: {} };
    markStatusAtStart();
    select('reviewRound', null, 'view', {});
  }

  function markStatusAtStart() {
    const item = review && review.items[review.index];
    if (!item || item.id in review.statusAtStart) return;
    const found = ObeyaData.findAny(dataset, item.id);
    review.statusAtStart[item.id] = found ? found.entity.status : null;
  }

  function reviewOpen() {
    return !!(selection && selection.type === 'reviewRound');
  }

  function getReview() {
    return review;
  }

  function currentReviewItem() {
    return review ? review.items[review.index] || null : null;
  }

  // outcome: 'done' | 'skipped' | 'flagged'. Wie een item tijdens de ronde
  // op amber of rood zet, geeft eerst kort de reden (de methodiek bespreekt
  // het probleem, niet alleen het signaal).
  function reviewAdvance(outcome) {
    const item = currentReviewItem();
    if (!item) return { ok: false, error: 'no-item' };
    const found = ObeyaData.findAny(dataset, item.id);
    if (found && outcome === 'done') {
      const status = found.entity.status;
      const veranderd = status !== review.statusAtStart[item.id];
      if (veranderd && (status === 'amber' || status === 'red') && !review.notes[item.id]) {
        review.error = 'reason-required';
        notify();
        return { ok: false, error: 'reason-required' };
      }
    }
    if (found && outcome === 'flagged' && !found.entity.flaggedForDiscussion) {
      mutate((ds) => ObeyaData.toggleFlag(ds, item.id), 'markeren voor bespreking');
    }
    review.outcomes[item.id] = outcome;
    review.error = null;
    review.index += 1;
    markStatusAtStart();
    notify();
    return { ok: true };
  }

  function reviewBack() {
    if (!review || review.index === 0) return;
    review.index -= 1;
    review.error = null;
    notify();
  }

  function reviewAddNote(text, author) {
    const item = currentReviewItem();
    const t = (text || '').trim();
    if (!item || !t) return null;
    const found = ObeyaData.findAny(dataset, item.id);
    if (!found) return null;
    const objectiveId = item.type === 'objective' ? item.id : found.entity.objectiveId;
    const identity = ObeyaGitBackend.getIdentity && ObeyaGitBackend.getIdentity();
    const note = mutate((ds) => ObeyaData.createNote(ds, objectiveId, {
      text: t, type: 'update', author: (author || '').trim() || (identity && identity.name) || '', relatedItemId: item.id,
    }), 'notitie toevoegen');
    if (note) {
      review.notes[item.id] = (review.notes[item.id] || 0) + 1;
      review.error = null;
    }
    notify();
    return note;
  }

  function reviewCounts() {
    if (!review) return null;
    const c = { done: 0, skipped: 0, flagged: 0, total: review.items.length };
    Object.values(review.outcomes).forEach((o) => { if (o in c) c[o] += 1; });
    return c;
  }

  function reviewFlagSkipped() {
    if (!review) return 0;
    const ids = review.items.filter((i) => review.outcomes[i.id] === 'skipped' && ObeyaData.findAny(dataset, i.id)).map((i) => i.id);
    if (!ids.length) return 0;
    mutate((ds) => ids.forEach((id) => {
      const f = ObeyaData.findAny(ds, id);
      if (f && !f.entity.flaggedForDiscussion) f.entity.flaggedForDiscussion = true;
    }), 'overgeslagen items markeren');
    ids.forEach((id) => { review.outcomes[id] = 'flagged'; });
    notify();
    return ids.length;
  }

  function endReview() {
    review = null;
    closeSelection();
  }

  // --- stukken (idee 54) ------------------------------------------------
  // Adviezen en verslagen uit de map stukken/ van het data-repo. Alleen
  // lezen; bewaard in deze browser zodat ze na herladen zichtbaar blijven.
  // Het is geen bord-data: niet in undo, export of samenvoegen.

  const DOCS_KEY = 'obeya-stukken';
  let stukken = { docs: [], images: [], fetchedAt: null };
  let stukkenStatus = { busy: false, error: null };
  let openDocPath = null;

  function leesStukken() {
    try {
      const raw = JSON.parse(localStorage.getItem(DOCS_KEY) || 'null');
      if (raw && Array.isArray(raw.docs)) {
        return {
          docs: raw.docs.filter((d) => d && typeof d.path === 'string' && typeof d.text === 'string'),
          images: (Array.isArray(raw.images) ? raw.images : []).filter((b) => b && typeof b.path === 'string' && typeof b.dataUrl === 'string'),
          fetchedAt: raw.fetchedAt || null,
        };
      }
    } catch (err) { /* onleesbaar: opnieuw ophalen lost het op */ }
    return { docs: [], images: [], fetchedAt: null };
  }

  // De afbeeldingen delen de opslag van de browser met het bord. Het bord
  // gaat voor: samen hooguit IMAGES_MAX tekens aan afbeeldingen bewaren, en
  // lukt bewaren niet, dan de stukken zonder afbeeldingen. Wat niet bewaard
  // is, blijft zichtbaar tot herladen en komt terug bij opnieuw ophalen
  // (review data-guardian, 8 november 2026).
  const IMAGES_MAX = 1000000;

  function bewaarStukken() {
    const totaal = stukken.images.reduce((n, b) => n + b.dataUrl.length, 0);
    const pogingen = totaal <= IMAGES_MAX ? [stukken, { ...stukken, images: [] }] : [{ ...stukken, images: [] }];
    for (const p of pogingen) {
      try { localStorage.setItem(DOCS_KEY, JSON.stringify(p)); return; } catch (err) { /* te vol: kleiner proberen */ }
    }
    try { localStorage.removeItem(DOCS_KEY); } catch (err) { /* geblokkeerd: dan alleen voor deze sessie */ }
  }

  function getDocuments() {
    return { ...stukken, ...stukkenStatus, configured: ObeyaGitBackend.isConfigured() };
  }

  async function fetchDocuments() {
    if (!ObeyaGitBackend.isConfigured()) {
      stukkenStatus = { busy: false, error: 'not-configured' };
      notify();
      return { ok: false, error: 'not-configured' };
    }
    stukkenStatus = { busy: true, error: null };
    notify();
    const res = await ObeyaGitBackend.loadRemoteDocuments();
    if (!res.ok) {
      stukkenStatus = { busy: false, error: res.error || 'unknown' };
      notify();
      return res;
    }
    stukken = {
      docs: res.docs.map((d) => ({ path: d.path, sha: d.sha, text: d.text })),
      images: (res.images || []).map((b) => ({ path: b.path, sha: b.sha, dataUrl: b.dataUrl })),
      fetchedAt: new Date().toISOString(),
    };
    bewaarStukken();
    stukkenStatus = { busy: false, error: null };
    if (openDocPath && !stukken.docs.some((d) => d.path === openDocPath)) openDocPath = null;
    notify();
    return { ok: true, count: stukken.docs.length };
  }

  function getOpenDocument() {
    return openDocPath;
  }

  function openDocument(docPath) {
    openDocPath = docPath || null;
    notify();
  }

  // --- wijzigingen bevestigen (stap 3 van docs/wijzigingslog-plan.md) -----
  // Alleen wie een rol heeft met "mag bevestigen" (idee 67/72). Dat is een
  // afspraak, geen beveiliging: daarom legt elke beslissing vast wie het deed
  // en met welke rollen op dat moment.

  let rejectingChangeId = null;
  let reviewNotice = '';
  // Waarom terugdraaien niet lukte, per regel: { id: [tekst] }.
  let revertProblems = {};

  function getRevertProblems() {
    return revertProblems;
  }

  // Wat er net besloten is, voor de melding aan schermlezers op de Agenda.
  function getReviewNotice() {
    return reviewNotice;
  }

  function getRejectingChange() {
    return rejectingChangeId;
  }

  function setRejectingChange(id) {
    rejectingChangeId = id || null;
    notify();
  }

  function reviewer() {
    const me = getMe();
    if (!me) return { error: 'no-me' };
    if (!ObeyaData.canConfirm(dataset, me.name)) return { error: 'not-allowed' };
    const login = gitLogin();
    return { by: { person: me.name, roles: ObeyaData.rolesOf(dataset, me.name).map((r) => r.name), ...(login ? { login } : {}) } };
  }

  function decideChange(id, status, reason) {
    // Een ander tabblad heeft intussen opgeslagen: hier niets meer wegschrijven.
    if (staleTab) return { ok: false, error: 'stale-tab' };
    const wie = reviewer();
    if (wie.error) return { ok: false, error: wie.error };
    const regel = (dataset.changeLog || []).find((c) => c.id === id);
    if (!regel || !regel.review || regel.review.status !== 'pending') return { ok: false, error: 'not-pending' };
    if (status === 'rejected' && !String(reason || '').trim()) return { ok: false, error: 'no-reason' };
    // Geen stap voor ongedaan maken: dat laat het log bewust staan (zie undo),
    // dus die stap zou niets doen. Ook geen nieuwe peildatum: een beslissing
    // verandert het bord niet. Wel opgeslagen en te delen met het team.
    regel.review = ObeyaHistory.reviewed(status, wie.by, { reason });
    rejectingChangeId = null;
    const nog = ObeyaHistory.pending(dataset.changeLog).length;
    reviewNotice = `${status === 'confirmed' ? 'Bevestigd' : 'Afgewezen'}: ${regel.label || 'wijziging'}. ${nog ? `Nog ${nog} te bevestigen.` : 'Niets meer te bevestigen.'}`;
    persist();
    notify();
    return { ok: true };
  }

  // Terugdraaien na afwijzen (stap 4): het overleg besloot het al, dus de
  // terugdraai-regel hoeft niet opnieuw bevestigd te worden. Wel ongedaan te
  // maken, zoals elke wijziging.
  function revertChange(id) {
    if (staleTab) return { ok: false, error: 'stale-tab' };
    const wie = reviewer();
    if (wie.error) return { ok: false, error: wie.error };
    const regel = (dataset.changeLog || []).find((c) => c.id === id);
    if (!regel || !ObeyaHistory.toRevert(dataset.changeLog).includes(regel)) return { ok: false, error: 'not-rejected' };
    const res = ObeyaHistory.revert(dataset, regel, dataset.changeLog);
    if (!res.ok) {
      revertProblems = { ...revertProblems, [id]: res.reasons };
      notify();
      return { ok: false, error: 'changed-since', reasons: res.reasons };
    }
    delete revertProblems[id];
    mutate((ds) => {
      Object.keys(ds).forEach((k) => { delete ds[k]; });
      Object.assign(ds, res.dataset);
      const r = ds.changeLog.find((c) => c.id === id);
      r.review = { ...r.review, reverted: { at: new Date().toISOString(), by: wie.by } };
    }, `teruggedraaid: ${regel.label || 'wijziging'}`, { needsConfirmation: false });
    const terug = dataset.changeLog[dataset.changeLog.length - 1];
    if (terug && terug.label === `teruggedraaid: ${regel.label || 'wijziging'}`) terug.revertOf = id;
    reviewNotice = `Teruggedraaid: ${regel.label || 'wijziging'}.`;
    persist();
    notify();
    return { ok: true };
  }

  // Afgewezen, maar het bord blijft zoals het is.
  function keepRejectedChange(id) {
    if (staleTab) return { ok: false, error: 'stale-tab' };
    const wie = reviewer();
    if (wie.error) return { ok: false, error: wie.error };
    const regel = (dataset.changeLog || []).find((c) => c.id === id);
    if (!regel || !ObeyaHistory.toRevert(dataset.changeLog).includes(regel)) return { ok: false, error: 'not-rejected' };
    regel.review = { ...regel.review, kept: { at: new Date().toISOString(), by: wie.by } };
    delete revertProblems[id];
    reviewNotice = `Laten staan: ${regel.label || 'wijziging'}.`;
    persist();
    notify();
    return { ok: true };
  }

  function confirmChange(id) {
    return decideChange(id, 'confirmed');
  }

  function rejectChange(id, reason) {
    return decideChange(id, 'rejected', reason);
  }

  // --- geschiedenis (stap 5 van docs/wijzigingslog-plan.md) ---------------
  // Wat de Tijdlijn toont en of kleine wijzigingen meedoen: alleen voor deze
  // sessie. Overleg afgerond hoort bij het bord: het hele team ziet
  // "sinds het vorige overleg" vanaf hetzelfde moment.

  let timelineMode = 'notes';
  let showAllChanges = false;

  function getTimelineMode() {
    return timelineMode;
  }

  function setTimelineMode(mode) {
    timelineMode = ['notes', 'changes', 'both'].includes(mode) ? mode : 'notes';
    notify();
  }

  function getShowAllChanges() {
    return showAllChanges;
  }

  function setShowAllChanges(aan) {
    showAllChanges = !!aan;
    notify();
  }

  function finishMeeting() {
    const me = getMe();
    mutate((ds) => {
      if (!ds.meta) ds.meta = {};
      ds.meta.lastMeeting = { at: new Date().toISOString(), ...(me ? { by: me.name } : {}) };
    }, 'overleg afgerond', { needsConfirmation: false });
    return { ok: true };
  }

  // --- hulp (idee 68) --------------------------------------------------
  // De pagina Hulp staat buiten de tabs: hij onthoudt waar je vandaan kwam,
  // zodat "terug" daar weer uitkomt.

  let helpPage = null;
  let viewBeforeHelp = 'board';

  function getHelpPage() {
    return helpPage;
  }

  function getViewBeforeHelp() {
    return viewBeforeHelp;
  }

  function openHelp(page) {
    if (view !== 'help') viewBeforeHelp = view;
    helpPage = page;
    setView('help');
  }

  function closeHelp() {
    setView(viewBeforeHelp);
  }

  // --- inline note editing --------------------------------------------

  function getEditingNoteId() {
    return editingNoteId;
  }

  function startEditNote(noteId) {
    editingNoteId = noteId;
    notify();
  }

  function stopEditNote() {
    editingNoteId = null;
    notify();
  }

  // --- kamer-modus (presentatiemodus) ----------------------------------

  function isPresentationMode() {
    return presentationMode;
  }

  function togglePresentationMode() {
    presentationMode = !presentationMode;
    notify();
  }

  // --- zoomniveau (Overzicht/Detail) --------------------------------------
  // Regelt alleen de dichtheid van Bord/Lijst (welke aantallen/kolommen
  // zichtbaar zijn), niet welke tabbladen of detailschermen bereikbaar zijn
  // — dat zou richting toegangsbeheer gaan, wat zonder backend niet
  // afdwingbaar is. Net als kamer-modus niet opgeslagen: reset bij herladen.

  function getZoomLevel() {
    return zoomLevel;
  }

  function setZoomLevel(level) {
    zoomLevel = level === 'overview' ? 'overview' : 'detail';
    notify();
  }

  // --- voorbeelddata in een vermengd bord ------------------------------------
  // Tot 3 oktober 2026 kon ophalen de voorbeelddata met de teamdata mengen.
  // Wie dat overkwam, krijgt een melding met een knop om precies de items van
  // de voorbeelddata weg te halen. Alleen als er ook andere items zijn: een
  // bord dat helemaal uit voorbeelddata bestaat, is gewoon de voorbeelddata.

  function demoDataset() {
    try {
      return window.OBEYA_SEED_DATA ? ObeyaData.normalizeDataset(window.OBEYA_SEED_DATA).dataset : null;
    } catch (err) {
      return null;
    }
  }

  let demoMixDismissed = false;

  function getDemoMix() {
    const demo = demoDataset();
    if (!demo || !dataset || demoMixDismissed) return null;
    const demoItems = ObeyaMerge.sharedItems(demo, dataset);
    if (!demoItems) return null;
    const totaal = ObeyaMerge.sharedItems(dataset, dataset);
    const ownItems = totaal - demoItems;
    return ownItems > 0 ? { demoItems, ownItems } : null;
  }

  function removeDemoItems() {
    const demo = demoDataset();
    if (!demo) return 0;
    let n = 0;
    mutate((ds) => { n = ObeyaData.removeItemsOf(ds, demo); }, 'voorbeelddata verwijderd');
    return n;
  }

  function dismissDemoMix() {
    demoMixDismissed = true;
    notify();
  }

  // --- Samenhang (canvas) ---------------------------------------------------

  function getCanvasState() {
    return {
      lens: canvas.lens, groupBy: canvas.groupBy, focusId: canvas.focusId, zoom: canvas.zoom, layoutWidth: canvas.layoutWidth,
      detail: canvas.detail, chainLayout: canvas.chainLayout, expanded: Array.from(canvas.expanded), folded: Array.from(canvas.folded),
      opened: Array.from(canvas.opened),
      selecting: canvas.selecting, selected: Array.from(canvas.selected), bulkNotice: canvas.bulkNotice, bulkUndo: canvas.bulkUndo,
    };
  }

  // In bulk wijzigen in Samenhang (idee 89): welke items zijn aangevinkt.
  // Alleen in het geheugen; uitzetten wist de selectie.
  function toggleCanvasSelecting() {
    canvas.selecting = !canvas.selecting;
    canvas.selected = new Set();
    canvas.bulkNotice = '';
    notify();
  }

  // undoable: de melding krijgt een knop "Ongedaan maken" (na een bulkwijziging).
  function setCanvasSelected(keys, notice, undoable) {
    canvas.selected = new Set(keys || []);
    canvas.bulkNotice = notice || '';
    canvas.bulkUndo = !!undoable;
    notify();
  }

  function toggleCanvasSelected(key, on) {
    const keys = new Set(canvas.selected);
    if (on) keys.add(key);
    else keys.delete(key);
    setCanvasSelected(keys);
  }

  function setCanvasLens(lens) {
    canvas.lens = ['operational', 'chain'].includes(lens) ? lens : 'strategic';
    canvas.layoutWidth = null;
    notify();
  }

  function setCanvasGroupBy(groupBy) {
    canvas.groupBy = ['objective', 'theme', 'owner', 'status'].includes(groupBy) ? groupBy : 'objective';
    canvas.layoutWidth = null;
    notify();
  }

  // Nogmaals op hetzelfde item klikken zet de keten weer uit.
  function toggleCanvasFocus(id) {
    canvas.focusId = canvas.focusId === id ? null : (id || null);
    notify();
  }

  // Met de knoppen of "Passend": opnieuw indelen voor deze zoomfactor.
  function setCanvasZoom(z) {
    canvas.zoom = Math.max(0.3, Math.min(1.5, Math.round(z * 100) / 100));
    canvas.layoutWidth = null;
    notify();
  }

  // Na zoomen met het wiel: de app heeft het canvas zelf al bijgewerkt
  // (ObeyaCanvas.zoomAt); hier alleen onthouden voor de volgende render, dus
  // zonder notify — opnieuw renderen bij elke tik van het wiel zou haperen.
  function rememberCanvasZoom(z, layoutWidth) {
    canvas.zoom = z;
    canvas.layoutWidth = layoutWidth || null;
  }

  function resetCanvasLayout() {
    canvas.layoutWidth = null;
  }

  // Detailniveau voor de hele muur; opengeklikte briefjes vervallen dan,
  // want die zouden anders niet meer opvallen.
  function setCanvasDetail(level) {
    canvas.detail = ObeyaData.DETAIL_LEVELS.includes(level) ? level : null;
    canvas.expanded = new Set();
    canvas.layoutWidth = null;
    notify();
  }

  function setChainLayout(layout) {
    canvas.chainLayout = ObeyaData.CHAIN_LAYOUTS.includes(layout) ? layout : null;
    canvas.layoutWidth = null;
    canvas.centerMindmap = layout === 'mindmap';
    notify();
  }

  // Organogram en mindmap: welke briefjes hun kinderen tonen.
  function toggleCanvasOpen(id) {
    if (canvas.opened.has(id)) canvas.opened.delete(id);
    else canvas.opened.add(id);
    canvas.layoutWidth = null;
    notify();
  }

  function setCanvasOpen(ids) {
    canvas.opened = new Set(ids || []);
    canvas.layoutWidth = null;
    canvas.centerMindmap = true;
    notify();
  }

  // Na het tekenen van de mindmap het midden in beeld brengen, één keer.
  function consumeMindmapCenter() {
    const c = canvas.centerMindmap;
    canvas.centerMindmap = false;
    return c;
  }

  function toggleCanvasExpand(id) {
    if (canvas.expanded.has(id)) canvas.expanded.delete(id);
    else canvas.expanded.add(id);
    canvas.layoutWidth = null;
    notify();
  }

  function toggleCanvasFold(id) {
    if (canvas.folded.has(id)) canvas.folded.delete(id);
    else canvas.folded.add(id);
    canvas.layoutWidth = null;
    notify();
  }

  function setCanvasFoldAll(fold) {
    canvas.folded = fold ? new Set(ObeyaData.allObjectives(dataset).map((o) => o.id)) : new Set();
    canvas.layoutWidth = null;
    notify();
  }

  // Van een doel in de strategische lens naar de operationele: die keten
  // licht op en het doel wordt in beeld geschoven.
  function zoomIntoObjective(id) {
    canvas.lens = 'operational';
    canvas.focusId = id;
    canvas.scrollTo = id;
    notify();
  }

  function consumeCanvasScrollTarget() {
    const id = canvas.scrollTo;
    canvas.scrollTo = null;
    return id;
  }

  return {
    init,
    getCanvasState,
    setCanvasLens,
    toggleCanvasSelecting,
    setCanvasSelected,
    toggleCanvasSelected,
    setCanvasGroupBy,
    toggleCanvasFocus,
    setCanvasZoom,
    rememberCanvasZoom,
    resetCanvasLayout,
    setCanvasDetail,
    setChainLayout,
    toggleCanvasOpen,
    setCanvasOpen,
    consumeMindmapCenter,
    toggleCanvasExpand,
    toggleCanvasFold,
    setCanvasFoldAll,
    zoomIntoObjective,
    consumeCanvasScrollTarget,
    clearStoredData,
    canUndo,
    getUndoLabel,
    undo,
    subscribe,
    getDataset,
    mutate,
    resetToExampleData,
    importDataset,
    applyImportedDataset,
    isGitConfigured,
    getGitStatus,
    getGitTestResult,
    getGitIdentity,
    getMe,
    setMe,
    confirmChange,
    rejectChange,
    revertChange,
    keepRejectedChange,
    getRejectingChange,
    setRejectingChange,
    getReviewNotice,
    getTimelineMode,
    setTimelineMode,
    getShowAllChanges,
    setShowAllChanges,
    finishMeeting,
    getRevertProblems,
    saveGitConfig,
    clearGitConfig,
    testGitConnection,
    pullFromGit,
    pushToGit,
    hasUnsharedChanges,
    hasGitBase,
    getPendingMerge,
    isStaleTab,
    noticeStorageChange,
    getDemoMix,
    removeDemoItems,
    dismissDemoMix,
    replaceWithTeamVersion,
    resolvePendingMerge,
    cancelPendingMerge,
    wasRestoredFromStorage,
    getLastSavedAt,
    getDatasetSource,
    getVersionInfo,
    getFilters,
    getChipFilterMode,
    setChipFilterMode,
    getMatrixMode,
    setMatrixMode,
    isolateThemes,
    toggleThemeFilter,
    isThemeActive,
    toggleStatusFilter,
    isStatusActive,
    toggleNoteTypeFilter,
    isNoteTypeActive,
    setOwnerFilter,
    setPrincipleFilter,
    setTeamPlanOnly,
    setSearch,
    setYearFilter,
    setQuarterFilter,
    clearFilters,
    clearFilter,
    getInbox,
    loadInbox,
    addInboxItem,
    landInboxItem,
    mergeInboxItem,
    parkInboxItem,
    rejectInboxItem,
    landedFromInbox,
    finishLandedInboxItem,
    updateSelectionContext,
    isFilterPanelOpen,
    toggleFilterPanel,
    hasActiveFilters,
    getView,
    setView,
    getSelection,
    select,
    getEditingNoteId,
    startEditNote,
    stopEditNote,
    isPresentationMode,
    togglePresentationMode,
    getZoomLevel,
    setZoomLevel,
    closeSelection,
    getDocuments,
    fetchDocuments,
    getOpenDocument,
    openDocument,
    getHelpPage,
    getViewBeforeHelp,
    openHelp,
    closeHelp,
    startReview,
    getReview,
    reviewAdvance,
    reviewBack,
    reviewAddNote,
    reviewCounts,
    reviewFlagSkipped,
    endReview,
  };
})();
