// js/git-backend.js
// GitHub-databackend: leest/schrijft data/obeya.json in een los data-repo via
// de GitHub REST API, zodat teamleden buiten deze ene browser om kunnen
// samenwerken. Elke opslag wordt een git-commit — dat geeft "wie wijzigde
// wat, wanneer" vrijwel gratis via git-log, zonder dat daar iets voor
// gebouwd hoeft te worden. Zie ROADMAP.md idee 4+49.
//
// Bewust een dunne, geïsoleerde laag: alle GitHub-specifieke details (API-
// vorm, base64-codering, sha-gebaseerde conflictdetectie) leven hier en
// alleen hier, zodat een latere overstap naar een andere git-provider (zelf
// gehost Gitea/Forgejo, Codeberg, ...) een beperkte wijziging blijft — de
// rest van de app kent alleen isConfigured/testConnection/
// loadRemoteDataset/saveRemoteDataset.
//
// Authenticatie: een fine-grained Personal Access Token, door de gebruiker
// zelf aangemaakt (scope: alleen dit ene repo, Contents read/write) en
// lokaal in déze browser bewaard — nooit naar een ander adres dan
// api.github.com gestuurd. Geen eigen server nodig voor v1 (geen OAuth-
// tokenuitwisseling, dus ook geen CORS-obstakel zoals bij de Asana-analyse).

