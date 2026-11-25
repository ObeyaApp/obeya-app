// js/history.js
// Het wijzigingslog (idee 70 en 72, docs/wijzigingslog-plan.md). Elke
// wijziging op het bord wordt één regel: wie, wanneer, wat (de omschrijving
// van ongedaan maken) en per item wat er veranderde, van voor naar na.
// Structuurwijzigingen (nieuw, verwijderd, naar een andere plek, omzetten)
// krijgen "Te bevestigen". Puur: geen DOM, geen opslag; vergelijkt twee
// versies van het bord met dezelfde platslag als het samenvoegen
// (ObeyaMerge.flatten), zodat het log en het samenvoegen hetzelfde zien.

const ObeyaHistory = (function () {
  'use strict';

  const M = ObeyaMerge;

  // Soorten items waarvan nieuw, verwijderd of verplaatst de opbouw van het
  // bord verandert. Notities, relaties en instellingen zijn inhoud.
  const STRUCTUUR = ['theme', 'objective', 'measurableResult', 'project', 'action'];

  // Wat het log nooit vastlegt: het log zelf, en wat de app uitrekent of
  // bijhoudt (statusoptelling, peildatum, app-versie).
  const OVERSLAAN = ['change', 'root'];

  // Velden die het log per soort overslaat: uitgerekend, of tijdstempels.
  function stripFields(item) {
    const f = { ...item.fields };
    (M.DERIVED[item.kind] || []).forEach((k) => delete f[k]);
    if (item.kind === 'meta') [...M.META_TIMESTAMPS, 'version'].forEach((k) => delete f[k]);
    return f;
  }

  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const isObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

  function nameOf(item) {
    const f = item.fields || {};
    if (item.kind === 'meta') return 'Bord';
    if (item.kind === 'config') return 'Instellingen';
    if (item.kind === 'relation') return `${f.from} → ${f.to}`;
    return String(f.name || f.title || f.text || '').slice(0, 120);
  }

  function indexIn(order, place, key) {
    return (order.get(place) || []).indexOf(key);
  }

  // Wat er per item verschilt tussen `before` en `after` (hele borden).
  function diff(before, after) {
    const A = M.flatten(before);
    const Z = M.flatten(after);
    const items = [];
    new Set([...A.items.keys(), ...Z.items.keys()]).forEach((key) => {
      const a = A.items.get(key);
      const z = Z.items.get(key);
      const kind = (a || z).kind;
      if (OVERSLAAN.includes(kind)) return;
      const id = (z || a).fields.id || key;
      if (!a) {
        items.push({ key, kind, id, name: nameOf(z), change: 'added', place: z.place, index: indexIn(Z.order, z.place, key) });
        return;
      }
      if (!z) {
        // Alle velden van vóór, met plek en volgorde: genoeg om terug te zetten.
        items.push({ key, kind, id, name: nameOf(a), change: 'deleted', place: a.place, index: indexIn(A.order, a.place, key), before: clone(a.fields) });
        return;
      }
      const fa = stripFields(a);
      const fz = stripFields(z);
      const fields = {};
      new Set([...Object.keys(fa), ...Object.keys(fz)]).forEach((k) => {
        if (same(fa[k], fz[k])) return;
        // In de instellingen is een veld vaak een hele lijst per naam (de
        // rollen van iedereen, alle statuslabels): dan alleen wat daarbinnen
        // veranderde, als 'people.Eva'. Anders groeit elke regel mee met het team.
        if (kind === 'config' && isObject(fa[k]) && isObject(fz[k])) {
          new Set([...Object.keys(fa[k]), ...Object.keys(fz[k])]).forEach((sub) => {
            if (!same(fa[k][sub], fz[k][sub])) fields[`${k}.${sub}`] = [clone(fa[k][sub]), clone(fz[k][sub])];
          });
          return;
        }
        fields[k] = [clone(fa[k]), clone(fz[k])];
      });
      const moved = a.place !== z.place;
      if (!moved && !Object.keys(fields).length) return;
      const regel = { key, kind, id, name: nameOf(z), change: moved ? 'moved' : 'updated', fields };
      if (moved) Object.assign(regel, { placeBefore: a.place, placeAfter: z.place, index: indexIn(A.order, a.place, key) });
      items.push(regel);
    });
    // Alleen de volgorde binnen een lijst veranderd (bijv. een doel een plek
    // omhoog): één regel per lijst, met de volgorde van vóór.
    Z.order.forEach((naKeys, place) => {
      const voorKeys = A.order.get(place) || [];
      const gedeeld = (k) => voorKeys.includes(k) && naKeys.includes(k) && !items.some((i) => i.key === k);
      const v = voorKeys.filter(gedeeld);
      const n = naKeys.filter(gedeeld);
      if (v.length > 1 && !same(v, n)) {
        const eerste = Z.items.get(n[0]);
        if (eerste && !OVERSLAAN.includes(eerste.kind)) items.push({ key: `order:${place}`, kind: eerste.kind, change: 'reordered', place, orderBefore: voorKeys.slice() });
      }
    });
    return items;
  }

  function isStructural(items) {
    return items.some((i) => STRUCTUUR.includes(i.kind) && ['added', 'deleted', 'moved'].includes(i.change));
  }

  function uid() {
    return `chg-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  }

  // Eén regel voor de stap van `before` naar `after`, of null als er op het
  // bord niets veranderde. opts: { label, by, at, needsConfirmation }.
  function makeEntry(before, after, opts) {
    const o = opts || {};
    const items = diff(before, after);
    if (!items.length) return null;
    const structural = isStructural(items);
    const bevestigen = o.needsConfirmation === undefined ? structural : o.needsConfirmation;
    return {
      id: o.id || uid(),
      at: o.at || new Date().toISOString(),
      by: o.by || null,
      label: o.label || null,
      structural,
      items,
      review: bevestigen ? { status: 'pending' } : null,
    };
  }

  // Wat standaard in beeld komt (advies Obeya-coach): nieuw of verwijderd,
  // een andere plek, omzetten, en een andere status of eigenaar. Typefouten
  // en verschuivingen alleen met "alle wijzigingen".
  function isMeaningful(entry) {
    return (entry.items || []).some((i) => ['added', 'deleted', 'moved'].includes(i.change)
      || (i.fields && ('status' in i.fields || 'owner' in i.fields)));
  }

  // De regels over één item, oudste eerst.
  function forItem(log, itemId) {
    return (log || []).filter((e) => (e.items || []).some((i) => i.id === itemId));
  }

  function pending(log) {
    return (log || []).filter((e) => e.review && e.review.status === 'pending');
  }

  // Welke items (nog) op het bord staan als deel van een wijziging die op
  // bevestiging wacht: nieuw of naar een andere plek. Die krijgen het label
  // "Te bevestigen" (stap 3 van docs/wijzigingslog-plan.md).
  function itemIdsOf(entries) {
    const ids = new Set();
    entries.forEach((e) => (e.items || []).forEach((i) => {
      if (STRUCTUUR.includes(i.kind) && ['added', 'moved'].includes(i.change)) ids.add(i.id);
    }));
    return ids;
  }

  function pendingItemIds(log) {
    return itemIdsOf(pending(log));
  }

  // Afgewezen en nog niet teruggedraaid: die items krijgen "Afgewezen".
  function rejectedItemIds(log) {
    return itemIdsOf(toRevert(log));
  }

  // Bevestigen of afwijzen: wie (persoon, rollen van dat moment, login),
  // wanneer en, bij afwijzen, waarom.
  function reviewed(status, by, opts) {
    const o = opts || {};
    const review = { status, by: by || null, at: o.at || new Date().toISOString() };
    if (status === 'rejected') review.reason = String(o.reason || '').trim();
    return review;
  }

  // Afgewezen en nog niet teruggedraaid of bewust laten staan: voor deze
  // regels stelt de app terugdraaien voor (stap 4).
  function toRevert(log) {
    return (log || []).filter((e) => e.review && e.review.status === 'rejected' && !e.review.reverted && !e.review.kept);
  }

  // --- terugdraaien (stap 4 van docs/wijzigingslog-plan.md) ----------------
  // Alleen de items uit deze ene regel, met hun plek en volgorde van vóór.
  // Is een van die items sindsdien verder veranderd (een latere regel in het
  // log, of een waarde die niet meer is wat de regel achterliet), dan draait
  // de app niets terug en zegt wat er veranderde. Geeft { ok, dataset } of
  // { ok: false, reasons: [tekst] }.

  // In de instellingen kan een veld 'people.Eva' heten (zie diff).
  function getVeld(fields, kind, f) {
    if (kind === 'config' && !(f in fields) && f.includes('.')) {
      const [hoofd, sub] = [f.slice(0, f.indexOf('.')), f.slice(f.indexOf('.') + 1)];
      return isObject(fields[hoofd]) ? fields[hoofd][sub] : undefined;
    }
    return fields[f];
  }

  function setVeld(fields, kind, f, waarde) {
    let doel = fields;
    let sleutel = f;
    if (kind === 'config' && !(f in fields) && f.includes('.')) {
      const hoofd = f.slice(0, f.indexOf('.'));
      if (!isObject(fields[hoofd])) fields[hoofd] = {};
      doel = fields[hoofd];
      sleutel = f.slice(f.indexOf('.') + 1);
    }
    if (waarde === undefined) delete doel[sleutel];
    else doel[sleutel] = clone(waarde);
  }

  function wieWanneer(e) {
    const wie = e.by && (e.by.person || (e.by.login ? `@${e.by.login}` : '')) || 'iemand';
    return `"${e.label || 'wijziging'}" (${wie}, ${String(e.at || '').slice(0, 10)})`;
  }

  // Kan deze regel terug? Alleen een regel in het formaat van deze app.
  function goedFormaat(i) {
    if (!i || typeof i.key !== 'string' || typeof i.kind !== 'string') return false;
    if (i.change === 'added') return true;
    if (i.change === 'deleted') return isObject(i.before) && typeof i.place === 'string';
    if (i.change === 'moved') return typeof i.placeBefore === 'string' && typeof i.placeAfter === 'string';
    if (i.change === 'updated') return isObject(i.fields);
    if (i.change === 'reordered') return Array.isArray(i.orderBefore) && typeof i.place === 'string';
    return false;
  }

  function revert(current, entry, log) {
    if (!(entry.items || []).every(goedFormaat)) {
      return { ok: false, reasons: ['Deze wijziging is in een ander formaat vastgelegd (bijvoorbeeld door een oudere versie van de app) en kan niet automatisch terug.'] };
    }
    const F = M.flatten(current);
    const redenen = [];
    const ids = new Set((entry.items || []).map((i) => i.id).filter(Boolean));
    const keys = new Set((entry.items || []).map((i) => i.key));

    // 1. Latere regels over dezelfde items (behalve wat zelf ongedaan is).
    const index = (log || []).findIndex((e) => e.id === entry.id);
    (log || []).slice(index + 1).forEach((e) => {
      if (e.review && e.review.status === 'undone') return;
      if ((e.items || []).some((i) => ids.has(i.id))) redenen.push(`Sindsdien veranderd: ${wieWanneer(e)}.`);
    });

    // 2. Klopt de stand nog met wat de regel achterliet?
    const zelfde = (a, b) => same(a === undefined ? null : a, b === undefined ? null : b);
    (entry.items || []).forEach((i) => {
      const nu = F.items.get(i.key);
      const naam = i.name ? `"${i.name}"` : 'een item';
      if (i.change === 'added') {
        if (!nu) return; // al weg: niets te doen
        F.items.forEach((onder) => {
          if (onder.place.startsWith(`${i.key}/`) && !keys.has(onder.key)) redenen.push(`Onder ${naam} staat intussen ${nameOf(onder) ? `"${nameOf(onder)}"` : 'iets anders'}.`);
        });
        // Verwijst iets buiten deze regel ernaar (een relatie, een koppeling,
        // een notitie), dan zou weghalen die verwijzing laten hangen.
        F.items.forEach((ander) => {
          if (keys.has(ander.key) || ['change', 'root', 'meta'].includes(ander.kind)) return;
          if (JSON.stringify(ander.fields).includes(`"${i.id}"`)) redenen.push(`${nameOf(ander) ? `"${nameOf(ander)}"` : 'Iets anders'} verwijst intussen naar ${naam}.`);
        });
      } else if (i.change === 'deleted') {
        if (nu) redenen.push(`${naam} staat er al weer.`);
      } else if (i.change === 'moved' || i.change === 'updated') {
        if (!nu) { redenen.push(`${naam} is intussen verwijderd.`); return; }
        if (i.change === 'moved' && nu.place !== i.placeAfter) redenen.push(`${naam} staat intussen op een andere plek.`);
        Object.keys(i.fields || {}).forEach((f) => {
          if (!zelfde(getVeld(nu.fields, i.kind, f), i.fields[f][1])) redenen.push(`${naam} is intussen anders (${f}).`);
        });
      }
    });
    if (redenen.length) return { ok: false, reasons: [...new Set(redenen)] };

    // 3. Terugzetten.
    const uitLijst = (key) => F.order.forEach((lijst) => { const p = lijst.indexOf(key); if (p !== -1) lijst.splice(p, 1); });
    const inLijst = (place, key, pos) => {
      if (!F.order.has(place)) F.order.set(place, []);
      const lijst = F.order.get(place);
      lijst.splice(Math.max(0, Math.min(pos == null || pos < 0 ? lijst.length : pos, lijst.length)), 0, key);
    };
    const items = entry.items || [];
    items.filter((i) => i.change === 'added').forEach((i) => { F.items.delete(i.key); uitLijst(i.key); });
    // Eerst wat op zijn plek terugkomt, laagste plek eerst, zodat de volgorde klopt.
    const terug = items.filter((i) => i.change === 'deleted' || i.change === 'moved').sort((a, b) => (a.index || 0) - (b.index || 0));
    terug.forEach((i) => {
      if (i.change === 'deleted') {
        F.items.set(i.key, { key: i.key, kind: i.kind, place: i.place, fields: clone(i.before) });
        inLijst(i.place, i.key, i.index);
      } else {
        const nu = F.items.get(i.key);
        uitLijst(i.key);
        nu.place = i.placeBefore;
        inLijst(i.placeBefore, i.key, i.index);
      }
    });
    items.filter((i) => i.change === 'moved' || i.change === 'updated').forEach((i) => {
      const nu = F.items.get(i.key);
      Object.keys(i.fields || {}).forEach((f) => setVeld(nu.fields, i.kind, f, i.fields[f][0]));
    });
    items.filter((i) => i.change === 'reordered').forEach((i) => {
      const nu = F.order.get(i.place) || [];
      const voor = (i.orderBefore || []).filter((k) => nu.includes(k));
      F.order.set(i.place, voor.concat(nu.filter((k) => !voor.includes(k))));
    });
    // Wat terugkomt moet een ouder hebben, anders zou het stil wegvallen.
    for (const i of items.filter((x) => x.change === 'deleted')) {
      const ouder = i.place.includes('/') ? i.place.slice(0, i.place.lastIndexOf('/')) : null;
      if (ouder && !F.items.has(ouder)) return { ok: false, reasons: [`${i.name ? `"${i.name}"` : 'Een item'} kan niet terug: waar het onder hing, bestaat niet meer.`] };
    }
    return { ok: true, dataset: M.rebuild(F.items, F.order, F.order) };
  }

  return { diff, makeEntry, isStructural, isMeaningful, forItem, pending, pendingItemIds, rejectedItemIds, reviewed, toRevert, revert, STRUCTUUR };
})();
