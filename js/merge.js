// js/merge.js
// Samenvoegen van twee versies van een Obeya die allebei zijn afgeleid van
// een gemeenschappelijke uitgangsversie (een "three-way merge"). Gebruikt
// door Ophalen en Delen (js/state.js) zodat twee mensen tegelijk aan het bord
// kunnen werken zonder elkaars wijzigingen kwijt te raken.
//
// Uitgangspunt: niet het bestand vergelijken, maar de items. De boom (thema →
// doel → meetbaar resultaat/project/actie/notitie) wordt platgeslagen tot
// losse items op id, met hun plek in de boom als gewoon veld. Per item en per
// veld geldt dan:
//
//   - alleen aan één kant gewijzigd  → die wijziging telt;
//   - aan beide kanten hetzelfde     → geen probleem;
//   - aan beide kanten verschillend  → botsing, de gebruiker kiest.
//
// Verwijderen volgt dezelfde logica: weg aan de ene kant en ongewijzigd aan
// de andere is weg; weg aan de ene kant en aangepast aan de andere is een
// botsing. Lijsten van id's (themeIds, measurableResultIds, eigenaren)
// worden als verzameling samengevoegd, zodat twee mensen die elk iets
// toevoegen allebei hun toevoeging houden.
//
// Puur en zonder afhankelijkheden: de module rekent alleen, de app beslist
// wat er met de uitkomst gebeurt. Zie docs/samenvoegen.md voor het hele
// verhaal, inclusief wat er bewust níet wordt samengevoegd.

