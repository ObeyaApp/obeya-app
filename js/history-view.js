// js/history-view.js
// Het wijzigingslog op het scherm (stap 3 van docs/wijzigingslog-plan.md):
// het blok "Te bevestigen" bovenaan de Agenda, en dezelfde regel met knoppen
// in het detailscherm van een item. Het label op de kaarten zelf staat in
// js/ui-helpers.js (pendingBadge). Ontwerp UX-designer: de knoppen zijn voor
// iedereen zichtbaar; wie niet mag bevestigen, ziet ze uitgeschakeld met één
// zin wie het wel mag.

const ObeyaHistoryView = (function () {
  'use strict';

  const H = ObeyaUI;

  const WOORD = { added: 'nieuw', moved: 'verplaatst', deleted: 'verwijderd', updated: 'aangepast' };
  const MAX_ITEMS = 5;

  // Wie het deed; leeg als dat niet bekend is (dan staat er niets, in plaats
  // van bij elke regel "onbekend").
  function wie(by) {
    if (by && by.person) return by.person;
    return by && by.login ? `@${by.login}` : '';
  }

  // " · Ana" of niets.
  const doorWie = (by) => (wie(by) ? ` · ${H.escapeHtml(wie(by))}` : '');

  function wanneer(iso) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  }

  // Wie er mag beslissen, en waarom jij misschien niet: één zin.
  // alleenAfgewezen: er staat niets meer te bevestigen, alleen terug te draaien.
  function permission(dataset, me, alleenAfgewezen) {
    const rollen = ObeyaData.confirmingRoles(dataset).map((r) => r.name);
    const door = rollen.length ? `${alleenAfgewezen ? 'Terugdraaien' : 'Bevestigen'} door de ${rollen.join(' of de ')}.` : 'Geen enkele rol mag bevestigen; stel dat in bij Instellingen → Rollen.';
    if (!me) return { may: false, html: `${H.escapeHtml(door)} Kies eerst wie je bent: <button type="button" class="doc-link" data-action="open-settings" data-section="team">Jij bent…</button>` };
    if (!ObeyaData.canConfirm(dataset, me.name)) return { may: false, html: H.escapeHtml(door) };
    return { may: true, html: alleenAfgewezen ? 'Draai terug wat het overleg afwees, of laat het staan.' : 'Bevestig wat het overleg goedkeurt; wijs af met een reden.' };
  }

  // De betrokken items als links; wat niet meer bestaat als tekst.
  // In het detailscherm (skipId) niet het item zelf.
  function itemLinks(dataset, entry, skipId) {
    const items = (entry.items || []).filter((i) => ObeyaHistory.STRUCTUUR.includes(i.kind) && WOORD[i.change] && i.id !== skipId);
    const toon = items.slice(0, MAX_ITEMS).map((i) => {
      const gevonden = i.change !== 'deleted' && ObeyaData.findAny(dataset, i.id);
      const naam = H.escapeHtml(i.name || '(zonder naam)');
      const wat = `<span class="change-tag">${WOORD[i.change]}</span>`;
      return gevonden
        ? `<button type="button" class="confirm-item" data-open="${gevonden.type}:${H.escapeHtml(i.id)}">${H.entityTypeBadge(i.kind)} ${naam}</button> ${wat}`
        : `<span class="confirm-item confirm-item--gone">${H.entityTypeBadge(i.kind)} ${naam}</span> ${wat}`;
    });
    const rest = items.length - toon.length;
    return `${toon.map((t) => `<li>${t}</li>`).join('')}${rest > 0 ? `<li class="muted">en nog ${rest}</li>` : ''}`;
  }

  // Wie niet mag, ziet de knoppen wel (uitgeschakeld maar focusbaar, met de
  // uitleg als beschrijving), zodat duidelijk is wat er kan en door wie.
  function buttons(entry, perm, rejecting, whoId) {
    const uit = perm.may ? '' : ` aria-disabled="true" aria-describedby="${whoId}"`;
    if (rejecting === entry.id) {
      return `
        <form class="confirm-reject" data-action="reject-change-form" data-change-id="${H.escapeHtml(entry.id)}">
          <label for="f-reject-reason">Waarom afwijzen? <span class="muted">(de maker ziet de reden)</span></label>
          <textarea id="f-reject-reason" rows="2"></textarea>
          <div class="confirm-reject__actions">
            <button type="submit" class="btn btn--small btn--primary">Afwijzen</button>
            <button type="button" class="btn btn--small btn--ghost" data-action="start-reject" data-change-id="">Annuleren</button>
          </div>
        </form>`;
    }
    return `
      <div class="confirm-row__buttons">
        <button type="button" class="btn btn--small" data-action="confirm-change" data-change-id="${H.escapeHtml(entry.id)}"${uit}>Bevestigen</button>
        <button type="button" class="btn btn--small btn--ghost" data-action="start-reject" data-change-id="${H.escapeHtml(entry.id)}"${uit}>Afwijzen…</button>
      </div>`;
  }

  function row(dataset, entry, perm, rejecting, skipId, whoId) {
    return `
      <li class="confirm-row" id="change-${H.escapeHtml(entry.id)}">
        <p class="confirm-row__what"><strong>${H.escapeHtml(entry.label || 'wijziging')}</strong> <span class="muted">${doorWie(entry.by)} · ${H.escapeHtml(wanneer(entry.at))}</span></p>
        ${(() => { const links = itemLinks(dataset, entry, skipId); return links ? `<ul class="confirm-row__items">${links}</ul>` : ''; })()}
        ${buttons(entry, perm, rejecting, whoId)}
      </li>`;
  }

  // Afgewezen, nog niet teruggedraaid (stap 4): de reden, en de keuze
  // terugdraaien of laten staan. Lukte terugdraaien niet, dan waarom.
  function rejectedRow(dataset, entry, perm, problems, skipId, whoId) {
    const r = entry.review || {};
    const uit = perm.may ? '' : ` aria-disabled="true" aria-describedby="${whoId}"`;
    const waarom = (problems || {})[entry.id];
    const links = itemLinks(dataset, entry, skipId);
    return `
      <li class="confirm-row confirm-row--rejected" id="change-${H.escapeHtml(entry.id)}">
        <p class="confirm-row__what"><strong>${H.escapeHtml(entry.label || 'wijziging')}</strong> <span class="muted">${doorWie(entry.by)} · ${H.escapeHtml(wanneer(entry.at))}</span></p>
        <p class="confirm-row__reason">✕ Afgewezen${wie(r.by) ? ` door ${H.escapeHtml(wie(r.by))}` : ''}${r.reason ? `: ${H.escapeHtml(r.reason)}` : ''}</p>
        ${links ? `<ul class="confirm-row__items">${links}</ul>` : ''}
        ${waarom ? `<div class="confirm-row__problem" role="alert"><p><strong>Terugdraaien kan niet:</strong></p><ul>${waarom.map((w) => `<li>${H.escapeHtml(w)}</li>`).join('')}</ul><p>Zet het met de hand terug, of kies Laten staan.</p></div>` : ''}
        <div class="confirm-row__buttons">
          <button type="button" class="btn btn--small" data-action="revert-change" data-change-id="${H.escapeHtml(entry.id)}"${uit}>Terugdraaien</button>
          <button type="button" class="btn btn--small btn--ghost" data-action="keep-change" data-change-id="${H.escapeHtml(entry.id)}"${uit}>Laten staan</button>
        </div>
      </li>`;
  }

  // Bovenaan de Agenda; alleen als er iets te bevestigen is. Oudste eerst.
  // notice: wat er net besloten is, voor schermlezers (blijft ook staan als
  // het blok verdwijnt).
  function agendaBlock(dataset, me, rejecting, notice, problems) {
    const open = ObeyaHistory.pending(dataset.changeLog);
    const afgewezen = ObeyaHistory.toRevert(dataset.changeLog);
    const melding = `<p class="sr-only" role="status" id="review-status">${H.escapeHtml(notice || '')}</p>`;
    if (!open.length && !afgewezen.length) return melding;
    const perm = permission(dataset, me, !open.length);
    const kop = open.length ? `⏳ Te bevestigen (${open.length})` : `✕ Afgewezen, nog terug te draaien (${afgewezen.length})`;
    return `${melding}
      <section class="modal-section confirm-block" aria-labelledby="confirm-kop">
        <div class="modal-section__head"><h3 id="confirm-kop" tabindex="-1">${kop}</h3></div>
        <p class="confirm-block__who" id="confirm-who">${perm.html}</p>
        ${open.length ? `<ul class="confirm-list">${open.map((e) => row(dataset, e, perm, rejecting, null, 'confirm-who')).join('')}</ul>` : ''}
        ${open.length && afgewezen.length ? `<h4 class="confirm-block__sub">✕ Afgewezen, nog terug te draaien (${afgewezen.length})</h4>` : ''}
        ${afgewezen.length ? `<ul class="confirm-list">${afgewezen.map((e) => rejectedRow(dataset, e, perm, problems, null, 'confirm-who')).join('')}</ul>` : ''}
      </section>`;
  }

  // In het detailscherm: de wijzigingen die over dit item nog open staan.
  function detailBlock(dataset, itemId, me, rejecting, problems) {
    const over = (e) => (e.items || []).some((i) => i.id === itemId);
    const open = ObeyaHistory.pending(dataset.changeLog).filter(over);
    const afgewezen = ObeyaHistory.toRevert(dataset.changeLog).filter(over);
    if (!open.length && !afgewezen.length) return '';
    const perm = permission(dataset, me, !open.length);
    return `
      <div class="confirm-detail" role="group" aria-label="${open.length ? 'Te bevestigen' : 'Afgewezen'}">
        <p class="confirm-block__who" id="confirm-who-detail">${perm.html}</p>
        <ul class="confirm-list">${open.map((e) => row(dataset, e, perm, rejecting, itemId, 'confirm-who-detail')).join('')}${afgewezen.map((e) => rejectedRow(dataset, e, perm, problems, itemId, 'confirm-who-detail')).join('')}</ul>
      </div>`;
  }

  // --- geschiedenis (stap 5 van docs/wijzigingslog-plan.md) -----------------

  const KIND = { theme: 'thema', objective: 'doel', measurableResult: 'meetbaar resultaat', project: 'project', action: 'actie', note: 'notitie', relation: 'relatie', config: 'instellingen', meta: 'bordgegevens', principle: 'principe' };

  // De naam van de plek ("objective:obj-1/measurableResults" → het doel).
  function plekNaam(dataset, place) {
    const key = String(place || '').split('/')[0];
    const id = key.includes(':') ? key.slice(key.indexOf(':') + 1) : '';
    const gevonden = id && ObeyaData.findAny(dataset, id);
    return gevonden ? (gevonden.entity.title || gevonden.entity.name || '') : '';
  }

  function waarde(dataset, kind, f, v) {
    if (v === undefined || v === null || v === '') return '—';
    if (f === 'status') return ObeyaData.statusLabelFor(kind, v, dataset);
    if (Array.isArray(v)) return v.length ? v.join(', ') : '—';
    if (typeof v === 'object') return '…';
    const t = String(v);
    return t.length > 60 ? `${t.slice(0, 57)}…` : t;
  }

  // Eén item uit een regel in gewone woorden.
  function describe(dataset, item) {
    if (item.change === 'added') return 'toegevoegd';
    if (item.change === 'deleted') return 'verwijderd';
    if (item.change === 'reordered') return 'volgorde aangepast';
    const delen = [];
    if (item.change === 'moved') {
      const naar = plekNaam(dataset, item.placeAfter);
      delen.push(naar ? `verplaatst naar "${naar}"` : 'verplaatst');
    }
    Object.keys(item.fields || {}).forEach((f) => {
      const [voor, na] = item.fields[f];
      const label = (ObeyaMerge.FIELD_LABELS && ObeyaMerge.FIELD_LABELS[f]) || f;
      if (['status', 'owner'].includes(f)) delen.push(`${label}: ${waarde(dataset, item.kind, f, voor)} → ${waarde(dataset, item.kind, f, na)}`);
      else if (item.change !== 'moved' || !/Id$/.test(f)) delen.push(`${label.toLowerCase()} aangepast`);
    });
    return delen.join('; ') || 'aangepast';
  }

  function itemNaam(item) {
    return item.name || KIND[item.kind] || 'item';
  }

  // Eén regel uit het log als lijstregel. itemId: alleen wat dit item betreft.
  function historyRow(dataset, entry, itemId) {
    const items = (entry.items || []).filter((i) => (itemId ? i.id === itemId : !['meta'].includes(i.kind)));
    const status = entry.review && entry.review.status;
    const besluit = status === 'confirmed' ? ' <span class="change-tag">bevestigd</span>'
      : status === 'rejected' ? ` <span class="change-tag">${entry.review.reverted ? 'afgewezen, teruggedraaid' : 'afgewezen'}</span>`
        : status === 'pending' ? ' <span class="change-tag">te bevestigen</span>' : '';
    const regels = itemId
      ? items.map((i) => H.escapeHtml(describe(dataset, i)))
      : items.slice(0, MAX_ITEMS).map((i) => `${H.entityTypeBadge(i.kind)} ${H.escapeHtml(itemNaam(i))}: ${H.escapeHtml(describe(dataset, i))}`);
    const rest = itemId ? 0 : items.length - regels.length;
    return `
      <li class="history-row">
        <div class="history-row__date">${H.escapeHtml(wanneer(entry.at))}</div>
        <div class="history-row__body">
          <p class="history-row__head"><strong>${H.escapeHtml(entry.label || 'wijziging')}</strong><span class="muted">${doorWie(entry.by)}</span>${besluit}</p>
          ${regels.length ? `<ul class="history-row__lines">${regels.map((r) => `<li>${r}</li>`).join('')}${rest > 0 ? `<li class="muted">en nog ${rest}</li>` : ''}</ul>` : ''}
        </div>
      </li>`;
  }

  // Wat standaard in beeld komt: wat betekenis heeft (advies Obeya-coach).
  function zichtbaar(entries, showAll) {
    return showAll ? entries : entries.filter((e) => ObeyaHistory.isMeaningful(e) || (e.review && e.review.status));
  }

  // Onderaan het detailscherm, ingeklapt, met de laatste regel op de knop.
  // Een knop met aria-expanded in plaats van <details>, zodat hij open blijft
  // als het scherm opnieuw wordt opgebouwd (selection.context.history).
  function itemHistory(dataset, itemId, showAll, open) {
    const alle = ObeyaHistory.forItem(dataset.changeLog, itemId);
    if (!alle.length) return '';
    const lijst = zichtbaar(alle, showAll).slice().reverse();
    const laatste = alle[alle.length - 1];
    return `
      <section class="modal-section history">
        <button type="button" class="history__toggle" id="history-toggle" data-action="toggle-history" aria-expanded="${!!open}" aria-controls="history-panel">
          <span class="history__caret" aria-hidden="true">${open ? '▾' : '▸'}</span> <strong>Geschiedenis (${alle.length})</strong> <span class="muted">· laatst: ${H.escapeHtml(laatste.label || 'wijziging')}${wie(laatste.by) ? `, ${H.escapeHtml(wie(laatste.by))}` : ''}, ${H.escapeHtml(wanneer(laatste.at))}</span>
        </button>
        ${open ? `<div id="history-panel">
          ${allToggle(showAll, 'item')}
          ${lijst.length ? `<ul class="history-list">${lijst.map((e) => historyRow(dataset, e, itemId)).join('')}</ul>` : '<p class="muted">Alleen kleine wijzigingen; zet "alle wijzigingen" aan om ze te zien.</p>'}
        </div>` : ''}
      </section>`;
  }

  function allToggle(showAll, waar) {
    return `<label class="field-checkbox history-all"><input type="checkbox" data-show-all-changes="${waar}" ${showAll ? 'checked' : ''}> Alle wijzigingen <span class="muted">(ook tekst en volgorde)</span></label>`;
  }

  // Voor de Tijdlijn: elke regel met zijn tijdstip, om tussen de notities te zetten.
  function timelineChanges(dataset, showAll) {
    return zichtbaar((dataset.changeLog || []).filter((e) => e && e.at), showAll)
      .map((e) => ({ at: e.at, html: historyRow(dataset, e, null) }));
  }

  // "Sinds het vorige overleg": de laatste keer Overleg afgerond, anders de
  // afgelopen zeven dagen.
  function since(dataset, now) {
    const m = dataset.meta && dataset.meta.lastMeeting;
    if (m && m.at) return { at: m.at, label: `Vorig overleg · ${wanneer(m.at)}${m.by ? ` · afgerond door ${m.by}` : ''}` };
    const t = new Date((now ? new Date(now) : new Date()).getTime() - 7 * 86400000).toISOString();
    return { at: t, label: 'Zeven dagen geleden (nog geen overleg afgerond)' };
  }

  // Onderaan de Agenda.
  // Hoe lang het vorige overleg geleden is, zodat een gemist overleg opvalt
  // (advies Obeya-coach, 8 november 2026). Na twee weken in woorden, niet
  // alleen in kleur: het voorgestelde ritme is wekelijks.
  const RITME_DAGEN = 14;

  function meetingButton(dataset, now) {
    const m = dataset.meta && dataset.meta.lastMeeting;
    let geleden = '';
    let laat = false;
    if (m && m.at) {
      const dagen = Math.max(0, Math.floor(((now ? new Date(now) : new Date()) - new Date(m.at)) / 86400000));
      geleden = dagen === 0 ? ', vandaag' : dagen === 1 ? ', gisteren' : `, ${dagen} dagen geleden`;
      laat = dagen > RITME_DAGEN;
    }
    return `
      <section class="modal-section meeting-done">
        ${laat ? '<p class="meeting-done__late"><span aria-hidden="true">⏰</span> Het vorige overleg is meer dan twee weken geleden. Is het ritme blijven liggen?</p>' : ''}
        <p class="muted">${m && m.at ? `Vorig overleg afgerond op ${H.escapeHtml(wanneer(m.at))}${m.by ? ` door ${H.escapeHtml(m.by)}` : ''}${geleden}.` : 'Nog geen overleg afgerond.'} Afronden zet het begin van "sinds het vorige overleg" in de Tijdlijn.</p>
        <button type="button" class="btn" data-action="finish-meeting">Overleg afgerond</button>
      </section>`;
  }

  return { agendaBlock, detailBlock, permission, describe, itemHistory, timelineChanges, since, meetingButton, allToggle };
})();