const ObeyaGitBackend = (function () {
  'use strict';

  // Instellingen en token bewust apart. Het zijn twee verschillende dingen:
  // eigenaar/repo/branch/pad zijn geen geheim en veranderen vrijwel nooit, het
  // token is een geheim dat een wachtwoordbeheerder hoort te bewaren. Stonden
  // ze samen, dan verdween ook de eigenaar zodra het token ontbrak — en mocht
  // je dus elke keer opnieuw invullen.
  const SETTINGS_KEY = 'obeya-git-settings';
  const TOKEN_KEY = 'obeya-git-token';
  // Wie er achter het token zit (GitHub-login + naam), vastgelegd na een
  // geslaagde verbindingstest. Staat altijd naast het token, in dezelfde
  // opslag: bij een ander token hoort mogelijk iemand anders.
  const IDENTITY_KEY = 'obeya-git-identity';
  // Tot september 2026 stond alles in één sleutel; die wordt hieronder
  // eenmalig overgezet en daarna opgeruimd.
  const CONFIG_KEY = 'obeya-git-backend-config';
  const API_BASE = 'https://api.github.com';
  const API_VERSION = '2022-11-28';

  // --- config (owner/repo/branch/path/token) --------------------------

  function lees(opslag, sleutel) {
    try {
      return opslag.getItem(sleutel);
    } catch (err) {
      return null; // privémodus of geblokkeerde opslag
    }
  }

  function schrijf(opslag, sleutel, waarde) {
    try {
      opslag.setItem(sleutel, waarde);
    } catch (err) {
      console.warn('Kon niet opslaan in deze browser:', err);
    }
  }

  function wis(opslag, sleutel) {
    try {
      opslag.removeItem(sleutel);
    } catch (err) {
      // niets te wissen
    }
  }

  // De oude, samengevoegde sleutel eenmalig overzetten.
  function migreerOudeConfig() {
    const raw = lees(localStorage, CONFIG_KEY);
    if (!raw) return;
    try {
      const oud = JSON.parse(raw);
      if (oud && (oud.owner || oud.repo)) {
        schrijf(localStorage, SETTINGS_KEY, JSON.stringify({
          owner: oud.owner || '', repo: oud.repo || '',
          branch: oud.branch || 'main', path: oud.path || 'data/obeya.json',
        }));
      }
      if (oud && oud.token) schrijf(localStorage, TOKEN_KEY, oud.token);
    } catch (err) {
      console.warn('Kon de oude git-configuratie niet overzetten:', err);
    }
    wis(localStorage, CONFIG_KEY);
  }

  // Het vaste teamrepo uit js/team-config.js, als eigenaar/repo; leeg als
  // daar niets (bruikbaars) staat.
  function teamRepo() {
    const url = typeof ObeyaTeamConfig !== 'undefined' && ObeyaTeamConfig ? ObeyaTeamConfig.dataRepo : '';
    return parseOwnerRepoFromUrl(url) || { owner: '', repo: '' };
  }

  // Alleen de niet-geheime instellingen. Deze zijn er ook als er (nog) geen
  // token is, zodat het formulier altijd ingevuld kan openen. Heeft iemand
  // zelf nog niets opgeslagen, dan staat het teamrepo er al.
  function getSettings() {
    migreerOudeConfig();
    let opgeslagen = {};
    try {
      opgeslagen = JSON.parse(lees(localStorage, SETTINGS_KEY) || '{}') || {};
    } catch (err) {
      console.warn('Kon git-instellingen niet lezen:', err);
    }
    // Een opgeslagen vroeger adres van het teamrepo telt niet als eigen keuze:
    // dan geldt het huidige teamrepo (het repo is verhuisd).
    const vroeger = (typeof ObeyaTeamConfig !== 'undefined' && ObeyaTeamConfig && ObeyaTeamConfig.formerDataRepos) || [];
    const isVroeger = vroeger.map(parseOwnerRepoFromUrl).some((r) => r && opgeslagen.owner && opgeslagen.repo
      && r.owner.toLowerCase() === String(opgeslagen.owner).toLowerCase() && r.repo.toLowerCase() === String(opgeslagen.repo).toLowerCase());
    const eigen = opgeslagen.owner && opgeslagen.repo && !isVroeger;
    const team = eigen ? null : teamRepo();
    return {
      owner: eigen ? opgeslagen.owner : team.owner,
      repo: eigen ? opgeslagen.repo : team.repo,
      isTeamRepo: !eigen && !!team.owner,
      branch: opgeslagen.branch || 'main',
      path: opgeslagen.path || 'data/obeya.json',
    };
  }

  // Het token staat in localStorage wanneer de gebruiker koos voor onthouden,
  // anders in sessionStorage: dan is het weg zodra de browser sluit en vult de
  // wachtwoordbeheerder het de volgende keer opnieuw in.
  function getToken() {
    migreerOudeConfig();
    return lees(sessionStorage, TOKEN_KEY) || lees(localStorage, TOKEN_KEY) || '';
  }

  function isTokenRemembered() {
    return !!lees(localStorage, TOKEN_KEY);
  }

  function getConfig() {
    const settings = getSettings();
    const token = getToken();
    if (!settings.owner || !settings.repo || !token) return null;
    return { owner: settings.owner, repo: settings.repo, branch: settings.branch, path: settings.path, token };
  }

  // Mensen plakken hier begrijpelijk vaak de hele GitHub-URL uit de
  // adresbalk i.p.v. alleen de repo-naam — herken dat patroon en haal er
  // automatisch de kale eigenaar/repo uit, in plaats van pas bij de eerste
  // API-aanroep een cryptische "Not Found" te tonen.
  function parseOwnerRepoFromUrl(str) {
    const match = String(str || '').trim().match(/github\.com\/([^/\s]+)\/([^/\s]+?)(\.git)?\/?$/i);
    if (!match) return null;
    return { owner: match[1], repo: match[2] };
  }

  function setConfig(config) {
    let owner = (config.owner || '').trim();
    let repo = (config.repo || '').trim();
    const fromUrl = parseOwnerRepoFromUrl(repo) || parseOwnerRepoFromUrl(owner);
    if (fromUrl) {
      // Eigenaar alleen overnemen als dat veld zelf ook een URL was (of leeg)
      // — een bewust apart ingevulde eigenaar blijft dan ongemoeid.
      if (!owner || parseOwnerRepoFromUrl(owner)) owner = fromUrl.owner;
      repo = fromUrl.repo;
    }
    const clean = {
      owner,
      repo,
      branch: (config.branch || 'main').trim() || 'main',
      path: (config.path || 'data/obeya.json').trim() || 'data/obeya.json',
      token: (config.token || '').trim(),
    };
    schrijf(localStorage, SETTINGS_KEY, JSON.stringify({
      owner: clean.owner, repo: clean.repo, branch: clean.branch, path: clean.path,
    }));
    if (clean.token) {
      // remember bepaalt of het token deze browser overleeft; standaard niet,
      // want de app staat op een publiek bereikbare URL en een
      // wachtwoordbeheerder invullen kost één klik.
      const onthouden = config.remember === true;
      const vorigToken = getToken();
      schrijf(onthouden ? localStorage : sessionStorage, TOKEN_KEY, clean.token);
      wis(onthouden ? sessionStorage : localStorage, TOKEN_KEY);
      const identiteit = clean.token === vorigToken ? getIdentity() : null;
      wis(localStorage, IDENTITY_KEY);
      wis(sessionStorage, IDENTITY_KEY);
      if (identiteit) setIdentity(identiteit);
    }
    wis(localStorage, CONFIG_KEY);
    return clean;
  }

  function getIdentity() {
    const raw = lees(sessionStorage, IDENTITY_KEY) || lees(localStorage, IDENTITY_KEY);
    if (!raw) return null;
    try {
      const id = JSON.parse(raw);
      return id && id.login ? { login: id.login, name: id.name || id.login } : null;
    } catch (err) {
      return null;
    }
  }

  // Bewaard in dezelfde opslag als het token: een token dat alleen deze
  // sessie geldt, laat ook geen naam achter in de blijvende opslag.
  function setIdentity(user) {
    wis(localStorage, IDENTITY_KEY);
    wis(sessionStorage, IDENTITY_KEY);
    if (!user || !user.login) return;
    const opslag = isTokenRemembered() ? localStorage : sessionStorage;
    schrijf(opslag, IDENTITY_KEY, JSON.stringify({ login: user.login, name: user.name || user.login }));
  }

  function clearConfig() {
    wis(localStorage, SETTINGS_KEY);
    wis(localStorage, TOKEN_KEY);
    wis(sessionStorage, TOKEN_KEY);
    wis(localStorage, IDENTITY_KEY);
    wis(sessionStorage, IDENTITY_KEY);
    localStorage.removeItem(CONFIG_KEY);
  }

  function isConfigured() {
    return !!getConfig();
  }

  // --- utf-8-veilige base64 --------------------------------------------
  // btoa/atob werken alleen op Latin1 (byte-waarden 0-255); onze data bevat
  // Nederlandse diakrieten (ë, ï, ü) en emoji (📌) die daar meteen op
  // breken. Via TextEncoder/TextDecoder omweg over een byte-array.

  function utf8ToBase64(str) {
    const bytes = new TextEncoder().encode(str);
    let binary = '';
    bytes.forEach((b) => { binary += String.fromCharCode(b); });
    return btoa(binary);
  }

  function base64ToUtf8(b64) {
    const binary = atob(b64.replace(/[\n\r]/g, ''));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  // --- low-level request --------------------------------------------------

  async function request(config, method, path, body) {
    let res;
    try {
      res = await fetch(`${API_BASE}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${config.token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': API_VERSION,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (err) {
      // Netwerkfout (geen verbinding, CORS, etc.) — geen HTTP-status
      // beschikbaar, apart van een fout-antwoord van GitHub zelf.
      return { ok: false, status: 0, json: null, networkError: true };
    }
    let json = null;
    try { json = await res.json(); } catch (err) { /* leeg antwoord, bv. bij sommige foutcodes */ }
    return { ok: res.ok, status: res.status, json };
  }

  function errorFor(status) {
    if (status === 0) return 'network';
    if (status === 401) return 'invalid-token';
    if (status === 403) return 'forbidden';
    if (status === 404) return 'not-found';
    return 'unknown';
  }

  function repoPath(cfg) {
    return `/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}`;
  }

  function contentsPath(cfg) {
    return `${repoPath(cfg)}/contents/${cfg.path}`;
  }

  // GitHub antwoordt "Not Found" op zowel een ontbrekend bestand als een
  // privé-repo waar het token niet bij mag (om niet te verklappen dat het
  // repo bestaat). Zoek stap voor stap uit welke van de twee het is, zodat
  // de melding zegt wat er te doen valt.
  async function diagnoseNotFound(cfg) {
    const repo = await request(cfg, 'GET', repoPath(cfg));
    if (repo.status === 404) return 'no-repo-access';
    const branch = await request(cfg, 'GET', `${repoPath(cfg)}/branches/${encodeURIComponent(cfg.branch)}`);
    if (branch.status === 404) return 'branch-not-found';
    return 'file-not-found';
  }

  // --- publieke acties ------------------------------------------------

  // Bevestigt dat het token werkt én bij het databestand kan. Geeft de
  // ingelogde gebruikersnaam terug — ook de bron voor "wie ben ik", i.p.v.
  // een vrij-tekst naamveld — en doet dat ook als het repo onbereikbaar
  // blijkt: het token zelf is dan immers wel geldig.
  async function testConnection(config) {
    const cfg = config || getConfig();
    if (!cfg) return { ok: false, error: 'not-configured' };
    const user = await request(cfg, 'GET', '/user');
    if (!user.ok) return { ok: false, error: errorFor(user.status), status: user.status, detail: user.json && user.json.message };
    const wie = { username: user.json.login, name: user.json.name || user.json.login };
    const bestand = await request(cfg, 'GET', `${contentsPath(cfg)}?ref=${encodeURIComponent(cfg.branch)}`);
    if (bestand.status === 404) return { ok: false, error: await diagnoseNotFound(cfg), ...wie };
    if (!bestand.ok) return { ok: false, error: errorFor(bestand.status), status: bestand.status, detail: bestand.json && bestand.json.message, ...wie };
    return { ok: true, ...wie };
  }

  // Haalt de huidige data/obeya.json op uit het data-repo. Geeft naast de
  // dataset ook de sha terug — nodig om straks conflictbewust (i.p.v.
  // "laatste export wint") terug te kunnen schrijven.
  async function loadRemoteDataset(config) {
    const cfg = config || getConfig();
    if (!cfg) return { ok: false, error: 'not-configured' };
    const { ok, status, json } = await request(cfg, 'GET', `${contentsPath(cfg)}?ref=${encodeURIComponent(cfg.branch)}`);
    if (status === 404) return { ok: false, error: await diagnoseNotFound(cfg), status };
    if (!ok) return { ok: false, error: errorFor(status), status, detail: json && json.message };
    if (!json || json.encoding !== 'base64' || typeof json.content !== 'string') {
      return { ok: false, error: 'unexpected-format' };
    }
    let dataset;
    try {
      dataset = JSON.parse(base64ToUtf8(json.content));
    } catch (err) {
      return { ok: false, error: 'invalid-json' };
    }
    return { ok: true, dataset, sha: json.sha };
  }

  // Stukken (idee 54): de Markdown-bestanden in de map stukken/ van het
  // data-repo, naast de teamdata. Alleen lezen; schrijven gaat via git. Geen
  // map is geen fout: dan zijn er (nog) geen stukken.
  const DOCS_DIR = 'stukken';
  // Afbeeldingen bij de stukken: alleen in stukken/afbeeldingen/, alleen deze
  // soorten. Ze komen als data-URL mee, zodat de app ze als <img> toont (een
  // SVG in een <img> voert geen scripts uit en laadt niets van buiten).
  const IMAGES_DIR = 'afbeeldingen';
  const IMAGE_TYPES = { svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' };

  async function loadRemoteDocuments(config) {
    const cfg = config || getConfig();
    if (!cfg) return { ok: false, error: 'not-configured' };
    const ref = `?ref=${encodeURIComponent(cfg.branch)}`;
    const lijst = await request(cfg, 'GET', `${repoPath(cfg)}/contents/${DOCS_DIR}${ref}`);
    if (lijst.status === 404) return { ok: true, docs: [], images: [] };
    if (!lijst.ok || !Array.isArray(lijst.json)) return { ok: false, error: lijst.ok ? 'unexpected-format' : errorFor(lijst.status), status: lijst.status };
    const bestanden = lijst.json.filter((f) => f && f.type === 'file' && /\.md$/i.test(f.name) && f.name.toLowerCase() !== 'readme.md');
    const docs = [];
    for (const f of bestanden) {
      const res = await request(cfg, 'GET', `${repoPath(cfg)}/contents/${f.path.split('/').map(encodeURIComponent).join('/')}${ref}`);
      if (!res.ok || !res.json || res.json.encoding !== 'base64') return { ok: false, error: res.ok ? 'unexpected-format' : errorFor(res.status), status: res.status };
      docs.push({ path: f.path, sha: res.json.sha || f.sha, text: base64ToUtf8(res.json.content) });
    }
    const images = [];
    if (lijst.json.some((f) => f && f.type === 'dir' && f.name === IMAGES_DIR)) {
      const map = await request(cfg, 'GET', `${repoPath(cfg)}/contents/${DOCS_DIR}/${IMAGES_DIR}${ref}`);
      for (const f of (map.ok && Array.isArray(map.json) ? map.json : [])) {
        const soort = f && f.type === 'file' && IMAGE_TYPES[(String(f.name).split('.').pop() || '').toLowerCase()];
        if (!soort) continue;
        const res = await request(cfg, 'GET', `${repoPath(cfg)}/contents/${f.path.split('/').map(encodeURIComponent).join('/')}${ref}`);
        // Een afbeelding die niet lukt, of boven 1 MB (dan geeft GitHub geen
        // inhoud mee), slaan we over: het stuk zegt dan "Afbeelding ontbreekt",
        // en de teksten van alle stukken komen gewoon binnen.
        if (!res.ok || !res.json || res.json.encoding !== 'base64' || !res.json.content) continue;
        images.push({ path: f.path, sha: res.json.sha || f.sha, dataUrl: `data:${soort};base64,${String(res.json.content).replace(/\s+/g, '')}` });
      }
    }
    return { ok: true, docs, images };
  }

  // Committeert dataset naar het data-repo. `sha` moet de sha zijn van de
  // laatst opgehaalde versie (of null voor een eerste commit van een nog
  // niet bestaand bestand) — GitHub wijst de commit af (conflict) als er
  // ondertussen door iemand anders is opgeslagen, i.p.v. dat stil te
  // overschrijven.
  async function saveRemoteDataset(config, dataset, sha, message) {
    const cfg = config || getConfig();
    if (!cfg) return { ok: false, error: 'not-configured' };
    const content = utf8ToBase64(JSON.stringify(dataset, null, 2));
    const body = {
      message: message || 'Wijziging via Obeya-bord',
      content,
      branch: cfg.branch,
    };
    if (sha) body.sha = sha;
    const { ok, status, json } = await request(cfg, 'PUT', contentsPath(cfg), body);
    if (!ok) {
      if (status === 409 || status === 422) return { ok: false, error: 'conflict', status, detail: json && json.message };
      if (status === 404) return { ok: false, error: await diagnoseNotFound(cfg), status };
      return { ok: false, error: errorFor(status), status, detail: json && json.message };
    }
    return { ok: true, sha: json.content && json.content.sha, commitUrl: json.commit && json.commit.html_url };
  }

  // --- de inbox: issues met het label "inbox" in het data-repo ----------------
  // Een token zonder rechten op Issues krijgt 403 of 404; dat wordt
  // 'issues-forbidden', met een eigen uitleg (zie ui-helpers gitErrorMessage).
  function issueError(status) {
    return status === 403 || status === 404 ? 'issues-forbidden' : errorFor(status);
  }

  async function listInboxIssues(config) {
    const cfg = config || getConfig();
    if (!cfg) return { ok: false, error: 'not-configured' };
    const res = await request(cfg, 'GET', `${repoPath(cfg)}/issues?labels=inbox&state=open&per_page=100`);
    if (!res.ok || !Array.isArray(res.json)) return { ok: false, error: issueError(res.status), status: res.status };
    return { ok: true, issues: res.json };
  }

  async function createIssue(config, issue) {
    const cfg = config || getConfig();
    if (!cfg) return { ok: false, error: 'not-configured' };
    const res = await request(cfg, 'POST', `${repoPath(cfg)}/issues`, issue);
    return res.ok ? { ok: true, issue: res.json } : { ok: false, error: issueError(res.status), status: res.status };
  }

  async function commentIssue(config, number, body) {
    const cfg = config || getConfig();
    if (!cfg) return { ok: false, error: 'not-configured' };
    const res = await request(cfg, 'POST', `${repoPath(cfg)}/issues/${Number(number)}/comments`, { body });
    return res.ok ? { ok: true } : { ok: false, error: issueError(res.status), status: res.status };
  }

  async function getIssue(config, number) {
    const cfg = config || getConfig();
    if (!cfg) return { ok: false, error: 'not-configured' };
    const res = await request(cfg, 'GET', `${repoPath(cfg)}/issues/${Number(number)}`);
    return res.ok && res.json ? { ok: true, issue: res.json } : { ok: false, error: issueError(res.status), status: res.status };
  }

  // patch: { state, state_reason, body, labels }
  async function updateIssue(config, number, patch) {
    const cfg = config || getConfig();
    if (!cfg) return { ok: false, error: 'not-configured' };
    const res = await request(cfg, 'PATCH', `${repoPath(cfg)}/issues/${Number(number)}`, patch);
    return res.ok ? { ok: true, issue: res.json } : { ok: false, error: issueError(res.status), status: res.status };
  }

  return {
    listInboxIssues,
    getIssue,
    createIssue,
    commentIssue,
    updateIssue,
    getConfig,
    getSettings,
    getToken,
    isTokenRemembered,
    getIdentity,
    setIdentity,
    setConfig,
    clearConfig,
    isConfigured,
    testConnection,
    loadRemoteDataset,
    loadRemoteDocuments,
    saveRemoteDataset,
  };
})();