const ObeyaMerge = (function () {
  'use strict';

  // Welke lijsten in welk soort item kinderen bevatten. Alles wat hier niet
  // staat, is een gewoon veld van het item zelf.
  const CHILD_LISTS = {
    theme: { objectives: 'objective' },
    objective: { measurableResults: 'measurableResult', projects: 'project', actions: 'action', notes: 'note' },
    project: { actions: 'action' },
  };

  // Velden die de app zelf uitrekent (de statusoptelling van doelen en
  // thema's). Die worden na het samenvoegen opnieuw berekend en kunnen dus
  // nooit botsen.
  // Velden die geen eigen inbreng zijn: de status die de app uitrekent, en de
  // oude waarden van een meetbaar resultaat (sinds 12 oktober 2026 een
  // deelproduct; normalizeDataset haalt ze weg). Een uitgangsversie van
  // daarvóór telt zo niet als eigen wijziging en botst niet.
  const DERIVED = { theme: ['status'], objective: ['status'], measurableResult: ['currentValue', 'targetValue', 'unit'] };

  // Lijsten van id's of namen: samenvoegen als verzameling.
  const SET_FIELDS = {
    theme: ['involved'], objective: ['themeIds', 'involved', 'principleIds'], measurableResult: ['involved'],
    project: ['measurableResultIds', 'involved', 'principleIds'], action: ['involved'], config: ['owners'],
  };

  const KIND_LABELS = {
    theme: 'Thema', objective: 'Doel', measurableResult: 'Meetbaar resultaat', project: 'Project',
    action: 'Actie', note: 'Notitie', relation: 'Relatie', principle: 'Principe', meta: 'Bordgegevens', config: 'Instellingen', root: 'Bord', change: 'Wijziging',
  };

  const FIELD_LABELS = {
    name: 'Naam', title: 'Titel', description: 'Omschrijving', owner: 'Eigenaar', status: 'Status',
    currentValue: 'Huidige waarde', targetValue: 'Doelwaarde', unit: 'Eenheid', valueCurrent: 'Stand', valueTarget: 'Doelwaarde', valueDate: 'Peildatum van de stand', monitoringText: 'Monitoren / toelichting',
    sourceStatus: 'Praktijkstatus', inTeamPlan: 'In teamplan', periodYear: 'Jaar', periodQuarter: 'Kwartaal',
    dueDate: 'Deadline', measurableResultId: 'Meetbaar resultaat', measurableResultIds: 'Meetbare resultaten',
    noMeasurableResultNeeded: 'Geen meetbaar resultaat nodig', flaggedForDiscussion: 'Gemarkeerd voor bespreking',
    themeIds: "Thema's", involved: 'Betrokkenen', principleIds: 'Principes', principles: 'Principes van het bord', favicon: 'Pictogram in het browsertabblad', workType: 'Soort werk', text: 'Tekst', type: 'Soort', author: 'Auteur', note: 'Toelichting', color: 'Kleur',
    owners: 'Eigenarenlijst', statusLabels: 'Statuslabels', display: 'Weergave van de muur', people: 'Rollen per persoon', roles: 'Rollen', roleGroups: 'Groepen van rollen', roleIds: 'Rollen in de groep', vision: 'Visie', __place: 'Plaats op het bord', __exists: 'Bestaat nog',
  };

  // Tijdstempels in meta die geen inhoudelijke wijziging zijn: de peildatum
  // en het moment waarop deze browser de data lokaal opsloeg (exportDataset).
  const META_TIMESTAMPS = ['lastUpdated', 'lastExported'];

  // "x.y.z" per getal vergelijken (0.10.0 is nieuwer dan 0.9.0): -1/0/1 voor
  // a<b, a=b, a>b. Een ontbrekende versie telt als de laagste.
  function compareVersions(a, b) {
    const pa = String(a || '0').split('.').map((n) => parseInt(n, 10) || 0);
    const pb = String(b || '0').split('.').map((n) => parseInt(n, 10) || 0);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const diff = (pa[i] || 0) - (pb[i] || 0);
      if (diff !== 0) return diff > 0 ? 1 : -1;
    }
    return 0;
  }

  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

  // --- platslaan --------------------------------------------------------------

  // Geeft { items: Map(key → item), order: Map(containerKey → [keys]) }.
  // Een item is { key, kind, place, fields }; `place` is "<ouder>/<lijst>",
  // zodat verplaatsen gewoon een gewijzigd veld is.
  function flatten(dataset) {
    const items = new Map();
    const order = new Map();
    if (!dataset) return { items, order };

    const add = (kind, entity, place) => {
      const fields = {};
      Object.keys(entity).forEach((k) => {
        if (CHILD_LISTS[kind] && CHILD_LISTS[kind][k]) return;
        fields[k] = clone(entity[k]);
      });
      const key = `${kind}:${entity.id}`;
      items.set(key, { key, kind, place, fields });
      if (!order.has(place)) order.set(place, []);
      order.get(place).push(key);
      Object.keys(CHILD_LISTS[kind] || {}).forEach((list) => {
        (entity[list] || []).forEach((child) => add(CHILD_LISTS[kind][list], child, `${key}/${list}`));
      });
    };

    (dataset.themes || []).forEach((t) => add('theme', t, 'themes'));
    (dataset.relations || []).forEach((r) => add('relation', r, 'relations'));
    // Het wijzigingslog (idee 70): elke regel een eigen item, zodat twee
    // mensen die elk iets vastleggen nooit botsen over het log.
    (Array.isArray(dataset.changeLog) ? dataset.changeLog : []).forEach((c) => { if (c && c.id) add('change', c, 'changeLog'); });
    if (dataset.meta) items.set('meta', { key: 'meta', kind: 'meta', place: '', fields: clone(dataset.meta) });
    // De principes van het bord elk als eigen item, zodat twee mensen die elk
    // een principe toevoegen of er een hernoemen niet botsen (zie data.js).
    if (dataset.config) {
      const { principles, ...config } = dataset.config;
      items.set('config', { key: 'config', kind: 'config', place: '', fields: clone(config) });
      (Array.isArray(principles) ? principles : []).forEach((p) => add('principle', p, 'principles'));
    }
    const rest = {};
    Object.keys(dataset).forEach((k) => {
      if (!['themes', 'relations', 'meta', 'config', 'changeLog'].includes(k)) rest[k] = clone(dataset[k]);
    });
    items.set('root', { key: 'root', kind: 'root', place: '', fields: rest });
    return { items, order };
  }

  // --- per veld samenvoegen ---------------------------------------------------

  function mergeSet(b, m, t) {
    const base = new Set(b || []);
    const mine = new Set(m || []);
    const theirs = new Set(t || []);
    const removed = new Set([...base].filter((x) => !mine.has(x) || !theirs.has(x)));
    const out = [];
    [...(t || []), ...(m || [])].forEach((x) => {
      if (!out.includes(x) && !removed.has(x)) out.push(x);
    });
    return out;
  }

  const isObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

  // Voor merge3: welke beslissing over een logregel blijft, of null als het
  // een echte botsing is.
  function reviewWinner(m, t) {
    const status = (r) => (r && r.status) || null;
    if (!isObject(m) || !isObject(t)) return null;
    if (status(m) === status(t)) {
      // Een afwijzing die daarna is teruggedraaid of bewust is blijven staan,
      // wint van dezelfde afwijzing zonder dat vervolg.
      const vervolg = (r) => (r.reverted ? 'teruggedraaid' : (r.kept ? 'laten staan' : ''));
      if (vervolg(m) && vervolg(t) && vervolg(m) !== vervolg(t)) return null;
      if (!!vervolg(m) !== !!vervolg(t)) return vervolg(m) ? m : t;
      return String(m.at || '') <= String(t.at || '') ? m : t;
    }
    if (status(m) === 'pending') return t;
    if (status(t) === 'pending') return m;
    return null;
  }

  // Een object (zoals config.display) per sleutel samenvoegen, ook genest.
  // Botst dezelfde sleutel, dan wordt dat één botsing voor die instelling.
  // `field` is het pad van het veld, voor de botsing (bijv. 'people.Daan').
  function mergeObject(idPrefix, labelPrefix, b, m, t, conflicts, choose, field) {
    const pad = field || 'display';
    const out = {};
    new Set([...Object.keys(m), ...Object.keys(t)]).forEach((k) => {
      const bv = b[k]; const mv = m[k]; const tv = t[k];
      let v;
      if (same(mv, tv)) v = mv;
      else if (isObject(mv) && isObject(tv)) v = mergeObject(`${idPrefix}.${k}`, `${labelPrefix}: ${k}`, isObject(bv) ? bv : {}, mv, tv, conflicts, choose, `${pad}.${k}`);
      else if (same(mv, bv)) v = tv;
      else if (same(tv, bv)) v = mv;
      else {
        const id = `${idPrefix}.${k}`;
        conflicts.push({ id, key: 'config', kind: 'config', label: 'Instellingen', field: `${pad}.${k}`, fieldLabel: `${labelPrefix}: ${k}`, mine: clone(mv), theirs: clone(tv) });
        v = choose(id, mv, tv, tv);
      }
      if (v !== undefined) out[k] = clone(v);
    });
    return out;
  }

  function labelOf(item) {
    if (!item) return '';
    const f = item.fields;
    if (item.kind === 'relation') return `${f.from} → ${f.to}`;
    return f.name || f.title || f.text || KIND_LABELS[item.kind] || item.key;
  }

  // Voegt één item samen. `b`, `m`, `t` zijn de versies (of undefined als het
  // item daar niet bestaat). Geeft { item | null, conflicts: [] }.
  function mergeItem(key, b, m, t, choices) {
    const conflicts = [];
    const ref = m || t || b;
    const choose = (id, mineVal, theirsVal, fallback) => {
      const c = choices[id];
      if (c === 'mine') return mineVal;
      if (c === 'theirs') return theirsVal;
      return fallback;
    };

    // Bestaat het nog? Alleen een botsing als de ene kant verwijderde en de
    // andere het item juist aanpaste.
    if (b && (!m || !t)) {
      const survivor = m || t;
      if (!survivor) return { item: null, conflicts };
      const changed = !same(survivor.fields, b.fields) || survivor.place !== b.place;
      if (!changed) return { item: null, conflicts };
      const id = `${key}#__exists`;
      const deletedBy = m ? 'theirs' : 'mine';
      conflicts.push({
        id, key, kind: ref.kind, label: labelOf(survivor), field: '__exists', fieldLabel: FIELD_LABELS.__exists,
        mine: m ? 'kept' : 'deleted', theirs: t ? 'kept' : 'deleted', deletedBy,
      });
      // Zolang er niet gekozen is, wint het behouden: liever iets te veel
      // dan stil iets kwijt.
      const keep = choose(id, !!m, !!t, true);
      if (!keep) return { item: null, conflicts };
      return { item: clone(survivor), conflicts };
    }

    if (!m && !t) return { item: null, conflicts };
    if (!m) return { item: clone(t), conflicts };
    if (!t) return { item: clone(m), conflicts };

    const out = { key, kind: ref.kind, place: t.place, fields: {} };
    const derived = DERIVED[ref.kind] || [];
    const sets = SET_FIELDS[ref.kind] || [];
    const bf = b ? b.fields : {};

    // De plek in de boom, als veld.
    const bp = b ? b.place : undefined;
    if (m.place !== t.place) {
      if (m.place === bp) out.place = t.place;
      else if (t.place === bp) out.place = m.place;
      else {
        const id = `${key}#__place`;
        conflicts.push({ id, key, kind: ref.kind, label: labelOf(m), field: '__place', fieldLabel: FIELD_LABELS.__place, mine: m.place, theirs: t.place });
        out.place = choose(id, m.place, t.place, t.place);
      }
    }

    const fields = new Set([...Object.keys(m.fields), ...Object.keys(t.fields)]);
    fields.forEach((f) => {
      const mv = m.fields[f];
      const tv = t.fields[f];
      const bv = bf[f];
      let value;
      if (same(mv, tv)) value = mv;
      else if (derived.includes(f)) value = tv;
      // Tijdstempels (peildatum, moment van lokaal opslaan) botsen nooit: de
      // meest recente geldt.
      else if (ref.kind === 'meta' && META_TIMESTAMPS.includes(f)) value = String(mv || '') > String(tv || '') ? mv : tv;
      // De hoogste app-versie die aan het bord werkte (state.js) botst ook
      // nooit: de nieuwste geldt.
      else if (ref.kind === 'meta' && f === 'version') value = compareVersions(mv, tv) >= 0 ? mv : tv;
      // Overleg afgerond (stap 5 van het wijzigingslog): het laatste overleg geldt.
      // (Alleen een echt object telt: een kapotte waarde verliest altijd.)
      else if (ref.kind === 'meta' && f === 'lastMeeting') {
        const at = (v) => (isObject(v) && typeof v.at === 'string' ? v.at : '');
        value = at(mv) >= at(tv) ? mv : tv;
      }
      else if (sets.includes(f)) value = mergeSet(bv, mv, tv);
      // De beslissing over een logregel: dezelfde beslissing van twee mensen
      // botst niet (de eerste blijft), en een beslissing wint altijd van
      // "wacht nog". Alleen bevestigd tegenover afgewezen is een botsing.
      else if (ref.kind === 'change' && f === 'review' && reviewWinner(mv, tv)) value = reviewWinner(mv, tv);
      else if (ref.kind === 'config' && f === 'display' && isObject(mv) && isObject(tv)) {
        // De weergave van de muur per instelling samenvoegen: wie de kleuren
        // aanpast en wie het detailniveau, botsen niet.
        value = mergeObject(`${key}#display`, FIELD_LABELS.display, isObject(bv) ? bv : {}, mv, tv, conflicts, choose);
      }
      else if (ref.kind === 'config' && (f === 'roles' || f === 'roleGroups') && Array.isArray(mv) && Array.isArray(tv)) {
        // Rollen per rol (op id): wie een rol toevoegt en wie een andere
        // hernoemt, botsen niet. Volgorde: die van mij, nieuwe van het team erachter.
        const perId = (lijst) => Object.fromEntries((lijst || []).filter((r) => r && r.id).map((r) => [r.id, r]));
        const basis = perId(Array.isArray(bv) ? bv : []);
        const mijn = perId(mv);
        const hun = perId(tv);
        // De rollen in een groep als verzameling: wie rol X toevoegt en wie
        // rol Y, houden ze allebei (review data-guardian, 23 nov 2026).
        if (f === 'roleGroups') {
          Object.keys(mijn).filter((id) => hun[id]).forEach((id) => {
            const rollen = mergeSet(basis[id] && basis[id].roleIds, mijn[id].roleIds, hun[id].roleIds);
            mijn[id] = { ...mijn[id], roleIds: rollen };
            hun[id] = { ...hun[id], roleIds: rollen };
          });
        }
        const samen = mergeObject(`${key}#${f}`, FIELD_LABELS[f], basis, mijn, hun, conflicts, choose, f);
        value = [...mv.map((r) => r.id), ...tv.map((r) => r.id)].filter((id, i, a) => a.indexOf(id) === i && samen[id]).map((id) => samen[id]);
      }
      else if (ref.kind === 'config' && f === 'people' && isObject(mv) && isObject(tv)) {
        // Rollen en GitHub-login per persoon: wie Daans rollen aanpast en wie
        // die van Bo, botsen niet.
        value = mergeObject(`${key}#people`, FIELD_LABELS.people, isObject(bv) ? bv : {}, mv, tv, conflicts, choose, 'people');
      }
      else if (b && same(mv, bv)) value = tv;
      else if (b && same(tv, bv)) value = mv;
      else {
        const id = `${key}#${f}`;
        conflicts.push({ id, key, kind: ref.kind, label: labelOf(m), field: f, fieldLabel: FIELD_LABELS[f] || f, mine: clone(mv), theirs: clone(tv) });
        value = choose(id, mv, tv, tv);
      }
      if (value !== undefined) out.fields[f] = clone(value);
    });
    return { item: out, conflicts };
  }

  // --- weer opbouwen ------------------------------------------------------------

  // Volgorde binnen een lijst: die van het team, met wat alleen jij had erachter
  // in jouw volgorde. Zo springt niets van plek bij wie de teamversie al had.
  function orderFor(place, merged, mineOrder, theirsOrder) {
    const keys = [];
    const push = (k) => {
      const item = merged.get(k);
      if (item && item.place === place && !keys.includes(k)) keys.push(k);
    };
    (theirsOrder.get(place) || []).forEach(push);
    (mineOrder.get(place) || []).forEach(push);
    merged.forEach((item, k) => { if (item.place === place) push(k); });
    return keys;
  }

  function rebuild(merged, mineOrder, theirsOrder) {
    const build = (key) => {
      const item = merged.get(key);
      const entity = clone(item.fields);
      Object.keys(CHILD_LISTS[item.kind] || {}).forEach((list) => {
        entity[list] = orderFor(`${key}/${list}`, merged, mineOrder, theirsOrder).map(build);
      });
      return entity;
    };
    const root = merged.get('root');
    const dataset = root ? clone(root.fields) : {};
    if (merged.has('meta')) dataset.meta = clone(merged.get('meta').fields);
    dataset.themes = orderFor('themes', merged, mineOrder, theirsOrder).map(build);
    dataset.relations = orderFor('relations', merged, mineOrder, theirsOrder).map(build);
    const log = orderFor('changeLog', merged, mineOrder, theirsOrder).map(build);
    if (log.length) dataset.changeLog = log.sort((a, b) => String(a.at || '').localeCompare(String(b.at || '')));
    if (merged.has('config')) dataset.config = clone(merged.get('config').fields);
    const principles = orderFor('principles', merged, mineOrder, theirsOrder).map(build);
    if (principles.length) {
      if (!dataset.config) dataset.config = {};
      dataset.config.principles = principles;
    }
    return dataset;
  }

  // --- publiek -----------------------------------------------------------------

  // Voegt `mine` en `theirs` samen ten opzichte van `base`. Zonder `base`
  // (geen gemeenschappelijke versie bekend) wordt niets als verwijderd
  // beschouwd en botst elk verschil: veilig, maar mogelijk veel keuzes.
  //
  // `choices` is { conflictId: 'mine' | 'theirs' } voor botsingen die al
  // beslist zijn. Geeft { dataset, conflicts, theirsChanges, mineChanges }:
  // `dataset` is de uitkomst met, voor nog onbesliste botsingen, de keuze
  // die het minst kan kwijtraken (teamversie, of behouden bij verwijderen).
  function merge3(base, mine, theirs, choices) {
    const B = flatten(base);
    const M = flatten(mine);
    const T = flatten(theirs);
    const keuzes = choices || {};
    const merged = new Map();
    let conflicts = [];

    const keys = new Set([...B.items.keys(), ...M.items.keys(), ...T.items.keys()]);
    keys.forEach((key) => {
      const res = mergeItem(key, B.items.get(key), M.items.get(key), T.items.get(key), keuzes);
      conflicts = conflicts.concat(res.conflicts);
      if (res.item) merged.set(key, res.item);
    });

    // Wees-items: de ene kant verwijderde een doel, de andere hing er net iets
    // onder. Dan wordt het verwijderen van die ouder een botsing, en blijft de
    // ouder staan tot er gekozen is.
    // Is er gekozen om de ouder tóch te verwijderen, dan gaat alles eronder
    // stil mee — één keuze, niet een nieuwe botsing per kleinkind.
    const weg = new Set();
    let gewijzigd = true;
    while (gewijzigd) {
      gewijzigd = false;
      Array.from(merged.values()).forEach((item) => {
        if (!merged.has(item.key)) return;
        if (!item.place || ['themes', 'relations', 'principles', 'changeLog'].includes(item.place)) return;
        const parentKey = item.place.slice(0, item.place.lastIndexOf('/'));
        if (merged.has(parentKey)) return;
        const parent = M.items.get(parentKey) || T.items.get(parentKey) || B.items.get(parentKey);
        if (!parent || weg.has(parentKey)) { merged.delete(item.key); weg.add(item.key); gewijzigd = true; return; }
        const id = `${parentKey}#__exists`;
        if (!conflicts.some((c) => c.id === id)) {
          conflicts.push({
            id, key: parentKey, kind: parent.kind, label: labelOf(parent), field: '__exists', fieldLabel: FIELD_LABELS.__exists,
            mine: M.items.has(parentKey) ? 'kept' : 'deleted', theirs: T.items.has(parentKey) ? 'kept' : 'deleted',
            deletedBy: M.items.has(parentKey) ? 'theirs' : 'mine', reason: 'children',
          });
        }
        const keuze = keuzes[id];
        const keep = keuze ? (keuze === 'mine' ? M.items.has(parentKey) : T.items.has(parentKey)) : true;
        if (keep) merged.set(parentKey, clone(parent));
        else { merged.delete(item.key); weg.add(parentKey); weg.add(item.key); }
        gewijzigd = true;
      });
    }

    const dataset = rebuild(merged, M.order, T.order);
    return {
      dataset,
      conflicts,
      theirsChanges: countChanges(B, T),
      mineChanges: countChanges(B, M),
    };
  }

  // Hoeveel items verschillen tussen twee versies (toegevoegd, verwijderd of
  // aangepast), zonder de velden die de app zelf uitrekent en zonder de
  // peildatum — anders lijkt elk bord na één klik "gewijzigd".
  function countChanges(A, Z) {
    const strip = (item) => {
      if (!item) return null;
      const f = { ...item.fields };
      (DERIVED[item.kind] || []).forEach((k) => delete f[k]);
      if (item.kind === 'meta') [...META_TIMESTAMPS, 'version'].forEach((k) => delete f[k]);
      return { place: item.place, f };
    };
    let n = 0;
    new Set([...A.items.keys(), ...Z.items.keys()]).forEach((k) => {
      // Een logregel is geen wijziging op het bord zelf: een nieuwe regel hoort
      // bij een bordwijziging die al meetelt. Een beslissing over een regel
      // (bevestigd, afgewezen) telt wel, anders zegt Delen "niets te delen" en
      // vervangt Ophalen het bord, met de beslissing.
      if ((A.items.get(k) || Z.items.get(k)).kind === 'change') {
        const a = A.items.get(k);
        const z = Z.items.get(k);
        if (a && z && !same(a.fields.review, z.fields.review)) n++;
        return;
      }
      if (!same(strip(A.items.get(k)), strip(Z.items.get(k)))) n++;
    });
    return n;
  }

  function changesBetween(a, z) {
    return countChanges(flatten(a), flatten(z));
  }

  // Hoeveel items (thema's, doelen, resultaten, projecten, acties, notities,
  // relaties) twee versies gemeen hebben. Nul betekent: twee verschillende
  // borden, die je nooit moet samenvoegen.
  function sharedItems(a, z) {
    const A = flatten(a).items;
    let n = 0;
    flatten(z).items.forEach((item, key) => {
      if (!['meta', 'config', 'root', 'principle', 'change'].includes(item.kind) && A.has(key)) n++;
    });
    return n;
  }

  return { merge3, changesBetween, sharedItems, compareVersions, flatten, rebuild, KIND_LABELS, FIELD_LABELS, DERIVED, META_TIMESTAMPS };
})();
