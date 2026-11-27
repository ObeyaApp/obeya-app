// js/data.js
// Data / repository layer for the Obeya PoC.
//
// Responsibilities:
// - own the shape of the Obeya dataset (themes -> objectives -> measurable
//   results / projects (-> actions) / notes);
// - load the initial dataset (from data/obeya.json when served over http,
//   falling back to the embedded js/seed-data.js copy so the app also works
//   when index.html is opened directly from disk);
// - provide CRUD helpers that mutate a dataset in place;
// - provide export/import of the full dataset as JSON;
// - know nothing about the DOM. UI code must not reach into this shape
//   directly except through the functions below, so storage can change later
//   without rewriting the UI.

const ObeyaData = (function () {
  'use strict';

  // De waarden die thema/doel kunnen hebben: hun status is altijd een
  // automatische rollup, nooit handmatig gekozen (zie rollupStatus/
  // recomputeRollups). Groen, amber en rood zijn een oordeel; "bezig" (blauw)
  // betekent dat er werk loopt maar nog niets is beoordeeld.
  const STATUS_VALUES = ['green', 'blue', 'amber', 'red', 'grey'];

  const STATUS_META = {
    green: { label: 'Op koers', en: 'on track' },
    amber: { label: 'Aandacht nodig', en: 'attention required' },
    red: { label: 'Buiten koers', en: 'off track' },
    grey: { label: 'Niet beoordeeld', en: 'not assessed / unknown' },
    // Uitbreiding voor entiteiten met een taakachtige levenscyclus (project/
    // actie) of een bereikbare eindwaarde (meetbaar resultaat). Nooit
    // gebruikt door thema/doel. Zie docs/statusmodel-voorstel.md.
    blue: { label: 'Bezig', en: 'in progress' },
    done: { label: 'Klaar', en: 'done' },
  };

  // Welke statuswaarden een entiteitstype mag gebruiken. Thema/doel expliciet
  // hier ook in (i.p.v. de generieke STATUS_VALUES-fallback) zodat de
  // statuslabels-configuratie hieronder alle 5 entiteitstypen even expliciet
  // kan doorlopen.
  const STATUS_LABEL_ENTITY_TYPES = ['theme', 'objective', 'measurableResult', 'project', 'action'];

  const STATUS_VALUES_BY_TYPE = {
    theme: ['grey', 'blue', 'green', 'amber', 'red'],
    objective: ['grey', 'blue', 'green', 'amber', 'red'],
    measurableResult: ['grey', 'green', 'amber', 'red', 'done'],
    project: ['grey', 'blue', 'green', 'amber', 'red'],
    action: ['grey', 'blue', 'green', 'amber', 'red'],
  };

  // Dezelfde onderliggende waarde/kleur kan per entiteitstype iets anders
  // betekenen — "groen" is bij een project/actie "Klaar", niet "Op koers".
  // Vaste standaardmapping; het team kan dit per entiteitstype overschrijven
  // via "Statuslabels beheren" (dataset.config.statusLabels, zie ensureConfig
  // hieronder) — zie ROADMAP idee 18/40 en docs/statusmodel-voorstel.md.
  // "Grijs" is bij project/actie standaard een samengevoegd label: met de
  // huidige (uit Excel geconverteerde) data is niet betrouwbaar te
  // onderscheiden wat nog niet is opgepakt versus nooit is beoordeeld.
  const STATUS_LABEL_OVERRIDES = {
    project: { grey: 'Nog niet opgepakt / onbekend', green: 'Klaar', red: 'Geblokkeerd / buiten koers' },
    action: { grey: 'Nog niet opgepakt / onbekend', green: 'Klaar', red: 'Geblokkeerd / buiten koers' },
  };

  function statusValuesFor(entityType) {
    return STATUS_VALUES_BY_TYPE[entityType] || STATUS_VALUES;
  }

  // Het vaste standaardlabel, los van eventuele configuratie in de dataset —
  // gebruikt om dataset.config.statusLabels initieel te vullen en als
  // terugvalwaarde wanneer een veld leeg wordt gemaakt.
  function defaultStatusLabel(entityType, statusKey) {
    const override = STATUS_LABEL_OVERRIDES[entityType] && STATUS_LABEL_OVERRIDES[entityType][statusKey];
    if (override) return override;
    const meta = STATUS_META[statusKey];
    return meta ? meta.label : statusKey;
  }

  // `dataset` is optioneel zodat bestaande aanroepen zonder configuratie-
  // bewustzijn (bv. in tests) gewoon het standaardlabel blijven krijgen.
  function statusLabelFor(entityType, statusKey, dataset) {
    const custom = dataset && dataset.config && dataset.config.statusLabels
      && dataset.config.statusLabels[entityType] && dataset.config.statusLabels[entityType][statusKey];
    if (typeof custom === 'string' && custom.trim()) return custom;
    return defaultStatusLabel(entityType, statusKey);
  }

  // Thema-accentkleur — puur ter herkenning/scanbaarheid, geen statussignaal
  // (die blijft status-kleur, ongewijzigd). Overgenomen uit de eerdere
  // referentie-mockup (docs/reference/obeya-tod-bord.html), die exact deze 7
  // thema's al een kleur gaf; nieuwe thema's krijgen de eerstvolgende,
  // nog ongebruikte kleur uit dezelfde reeks (met wat marge erbovenop).
  // Zie IDEAS.md idee 45.
  const THEME_COLOR_PALETTE = [
    '#3B6FA0', '#2E8B87', '#7A5C9E', '#C98A2B', '#5B6B79', '#4C8C4A', '#B5563F',
    '#A0527A', '#527A8C', '#8C7A52',
  ];

  // Namen bij het rijtje, voor wie de kleur niet ziet (schermlezer, tooltip).
  const THEME_COLOR_NAMES = {
    '#3B6FA0': 'Blauw', '#2E8B87': 'Zeegroen', '#7A5C9E': 'Paars', '#C98A2B': 'Oker', '#5B6B79': 'Leisteen',
    '#4C8C4A': 'Groen', '#B5563F': 'Steenrood', '#A0527A': 'Framboos', '#527A8C': 'Staalblauw', '#8C7A52': 'Zand',
  };

  function validColor(c) {
    return typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c.trim());
  }

  function nextThemeColor(dataset) {
    return THEME_COLOR_PALETTE[(dataset.themes || []).length % THEME_COLOR_PALETTE.length];
  }

  function themeColor(theme) {
    return (theme && theme.color) || THEME_COLOR_PALETTE[0];
  }

  const NOTE_TYPES = {
    update: 'Update',
    question: 'Vraag / ontwikkeling',
    monitoring: 'Monitoren',
    success: 'Succes',
    obstacle: 'Obstakel',
    countermeasure: 'Maatregel',
    decision: 'Besluit',
    // Sluit de methodiek-kernlus af: Doel -> Werkelijkheid -> Afwijking ->
    // Probleem -> Besluit -> Actie -> Resultaat -> Leren.
    learning: 'Leren',
  };

  // Twee soorten verbanden tussen items die niet al via de boom verbonden
  // zijn (zie docs/relatiemodel-voorstel.md): `contributes` heeft een
  // richting (van project of actie naar een doel of meetbaar resultaat
  // elders), `related` niet (hangt samen met — overlap, dubbelingen,
  // raakvlakken die nog geen bijdrage zijn). Alleen deze twee; een derde
  // soort komt er pas als de praktijk erom vraagt.
  const RELATION_TYPES = {
    contributes: 'Draagt bij aan',
    related: 'Hangt samen met',
  };

  // Alleen deze vier itemtypen kunnen een relatie hebben — thema's zijn
  // containers zonder eigen inhoud, notities horen al bij precies één item.
  // Zie "Wat er nodig is" in het relatiemodel-voorstel.
  const RELATABLE_TYPES = ['objective', 'measurableResult', 'project', 'action'];

  function uid(prefix) {
    return prefix + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  // ---------------------------------------------------------------------
  // Loading
  // ---------------------------------------------------------------------

  async function loadInitialDataset() {
    if (location.protocol === 'http:' || location.protocol === 'https:') {
      try {
        const res = await fetch('data/obeya.json', { cache: 'no-store' });
        if (res.ok) {
          const json = await res.json();
          // Ook de meegeleverde data kan met de hand zijn aangepast; dezelfde
          // normalisatie als bij import houdt de opstartroute veilig.
          if (isValidDataset(json)) return normalizeDataset(json).dataset;
        }
      } catch (err) {
        // fall through to embedded seed data (e.g. served without the data
        // folder, or a network hiccup)
      }
    }
    if (window.OBEYA_SEED_DATA) {
      return normalizeDataset(window.OBEYA_SEED_DATA).dataset;
    }
    throw new Error('Geen Obeya-data gevonden (noch data/obeya.json, noch js/seed-data.js).');
  }

  function isValidDataset(json) {
    return !!json && typeof json === 'object' && Array.isArray(json.themes) && !!json.meta;
  }

  // Harde fouten: dingen die niet te repareren zijn zonder te gokken wat de
  // gebruiker bedoelde. Alles wat wél veilig aan te vullen is (ontbrekende
  // lijsten, een oude veldnaam, een losgeraakte notitie) is géén fout maar
  // werk voor normalizeDataset hieronder.
  function validateDataset(json) {
    const errors = [];
    if (!json || typeof json !== 'object' || Array.isArray(json)) {
      errors.push('Bestand bevat geen geldig JSON-object.');
      return errors;
    }
    if (!json.meta || typeof json.meta !== 'object') errors.push('Veld "meta" ontbreekt.');
    if (!Array.isArray(json.themes)) {
      errors.push('Veld "themes" ontbreekt of is geen lijst.');
      return errors;
    }

    // Dubbele id's maken elke verwijzing dubbelzinnig: findAny zou het
    // verkeerde item terug kunnen geven, en bewerken raakt dan het verkeerde
    // item. Niet te repareren zonder te raden welke de echte is.
    const seen = new Set();
    const checkId = (id, omschrijving) => {
      if (!id) return;
      if (seen.has(id)) errors.push(`Dubbel id "${id}" (${omschrijving}). Elk item heeft een eigen id nodig.`);
      seen.add(id);
    };

    json.themes.forEach((theme, i) => {
      if (!theme || typeof theme !== 'object') {
        errors.push(`Thema #${i + 1} is geen object.`);
        return;
      }
      if (!theme.id || !theme.name) errors.push(`Thema #${i + 1} mist id of name.`);
      checkId(theme.id, 'thema');
      if (theme.objectives !== undefined && !Array.isArray(theme.objectives)) {
        errors.push(`Thema "${theme.name || i}" heeft een objectives-veld dat geen lijst is.`);
        return;
      }
      (theme.objectives || []).forEach((objective, j) => {
        if (!objective || typeof objective !== 'object') {
          errors.push(`Doel #${j + 1} in thema "${theme.name || i}" is geen object.`);
          return;
        }
        checkId(objective.id, 'doel');
        ['measurableResults', 'projects', 'actions', 'notes'].forEach((lijst) => {
          if (objective[lijst] !== undefined && !Array.isArray(objective[lijst])) {
            errors.push(`Doel "${objective.title || j}" heeft een ${lijst}-veld dat geen lijst is.`);
          }
        });
        (objective.measurableResults || []).forEach((mr) => checkId(mr && mr.id, 'meetbaar resultaat'));
        (objective.projects || []).forEach((p) => {
          checkId(p && p.id, 'project');
          if (p && p.actions !== undefined && !Array.isArray(p.actions)) {
            errors.push(`Project "${(p && p.name) || ''}" heeft een actions-veld dat geen lijst is.`);
          }
          ((p && p.actions) || []).forEach((a) => checkId(a && a.id, 'actie'));
        });
        (objective.actions || []).forEach((a) => checkId(a && a.id, 'actie'));
        (objective.notes || []).forEach((n) => checkId(n && n.id, 'notitie'));
      });
    });
    return errors;
  }

  // Vult aan wat veilig aan te vullen is en zet oude veldnamen om, zodat de
  // rest van de app mag aannemen dat de vorm klopt. Geeft de gerepareerde
  // dataset terug plus meldingen in gewone taal over wat er is aangepast —
  // stil repareren zou net zo misleidend zijn als stil kapotgaan.
  function normalizeDataset(input) {
    const dataset = deepClone(input);
    const warnings = [];
    let aangevuldeLijsten = 0;
    let omgezetteKoppelingen = 0;
    let hersteldeNotities = 0;
    let toegekendeIds = 0;

    const zorgLijst = (obj, veld) => {
      if (!Array.isArray(obj[veld])) {
        obj[veld] = [];
        aangevuldeLijsten++;
      }
    };
    const zorgId = (obj, prefix) => {
      if (!obj.id) {
        obj.id = uid(prefix);
        toegekendeIds++;
      }
    };

    if (!dataset.meta || typeof dataset.meta !== 'object') dataset.meta = {};
    if (!Array.isArray(dataset.themes)) dataset.themes = [];

    dataset.themes.forEach((theme) => {
      zorgId(theme, 'theme');
      zorgLijst(theme, 'objectives');
      if (!theme.status) theme.status = 'grey';

      theme.objectives.forEach((objective) => {
        zorgId(objective, 'objective');
        ['measurableResults', 'projects', 'actions', 'notes'].forEach((lijst) => zorgLijst(objective, lijst));
        if (!objective.status) objective.status = 'grey';

        // Het thema waarin een doel staat, hoort ook in themeIds te staan —
        // zie owningThemeIdFor. Een doel uit een oudere export heeft alleen
        // themeId; dat blijft hier gewoon werken.
        const gekoppeld = Array.isArray(objective.themeIds) ? objective.themeIds.filter(Boolean) : [];
        objective.themeIds = gekoppeld.includes(theme.id) ? gekoppeld : [theme.id].concat(gekoppeld);
        objective.themeId = theme.id;

        objective.measurableResults.forEach((mr) => {
          zorgId(mr, 'mr');
          mr.objectiveId = objective.id;
          if (!mr.status) mr.status = 'grey';
        });

        objective.projects.forEach((project) => {
          zorgId(project, 'project');
          project.objectiveId = objective.id;
          if (!project.status) project.status = 'grey';
          zorgLijst(project, 'actions');

          // Tot v0.3 was de koppeling naar een meetbaar resultaat enkelvoudig.
          if (!Array.isArray(project.measurableResultIds)) {
            project.measurableResultIds = project.measurableResultId ? [project.measurableResultId] : [];
            if (project.measurableResultId) omgezetteKoppelingen++;
          }
          delete project.measurableResultId;

          project.actions.forEach((action) => {
            zorgId(action, 'action');
            action.objectiveId = objective.id;
            action.projectId = project.id;
            action.relatedItemId = project.id;
            if (!action.status) action.status = 'grey';
          });
        });

        objective.actions.forEach((action) => {
          zorgId(action, 'action');
          action.objectiveId = objective.id;
          action.projectId = null;
          action.relatedItemId = objective.id;
          if (!action.status) action.status = 'grey';
        });

        objective.notes.forEach((note) => zorgId(note, 'note'));
      });
    });

    // Notities verwijzen naar het item waar ze over gaan; wijst die verwijzing
    // nergens meer heen, dan zou de notitie nergens meer getoond worden. Val
    // dan terug op het doel, zodat de tekst niet stilletjes verdwijnt.
    dataset.themes.forEach((theme) => {
      theme.objectives.forEach((objective) => {
        objective.notes.forEach((note) => {
          if (!note.relatedItemId || !findAny(dataset, note.relatedItemId)) {
            note.relatedItemId = objective.id;
            hersteldeNotities++;
          }
        });
      });
    });

    // Een project of actie hangt via measurableResultIds/measurableResultId
    // alleen aan resultaten van het eigen doel; een bijdrage elders is een
    // relatie. Na verplaatsen en samenvoegen kan er toch een id van een ander
    // doel blijven staan (twee mensen verplaatsen hetzelfde project naar
    // verschillende doelen): die koppeling klopt dan niet meer en wordt
    // weggehaald, met een melding.
    let losgemaakteKoppelingen = 0;
    dataset.themes.forEach((theme) => {
      theme.objectives.forEach((objective) => {
        const eigen = new Set(objective.measurableResults.map((m) => m.id));
        const actieOpschonen = (a) => {
          if (a.measurableResultId && !eigen.has(a.measurableResultId)) { a.measurableResultId = null; losgemaakteKoppelingen++; }
        };
        objective.projects.forEach((p) => {
          const voor = (p.measurableResultIds || []).length;
          p.measurableResultIds = (p.measurableResultIds || []).filter((id) => eigen.has(id));
          losgemaakteKoppelingen += voor - p.measurableResultIds.length;
          (p.actions || []).forEach(actieOpschonen);
        });
        (objective.actions || []).forEach(actieOpschonen);
      });
    });
    // inboxIssue (het issuenummer waar een item of notitie uit de inbox vandaan
    // komt) is een positief geheel getal; iets anders, bijv. uit een met de
    // hand aangepast bestand, wordt weggehaald zodat "Afronden" nooit het
    // verkeerde issue sluit.
    const inboxNummerOpschonen = (x) => {
      if (x && 'inboxIssue' in x && !(Number.isInteger(x.inboxIssue) && x.inboxIssue > 0)) delete x.inboxIssue;
    };
    dataset.themes.forEach((theme) => {
      inboxNummerOpschonen(theme);
      theme.objectives.forEach((o) => {
        [o, ...o.measurableResults, ...o.projects, ...o.projects.flatMap((p) => p.actions || []), ...(o.actions || []), ...(o.notes || [])].forEach(inboxNummerOpschonen);
      });
    });

    if (losgemaakteKoppelingen) warnings.push(`${losgemaakteKoppelingen} koppeling${losgemaakteKoppelingen === 1 ? '' : 'en'} met een meetbaar resultaat van een ander doel verwijderd; een bijdrage aan een resultaat elders hoort een relatie te zijn.`);

    // Relaties (zie docs/relatiemodel-voorstel.md) staan los van de boom, dus
    // pas hier op te schonen — nu de boom hierboven compleet en van id's
    // voorzien is, kan findAny alles vinden wat er werkelijk is. Een relatie
    // die naar een verdwenen of niet-relateerbaar item wijst (bijv. een
    // thema) wordt verwijderd in plaats van dat de app er later op stuk loopt.
    if (!Array.isArray(dataset.relations)) dataset.relations = [];
    let opgeschoondeRelaties = 0;
    dataset.relations = dataset.relations.filter((r) => {
      if (!r || typeof r !== 'object' || !r.from || !r.to) { opgeschoondeRelaties++; return false; }
      const fromFound = findAny(dataset, r.from);
      const toFound = findAny(dataset, r.to);
      if (!fromFound || !toFound || !RELATABLE_TYPES.includes(fromFound.type) || !RELATABLE_TYPES.includes(toFound.type)) {
        opgeschoondeRelaties++;
        return false;
      }
      return true;
    }).map((r) => ({
      id: r.id || uid('rel'),
      from: r.from,
      to: r.to,
      type: r.type === 'related' ? 'related' : 'contributes',
      note: r.note || null,
    }));
    // Het wijzigingslog (idee 70): een lijst regels met een id en een tijdstip.
    // Kapot of ontbrekend breekt niets; regels ouder dan een jaar vallen weg,
    // behalve wat nog op bevestiging wacht of nog teruggedraaid kan worden.
    // De grens valt op hele dagen, zodat twee browsers hetzelfde weghalen.
    if ('changeLog' in dataset && !Array.isArray(dataset.changeLog)) dataset.changeLog = [];
    const grens = new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10);
    if (Array.isArray(dataset.changeLog)) dataset.changeLog = dataset.changeLog.filter((c) => {
      // Alleen een regel zonder id is onbruikbaar; een regel in een ander
      // formaat (bijv. van een nieuwere app) blijft staan.
      if (!c || typeof c !== 'object' || typeof c.id !== 'string') return false;
      const status = c.review && c.review.status;
      if (status === 'pending' || (status === 'rejected' && !c.review.reverted && !c.review.kept)) return true;
      return typeof c.at !== 'string' || c.at.slice(0, 10) >= grens;
    });

    // Rollen en personen (idee 67/72): alleen herstellen wat er staat; een
    // bord zonder eigen rollen houdt de standaardrollen zonder veld.
    if (dataset.config && 'roles' in dataset.config) {
      dataset.config.roles = Array.isArray(dataset.config.roles)
        ? dataset.config.roles.filter((r) => r && typeof r.id === 'string' && typeof r.name === 'string' && r.name.trim())
          .map((r) => ({ id: r.id, name: r.name.trim(), canConfirm: r.canConfirm === true }))
        : DEFAULT_ROLES.map((r) => ({ ...r }));
    }
    // Groepen van rollen (idee 88): alleen geldige groepen en rol-id's.
    if (dataset.config && 'roleGroups' in dataset.config) {
      dataset.config.roleGroups = Array.isArray(dataset.config.roleGroups)
        ? dataset.config.roleGroups.filter((g) => g && typeof g.id === 'string' && typeof g.name === 'string' && g.name.trim())
          .map((g) => ({ id: g.id, name: g.name.trim(), roleIds: Array.isArray(g.roleIds) ? g.roleIds.filter((r, i, a) => typeof r === 'string' && a.indexOf(r) === i) : [] }))
        : [];
      // Een rol die (elders) is verwijderd, valt ook uit de groepen.
      const bestaand = new Set(getRoles(dataset).map((r) => r.id));
      dataset.config.roleGroups.forEach((g) => { g.roleIds = g.roleIds.filter((r) => bestaand.has(r)); });
    }
    if (dataset.config && 'people' in dataset.config) {
      const mensen = dataset.config.people;
      dataset.config.people = {};
      if (mensen && typeof mensen === 'object' && !Array.isArray(mensen)) {
        const owners = Array.isArray(dataset.config.owners) ? dataset.config.owners : null;
        const rolIds = new Set(getRoles(dataset).map((r) => r.id));
        Object.keys(mensen).forEach((naam) => {
          if (owners && !owners.includes(naam)) return;
          const p = personFields(mensen[naam]);
          p.roles = p.roles.filter((r) => rolIds.has(r));
          if (p.roles.length || p.github) dataset.config.people[naam] = p;
        });
      }
    }

    // Dezelfde relatie twee keer (bijv. na samenvoegen, als twee mensen
    // tegelijk dezelfde bijdrage vastlegden: elk met een eigen id) wordt er
    // één; een toelichting gaat daarbij niet verloren.
    const gezien = new Map();
    dataset.relations = dataset.relations.filter((r) => {
      const sleutel = r.type === 'related' ? `related|${[r.from, r.to].sort().join('|')}` : `contributes|${r.from}|${r.to}`;
      const eerder = gezien.get(sleutel);
      if (!eerder) { gezien.set(sleutel, r); return true; }
      if (!eerder.note && r.note) eerder.note = r.note;
      opgeschoondeRelaties++;
      return false;
    });

    // Betrokkenen: alleen namen, geen dubbelen, niet de eigenaar zelf.
    forEachItem(dataset, tidyInvolved);
    let weggehaaldeWaarden = 0;
    allMeasurableResults(dataset).forEach((mr) => { if (tidyDeliverable(mr)) weggehaaldeWaarden += 1; });
    if (weggehaaldeWaarden) warnings.push(`Bij ${weggehaaldeWaarden} meetbaar resultaat${weggehaaldeWaarden === 1 ? '' : 'en'} is de huidige waarde of doelwaarde weggehaald: meetbare resultaten zijn nu deelproducten, met "Klaar als …" en een streefkwartaal.`);
    allProjects(dataset).forEach(tidyWorkType);
    let weggehaaldePrincipes = 0;
    forEachItem(dataset, (item) => { weggehaaldePrincipes += tidyPrinciples(item, dataset); });

    if (weggehaaldePrincipes) warnings.push(`${weggehaaldePrincipes} principe-label${weggehaaldePrincipes === 1 ? '' : 's'} wees naar een principe dat niet meer bestaat en is weggehaald.`);
    if (aangevuldeLijsten) warnings.push(`${aangevuldeLijsten} ontbrekende lijst${aangevuldeLijsten === 1 ? '' : 'en'} aangevuld (bijv. een doel zonder meetbare resultaten).`);
    if (omgezetteKoppelingen) warnings.push(`${omgezetteKoppelingen} project${omgezetteKoppelingen === 1 ? '' : 'en'} met een koppeling uit een oudere versie omgezet naar het huidige formaat.`);
    if (hersteldeNotities) warnings.push(`${hersteldeNotities} notitie${hersteldeNotities === 1 ? '' : 's'} verwees naar een verdwenen item en is aan het doel gekoppeld.`);
    if (toegekendeIds) warnings.push(`${toegekendeIds} item${toegekendeIds === 1 ? '' : 's'} zonder id heeft er een gekregen.`);
    if (opgeschoondeRelaties) warnings.push(`${opgeschoondeRelaties} relatie${opgeschoondeRelaties === 1 ? '' : 's'} wees naar een item dat niet meer bestaat of stond er dubbel, en is verwijderd.`);

    return { dataset, warnings };
  }

  // ---------------------------------------------------------------------
  // Lookup helpers (read-only traversal of the nested tree)
  // ---------------------------------------------------------------------

  function findTheme(dataset, themeId) {
    return dataset.themes.find((t) => t.id === themeId) || null;
  }

  function findObjective(dataset, objectiveId) {
    for (const t of dataset.themes) {
      const o = t.objectives.find((o) => o.id === objectiveId);
      if (o) return o;
    }
    return null;
  }

  function findObjectiveOwnerTheme(dataset, objectiveId) {
    return dataset.themes.find((t) => t.objectives.some((o) => o.id === objectiveId)) || null;
  }

  function findMeasurableResult(dataset, mrId) {
    for (const t of dataset.themes) {
      for (const o of t.objectives) {
        const mr = o.measurableResults.find((m) => m.id === mrId);
        if (mr) return mr;
      }
    }
    return null;
  }

  function findProject(dataset, projectId) {
    for (const t of dataset.themes) {
      for (const o of t.objectives) {
        const p = o.projects.find((p) => p.id === projectId);
        if (p) return p;
      }
    }
    return null;
  }

  function findAction(dataset, actionId) {
    for (const t of dataset.themes) {
      for (const o of t.objectives) {
        for (const p of o.projects) {
          const a = (p.actions || []).find((a) => a.id === actionId);
          if (a) return a;
        }
        const a2 = (o.actions || []).find((a) => a.id === actionId);
        if (a2) return a2;
      }
    }
    return null;
  }

  function findNote(dataset, noteId) {
    for (const t of dataset.themes) {
      for (const o of t.objectives) {
        const n = (o.notes || []).find((n) => n.id === noteId);
        if (n) return n;
      }
    }
    return null;
  }

  // Generic lookup by id across all entity types. Returns {type, entity} or null.
  function findAny(dataset, id) {
    if (!id) return null;
    for (const t of dataset.themes) {
      if (t.id === id) return { type: 'theme', entity: t };
      for (const o of t.objectives) {
        if (o.id === id) return { type: 'objective', entity: o };
        for (const mr of o.measurableResults) {
          if (mr.id === id) return { type: 'measurableResult', entity: mr };
        }
        for (const p of o.projects) {
          if (p.id === id) return { type: 'project', entity: p };
          for (const a of p.actions || []) {
            if (a.id === id) return { type: 'action', entity: a };
          }
        }
        for (const a of o.actions || []) {
          if (a.id === id) return { type: 'action', entity: a };
        }
        for (const n of o.notes || []) {
          if (n.id === id) return { type: 'note', entity: n };
        }
      }
    }
    return null;
  }

  // Flat views, useful for filtering/searching/owner lists without caring
  // about nesting depth.
  function allObjectives(dataset) {
    const out = [];
    dataset.themes.forEach((t) => t.objectives.forEach((o) => out.push(o)));
    return out;
  }

  function allMeasurableResults(dataset) {
    const out = [];
    allObjectives(dataset).forEach((o) => o.measurableResults.forEach((mr) => out.push(mr)));
    return out;
  }

  function allProjects(dataset) {
    const out = [];
    allObjectives(dataset).forEach((o) => o.projects.forEach((p) => out.push(p)));
    return out;
  }

  function allActions(dataset) {
    const out = [];
    allObjectives(dataset).forEach((o) => {
      o.projects.forEach((p) => (p.actions || []).forEach((a) => out.push(a)));
      (o.actions || []).forEach((a) => out.push(a));
    });
    return out;
  }

  function allNotes(dataset) {
    const out = [];
    allObjectives(dataset).forEach((o) => (o.notes || []).forEach((n) => out.push(n)));
    return out;
  }

  // ---------------------------------------------------------------------
  // Agenda: items opgevoerd voor het volgende overleg, hetzij handmatig
  // gemarkeerd (elk entiteitstype), hetzij automatisch omdat een project nog
  // aan geen enkel meetbaar resultaat is gekoppeld en dat ook niet bewust is
  // afgemeld — zie ROADMAP.md ideeën 13, 26, 37, 38.
  // ---------------------------------------------------------------------

  function toggleFlag(dataset, id) {
    const found = findAny(dataset, id);
    if (!found) return null;
    found.entity.flaggedForDiscussion = !found.entity.flaggedForDiscussion;
    return found.entity;
  }

  function allFlaggedItems(dataset) {
    const out = [];
    dataset.themes.forEach((t) => { if (t.flaggedForDiscussion) out.push({ type: 'theme', entity: t }); });
    allObjectives(dataset).forEach((o) => { if (o.flaggedForDiscussion) out.push({ type: 'objective', entity: o }); });
    allMeasurableResults(dataset).forEach((m) => { if (m.flaggedForDiscussion) out.push({ type: 'measurableResult', entity: m }); });
    allProjects(dataset).forEach((p) => { if (p.flaggedForDiscussion) out.push({ type: 'project', entity: p }); });
    allActions(dataset).forEach((a) => { if (a.flaggedForDiscussion) out.push({ type: 'action', entity: a }); });
    return out;
  }

  // De meetbare resultaten waar een project via een "draagt bij aan"-relatie
  // aan bijdraagt — de weg voor een resultaat in een ánder doel, dat het
  // vinkjesveld van het project niet kan bereiken.
  function relatedMeasurableResults(dataset, projectId) {
    if (!dataset) return [];
    return outgoingContributions(dataset, projectId)
      .map((r) => findMeasurableResult(dataset, r.to))
      .filter(Boolean);
  }

  // Meetbare resultaten buiten het eigen doel van een project, om vanuit het
  // projectscherm een bijdrage elders vast te leggen (idee 64).
  function measurableResultsElsewhere(dataset, objectiveId) {
    const uit = [];
    (dataset ? dataset.themes : []).forEach((theme) => theme.objectives.forEach((objective) => {
      if (objective.id === objectiveId) return;
      objective.measurableResults.forEach((mr) => uit.push({ theme, objective, mr }));
    }));
    return uit;
  }

  // Bijdragen van een project aan resultaten elders bijwerken: een relatie
  // "Draagt bij aan" voor elk resultaat in `change.add`, en de relatie weg
  // voor elk resultaat in `change.remove` (wat iemand in het formulier heeft
  // uitgevinkt). Alleen wat expliciet genoemd is verandert, zodat een
  // bijdrage die een collega intussen toevoegde blijft staan. Een project
  // hoort bij één doel; een bijdrage elders blijft een relatie, dit is alleen
  // een kortere route ernaartoe. Resultaten van het eigen doel en relaties
  // naar iets anders dan een meetbaar resultaat blijven ongemoeid.
  function setContributionsElsewhere(dataset, projectId, change) {
    const project = findProject(dataset, projectId);
    if (!project) return { added: 0, removed: 0 };
    const eigen = new Set((findObjective(dataset, project.objectiveId) || { measurableResults: [] }).measurableResults.map((m) => m.id));
    const geldig = (id) => !eigen.has(id) && !!findMeasurableResult(dataset, id);
    const gewenst = new Set(((change && change.add) || []).filter(geldig));
    const weg = new Set(((change && change.remove) || []).filter((id) => geldig(id) && !gewenst.has(id)));
    let removed = 0;
    outgoingContributions(dataset, projectId).forEach((r) => {
      if (weg.has(r.to) && deleteRelation(dataset, r.id)) removed++;
    });
    const bestaand = new Set(outgoingContributions(dataset, projectId).map((r) => r.to));
    let added = 0;
    gewenst.forEach((id) => {
      if (!bestaand.has(id) && createRelation(dataset, { from: projectId, to: id, type: 'contributes' })) added++;
    });
    return { added, removed };
  }

  // `dataset` is optioneel: zonder telt alleen de koppeling binnen het eigen
  // doel, mét telt ook een relatie naar een resultaat elders op het bord.
  function projectNeedsMapping(project, dataset) {
    if (project.noMeasurableResultNeeded) return false;
    if (project.measurableResultIds && project.measurableResultIds.length) return false;
    return relatedMeasurableResults(dataset, project.id).length === 0;
  }

  function projectsNeedingMapping(dataset) {
    return allProjects(dataset).filter((p) => projectNeedsMapping(p, dataset));
  }

  // Gaten in de keten voor de Agenda (idee 79): alleen wat zeker ontbreekt,
  // geen vermoedens over de formulering (advies Obeya-coach en
  // teamcoördinator, 8 november 2026). Een "Klaar als" zonder getal telt als
  // ingevuld, want een ja/nee-toets is ook goed.
  function chainGaps(dataset) {
    const leeg = (v) => !String(v || '').trim();
    return {
      objectivesWithoutOwner: allObjectives(dataset).filter((o) => leeg(o.owner)),
      objectivesWithoutResult: allObjectives(dataset).filter((o) => !(o.measurableResults || []).length),
      resultsWithoutCriterion: allMeasurableResults(dataset).filter((mr) => leeg(mr.doneCriterion)),
      projectsWithoutResult: projectsNeedingMapping(dataset),
    };
  }

  // "Andersom" van Project.measurableResultIds/Action.measurableResultId:
  // welke projecten/acties dragen bij aan een gegeven meetbaar resultaat. Een
  // MR is de validatie-anker van een doel, dus zijn eigen scherm en de
  // Uitvoering-weergave tonen wat er feitelijk aan wordt gedaan, niet alleen
  // zijn eigen cijfers. Zie ROADMAP idee 39.
  function contributingItems(objective, measurableResultId) {
    const projects = objective.projects.filter((p) => (p.measurableResultIds || []).includes(measurableResultId));
    const directActions = (objective.actions || []).filter((a) => a.measurableResultId === measurableResultId);
    const projectActions = objective.projects.flatMap((p) => (p.actions || []).filter((a) => a.measurableResultId === measurableResultId));
    return { projects, actions: [...directActions, ...projectActions] };
  }

  function allOwners(dataset) {
    const owners = new Set();
    dataset.themes.forEach((t) => t.owner && owners.add(t.owner));
    allObjectives(dataset).forEach((o) => o.owner && owners.add(o.owner));
    allMeasurableResults(dataset).forEach((m) => m.owner && owners.add(m.owner));
    allProjects(dataset).forEach((p) => p.owner && owners.add(p.owner));
    allActions(dataset).forEach((a) => a.owner && owners.add(a.owner));
    return Array.from(owners).sort((a, b) => a.localeCompare(b, 'nl'));
  }

  // Aantal items per eigenaar binnen dit thema (thema/doel/MR/project/actie
  // samen) — voor de eigenaar × thema-capaciteitsmatrix in Verbindingen. Een
  // eigenaar die breed verspreid is over veel thema's is precies het soort
  // ding dat in een fysieke Obeya vanzelf opvalt (naam overal op de muur)
  // maar hier onzichtbaar blijft zonder dit overzicht. Zie ROADMAP idee 47.
  function themeOwnerCounts(theme) {
    const counts = {};
    const add = (owner) => { if (owner) counts[owner] = (counts[owner] || 0) + 1; };
    add(theme.owner);
    theme.objectives.forEach((o) => {
      add(o.owner);
      o.measurableResults.forEach((m) => add(m.owner));
      o.projects.forEach((p) => {
        add(p.owner);
        (p.actions || []).forEach((a) => add(a.owner));
      });
      (o.actions || []).forEach((a) => add(a.owner));
    });
    return counts;
  }

  // ---------------------------------------------------------------------
  // Periode (jaar/kwartaal). Projecten dragen dit expliciet als twee losse
  // velden (periodYear/periodQuarter, geen vrije tekst meer om te parsen);
  // acties hebben al een echte ISO-datum (dueDate) waar jaar/kwartaal
  // betrouwbaar uit af te leiden zijn, dus die krijgen geen extra velden.
  // ---------------------------------------------------------------------

  function yearFromDate(dateStr) {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return null;
    return d.getFullYear();
  }

  function quarterFromDate(dateStr) {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return null;
    return Math.floor(d.getMonth() / 3) + 1;
  }

  // Meetbare resultaten zijn deelproducten (besluit 12 oktober 2026): een
  // criterium "Klaar als …" en een streefkwartaal, geen huidige waarde en
  // doelwaarde. Die oude velden vallen weg; geeft true als er nog een waarde
  // in stond, zodat inlezen dat kan melden.
  function toPeriodNumber(v, min, max) {
    const n = parseInt(v, 10);
    return Number.isInteger(n) && n >= min && n <= max ? n : null;
  }

  // Een getal van nul of meer, ook met een komma ("3,5"); anders null.
  function standGetal(v) {
    if (typeof v === 'number') return Number.isFinite(v) && v >= 0 ? v : null;
    if (typeof v !== 'string') return null;
    const t = v.trim().replace(',', '.');
    return /^\d+(\.\d+)?$/.test(t) ? parseFloat(t) : null;
  }

  const MAANDEN = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
  function korteDatum(iso) {
    const [j, m, d] = String(iso).split('-').map(Number);
    return j && m && d ? `${d} ${MAANDEN[m - 1]} ${j}` : '';
  }

  // De stand als tekst: "5 van 9 (56%) · per 23 nov 2026", of kort "5/9".
  // Geen balk en geen oordeel: de status blijft wat het team zegt.
  function valueText(mr, opts) {
    if (!mr || typeof mr.valueCurrent !== 'number') return '';
    const getal = (n) => String(Math.round(n * 100) / 100).replace('.', ',');
    const heeftDoel = typeof mr.valueTarget === 'number' && mr.valueTarget > 0;
    if (opts && opts.short) return heeftDoel ? `${getal(mr.valueCurrent)}/${getal(mr.valueTarget)}` : getal(mr.valueCurrent);
    const kern = heeftDoel ? `${getal(mr.valueCurrent)} van ${getal(mr.valueTarget)} (${Math.round((mr.valueCurrent / mr.valueTarget) * 100)}%)` : getal(mr.valueCurrent);
    return mr.valueDate && !(opts && opts.noDate) ? `${kern} · per ${korteDatum(mr.valueDate)}` : kern;
  }

  function tidyDeliverable(mr) {
    const hadValues = ['currentValue', 'targetValue', 'unit'].some((k) => mr[k] !== undefined && mr[k] !== null && String(mr[k]).trim() !== '');
    delete mr.currentValue;
    delete mr.targetValue;
    delete mr.unit;
    // Lege velden bestaan niet, zodat een bestaand bord na het inlezen niet
    // ineens als gewijzigd geldt.
    const criterium = typeof mr.doneCriterion === 'string' ? mr.doneCriterion.trim() : '';
    if (criterium) mr.doneCriterion = criterium;
    else delete mr.doneCriterion;
    const jaar = toPeriodNumber(mr.periodYear, 2000, 2100);
    const kwartaal = jaar ? toPeriodNumber(mr.periodQuarter, 1, 4) : null;
    if (jaar) mr.periodYear = jaar;
    else delete mr.periodYear;
    if (kwartaal) mr.periodQuarter = kwartaal;
    else delete mr.periodQuarter;
    // De stand (idee 87, 23 november 2026): optioneel, met nieuwe veldnamen,
    // zodat een oudere versie van de app hem niet als oude waarde weggooit.
    const huidig = standGetal(mr.valueCurrent);
    const doel = standGetal(mr.valueTarget);
    if (huidig !== null) mr.valueCurrent = huidig;
    else delete mr.valueCurrent;
    if (doel !== null && doel > 0) mr.valueTarget = doel;
    else delete mr.valueTarget;
    if (typeof mr.valueDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(mr.valueDate.trim())) mr.valueDate = mr.valueDate.trim();
    else delete mr.valueDate;
    return hadValues;
  }

  // Te laat: het streefkwartaal (of, zonder kwartaal, het jaar) is voorbij
  // en het resultaat staat niet op Klaar. Alleen een signaal: de status
  // blijft het oordeel van het team.
  function isLate(mr, today) {
    if (!mr || !mr.periodYear || mr.status === 'done') return false;
    const eindMaand = mr.periodQuarter ? mr.periodQuarter * 3 : 12;
    const eind = new Date(mr.periodYear, eindMaand, 1); // eerste dag ná de periode
    return (today || new Date()) >= eind;
  }

  // "2026 Q3 · te laat": het streefkwartaal in woorden, voor de muur en de
  // muurvellen.
  function deliverableSummary(mr, today) {
    if (!mr || !mr.periodYear) return '';
    return `${formatPeriod(mr.periodYear, mr.periodQuarter)}${isLate(mr, today) ? ' · te laat' : ''}`;
  }

  function formatPeriod(year, quarter) {
    if (!year) return '';
    return quarter ? `${year} Q${quarter}` : String(year);
  }

  // true wanneer een item met (itemYear, itemQuarter) binnen het gekozen
  // filter (filterYear, filterQuarter) valt; null in het filter betekent
  // "niet ingeperkt op dat niveau".
  function periodMatches(itemYear, itemQuarter, filterYear, filterQuarter) {
    if (filterYear !== null && itemYear !== filterYear) return false;
    if (filterQuarter !== null && itemQuarter !== filterQuarter) return false;
    return true;
  }

  // Jaren die daadwerkelijk in de data voorkomen, plus het huidige jaar, zodat
  // de jaarfilter nooit leeg is voor een verse of net-gestarte Obeya.
  function getAvailableYears(dataset) {
    const years = new Set([new Date().getFullYear()]);
    allProjects(dataset).forEach((p) => { if (p.periodYear) years.add(p.periodYear); });
    allActions(dataset).forEach((a) => { const y = yearFromDate(a.dueDate); if (y) years.add(y); });
    return Array.from(years).sort((a, b) => a - b);
  }

  // ---------------------------------------------------------------------
  // Configuration: the managed owners list. Kept inside the dataset itself
  // (dataset.config.owners) rather than in separate storage, so it travels
  // along automatically with every export/import — no second place to keep
  // in sync. Seeded once from whichever owner names are already in use, so
  // existing data is never hidden by an empty list.
  // ---------------------------------------------------------------------

  function ensureConfig(dataset) {
    if (!dataset.config || typeof dataset.config !== 'object') dataset.config = {};
    if (!Array.isArray(dataset.config.owners)) {
      dataset.config.owners = allOwners(dataset);
    }
    // Statuslabels: net als owners, volledig voorgevuld (niet alleen de
    // afwijkingen) zodat "Statuslabels beheren" een concreet, compleet
    // formulier toont i.p.v. een lege configuratie. Vult ook achteraf
    // ontbrekende sleutels aan (bv. na een latere toevoeging aan
    // STATUS_VALUES_BY_TYPE), zonder al aangepaste labels te overschrijven.
    if (!dataset.config.statusLabels || typeof dataset.config.statusLabels !== 'object') {
      dataset.config.statusLabels = {};
    }
    STATUS_LABEL_ENTITY_TYPES.forEach((type) => {
      if (!dataset.config.statusLabels[type] || typeof dataset.config.statusLabels[type] !== 'object') {
        dataset.config.statusLabels[type] = {};
      }
      statusValuesFor(type).forEach((key) => {
        if (typeof dataset.config.statusLabels[type][key] !== 'string') {
          dataset.config.statusLabels[type][key] = defaultStatusLabel(type, key);
        }
      });
    });
    return dataset.config;
  }

  // Weergave van de muur (lens Keten en het ketenvel): de kleur van de
  // geeltjes en het detailniveau waarmee de muur opent. In de dataset, zodat
  // het hele team dezelfde muur ziet; pas bewaard als iemand iets aanpast,
  // zodat een bestaand bord niet ineens als gewijzigd geldt.
  const DISPLAY_DEFAULTS = {
    stickyColors: 'type', // 'type' | 'theme' | 'none'
    typeColors: { objective: '#fff2a8', measurableResult: '#d8f0c8', project: '#ffd9a8', action: '#d4e8ff' },
    defaultDetail: 'standard', // 'head' | 'standard' | 'detail'
    tilt: true,
    chainLayout: 'rows', // 'rows' (thema's onder elkaar) | 'org' (organogram) | 'mindmap'
    // Rustige status (26 november 2026): op de kaarten van Bord en Samenhang
    // alleen een symbool bij wat op koers, bezig of klaar is; het woord alleen
    // bij een afwijking. Standaard uit: het team besluit of het aan gaat.
    quietStatus: false,
  };
  const DETAIL_LEVELS = ['head', 'standard', 'detail'];
  // Tabbladen die het team tijdelijk kan uitzetten (idee 83). Het Bord kan niet uit.
  const HIDEABLE_VIEWS = ['canvas', 'list', 'matrix', 'execution', 'timeline', 'agenda', 'documents'];
  function cleanHiddenViews(lijst) {
    return Array.isArray(lijst) ? HIDEABLE_VIEWS.filter((v) => lijst.includes(v)) : null;
  }
  const CHAIN_LAYOUTS = ['rows', 'org', 'mindmap'];
  const KLEUR = /^#[0-9a-f]{6}$/i;

  function getDisplaySettings(dataset) {
    const eigen = (dataset && dataset.config && dataset.config.display) || {};
    const kleuren = { ...DISPLAY_DEFAULTS.typeColors };
    Object.keys(kleuren).forEach((k) => {
      if (eigen.typeColors && KLEUR.test(eigen.typeColors[k] || '')) kleuren[k] = eigen.typeColors[k];
    });
    return {
      stickyColors: ['type', 'theme', 'none'].includes(eigen.stickyColors) ? eigen.stickyColors : DISPLAY_DEFAULTS.stickyColors,
      typeColors: kleuren,
      defaultDetail: DETAIL_LEVELS.includes(eigen.defaultDetail) ? eigen.defaultDetail : DISPLAY_DEFAULTS.defaultDetail,
      tilt: typeof eigen.tilt === 'boolean' ? eigen.tilt : DISPLAY_DEFAULTS.tilt,
      // 'columns' (thema's naast elkaar) is op 3 oktober 2026 het organogram geworden.
      chainLayout: eigen.chainLayout === 'columns' ? 'org'
        : (CHAIN_LAYOUTS.includes(eigen.chainLayout) ? eigen.chainLayout : DISPLAY_DEFAULTS.chainLayout),
      hiddenViews: cleanHiddenViews(eigen.hiddenViews) || [],
      quietStatus: typeof eigen.quietStatus === 'boolean' ? eigen.quietStatus : DISPLAY_DEFAULTS.quietStatus,
    };
  }

  // Neemt alleen geldige waarden over; de rest blijft wat het was.
  function setDisplaySettings(dataset, fields) {
    const config = ensureConfig(dataset);
    const huidig = getDisplaySettings(dataset);
    const f = fields || {};
    const kleuren = { ...huidig.typeColors };
    Object.keys(kleuren).forEach((k) => {
      if (f.typeColors && KLEUR.test(f.typeColors[k] || '')) kleuren[k] = f.typeColors[k].toLowerCase();
    });
    config.display = {
      stickyColors: ['type', 'theme', 'none'].includes(f.stickyColors) ? f.stickyColors : huidig.stickyColors,
      typeColors: kleuren,
      defaultDetail: DETAIL_LEVELS.includes(f.defaultDetail) ? f.defaultDetail : huidig.defaultDetail,
      tilt: typeof f.tilt === 'boolean' ? f.tilt : huidig.tilt,
      chainLayout: CHAIN_LAYOUTS.includes(f.chainLayout) ? f.chainLayout : huidig.chainLayout,
      hiddenViews: cleanHiddenViews(f.hiddenViews) || huidig.hiddenViews,
      quietStatus: typeof f.quietStatus === 'boolean' ? f.quietStatus : huidig.quietStatus,
    };
    return config.display;
  }

  function resetDisplaySettings(dataset) {
    if (dataset.config) delete dataset.config.display;
  }

  // Rollen en wie welke rol heeft (stap 2 van docs/wijzigingslog-plan.md, deel
  // van idee 67, nog zonder mandaat). Een rol met "mag bevestigen" mag in het
  // overleg structuurwijzigingen bevestigen. Dat is een afspraak, geen
  // beveiliging: wie het bestand aanpast, kan eromheen.
  //
  // config.roles: [{ id, name, canConfirm }], pas bewaard als iemand de rollen
  // aanpast (tot dan de standaardrollen, met vaste id's, zodat een bestaand
  // bord niet ineens als gewijzigd geldt).
  // config.people: { naam: { roles: [rol-id], github: 'login' } }, per naam uit
  // de eigenarenlijst; bij samenvoegen per persoon (js/merge.js).
  const DEFAULT_ROLES = [
    { id: 'role-tc', name: 'Teamcoördinator', canConfirm: true },
    { id: 'role-po', name: 'Product Owner ODV', canConfirm: true },
    { id: 'role-senior-webmaster', name: 'Senior Webmaster', canConfirm: false },
    { id: 'role-webmaster', name: 'Webmaster', canConfirm: false },
    { id: 'role-senior-contentmanager', name: 'Senior Contentmanager', canConfirm: false },
    { id: 'role-contentmanager', name: 'Contentmanager', canConfirm: false },
    { id: 'role-senior-webanalist', name: 'Senior Webanalist', canConfirm: false },
    { id: 'role-webanalist', name: 'Webanalist', canConfirm: false },
    { id: 'role-ux', name: 'UX/UI-designer', canConfirm: false },
  ];
  const ROLE_NAME_MAX = 60;

  function getRoles(dataset) {
    const eigen = dataset && dataset.config && dataset.config.roles;
    return (Array.isArray(eigen) ? eigen : DEFAULT_ROLES).map((r) => ({ ...r }));
  }

  // Vóór de eerste aanpassing: de standaardrollen in het bord zetten.
  function ownRoles(dataset) {
    const config = ensureConfig(dataset);
    if (!Array.isArray(config.roles)) config.roles = DEFAULT_ROLES.map((r) => ({ ...r }));
    return config.roles;
  }

  function roleName(name) {
    return typeof name === 'string' ? name.trim().slice(0, ROLE_NAME_MAX) : '';
  }

  function addRole(dataset, name) {
    const naam = roleName(name);
    if (!naam) return null;
    const rollen = ownRoles(dataset);
    if (rollen.some((r) => r.name.toLowerCase() === naam.toLowerCase())) return null;
    const rol = { id: uid('role'), name: naam, canConfirm: false };
    rollen.push(rol);
    return rol;
  }

  function updateRole(dataset, id, fields) {
    const rollen = ownRoles(dataset);
    const rol = rollen.find((r) => r.id === id);
    if (!rol) return null;
    const f = fields || {};
    if ('name' in f) {
      const naam = roleName(f.name);
      if (!naam || rollen.some((r) => r !== rol && r.name.toLowerCase() === naam.toLowerCase())) return null;
      rol.name = naam;
    }
    if ('canConfirm' in f) rol.canConfirm = f.canConfirm === true;
    return rol;
  }

  // Haalt de rol ook weg bij iedereen die hem had.
  function removeRole(dataset, id) {
    const config = ensureConfig(dataset);
    config.roles = ownRoles(dataset).filter((r) => r.id !== id);
    (config.roleGroups || []).forEach((g) => { g.roleIds = g.roleIds.filter((r) => r !== id); });
    Object.keys(config.people || {}).forEach((naam) => {
      const p = config.people[naam];
      p.roles = p.roles.filter((r) => r !== id);
      if (!p.roles.length && !p.github) delete config.people[naam];
    });
    return true;
  }

  // Een GitHub-login zonder @ en in kleine letters, zoals GitHub hem vergelijkt.
  function githubLogin(value) {
    return typeof value === 'string' ? value.trim().replace(/^@/, '').toLowerCase().slice(0, 39) : '';
  }

  function personFields(raw) {
    const p = raw && typeof raw === 'object' ? raw : {};
    const roles = Array.isArray(p.roles) ? p.roles.filter((r, i) => typeof r === 'string' && p.roles.indexOf(r) === i) : [];
    return { roles, github: githubLogin(p.github) };
  }

  // Alleen voor namen die nu in de eigenarenlijst staan: een achtergebleven
  // regel (na hernoemen bij een collega, of door een oudere app) geeft geen
  // rollen of rechten, ook niet aan iemand die later die naam krijgt.
  function getPerson(dataset, name) {
    const mensen = dataset && dataset.config && dataset.config.people;
    const isEigenaar = getOwnerOptions(dataset).includes(name);
    const p = isEigenaar && mensen && Object.prototype.hasOwnProperty.call(mensen, name) ? mensen[name] : null;
    const bekend = new Set(getRoles(dataset).map((r) => r.id));
    const f = personFields(p);
    return { roles: f.roles.filter((r) => bekend.has(r)), github: f.github };
  }

  function rolesOf(dataset, name) {
    const ids = getPerson(dataset, name).roles;
    return getRoles(dataset).filter((r) => ids.includes(r.id));
  }

  // De rollen en de GitHub-login van één persoon uit de eigenarenlijst.
  // Geeft { ok } of { ok: false, error: 'unknown-owner' | 'github-taken', by }.
  function setPerson(dataset, name, fields) {
    const config = ensureConfig(dataset);
    if (!config.owners.includes(name)) return { ok: false, error: 'unknown-owner' };
    const bekend = new Set(getRoles(dataset).map((r) => r.id));
    const f = personFields(fields);
    const roles = f.roles.filter((r) => bekend.has(r));
    const ander = f.github && personForLogin(dataset, f.github);
    if (ander && ander !== name) return { ok: false, error: 'github-taken', by: ander };
    if (!config.people || typeof config.people !== 'object') config.people = {};
    if (roles.length || f.github) config.people[name] = { roles, github: f.github };
    else delete config.people[name];
    return { ok: true };
  }

  // De persoon uit de eigenarenlijst bij een GitHub-login, of null. Hoort de
  // login (na samenvoegen) bij twee personen, dan bij niemand: liever geen
  // naam dan de verkeerde.
  function personForLogin(dataset, login) {
    const l = githubLogin(login);
    if (!l) return null;
    const mensen = (dataset && dataset.config && dataset.config.people) || {};
    const owners = getOwnerOptions(dataset);
    const treffers = Object.keys(mensen).filter((naam) => owners.includes(naam) && githubLogin(mensen[naam].github) === l);
    return treffers.length === 1 ? treffers[0] : null;
  }

  function canConfirm(dataset, name) {
    return !!name && rolesOf(dataset, name).some((r) => r.canConfirm);
  }

  // De eigenaren ingedeeld per rol, voor keuzelijsten en Instellingen (besluit
  // David, 7 november 2026). Iemand met meer rollen staat onder de eerste in
  // de volgorde van de rollenlijst, zodat niemand dubbel in een keuzelijst
  // staat. "Zonder rol" komt achteraan. Heeft nog niemand een rol, dan één
  // groep zonder kop (role: null, label: ''), zodat er geen loze kop staat.
  // Geeft [{ role, label, names }].
  function ownersByRole(dataset) {
    const owners = getOwnerOptions(dataset);
    const rollen = getRoles(dataset);
    const eerste = (naam) => {
      const ids = getPerson(dataset, naam).roles;
      return rollen.find((r) => ids.includes(r.id)) || null;
    };
    const groepen = rollen.map((r) => ({ role: r, label: r.name, names: owners.filter((o) => eerste(o) === r) }))
      .filter((g) => g.names.length);
    const zonder = owners.filter((o) => !eerste(o));
    if (!groepen.length) return owners.length ? [{ role: null, label: '', names: owners }] : [];
    if (zonder.length) groepen.push({ role: null, label: 'Zonder rol', names: zonder });
    return groepen;
  }

  // Groepen van rollen (idee 88), bijv. "Sturing" voor de senioren en de
  // teamcoördinator: om in één keer iedereen met zo'n rol betrokken te maken.
  // config.roleGroups: [{ id, name, roleIds: [rol-id] }]; een rol mag in meer
  // groepen staan.
  function getRoleGroups(dataset) {
    const eigen = dataset && dataset.config && dataset.config.roleGroups;
    return Array.isArray(eigen) ? eigen.map((g) => ({ ...g, roleIds: [...g.roleIds] })) : [];
  }

  function addRoleGroup(dataset, name) {
    const naam = roleName(name);
    if (!naam) return null;
    const config = ensureConfig(dataset);
    config.roleGroups = Array.isArray(config.roleGroups) ? config.roleGroups : [];
    if (config.roleGroups.some((g) => g.name.toLowerCase() === naam.toLowerCase())) return null;
    const groep = { id: uid('group'), name: naam, roleIds: [] };
    config.roleGroups.push(groep);
    return groep;
  }

  function updateRoleGroup(dataset, id, fields) {
    const lijst = (dataset.config && dataset.config.roleGroups) || [];
    const groep = lijst.find((g) => g.id === id);
    if (!groep) return null;
    const f = fields || {};
    if ('name' in f) {
      const naam = roleName(f.name);
      if (!naam || lijst.some((g) => g !== groep && g.name.toLowerCase() === naam.toLowerCase())) return null;
      groep.name = naam;
    }
    if (Array.isArray(f.roleIds)) {
      const bekend = new Set(getRoles(dataset).map((r) => r.id));
      groep.roleIds = f.roleIds.filter((r, i, a) => bekend.has(r) && a.indexOf(r) === i);
    }
    return groep;
  }

  function removeRoleGroup(dataset, id) {
    const config = ensureConfig(dataset);
    config.roleGroups = (config.roleGroups || []).filter((g) => g.id !== id);
    return true;
  }

  // Per groep de mensen die een van de rollen hebben, in de volgorde van de
  // eigenarenlijst. Groepen zonder mensen vallen weg.
  function roleGroups(dataset) {
    const owners = getOwnerOptions(dataset);
    return getRoleGroups(dataset).map((g) => ({
      name: g.name,
      names: owners.filter((o) => getPerson(dataset, o).roles.some((id) => g.roleIds.includes(id))),
    })).filter((g) => g.names.length);
  }

  // Mag deze persoon bevestigen? Zonder gate gelden de rollen in de app. Met
  // een gate (het GitHub-team, zie ObeyaState.getConfirmGate) alleen wie met
  // een GitHub-login in dat team verbonden is; de rollen tellen dan niet.
  function mayConfirm(dataset, name, gate) {
    if (!gate) return canConfirm(dataset, name);
    return !!(gate.login && Array.isArray(gate.logins) && gate.logins.includes(String(gate.login).toLowerCase()));
  }

  // De namen uit de eigenarenlijst bij de logins van het GitHub-team.
  function confirmersFromLogins(dataset, logins) {
    return (logins || []).map((l) => personForLogin(dataset, l)).filter(Boolean);
  }

  // Wie er mag bevestigen, voor de zin "Bevestigen door …".
  function confirmingRoles(dataset) {
    return getRoles(dataset).filter((r) => r.canConfirm);
  }

  // Naam en visie van het bord (meta.name, meta.vision): wat het bord van dít
  // team maakt. Staan in de kop, in Samenhang en op de muurvellen. Een lege
  // naam laat de oude staan (een bord heeft altijd een naam); een lege visie
  // haalt de visie weg.
  const BOARD_LIMITS = { name: 120, vision: 600 };

  // Het pictogram in het browsertabblad, per bord (idee 58). Standaard dat van
  // de gemeente Leiden; de bestanden staan in img/ in dit repo, zodat er nooit
  // iets live bij een andere site wordt opgehaald. Een eigen afbeelding is een
  // kleine PNG als data-URL (geen SVG uit een bestand: die kan scripts
  // bevatten). De standaard staat niet in het bord, zodat een bestaand bord
  // niet als gewijzigd geldt.
  const FAVICONS = {
    leiden: { label: 'Gemeente Leiden', href: 'img/favicon-leiden-32.png' },
    obeya: { label: 'Obeya (neutraal)', href: 'img/favicon-obeya.svg' },
  };
  const FAVICON_MAX = 20000; // een 64 × 64 PNG is meestal 2 tot 8 kB

  function getFavicon(dataset) {
    const f = dataset && dataset.config && dataset.config.favicon;
    if (f && f.kind === 'custom' && validFaviconData(f.dataUrl)) return { kind: 'custom', href: f.dataUrl };
    if (f && f.kind === 'leiden') return { kind: 'leiden', href: FAVICONS.leiden.href };
    // Standaard het neutrale pictogram (25 november 2026; daarvoor Leiden).
    return { kind: 'obeya', href: FAVICONS.obeya.href };
  }

  function validFaviconData(url) {
    return typeof url === 'string' && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(url) && url.length <= FAVICON_MAX;
  }

  function setFavicon(dataset, choice) {
    const c = choice || {};
    if (!dataset.config) dataset.config = {};
    if (c.kind === 'custom') {
      if (!validFaviconData(c.dataUrl)) return false;
      dataset.config.favicon = { kind: 'custom', dataUrl: c.dataUrl };
    } else if (c.kind === 'leiden') {
      dataset.config.favicon = { kind: 'leiden' };
    } else {
      delete dataset.config.favicon;
    }
    return true;
  }

  function getBoardSettings(dataset) {
    const meta = (dataset && dataset.meta) || {};
    return { name: meta.name || '', vision: meta.vision || '' };
  }

  function setBoardSettings(dataset, fields) {
    if (!dataset.meta) dataset.meta = {};
    const f = fields || {};
    const name = typeof f.name === 'string' ? f.name.trim().slice(0, BOARD_LIMITS.name) : '';
    if (name) dataset.meta.name = name;
    if (typeof f.vision === 'string') {
      const vision = f.vision.trim().slice(0, BOARD_LIMITS.vision);
      if (vision) dataset.meta.vision = vision;
      else delete dataset.meta.vision;
    }
    return getBoardSettings(dataset);
  }

  // ---------------------------------------------------------------------
  // Beoordelingsronde (stap 1.4 in docs/plan-naar-v1.md): de items waar nog
  // een oordeel, een waarde of een duidelijke eigenaar ontbreekt, in de
  // volgorde van het bord (per thema, per doel).
  // ---------------------------------------------------------------------

  const REVIEW_REASONS = {
    status: 'Nog niet beoordeeld',
    // De sleutel heet nog 'values' zodat een bewaarde ronde blijft werken;
    // sinds 12 oktober 2026 gaat het om het criterium en het streefkwartaal.
    values: 'Nog geen "Klaar als …" of streefkwartaal',
    late: 'Te laat: het streefkwartaal is voorbij en het is nog niet klaar',
    'owner-missing': 'Geen eigenaar',
    'owner-unclear': 'Eigenaar onduidelijk',
  };

  // Eigenaarschap is één persoon uit de beheerlijst. Een vraagteken, meerdere
  // namen of een naam die niet in de lijst staat ("seniors") is een vraag
  // voor het team, geen eigenaar.
  function isUnclearOwner(dataset, owner) {
    const o = (owner || '').trim();
    if (!o) return false;
    if (/[?/,&+]|\s(en|of)\s/i.test(o)) return true;
    return !getOwnerOptions(dataset).includes(o);
  }

  function reviewReasons(dataset, type, entity) {
    const reasons = [];
    if ((type === 'measurableResult' || type === 'project') && (entity.status || 'grey') === 'grey') reasons.push('status');
    if (type === 'measurableResult' && (!String(entity.doneCriterion || '').trim() || !entity.periodYear)) reasons.push('values');
    if (type === 'measurableResult' && isLate(entity)) reasons.push('late');
    if (!(entity.owner || '').trim()) reasons.push('owner-missing');
    else if (isUnclearOwner(dataset, entity.owner)) reasons.push('owner-unclear');
    return reasons;
  }

  // scope: { themeId, owner } — beide optioneel.
  function reviewQueue(dataset, scope) {
    const s = scope || {};
    const out = [];
    dataset.themes.forEach((theme) => {
      if (s.themeId && theme.id !== s.themeId) return;
      theme.objectives.forEach((objective) => {
        const kandidaten = [['objective', objective]]
          .concat(objective.measurableResults.map((m) => ['measurableResult', m]))
          .concat(objective.projects.map((p) => ['project', p]));
        kandidaten.forEach(([type, entity]) => {
          if (s.owner && (entity.owner || '') !== s.owner) return;
          const reasons = reviewReasons(dataset, type, entity);
          if (reasons.length) out.push({ type, id: entity.id, reasons });
        });
      });
    });
    return out;
  }

  function getStatusLabelConfig(dataset) {
    return ensureConfig(dataset).statusLabels;
  }

  function setStatusLabel(dataset, entityType, statusKey, label) {
    const config = ensureConfig(dataset);
    if (!config.statusLabels[entityType]) config.statusLabels[entityType] = {};
    const trimmed = (label || '').trim();
    config.statusLabels[entityType][statusKey] = trimmed || defaultStatusLabel(entityType, statusKey);
  }

  function getOwnerOptions(dataset) {
    return ensureConfig(dataset).owners.slice().sort((a, b) => a.localeCompare(b, 'nl'));
  }

  function addOwner(dataset, name) {
    const trimmed = (name || '').trim();
    if (!trimmed) return null;
    const config = ensureConfig(dataset);
    if (config.owners.some((o) => o.toLowerCase() === trimmed.toLowerCase())) return null; // duplicate
    // Een achtergebleven regel met rollen onder deze naam hoort niet bij de nieuwe eigenaar.
    if (config.people) delete config.people[trimmed];
    config.owners.push(trimmed);
    return trimmed;
  }

  // Applies `mapFn(currentOwner) -> newOwner` to the owner field of every
  // theme, objective, measurable result, project and action in one pass.
  function mapAllOwnerFields(dataset, mapFn) {
    dataset.themes.forEach((t) => {
      t.owner = mapFn(t.owner);
      t.objectives.forEach((o) => {
        o.owner = mapFn(o.owner);
        o.measurableResults.forEach((m) => { m.owner = mapFn(m.owner); });
        o.projects.forEach((p) => {
          p.owner = mapFn(p.owner);
          (p.actions || []).forEach((a) => { a.owner = mapFn(a.owner); });
        });
        (o.actions || []).forEach((a) => { a.owner = mapFn(a.owner); });
      });
    });
  }

  // Betrokkenen: wie meewerkt aan een item, naast de ene eigenaar die
  // aanspreekbaar is (besluit 4 oktober 2026: geen gedeeld eigenaarschap).
  // Een optionele lijst namen; leeg betekent: het veld bestaat niet, zodat
  // een item zonder betrokkenen er precies zo uitziet als voorheen.
  // Soort werk op een project (proef van 5 oktober 2026, de teamsessie
  // beoordeelt of het blijft): laat zien hoeveel werk naar beheer gaat en
  // hoeveel naar doorontwikkeling of vernieuwing. Geen keuze = geen veld.
  const WORK_TYPES = { beheer: 'Operatie en beheer', doorontwikkeling: 'Doorontwikkeling', vernieuwing: 'Vernieuwing' };

  function tidyWorkType(project) {
    if (project && 'workType' in project && !Object.prototype.hasOwnProperty.call(WORK_TYPES, project.workType)) delete project.workType;
    return project;
  }

  function workTypeCounts(projects) {
    const c = { beheer: 0, doorontwikkeling: 0, vernieuwing: 0, '': 0 };
    projects.forEach((p) => { c[Object.prototype.hasOwnProperty.call(WORK_TYPES, p.workType) ? p.workType : ''] += 1; });
    return c;
  }

  // Principes uit de visie (besluit 12 oktober 2026): geen thema, maar een
  // label op doelen en projecten (niet op acties), zodat zichtbaar wordt aan
  // welk principe het werk bijdraagt. De lijst hoort bij het bord
  // (config.principles), zodat een ander team eigen principes heeft. Pas
  // bewaard als iemand er een toevoegt, zodat een bestaand bord niet ineens
  // als gewijzigd geldt. Een item kan er meer dan één hebben; geen keuze =
  // geen veld.
  const PRINCIPLE_LIMITS = { name: 60, description: 300 };
  const NO_PRINCIPLE = '__geen';

  function getPrinciples(dataset) {
    const lijst = dataset && dataset.config && dataset.config.principles;
    return Array.isArray(lijst) ? lijst : [];
  }

  // Geeft het aantal weggehaalde verwijzingen naar een onbekend principe
  // terug, zodat inlezen dat kan melden.
  function tidyPrinciples(entity, dataset) {
    if (!entity || !('principleIds' in entity)) return 0;
    const bekend = new Set(getPrinciples(dataset).map((p) => p.id));
    const ids = Array.isArray(entity.principleIds) ? entity.principleIds : [];
    const schoon = ids.filter((id, i) => bekend.has(id) && ids.indexOf(id) === i);
    const weg = ids.filter((id) => typeof id === 'string' && !bekend.has(id)).length;
    if (schoon.length) entity.principleIds = schoon;
    else delete entity.principleIds;
    return weg;
  }

  function principleFields(fields) {
    const f = fields || {};
    const name = typeof f.name === 'string' ? f.name.trim().slice(0, PRINCIPLE_LIMITS.name) : '';
    const description = typeof f.description === 'string' ? f.description.trim().slice(0, PRINCIPLE_LIMITS.description) : '';
    return { name, description };
  }

  function addPrinciple(dataset, fields) {
    const { name, description } = principleFields(fields);
    if (!name) return null;
    if (!dataset.config) dataset.config = {};
    if (!Array.isArray(dataset.config.principles)) dataset.config.principles = [];
    const principle = { id: uid('principle'), name };
    if (description) principle.description = description;
    dataset.config.principles.push(principle);
    return principle;
  }

  function updatePrinciple(dataset, id, fields) {
    const principle = getPrinciples(dataset).find((p) => p.id === id);
    if (!principle) return null;
    const { name, description } = principleFields(fields);
    if (name) principle.name = name;
    if (fields && typeof fields.description === 'string') {
      if (description) principle.description = description;
      else delete principle.description;
    }
    return principle;
  }

  function countPrincipleUse(dataset, id) {
    let n = 0;
    forEachItem(dataset, (item) => { if (Array.isArray(item.principleIds) && item.principleIds.includes(id)) n++; });
    return n;
  }

  function removePrinciple(dataset, id) {
    const lijst = getPrinciples(dataset);
    const index = lijst.findIndex((p) => p.id === id);
    if (index < 0) return false;
    lijst.splice(index, 1);
    forEachItem(dataset, (item) => tidyPrinciples(item, dataset));
    return true;
  }

  // Waaraan het werk bijdraagt: een doel aan zijn eigen principes en die van
  // zijn projecten, een project aan zijn eigen en die van zijn doel.
  function objectivePrinciples(objective) {
    const ids = new Set(objective.principleIds || []);
    (objective.projects || []).forEach((p) => (p.principleIds || []).forEach((id) => ids.add(id)));
    return ids;
  }

  function projectPrinciples(project, objective) {
    return new Set([...(project.principleIds || []), ...((objective && objective.principleIds) || [])]);
  }

  // Per principe hoeveel doelen en projecten het zelf dragen en hoeveel
  // daarvan amber of rood staan, plus wat nog geen principe heeft.
  function principleCoverage(dataset) {
    const rows = getPrinciples(dataset).map((principle) => ({ principle, objectives: 0, projects: 0, attention: 0 }));
    const byId = new Map(rows.map((r) => [r.principle.id, r]));
    let unlabelledObjectives = 0;
    let unlabelledProjects = 0;
    const tel = (item, soort) => {
      const ids = item.principleIds || [];
      if (!ids.length) return false;
      ids.forEach((id) => {
        const r = byId.get(id);
        if (!r) return;
        r[soort] += 1;
        if (item.status === 'amber' || item.status === 'red') r.attention += 1;
      });
      return true;
    };
    dataset.themes.forEach((t) => t.objectives.forEach((o) => {
      if (!tel(o, 'objectives')) unlabelledObjectives += 1;
      o.projects.forEach((p) => { if (!tel(p, 'projects')) unlabelledProjects += 1; });
    }));
    return { rows, unlabelledObjectives, unlabelledProjects };
  }

  function tidyInvolved(entity) {
    if (!entity || !('involved' in entity)) return entity;
    const owner = (entity.owner || '').trim();
    const namen = Array.isArray(entity.involved) ? entity.involved : [];
    const schoon = [];
    namen.forEach((n) => {
      const t = typeof n === 'string' ? n.trim() : '';
      if (t && t !== owner && !schoon.includes(t)) schoon.push(t);
    });
    if (schoon.length) entity.involved = schoon;
    else delete entity.involved;
    return entity;
  }

  function forEachItem(dataset, fn) {
    dataset.themes.forEach((t) => {
      fn(t);
      t.objectives.forEach((o) => {
        fn(o);
        o.measurableResults.forEach(fn);
        o.projects.forEach((p) => { fn(p); (p.actions || []).forEach(fn); });
        (o.actions || []).forEach(fn);
      });
    });
  }

  function mapAllInvolved(dataset, mapFn) {
    forEachItem(dataset, (item) => {
      if (!Array.isArray(item.involved)) return;
      item.involved = item.involved.map(mapFn);
      tidyInvolved(item);
    });
  }

  function countInvolvement(dataset, name) {
    let count = 0;
    forEachItem(dataset, (item) => { if (Array.isArray(item.involved) && item.involved.includes(name)) count++; });
    return count;
  }

  function countOwnerUsage(dataset, name) {
    let count = 0;
    mapAllOwnerFields(dataset, (owner) => {
      if (owner === name) count++;
      return owner;
    });
    return count;
  }

  // Renames an owner both in the managed list and on every item currently
  // set to that name, so a typo fix (e.g. "David-Wouter?" -> "David-Wouter")
  // does not leave the board in an inconsistent state. Returns false without
  // changing anything if `oldName` isn't a known owner or `newName` would
  // collide with a different existing owner.
  function renameOwner(dataset, oldName, newName) {
    const trimmed = (newName || '').trim();
    if (!oldName || !trimmed) return false;
    const config = ensureConfig(dataset);
    const idx = config.owners.findIndex((o) => o === oldName);
    if (idx === -1) return false;
    if (trimmed !== oldName && config.owners.some((o) => o.toLowerCase() === trimmed.toLowerCase())) return false;
    config.owners[idx] = trimmed;
    if (config.people && config.people[oldName] && trimmed !== oldName) {
      config.people[trimmed] = config.people[oldName];
      delete config.people[oldName];
    }
    mapAllOwnerFields(dataset, (owner) => (owner === oldName ? trimmed : owner));
    mapAllInvolved(dataset, (n) => (n === oldName ? trimmed : n));
    return true;
  }

  // Removes an owner from the managed list. When `opts.clearFromItems` is
  // set, also clears that owner off every item that still had it (rather
  // than leaving a name on items that no longer offers it in the dropdown).
  function removeOwner(dataset, name, opts) {
    const config = ensureConfig(dataset);
    config.owners = config.owners.filter((o) => o !== name);
    if (config.people) delete config.people[name];
    if (opts && opts.clearFromItems) {
      mapAllOwnerFields(dataset, (owner) => (owner === name ? '' : owner));
      mapAllInvolved(dataset, (n) => (n === name ? '' : n));
    }
    return true;
  }

  // ---------------------------------------------------------------------
  // Mutations. Every function mutates `dataset` in place and returns the
  // created/updated entity (or true for deletes) so callers can react.
  // ---------------------------------------------------------------------

  function createTheme(dataset, fields) {
    const theme = {
      id: uid('theme'),
      name: fields.name || 'Nieuw thema',
      description: fields.description || '',
      status: fields.status || 'grey',
      owner: fields.owner || '',
      objectives: [],
      flaggedForDiscussion: !!fields.flaggedForDiscussion,
      color: validColor(fields.color) ? fields.color.trim() : nextThemeColor(dataset),
    };
    if (fields.involved) { theme.involved = fields.involved; tidyInvolved(theme); }
    dataset.themes.push(theme);
    return theme;
  }

  function updateTheme(dataset, themeId, fields) {
    const theme = findTheme(dataset, themeId);
    if (!theme) return null;
    const { color, ...rest } = fields || {};
    Object.assign(theme, rest);
    // Alleen een echte kleur (#rrggbb); iets anders laat de kleur staan.
    if (validColor(color)) theme.color = color.trim();
    tidyInvolved(theme);
    return theme;
  }

  // Verwijdert het thema en de doelen die alléén hieraan hingen. Een doel dat
  // ook een ander thema raakt, verhuist daarheen in plaats van mee verwijderd
  // te worden — anders verdwijnt het ook uit thema's die gewoon blijven
  // bestaan. Koppelingen naar het verwijderde thema worden overal opgeruimd,
  // zodat er geen verwijzingen naar een niet-bestaand thema achterblijven.
  function deleteTheme(dataset, themeId) {
    const idx = dataset.themes.findIndex((t) => t.id === themeId);
    if (idx === -1) return false;
    const theme = dataset.themes[idx];

    allObjectives(dataset).forEach((objective) => {
      const linked = objective.themeIds || [objective.themeId];
      objective.themeIds = linked.filter((id) => id !== themeId);
    });

    const orphans = [];
    theme.objectives.forEach((objective) => {
      const target = objective.themeIds.map((id) => findTheme(dataset, id)).find((t) => t && t.id !== themeId);
      if (!target) {
        orphans.push(objective);
        return;
      }
      objective.themeId = target.id;
      target.objectives.push(objective);
    });
    // Doelen zonder ander thema verdwijnen met dit thema mee; hun themeIds
    // herstellen we zodat een verwijderd doel niet half opgeruimd achterblijft
    // als een aanroeper de lijst nog vasthoudt. Hun relaties (en die van hun
    // meetbare resultaten, projecten en acties) verdwijnen mee.
    const removedIds = [];
    orphans.forEach((objective) => {
      objective.themeIds = [themeId];
      removedIds.push(...collectObjectiveDescendantIds(objective));
    });
    pruneRelationsForIds(dataset, removedIds);

    dataset.themes.splice(idx, 1);
    return true;
  }

  // Een doel is fysiek opgeslagen in de objectives-lijst van precies één thema,
  // terwijl themeIds er meerdere kan bevatten. De regel: het thema waarin het
  // doel staat, staat ook in themeIds, en objective.themeId wijst daarnaar.
  // Zonder dat loopt het bord (dat de fysieke plek toont) uit de pas met de
  // Verbindingen-matrix en de kruimelpaden (die themeIds volgen).
  //
  // Blijft het huidige thema gekoppeld, dan blijft het doel staan — een kaart
  // hoort niet naar een andere kolom te springen zolang zijn thema er nog bij
  // hoort. Anders verhuist het naar het eerste thema uit themeIds.
  function owningThemeIdFor(themeIds, currentThemeId) {
    const linked = Array.isArray(themeIds) ? themeIds.filter(Boolean) : [];
    if (!linked.length) return currentThemeId || null;
    if (currentThemeId && linked.includes(currentThemeId)) return currentThemeId;
    return linked[0];
  }

  function createObjective(dataset, themeId, fields) {
    // Het formulier kan andere thema's aangevinkt hebben dan de kolom waarin
    // "+ Doel" is aangeklikt; dan telt de aanvinklijst.
    const owningThemeId = owningThemeIdFor(fields.themeIds, themeId);
    const theme = findTheme(dataset, owningThemeId) || findTheme(dataset, themeId);
    if (!theme) return null;
    const objective = {
      id: uid('objective'),
      title: fields.title || 'Nieuw doel',
      description: fields.description || '',
      owner: fields.owner || '',
      status: fields.status || 'grey',
      themeId: theme.id,
      themeIds: fields.themeIds && fields.themeIds.length ? fields.themeIds : [theme.id],
      measurableResults: [],
      projects: [],
      actions: [],
      notes: [],
      flaggedForDiscussion: !!fields.flaggedForDiscussion,
    };
    if (fields.involved) { objective.involved = fields.involved; tidyInvolved(objective); }
    if (fields.principleIds) { objective.principleIds = fields.principleIds; tidyPrinciples(objective, dataset); }
    theme.objectives.push(objective);
    return objective;
  }

  function updateObjective(dataset, objectiveId, fields) {
    const objective = findObjective(dataset, objectiveId);
    if (!objective) return null;
    const currentTheme = findObjectiveOwnerTheme(dataset, objectiveId);
    Object.assign(objective, fields);
    tidyInvolved(objective);
    tidyPrinciples(objective, dataset);

    // Alleen de themakoppeling zelf kan een verhuizing veroorzaken; de rest van
    // de velden raakt de opslagplek niet.
    if (!fields.themeIds || !currentTheme) return objective;

    const targetTheme = findTheme(dataset, owningThemeIdFor(objective.themeIds, currentTheme.id));
    if (!targetTheme) {
      // Onbekend thema (bv. handmatig aangepaste import): laat het doel staan
      // waar het staat in plaats van het nergens te laten belanden.
      objective.themeId = currentTheme.id;
      return objective;
    }

    objective.themeId = targetTheme.id;
    if (targetTheme.id !== currentTheme.id) {
      currentTheme.objectives = currentTheme.objectives.filter((o) => o.id !== objectiveId);
      targetTheme.objectives.push(objective);
    }
    return objective;
  }

  function deleteObjective(dataset, objectiveId) {
    const theme = findObjectiveOwnerTheme(dataset, objectiveId);
    if (!theme) return false;
    const objective = theme.objectives.find((o) => o.id === objectiveId);
    theme.objectives = theme.objectives.filter((o) => o.id !== objectiveId);
    if (objective) pruneRelationsForIds(dataset, collectObjectiveDescendantIds(objective));
    return true;
  }

  function createMeasurableResult(dataset, objectiveId, fields) {
    const objective = findObjective(dataset, objectiveId);
    if (!objective) return null;
    const mr = {
      id: uid('mr'),
      name: fields.name || 'Nieuw meetbaar resultaat',
      doneCriterion: fields.doneCriterion || '',
      periodYear: fields.periodYear ?? null,
      periodQuarter: fields.periodQuarter ?? null,
      owner: fields.owner || '',
      status: fields.status || 'grey',
      sourceStatus: fields.sourceStatus || null,
      inTeamPlan: !!fields.inTeamPlan,
      monitoringText: fields.monitoringText || '',
      objectiveId: objectiveId,
      flaggedForDiscussion: !!fields.flaggedForDiscussion,
      valueCurrent: fields.valueCurrent,
      valueTarget: fields.valueTarget,
      valueDate: fields.valueDate,
    };
    if (fields.involved) { mr.involved = fields.involved; tidyInvolved(mr); }
    tidyDeliverable(mr);
    objective.measurableResults.push(mr);
    return mr;
  }

  // Meerdere meetbare resultaten tegelijk (idee 84): één naam per regel.
  // Opsommingstekens vooraan ("- ", "• ", "1. ") vallen weg, zodat een lijst
  // uit Word of een mail zo te plakken is; een komma blijft in de naam.
  const OPSOMMING = /^\s*(?:[-*•·–—]|\d+[.)])\s+/;
  function splitResultNames(text) {
    const gezien = new Set();
    const namen = [];
    String(text || '').split(/\r?\n/).forEach((regel) => {
      const naam = regel.replace(OPSOMMING, '').trim();
      const sleutel = naam.toLowerCase();
      if (!naam || gezien.has(sleutel)) return;
      gezien.add(sleutel);
      namen.push(naam);
    });
    return namen;
  }

  // Voegt de namen toe als meetbare resultaten van één doel, met de gedeelde
  // velden (eigenaar, streefjaar, -kwartaal). Een naam die het doel al heeft,
  // wordt overgeslagen. Geeft { added, skipped }.
  function addMeasurableResults(dataset, objectiveId, names, shared) {
    const objective = findObjective(dataset, objectiveId);
    if (!objective) return { added: [], skipped: [] };
    const bestaand = new Set(objective.measurableResults.map((m) => String(m.name).trim().toLowerCase()));
    const added = [];
    const skipped = [];
    (names || []).forEach((naam) => {
      if (bestaand.has(naam.toLowerCase())) { skipped.push(naam); return; }
      bestaand.add(naam.toLowerCase());
      added.push(createMeasurableResult(dataset, objectiveId, { ...(shared || {}), name: naam }));
    });
    return { added, skipped };
  }

  function updateMeasurableResult(dataset, mrId, fields) {
    const mr = findMeasurableResult(dataset, mrId);
    if (!mr) return null;
    Object.assign(mr, fields);
    tidyInvolved(mr);
    tidyDeliverable(mr);
    return mr;
  }

  function deleteMeasurableResult(dataset, mrId) {
    for (const t of dataset.themes) {
      for (const o of t.objectives) {
        const before = o.measurableResults.length;
        o.measurableResults = o.measurableResults.filter((m) => m.id !== mrId);
        if (o.measurableResults.length !== before) {
          pruneRelationsForIds(dataset, [mrId]);
          return true;
        }
      }
    }
    return false;
  }

  function createProject(dataset, objectiveId, fields) {
    const objective = findObjective(dataset, objectiveId);
    if (!objective) return null;
    const project = {
      id: uid('project'),
      name: fields.name || 'Nieuw project',
      description: fields.description || '',
      owner: fields.owner || '',
      status: fields.status || 'grey',
      sourceStatus: fields.sourceStatus || null,
      inTeamPlan: !!fields.inTeamPlan,
      monitoringText: fields.monitoringText || '',
      periodYear: fields.periodYear ?? null,
      periodQuarter: fields.periodQuarter ?? null,
      // Welke meetbare resultaten dit project (mede) realiseert — veel-op-
      // veel, net als themeIds op Objective: één project kan aan meerdere
      // resultaten bijdragen en één resultaat door meerdere projecten
      // worden gerealiseerd. Voor de brondata een op Excel-rijpositie
      // gebaseerde aanname (zie meta.extraction), voor nieuwe projecten een
      // bewuste keuze in het bewerkformulier.
      measurableResultIds: Array.isArray(fields.measurableResultIds) ? fields.measurableResultIds : [],
      // Bewust gezet wanneer een project terecht geen meetbaar resultaat
      // heeft (bv. breed coördinerend werk) — voorkomt dat zo'n project voor
      // altijd als "nog te koppelen" op de agenda blijft staan.
      noMeasurableResultNeeded: !!fields.noMeasurableResultNeeded,
      objectiveId: objectiveId,
      actions: [],
      flaggedForDiscussion: !!fields.flaggedForDiscussion,
    };
    if (fields.involved) { project.involved = fields.involved; tidyInvolved(project); }
    if (fields.workType) { project.workType = fields.workType; tidyWorkType(project); }
    if (fields.principleIds) { project.principleIds = fields.principleIds; tidyPrinciples(project, dataset); }
    objective.projects.push(project);
    return project;
  }

  function updateProject(dataset, projectId, fields) {
    const project = findProject(dataset, projectId);
    if (!project) return null;
    Object.assign(project, fields);
    tidyInvolved(project);
    tidyWorkType(project);
    tidyPrinciples(project, dataset);
    return project;
  }

  function deleteProject(dataset, projectId) {
    for (const t of dataset.themes) {
      for (const o of t.objectives) {
        const project = o.projects.find((p) => p.id === projectId);
        if (!project) continue;
        const removedIds = [projectId, ...(project.actions || []).map((a) => a.id)];
        o.projects = o.projects.filter((p) => p.id !== projectId);
        pruneRelationsForIds(dataset, removedIds);
        return true;
      }
    }
    return false;
  }

  function createAction(dataset, objectiveId, projectId, fields) {
    const objective = findObjective(dataset, objectiveId);
    if (!objective) return null;
    const action = {
      id: uid('action'),
      title: fields.title || 'Nieuwe actie',
      description: fields.description || '',
      owner: fields.owner || '',
      status: fields.status || 'grey',
      dueDate: fields.dueDate || null,
      projectId: projectId || null,
      objectiveId: objectiveId,
      relatedItemId: projectId || objectiveId,
      measurableResultId: fields.measurableResultId || null,
      flaggedForDiscussion: !!fields.flaggedForDiscussion,
    };
    if (fields.involved) { action.involved = fields.involved; tidyInvolved(action); }
    if (projectId) {
      const project = objective.projects.find((p) => p.id === projectId);
      if (!project) return null;
      project.actions.push(action);
    } else {
      objective.actions = objective.actions || [];
      objective.actions.push(action);
    }
    return action;
  }

  // Meerdere acties bij een meetbaar resultaat (idee 86): elke naam wordt een
  // actie bij het doel, gekoppeld aan het resultaat. Zonder eigenaar: die
  // kiest het team daarna per actie. Een titel die al aan het resultaat
  // hangt, wordt overgeslagen. Geeft { added, skipped }.
  function addActionsToResult(dataset, mrId, names) {
    const mr = findMeasurableResult(dataset, mrId);
    const objective = mr && findObjective(dataset, mr.objectiveId);
    if (!objective) return { added: [], skipped: [] };
    const bestaand = new Set(contributingItems(objective, mr.id).actions.map((a) => String(a.title).trim().toLowerCase()));
    const added = [];
    const skipped = [];
    (names || []).forEach((naam) => {
      if (bestaand.has(naam.toLowerCase())) { skipped.push(naam); return; }
      bestaand.add(naam.toLowerCase());
      added.push(createAction(dataset, objective.id, null, { title: naam, measurableResultId: mr.id }));
    });
    return { added, skipped };
  }

  // In bulk wijzigen in Samenhang (idee 89). Een status kies je op betekenis,
  // niet op kleur: "Klaar" is bij een meetbaar resultaat 'done' en bij een
  // project of actie 'green'; "Op koers" bestaat alleen bij een resultaat.
  // Een soort die de gekozen betekenis niet kent, blijft staan.
  const BULK_STATUS = {
    done: { measurableResult: 'done', project: 'green', action: 'green' },
    blue: { project: 'blue', action: 'blue' },
    green: { measurableResult: 'green' },
    amber: { measurableResult: 'amber', project: 'amber', action: 'amber' },
    red: { measurableResult: 'red', project: 'red', action: 'red' },
    grey: { measurableResult: 'grey', project: 'grey', action: 'grey' },
  };
  const BULK_TYPES = ['measurableResult', 'project', 'action'];

  function bulkEntity(dataset, item) {
    if (!item || !BULK_TYPES.includes(item.type)) return null;
    if (item.type === 'measurableResult') return findMeasurableResult(dataset, item.id);
    if (item.type === 'project') return findProject(dataset, item.id);
    return findAction(dataset, item.id);
  }

  // change: { status: betekenis } | { owner: naam of '' } | { flag: true/false }.
  // Geeft { changed, skipped }.
  function bulkEdit(dataset, items, change) {
    let changed = 0;
    let skipped = 0;
    (items || []).forEach((item) => {
      const e = bulkEntity(dataset, item);
      if (!e) { skipped += 1; return; }
      if (change && 'status' in change) {
        const waarde = (BULK_STATUS[change.status] || {})[item.type];
        if (!waarde) { skipped += 1; return; }
        e.status = waarde;
      } else if (change && 'owner' in change) {
        e.owner = String(change.owner || '').trim();
      } else if (change && 'flag' in change) {
        e.flaggedForDiscussion = !!change.flag;
      } else { skipped += 1; return; }
      changed += 1;
    });
    return { changed, skipped };
  }

  // Verwijderen in bulk. Een actie onder een project dat ook weggaat, gaat met
  // het project mee. Geeft { removed }: hoeveel van de gekozen items weg zijn.
  function bulkDelete(dataset, items) {
    const gekozen = (items || []).filter((i) => i && BULK_TYPES.includes(i.type) && bulkEntity(dataset, i));
    const volgorde = { project: 0, measurableResult: 1, action: 2 };
    [...gekozen].sort((x, y) => volgorde[x.type] - volgorde[y.type]).forEach((item) => {
      if (!bulkEntity(dataset, item)) return;
      if (item.type === 'project') deleteProject(dataset, item.id);
      else if (item.type === 'measurableResult') deleteMeasurableResult(dataset, item.id);
      else deleteAction(dataset, item.id);
    });
    return { removed: gekozen.filter((i) => !bulkEntity(dataset, i)).length };
  }

  // Dupliceren (idee 85): een meetbaar resultaat, project of actie, alleen het
  // item zelf, direct na het origineel. Een kopie is nog niet beoordeeld en
  // staat niet in het teamplan of op de agenda; de stand (monitoring),
  // notities, relaties en de acties van een project gaan niet mee.
  function duplicateItem(dataset, type, id) {
    let origineel = null;
    let lijst = null;
    let naamVeld = 'name';
    if (type === 'measurableResult') {
      origineel = findMeasurableResult(dataset, id);
      const doel = origineel && findObjective(dataset, origineel.objectiveId);
      lijst = doel && doel.measurableResults;
    } else if (type === 'project') {
      origineel = findProject(dataset, id);
      const doel = origineel && findObjective(dataset, origineel.objectiveId);
      lijst = doel && doel.projects;
    } else if (type === 'action') {
      naamVeld = 'title';
      origineel = findAction(dataset, id);
      const doel = origineel && findObjective(dataset, origineel.objectiveId);
      const project = doel && origineel.projectId ? doel.projects.find((p) => p.id === origineel.projectId) : null;
      lijst = project ? project.actions : doel && doel.actions;
    }
    if (!origineel || !lijst || !lijst.includes(origineel)) return null;
    const kopie = deepClone(origineel);
    kopie.id = uid(type === 'measurableResult' ? 'mr' : type);
    kopie[naamVeld] = `${origineel[naamVeld]} (kopie)`;
    kopie.status = 'grey';
    kopie.flaggedForDiscussion = false;
    if ('sourceStatus' in kopie) kopie.sourceStatus = null;
    if ('inTeamPlan' in kopie) kopie.inTeamPlan = false;
    if ('monitoringText' in kopie) kopie.monitoringText = '';
    if (type === 'project') kopie.actions = [];
    lijst.splice(lijst.indexOf(origineel) + 1, 0, kopie);
    return kopie;
  }

  function updateAction(dataset, actionId, fields) {
    const action = findAction(dataset, actionId);
    if (!action) return null;
    const objective = findObjective(dataset, action.objectiveId);
    if (!objective) return null;

    // An action is physically stored inside project.actions or (when it has
    // no project) objective.actions. If the edit changes which project it
    // belongs to, it has to move to that array too, not just get a new
    // projectId field while staying in the old list.
    const changesProject = Object.prototype.hasOwnProperty.call(fields, 'projectId')
      && (fields.projectId || null) !== (action.projectId || null);

    if (changesProject) {
      if (action.projectId) {
        const oldProject = objective.projects.find((p) => p.id === action.projectId);
        if (oldProject) oldProject.actions = oldProject.actions.filter((a) => a.id !== actionId);
      } else {
        objective.actions = (objective.actions || []).filter((a) => a.id !== actionId);
      }
    }

    Object.assign(action, fields);
    tidyInvolved(action);

    if (changesProject) {
      action.relatedItemId = action.projectId || action.objectiveId;
      if (action.projectId) {
        const newProject = objective.projects.find((p) => p.id === action.projectId);
        if (newProject) newProject.actions.push(action);
      } else {
        objective.actions = objective.actions || [];
        objective.actions.push(action);
      }
    }
    return action;
  }

  // Haalt uit `dataset` elk item weg dat ook in `other` staat (op id): thema's,
  // doelen, meetbare resultaten, projecten, acties, notities en relaties, plus
  // eigenaren die alleen daardoor in de lijst stonden. Bedoeld om de
  // voorbeelddata uit een per ongeluk vermengd bord te halen; eigen werk blijft
  // staan. Geeft het aantal verwijderde items.
  function removeItemsOf(dataset, other) {
    const weg = new Set();
    (other.themes || []).forEach((t) => {
      weg.add(t.id);
      (t.objectives || []).forEach((o) => {
        weg.add(o.id);
        (o.measurableResults || []).forEach((m) => weg.add(m.id));
        (o.projects || []).forEach((p) => { weg.add(p.id); (p.actions || []).forEach((a) => weg.add(a.id)); });
        (o.actions || []).forEach((a) => weg.add(a.id));
        (o.notes || []).forEach((n) => weg.add(n.id));
      });
    });
    (other.relations || []).forEach((r) => weg.add(r.id));
    const eigenarenVoor = new Set(allOwners(dataset));
    let n = 0;
    const filter = (list) => (list || []).filter((x) => { if (weg.has(x.id)) { n++; return false; } return true; });
    dataset.themes = filter(dataset.themes);
    dataset.themes.forEach((t) => {
      t.objectives = filter(t.objectives);
      t.objectives.forEach((o) => {
        o.themeIds = (o.themeIds || []).filter((id) => !weg.has(id));
        o.measurableResults = filter(o.measurableResults);
        o.projects = filter(o.projects);
        o.projects.forEach((p) => {
          p.actions = filter(p.actions);
          p.measurableResultIds = (p.measurableResultIds || []).filter((id) => !weg.has(id));
        });
        o.actions = filter(o.actions);
        o.notes = filter(o.notes);
      });
    });
    dataset.relations = filter(dataset.relations).filter((r) => !weg.has(r.from) && !weg.has(r.to));
    // Eigenaren die alleen door de weggehaalde items in de lijst stonden.
    if (dataset.config && Array.isArray(dataset.config.owners)) {
      const nog = new Set(allOwners(dataset));
      const vanAnder = new Set(allOwners(other));
      dataset.config.owners = dataset.config.owners.filter((o) => nog.has(o) || !vanAnder.has(o) || !eigenarenVoor.has(o));
    }
    return n;
  }

  // --- verschuiven en verbinden op de muur (lens Keten) ----------------------
  // Elke functie hieronder is één verplaatsing, zodat één mutatie (en dus één
  // keer ongedaan maken) haar volledig terugdraait. De volgorde in de lijsten
  // ís de volgorde op de muur; `beforeId` zet een item vóór dat item, zonder
  // `beforeId` komt het achteraan.

  function placeBefore(list, item, beforeId) {
    const zonder = list.filter((x) => x.id !== item.id);
    const i = beforeId ? zonder.findIndex((x) => x.id === beforeId) : -1;
    if (i === -1) zonder.push(item);
    else zonder.splice(i, 0, item);
    return zonder;
  }

  // Notities staan bij hun doel; verhuist een item naar een ander doel, dan
  // verhuizen de notities erover mee, anders verdwijnen ze uit beeld.
  function moveNotes(from, to, ids) {
    if (!from || !to || from === to) return;
    const set = new Set(ids);
    const mee = (from.notes || []).filter((n) => set.has(n.relatedItemId));
    if (!mee.length) return;
    from.notes = from.notes.filter((n) => !set.has(n.relatedItemId));
    to.notes = (to.notes || []).concat(mee);
  }

  // Het teamplan (idee 61): alles met het vinkje "In teamplan", per thema en
  // doel, in de volgorde van het bord. Een doel hoort erbij als er een
  // meetbaar resultaat of project onder hangt dat in het teamplan staat; een
  // thema als er zo'n doel onder hangt. Basis voor de presentatie.
  function teamPlan(dataset) {
    let count = 0;
    const themes = [];
    (dataset.themes || []).forEach((theme) => {
      const objectives = [];
      theme.objectives.forEach((objective) => {
        const results = objective.measurableResults.filter((m) => m.inTeamPlan);
        const projects = objective.projects.filter((p) => p.inTeamPlan);
        if (results.length + projects.length === 0) return;
        count += results.length + projects.length;
        objectives.push({ objective, results, projects });
      });
      if (objectives.length) themes.push({ theme, objectives });
    });
    return { themes, count };
  }

  // De volgorde van de thema's (slepen op het Bord).
  function moveTheme(dataset, themeId, opts) {
    const theme = findTheme(dataset, themeId);
    if (!theme) return null;
    dataset.themes = placeBefore(dataset.themes, theme, opts && opts.beforeId);
    return theme;
  }

  function moveObjective(dataset, objectiveId, opts) {
    const o = opts || {};
    const objective = findObjective(dataset, objectiveId);
    const current = findObjectiveOwnerTheme(dataset, objectiveId);
    if (!objective || !current) return null;
    if (o.themeId && o.themeId !== current.id && findTheme(dataset, o.themeId)) {
      updateObjective(dataset, objectiveId, {
        themeIds: [o.themeId, ...(objective.themeIds || []).filter((t) => t !== current.id && t !== o.themeId)],
      });
    }
    const theme = findObjectiveOwnerTheme(dataset, objectiveId);
    theme.objectives = placeBefore(theme.objectives, objective, o.beforeId);
    return objective;
  }

  // opts: { objectiveId (ander doel, idee 71), beforeId }. Naar een ander
  // doel gaat het werk mee dat alleen aan dit resultaat hangt; werk dat ook
  // aan andere resultaten van het oude doel hangt blijft staan en draagt via
  // een relatie bij aan het verhuisde resultaat. Zo verdwijnt geen koppeling.
  function moveMeasurableResult(dataset, mrId, opts) {
    const o = opts || {};
    const mr = findMeasurableResult(dataset, mrId);
    const objective = mr && findObjective(dataset, mr.objectiveId);
    if (!objective) return null;
    const naar = o.objectiveId && o.objectiveId !== objective.id ? findObjective(dataset, o.objectiveId) : null;
    if (o.objectiveId && o.objectiveId !== objective.id && !naar) return null;
    if (!naar) {
      objective.measurableResults = placeBefore(objective.measurableResults, mr, o.beforeId);
      return mr;
    }
    objective.measurableResults = objective.measurableResults.filter((m) => m.id !== mrId);
    mr.objectiveId = naar.id;
    naar.measurableResults = placeBefore(naar.measurableResults, mr, o.beforeId);
    moveNotes(objective, naar, [mrId]);
    werkMeeNaar(dataset, objective, mrId, naar, mrId);
    relatiesOpruimen(dataset);
    return mr;
  }

  // Het werk van `van` dat aan resultaat `mrId` hangt: wat alleen daaraan
  // hangt verhuist naar doel `naar` (gekoppeld aan `naarMrId`, of los als dat
  // null is); de rest blijft en krijgt een relatie "draagt bij aan" naar
  // `relatieNaar` (het resultaat of het nieuwe doel).
  function werkMeeNaar(dataset, van, mrId, naar, naarMrId, relatieNaar) {
    const doelVoorRelatie = relatieNaar || mrId;
    van.projects.slice().forEach((p) => {
      const ids = p.measurableResultIds || [];
      if (!ids.includes(mrId)) return;
      if (ids.length === 1) {
        // Een actie onder dit project die aan een ander resultaat van het
        // oude doel hangt, houdt die bijdrage als relatie.
        (p.actions || []).forEach((a) => {
          if (a.measurableResultId && a.measurableResultId !== mrId) createRelation(dataset, { from: a.id, to: a.measurableResultId, type: 'contributes' });
        });
        moveProject(dataset, p.id, { objectiveId: naar.id, fromMrId: mrId, toMrId: naarMrId || null });
      } else {
        p.measurableResultIds = ids.filter((id) => id !== mrId);
        createRelation(dataset, { from: p.id, to: doelVoorRelatie, type: 'contributes' });
      }
    });
    (van.actions || []).slice().forEach((a) => {
      if (a.measurableResultId === mrId) moveAction(dataset, a.id, { projectId: null, objectiveId: naar.id, toMrId: naarMrId || null });
    });
    van.projects.forEach((p) => (p.actions || []).forEach((a) => {
      if (a.measurableResultId !== mrId) return;
      a.measurableResultId = null;
      createRelation(dataset, { from: a.id, to: doelVoorRelatie, type: 'contributes' });
    }));
  }

  // opts: { objectiveId (ander doel), fromMrId (de groep waar het vandaan
  // komt), toMrId (resultaat waar het nu onder hangt, null = niet
  // gekoppeld), beforeId }
  function moveProject(dataset, projectId, opts) {
    const o = opts || {};
    const project = findProject(dataset, projectId);
    const from = project && findObjective(dataset, project.objectiveId);
    if (!from) return null;
    const to = o.objectiveId ? findObjective(dataset, o.objectiveId) : from;
    if (!to) return null;

    if (to !== from) {
      from.projects = from.projects.filter((p) => p.id !== projectId);
      project.objectiveId = to.id;
      const eigen = new Set(to.measurableResults.map((m) => m.id));
      (project.actions || []).forEach((a) => {
        a.objectiveId = to.id;
        if (a.measurableResultId && !eigen.has(a.measurableResultId)) a.measurableResultId = null;
      });
      project.measurableResultIds = o.toMrId && eigen.has(o.toMrId) ? [o.toMrId] : [];
      moveNotes(from, to, [project.id, ...(project.actions || []).map((a) => a.id)]);
    } else {
      const eigen = new Set(from.measurableResults.map((m) => m.id));
      let ids = (project.measurableResultIds || []).filter((id) => id !== o.fromMrId && id !== o.toMrId);
      if (o.toMrId && eigen.has(o.toMrId)) ids = [o.toMrId, ...ids];
      else ids = ids.filter((id) => !eigen.has(id));
      project.measurableResultIds = ids;
    }
    if (project.measurableResultIds.length) project.noMeasurableResultNeeded = false;
    to.projects = placeBefore(to.projects, project, o.beforeId);
    return project;
  }

  // opts: { projectId (null = los onder een doel), objectiveId (voor een losse
  // actie), toMrId (alleen voor losse acties tussen resultaatgroepen),
  // beforeId }
  function moveAction(dataset, actionId, opts) {
    const o = opts || {};
    const action = findAction(dataset, actionId);
    const from = action && findObjective(dataset, action.objectiveId);
    if (!from) return null;
    const project = o.projectId ? findProject(dataset, o.projectId) : null;
    const to = project ? findObjective(dataset, project.objectiveId) : (o.objectiveId ? findObjective(dataset, o.objectiveId) : from);
    if (!to || (o.projectId && !project)) return null;

    // Uit de oude lijst.
    if (action.projectId) {
      const oud = from.projects.find((p) => p.id === action.projectId);
      if (oud) oud.actions = oud.actions.filter((a) => a.id !== actionId);
    } else {
      from.actions = (from.actions || []).filter((a) => a.id !== actionId);
    }
    action.projectId = project ? project.id : null;
    action.objectiveId = to.id;
    action.relatedItemId = project ? project.id : to.id;
    const eigen = new Set(to.measurableResults.map((m) => m.id));
    if (Object.prototype.hasOwnProperty.call(o, 'toMrId')) action.measurableResultId = o.toMrId && eigen.has(o.toMrId) ? o.toMrId : null;
    else if (action.measurableResultId && !eigen.has(action.measurableResultId)) action.measurableResultId = null;
    // In de nieuwe lijst.
    if (project) project.actions = placeBefore(project.actions || [], action, o.beforeId);
    else to.actions = placeBefore(to.actions || [], action, o.beforeId);
    moveNotes(from, to, [action.id]);
    return action;
  }

  // --- Omzetten: project ↔ actie (idee 65) ---------------------------------
  // Iets dat als project is neergezet maar eigenlijk een actie is (of
  // andersom) van niveau laten wisselen, zonder het opnieuw te typen. Het
  // omgezette item krijgt een nieuw id (een project en een actie met hetzelfde
  // id zouden bij samenvoegen met een collega allebei kunnen blijven staan);
  // alles wat ernaar verwijst gaat mee: relaties, notities, de markering voor
  // bespreking, het inbox-nummer en de betrokkenen. Alleen een project zonder
  // acties kan een actie worden.

  // Wat bij omzetten niet meegaat, in woorden (voor de bevestiging vooraf).
  // Tekst gaat nooit verloren: de toelichting komt in de omschrijving.
  function conversionLosses(dataset, type, id) {
    const uit = [];
    if (type === 'project') {
      const p = findProject(dataset, id);
      if (!p) return uit;
      if (p.inTeamPlan) uit.push('het vinkje "In teamplan"');
      if ((p.principleIds || []).length) uit.push('de principes');
      if (p.workType) uit.push('de soort werk');
      if (p.sourceStatus) uit.push('de praktijkstatus');
      if (p.periodYear) uit.push('de periode (jaar/kwartaal)');
      if ((p.measurableResultIds || []).length > 1) uit.push('de koppeling met meer dan één meetbaar resultaat (alleen het eerste blijft)');
      if (p.noMeasurableResultNeeded) uit.push('het vinkje "hoeft niet aan een meetbaar resultaat gekoppeld"');
    } else {
      const a = findAction(dataset, id);
      if (!a) return uit;
      if (a.projectId) uit.push('dat het onder een project hing (het wordt een project van hetzelfde doel)');
      if (a.dueDate) uit.push('de exacte deadline (die wordt een jaar en kwartaal)');
    }
    return uit;
  }

  // Waarom omzetten (nu) niet kan, of null.
  function conversionBlocker(dataset, type, id) {
    if (type === 'project') {
      const p = findProject(dataset, id);
      if (!p) return 'Project niet gevonden.';
      if ((p.actions || []).length) return `Dit project heeft ${p.actions.length} actie${p.actions.length === 1 ? '' : 's'}. Verplaats of verwijder die eerst; een actie kan zelf geen acties hebben.`;
      return null;
    }
    return findAction(dataset, id) ? null : 'Actie niet gevonden.';
  }

  // Overal waar naar oudId wordt verwezen, voortaan naar nieuwId.
  function rewriteReferences(dataset, oudId, nieuwId) {
    allRelations(dataset).forEach((r) => {
      if (r.from === oudId) r.from = nieuwId;
      if (r.to === oudId) r.to = nieuwId;
    });
    dataset.themes.forEach((t) => t.objectives.forEach((o) => (o.notes || []).forEach((n) => {
      if (n.relatedItemId === oudId) n.relatedItemId = nieuwId;
    })));
  }

  // Wat alleen bij een project of alleen bij een actie hoort; die velden
  // worden bewust omgezet of staan in conversionLosses. Alle andere velden
  // (ook onbekende, bijv. uit een ouder of met de hand aangepast bestand)
  // gaan ongewijzigd mee.
  const ALLEEN_PROJECT = ['id', 'name', 'actions', 'measurableResultIds', 'noMeasurableResultNeeded', 'inTeamPlan', 'principleIds', 'workType', 'sourceStatus', 'monitoringText', 'periodYear', 'periodQuarter', 'objectiveId', 'description'];
  const ALLEEN_ACTIE = ['id', 'title', 'dueDate', 'projectId', 'relatedItemId', 'measurableResultId', 'objectiveId', 'description'];

  function meeNemen(van, naar, eigenVelden) {
    Object.keys(van).forEach((k) => {
      if (eigenVelden.includes(k) || k in naar && !['flaggedForDiscussion', 'involved', 'owner', 'status'].includes(k)) return;
      naar[k] = JSON.parse(JSON.stringify(van[k]));
    });
    tidyInvolved(naar);
  }

  // opts.projectId: onder welk project de actie komt (anders een losse actie
  // onder het eigen doel); opts.beforeId: waar in de lijst.
  function convertProjectToAction(dataset, projectId, opts) {
    const o = opts || {};
    if (conversionBlocker(dataset, 'project', projectId)) return null;
    if (o.projectId === projectId) return null;
    const p = findProject(dataset, projectId);
    const doel = findObjective(dataset, p.objectiveId);
    const omschrijving = [p.description, p.monitoringText ? `Toelichting: ${p.monitoringText}` : ''].filter(Boolean).join('\n\n');
    const actie = createAction(dataset, doel.id, null, {
      title: p.name, description: omschrijving, owner: p.owner, status: p.status,
      measurableResultId: (p.measurableResultIds || [])[0] || null,
    });
    meeNemen(p, actie, ALLEEN_PROJECT);
    // Op de plek van het project in de lijst, of waar het neergezet werd.
    doel.actions = placeBefore(doel.actions, actie, o.beforeId);
    doel.projects = doel.projects.filter((x) => x.id !== projectId);
    rewriteReferences(dataset, projectId, actie.id);
    if (o.projectId) moveAction(dataset, actie.id, { projectId: o.projectId, beforeId: o.beforeId });
    return actie;
  }

  function convertActionToProject(dataset, actionId, opts) {
    const o = opts || {};
    const a = findAction(dataset, actionId);
    if (!a) return null;
    const doel = findObjective(dataset, a.objectiveId);
    const datum = a.dueDate ? new Date(`${String(a.dueDate).slice(0, 10)}T12:00:00`) : null;
    const geldig = datum && !Number.isNaN(datum.getTime());
    const project = createProject(dataset, doel.id, {
      name: a.title, description: a.description, owner: a.owner, status: a.status,
      periodYear: geldig ? datum.getFullYear() : null,
      periodQuarter: geldig ? Math.floor(datum.getMonth() / 3) + 1 : null,
      measurableResultIds: a.measurableResultId && doel.measurableResults.some((m) => m.id === a.measurableResultId) ? [a.measurableResultId] : [],
    });
    meeNemen(a, project, ALLEEN_ACTIE);
    if (a.projectId) {
      const ouder = doel.projects.find((x) => x.id === a.projectId);
      if (ouder) ouder.actions = ouder.actions.filter((x) => x.id !== actionId);
    } else {
      doel.actions = (doel.actions || []).filter((x) => x.id !== actionId);
    }
    doel.projects = placeBefore(doel.projects, project, o.beforeId);
    rewriteReferences(dataset, actionId, project.id);
    return project;
  }

  // --- Omzetten: doel ↔ meetbaar resultaat (idee 71) ------------------------
  // Hetzelfde patroon als project ↔ actie: nieuw id, verwijzingen gaan mee,
  // tekst gaat nooit verloren, en wat niet meegaat staat vooraf in woorden.

  const ALLEEN_DOEL = ['id', 'title', 'description', 'status', 'themeId', 'themeIds', 'measurableResults', 'projects', 'actions', 'notes', 'principleIds'];
  const ALLEEN_RESULTAAT = ['id', 'name', 'doneCriterion', 'periodYear', 'periodQuarter', 'status', 'sourceStatus', 'inTeamPlan', 'monitoringText', 'objectiveId'];

  // Na omzetten of verplaatsen: geen relatie van iets naar zichzelf, geen
  // dubbele, en geen "draagt bij aan" van werk naar het doel waar het al
  // onder hangt (dat is de boom zelf al).
  function relatiesOpruimen(dataset) {
    const gezien = new Set();
    dataset.relations = allRelations(dataset).filter((r) => {
      if (r.from === r.to) return false;
      if (r.type === 'contributes') {
        const van = findAny(dataset, r.from);
        if (van && van.entity.objectiveId === r.to) return false;
      }
      const sleutel = r.type === 'related' ? `related|${[r.from, r.to].sort().join('|')}` : `contributes|${r.from}|${r.to}`;
      if (gezien.has(sleutel)) return false;
      gezien.add(sleutel);
      return true;
    });
  }

  const RESULTAAT_STATUS = (s) => (['grey', 'green', 'amber', 'red'].includes(s) ? s : 'grey');

  function levelLosses(dataset, type, id) {
    const uit = [];
    if (type === 'objective') {
      const o = findObjective(dataset, id);
      if (!o) return uit;
      const nu = rollupStatus(objectiveChildStatuses(o));
      uit.push(`de uitgerekende status: het resultaat begint met het oordeel "${statusLabelFor('measurableResult', RESULTAAT_STATUS(nu), dataset)}"; pas het zo nodig aan`);
      if ((o.themeIds || []).length > 1) uit.push('dat het doel ook bij andere thema\'s hoort');
      if ((o.principleIds || []).length) uit.push('de principes');
    } else {
      const m = findMeasurableResult(dataset, id);
      if (!m) return uit;
      if (m.inTeamPlan) uit.push('het vinkje "In teamplan"');
      if (m.periodYear) uit.push('het streefkwartaal (staat daarna in de omschrijving)');
      if (m.sourceStatus) uit.push('de praktijkstatus');
    }
    return uit;
  }

  function levelBlocker(dataset, type, id, opts) {
    const o = opts || {};
    if (type === 'objective') {
      const doel = findObjective(dataset, id);
      if (!doel) return 'Doel niet gevonden.';
      if (o.objectiveId === id) return 'Kies een ander doel om het resultaat onder te zetten.';
      if (o.objectiveId && !findObjective(dataset, o.objectiveId)) return 'Kies het doel waar het resultaat onder komt.';
      return null;
    }
    return findMeasurableResult(dataset, id) ? null : 'Meetbaar resultaat niet gevonden.';
  }

  // opts.objectiveId: onder welk doel het resultaat komt (verplicht). Heeft
  // het doel eigen meetbare resultaten, dan verhuizen die eerst mee naar dat
  // doel (met het werk dat alleen eraan hangt); een resultaat kan zelf geen
  // resultaten hebben.
  function convertObjectiveToMeasurableResult(dataset, objectiveId, opts) {
    const o = opts || {};
    if (!o.objectiveId || levelBlocker(dataset, 'objective', objectiveId, o)) return null;
    const doel = findObjective(dataset, objectiveId);
    const thema = findObjectiveOwnerTheme(dataset, objectiveId);
    const naar = findObjective(dataset, o.objectiveId);
    const statusVooraf = RESULTAAT_STATUS(rollupStatus(objectiveChildStatuses(doel)));
    doel.measurableResults.slice().forEach((m) => moveMeasurableResult(dataset, m.id, { objectiveId: naar.id }));
    const mr = createMeasurableResult(dataset, naar.id, {
      name: doel.title, owner: doel.owner,
      status: statusVooraf,
      monitoringText: doel.description || '',
    });
    meeNemen(doel, mr, ALLEEN_DOEL);
    naar.measurableResults = placeBefore(naar.measurableResults, mr, o.beforeId);
    // Het werk gaat mee en hangt voortaan aan het nieuwe resultaat.
    doel.projects.slice().forEach((p) => moveProject(dataset, p.id, { objectiveId: naar.id, toMrId: mr.id }));
    (doel.actions || []).slice().forEach((a) => moveAction(dataset, a.id, { projectId: null, objectiveId: naar.id, toMrId: mr.id }));
    // Notities over het doel zelf worden notities over het resultaat.
    (doel.notes || []).forEach((n) => { if (!n.relatedItemId || n.relatedItemId === doel.id) n.relatedItemId = mr.id; });
    naar.notes = (naar.notes || []).concat(doel.notes || []);
    doel.notes = [];
    thema.objectives = thema.objectives.filter((x) => x.id !== objectiveId);
    rewriteReferences(dataset, objectiveId, mr.id);
    relatiesOpruimen(dataset);
    return mr;
  }

  // opts.themeId: in welk thema het doel komt (standaard dat van het oude
  // doel); opts.beforeId: waar in de kolom.
  function convertMeasurableResultToObjective(dataset, mrId, opts) {
    const o = opts || {};
    const mr = findMeasurableResult(dataset, mrId);
    if (!mr) return null;
    const van = findObjective(dataset, mr.objectiveId);
    const themaId = o.themeId && findTheme(dataset, o.themeId) ? o.themeId : findObjectiveOwnerTheme(dataset, van.id).id;
    const omschrijving = [
      mr.monitoringText,
      mr.doneCriterion ? `Klaar als: ${mr.doneCriterion}` : '',
      mr.periodYear ? `Streefkwartaal: ${formatPeriod(mr.periodYear, mr.periodQuarter)}` : '',
    ].filter(Boolean).join('\n\n');
    const doel = createObjective(dataset, themaId, {
      title: mr.name, owner: mr.owner, description: omschrijving, themeIds: [themaId],
      status: mr.status === 'done' ? 'green' : mr.status,
    });
    meeNemen(mr, doel, ALLEEN_RESULTAAT);
    const thema = findTheme(dataset, themaId);
    thema.objectives = placeBefore(thema.objectives, doel, o.beforeId);
    // Notities over het resultaat worden notities over het nieuwe doel.
    const mee = (van.notes || []).filter((n) => n.relatedItemId === mrId);
    van.notes = (van.notes || []).filter((n) => n.relatedItemId !== mrId);
    mee.forEach((n) => { n.relatedItemId = doel.id; });
    doel.notes = doel.notes.concat(mee);
    werkMeeNaar(dataset, van, mrId, doel, null, doel.id);
    van.measurableResults = van.measurableResults.filter((m) => m.id !== mrId);
    rewriteReferences(dataset, mrId, doel.id);
    relatiesOpruimen(dataset);
    return doel;
  }

  // Een project of actie laten bijdragen aan een meetbaar resultaat. Binnen
  // het eigen doel is dat de gewone koppeling; met een resultaat elders een
  // "draagt bij aan"-relatie. Geeft 'link', 'relation', 'exists' of null.
  function connectToMeasurableResult(dataset, fromId, mrId) {
    const mr = findMeasurableResult(dataset, mrId);
    const found = findAny(dataset, fromId);
    if (!mr || !found || !['project', 'action'].includes(found.type)) return null;
    const item = found.entity;
    if (item.objectiveId === mr.objectiveId) {
      if (found.type === 'project') {
        const ids = item.measurableResultIds || [];
        if (ids.includes(mrId)) return 'exists';
        item.measurableResultIds = [...ids, mrId];
        item.noMeasurableResultNeeded = false;
      } else {
        if (item.measurableResultId === mrId) return 'exists';
        item.measurableResultId = mrId;
      }
      return 'link';
    }
    if (outgoingContributions(dataset, fromId).some((r) => r.to === mrId)) return 'exists';
    return createRelation(dataset, { from: fromId, to: mrId, type: 'contributes' }) ? 'relation' : null;
  }

  function deleteAction(dataset, actionId) {
    for (const t of dataset.themes) {
      for (const o of t.objectives) {
        for (const p of o.projects) {
          const before = p.actions.length;
          p.actions = p.actions.filter((a) => a.id !== actionId);
          if (p.actions.length !== before) {
            pruneRelationsForIds(dataset, [actionId]);
            return true;
          }
        }
        if (o.actions) {
          const before = o.actions.length;
          o.actions = o.actions.filter((a) => a.id !== actionId);
          if (o.actions.length !== before) {
            pruneRelationsForIds(dataset, [actionId]);
            return true;
          }
        }
      }
    }
    return false;
  }

  function createNote(dataset, objectiveId, fields) {
    const objective = findObjective(dataset, objectiveId);
    if (!objective) return null;
    const note = {
      id: uid('note'),
      text: fields.text || '',
      type: fields.type || 'update',
      author: fields.author || '',
      createdAt: fields.createdAt || new Date().toISOString().slice(0, 10),
      updatedAt: null,
      relatedItemId: fields.relatedItemId || objectiveId,
    };
    objective.notes.push(note);
    return note;
  }

  function updateNote(dataset, noteId, fields) {
    const note = findNote(dataset, noteId);
    if (!note) return null;
    Object.assign(note, fields);
    note.updatedAt = new Date().toISOString().slice(0, 10);
    return note;
  }

  function deleteNote(dataset, noteId) {
    for (const t of dataset.themes) {
      for (const o of t.objectives) {
        const before = o.notes.length;
        o.notes = o.notes.filter((n) => n.id !== noteId);
        if (o.notes.length !== before) return true;
      }
    }
    return false;
  }

  // ---------------------------------------------------------------------
  // Relations: verbanden tussen items die de boom zelf niet kan uitdrukken —
  // bijvoorbeeld een project dat bijdraagt aan een meetbaar resultaat in een
  // ánder doel of thema. Zie docs/relatiemodel-voorstel.md. Eigenaarschap en
  // de statusoptelling blijven bewust via de boom lopen ("Wat bewust níet
  // verandert" in het voorstel) — relaties zijn puur een extra laag
  // verbanden ernaast, geen tweede plek waar iets thuishoort.
  // ---------------------------------------------------------------------

  function allRelations(dataset) {
    return Array.isArray(dataset.relations) ? dataset.relations : [];
  }

  // Verwijdert elke relatie die naar een van deze id's verwijst. Gebruikt
  // door de delete*-functies hieronder zodat een verwijderd item geen dode
  // relatie achterlaat — stil, zoals de rest van die functies: opruimen van
  // iets dat toch al weg is, is geen gebeurtenis om te melden.
  function pruneRelationsForIds(dataset, ids) {
    if (!Array.isArray(dataset.relations) || !ids || !ids.length) return;
    const idSet = new Set(ids);
    dataset.relations = dataset.relations.filter((r) => !idSet.has(r.from) && !idSet.has(r.to));
  }

  // Alle id's die met dit doel verdwijnen: het doel zelf plus alles wat er
  // fysiek onder hangt. Gedeeld door deleteObjective en de orphan-tak van
  // deleteTheme, die elk een compleet (sub)doel uit de dataset verwijderen.
  function collectObjectiveDescendantIds(objective) {
    const ids = [objective.id];
    objective.measurableResults.forEach((m) => ids.push(m.id));
    objective.projects.forEach((p) => {
      ids.push(p.id);
      (p.actions || []).forEach((a) => ids.push(a.id));
    });
    (objective.actions || []).forEach((a) => ids.push(a.id));
    return ids;
  }

  // `from`/`to` zijn id's van bestaande, relateerbare items; `type` is
  // 'contributes' (gericht) of 'related' (ongericht, standaard). Weigert
  // stil (geeft null terug) bij een lus naar zichzelf, een onbekend item, een
  // niet-relateerbaar type (thema, notitie), of een relatie die er al
  // precies zo staat — voor 'related' telt A→B hetzelfde als B→A.
  function createRelation(dataset, fields) {
    const from = fields && fields.from;
    const to = fields && fields.to;
    const type = fields && fields.type === 'related' ? 'related' : 'contributes';
    if (!from || !to || from === to) return null;

    const fromFound = findAny(dataset, from);
    const toFound = findAny(dataset, to);
    if (!fromFound || !toFound) return null;
    if (!RELATABLE_TYPES.includes(fromFound.type) || !RELATABLE_TYPES.includes(toFound.type)) return null;

    if (!Array.isArray(dataset.relations)) dataset.relations = [];
    const dubbel = dataset.relations.some((r) => r.type === type && (
      (r.from === from && r.to === to) || (type === 'related' && r.from === to && r.to === from)
    ));
    if (dubbel) return null;

    const relation = { id: uid('rel'), from, to, type, note: (fields.note || '').trim() || null };
    dataset.relations.push(relation);
    return relation;
  }

  function updateRelation(dataset, relationId, fields) {
    const relation = allRelations(dataset).find((r) => r.id === relationId);
    if (!relation) return null;
    if (typeof fields.note === 'string') relation.note = fields.note.trim() || null;
    return relation;
  }

  function deleteRelation(dataset, relationId) {
    const before = allRelations(dataset).length;
    dataset.relations = allRelations(dataset).filter((r) => r.id !== relationId);
    return dataset.relations.length !== before;
  }

  // Relaties waarin `itemId` de bron is van een "draagt bij aan" — wat dit
  // item zélf realiseert.
  function outgoingContributions(dataset, itemId) {
    return allRelations(dataset).filter((r) => r.type === 'contributes' && r.from === itemId);
  }

  // Relaties waarin `itemId` het doelwit is van een "draagt bij aan" — wat er
  // aan dít item bijdraagt.
  function incomingContributions(dataset, itemId) {
    return allRelations(dataset).filter((r) => r.type === 'contributes' && r.to === itemId);
  }

  // Ongerichte "hangt samen met"-relaties waar `itemId` bij betrokken is.
  function relatedRelations(dataset, itemId) {
    return allRelations(dataset).filter((r) => r.type === 'related' && (r.from === itemId || r.to === itemId));
  }

  // Het andere eind van een relatie t.o.v. `itemId` — nodig omdat een
  // `related`-relatie geen vaste "van"/"naar"-betekenis heeft voor de kant
  // die ernaar kijkt.
  function otherRelationEndId(relation, itemId) {
    return relation.from === itemId ? relation.to : relation.from;
  }

  // Korte, op zichzelf staande beschrijving van een relateerbaar item — naam,
  // type, en het doel/thema waar het onder hangt — voor het tonen van een
  // relatie op een detailscherm zonder dat de aanroeper zelf de boom in hoeft.
  function describeItem(dataset, id) {
    const found = findAny(dataset, id);
    if (!found || !RELATABLE_TYPES.includes(found.type)) return null;
    const { type, entity } = found;
    const objective = type === 'objective' ? entity : findObjective(dataset, entity.objectiveId);
    const theme = objective ? findObjectiveOwnerTheme(dataset, objective.id) : null;
    return { type, id, entity, label: entity.title || entity.name || '(zonder naam)', objective, theme };
  }

  // ---------------------------------------------------------------------
  // Status roll-up
  //
  // A theme or objective's status is not independently set by a user; it is
  // always derived from the items underneath it, so the board can never show
  // a stale "on track" while a child project is actually off track. Leaf
  // items (measurable results, projects, actions) carry the real, editable
  // assessment.
  // ---------------------------------------------------------------------

  // "Blauw" (bezig) en "klaar" (bij meetbare resultaten) tellen mee als
  // "geen probleem", net als groen — een doel met een project dat nog gewoon
  // bezig is, hoeft daarmee niet naar grijs te zakken. Het resultaat blijft
  // altijd één van de 4 kernwaarden: thema/doel kennen zelf geen blauw/klaar.
  //
  // Niet-beoordeelde (grijze) items doen niet mee in de kleur. Ze zijn een
  // eigen signaal — zie objectiveCoverage/themeCoverage hieronder, die de app
  // naast de statusbol toont als "3 van 5 beoordeeld". Voorheen maakte één
  // grijs kind het hele doel grijs, waardoor onvolledigheid zich vermomde als
  // een oordeel en het bord grotendeels kleurloos bleef. Is er niets
  // beoordeeld, dan blijft het geheel wél grijs. Zie besluit 2 in
  // docs/plan-naar-v1.md.
  //
  // "Bezig" (blauw) zegt dat er gewerkt wordt, niet of dat op koers is. Het
  // telt daarom niet als groen: een doel waaronder alleen werk loopt en nog
  // niets is beoordeeld, staat zelf op Bezig. Zodra er wel een oordeel is
  // (groen, amber, rood of klaar), bepaalt dat oordeel de kleur.
  function rollupStatus(statuses) {
    const present = statuses.filter(Boolean).filter((s) => s !== 'grey');
    const assessed = present.filter((s) => s !== 'blue');
    if (!assessed.length) return present.length ? 'blue' : 'grey';
    if (assessed.includes('red')) return 'red';
    if (assessed.includes('amber')) return 'amber';
    return 'green';
  }

  // De statussen van alles wat direct onder een doel hangt: meetbare
  // resultaten, projecten en losse acties. (Acties ónder een project tellen
  // niet mee — zie de test die dat vastlegt.)
  function objectiveChildStatuses(objective) {
    return [
      ...objective.measurableResults.map((m) => m.status),
      ...objective.projects.map((p) => p.status),
      ...(objective.actions || []).map((a) => a.status),
    ];
  }

  function coverageOf(statuses) {
    const present = statuses.filter(Boolean);
    return { assessed: present.filter((s) => s !== 'grey').length, total: present.length };
  }

  // "Hoeveel weten we hier eigenlijk van": op elk niveau geteld over de directe
  // kinderen, zodat de vraag hetzelfde blijft als je inzoomt — bij een thema
  // hoeveel doelen een oordeel hebben, bij een doel hoeveel onderliggende items.
  function objectiveCoverage(objective) {
    return coverageOf(objectiveChildStatuses(objective));
  }

  function themeCoverage(theme) {
    return coverageOf(theme.objectives.map((o) => o.status));
  }

  function recomputeRollups(dataset) {
    dataset.themes.forEach((theme) => {
      theme.objectives.forEach((objective) => {
        objective.status = rollupStatus(objectiveChildStatuses(objective));
      });
      theme.status = rollupStatus(theme.objectives.map((o) => o.status));
    });
    return dataset;
  }

  // ---------------------------------------------------------------------
  // Export / import
  // ---------------------------------------------------------------------

  function exportDataset(dataset) {
    const clone = deepClone(dataset);
    clone.meta = clone.meta || {};
    clone.meta.lastExported = new Date().toISOString();
    return JSON.stringify(clone, null, 2);
  }

  function downloadDataset(dataset, filename) {
    const json = exportDataset(dataset);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || `obeya-export-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function parseImport(text) {
    let json;
    try {
      json = JSON.parse(text);
    } catch (err) {
      return { ok: false, errors: ['Bestand is geen geldige JSON: ' + err.message] };
    }
    const errors = validateDataset(json);
    if (errors.length) return { ok: false, errors };
    // Pas normaliseren nadat de harde controles zijn gehaald: de aanroeper
    // krijgt daarmee altijd een dataset waarvan de vorm klopt, zodat de rest
    // van de app er niet op stuk kan lopen.
    const { dataset, warnings } = normalizeDataset(json);
    return { ok: true, dataset, warnings };
  }

  return {
    STATUS_VALUES,
    STATUS_META,
    STATUS_LABEL_ENTITY_TYPES,
    statusValuesFor,
    statusLabelFor,
    THEME_COLOR_PALETTE,
    nextThemeColor,
    themeColor,
    THEME_COLOR_NAMES,
    NOTE_TYPES,
    uid,
    deepClone,
    loadInitialDataset,
    validateDataset,
    normalizeDataset,
    findTheme,
    findObjective,
    findObjectiveOwnerTheme,
    findMeasurableResult,
    findProject,
    findAction,
    findNote,
    findAny,
    allObjectives,
    allMeasurableResults,
    allProjects,
    allActions,
    allNotes,
    allOwners,
    toggleFlag,
    allFlaggedItems,
    projectNeedsMapping,
    removeItemsOf,
    moveTheme,
    teamPlan,
    moveObjective,
    moveMeasurableResult,
    moveProject,
    moveAction,
    connectToMeasurableResult,
    getDisplaySettings,
    BOARD_LIMITS,
    REVIEW_REASONS,
    isUnclearOwner,
    reviewReasons,
    reviewQueue,
    getBoardSettings,
    setBoardSettings,
    setDisplaySettings,
    resetDisplaySettings,
    DEFAULT_ROLES,
    getRoles,
    addRole,
    updateRole,
    removeRole,
    getPerson,
    rolesOf,
    setPerson,
    roleGroups,
    getRoleGroups,
    addRoleGroup,
    updateRoleGroup,
    removeRoleGroup,
    personForLogin,
    canConfirm,
    confirmingRoles,
    mayConfirm,
    confirmersFromLogins,
    ownersByRole,
    DISPLAY_DEFAULTS,
    DETAIL_LEVELS,
    CHAIN_LAYOUTS,
    relatedMeasurableResults,
    measurableResultsElsewhere,
    conversionLosses,
    conversionBlocker,
    convertProjectToAction,
    convertActionToProject,
    levelLosses,
    levelBlocker,
    convertObjectiveToMeasurableResult,
    convertMeasurableResultToObjective,
    setContributionsElsewhere,
    projectsNeedingMapping,
    chainGaps,
    contributingItems,
    themeOwnerCounts,
    yearFromDate,
    quarterFromDate,
    formatPeriod,
    periodMatches,
    getAvailableYears,
    ensureConfig,
    getStatusLabelConfig,
    setStatusLabel,
    getOwnerOptions,
    addOwner,
    renameOwner,
    removeOwner,
    countOwnerUsage,
    countInvolvement,
    WORK_TYPES,
    workTypeCounts,
    isLate,
    deliverableSummary,
    valueText,
    korteDatum,
    PRINCIPLE_LIMITS,
    FAVICONS,
    FAVICON_MAX,
    getFavicon,
    setFavicon,
    NO_PRINCIPLE,
    getPrinciples,
    addPrinciple,
    updatePrinciple,
    removePrinciple,
    countPrincipleUse,
    objectivePrinciples,
    projectPrinciples,
    principleCoverage,
    tidyInvolved,
    createTheme,
    updateTheme,
    deleteTheme,
    createObjective,
    updateObjective,
    deleteObjective,
    createMeasurableResult,
    updateMeasurableResult,
    splitResultNames,
    duplicateItem,
    bulkEdit,
    bulkDelete,
    addActionsToResult,
    addMeasurableResults,
    deleteMeasurableResult,
    createProject,
    updateProject,
    deleteProject,
    createAction,
    updateAction,
    deleteAction,
    createNote,
    updateNote,
    deleteNote,
    RELATION_TYPES,
    RELATABLE_TYPES,
    allRelations,
    createRelation,
    updateRelation,
    deleteRelation,
    outgoingContributions,
    incomingContributions,
    relatedRelations,
    otherRelationEndId,
    describeItem,
    rollupStatus,
    objectiveCoverage,
    themeCoverage,
    recomputeRollups,
    exportDataset,
    downloadDataset,
    parseImport,
  };
})();
