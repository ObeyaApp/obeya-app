// js/inbox-view.js
// De inbox op het scherm: een blok bovenaan de Agenda, de teller in de
// hoofdbalk, en de vensters om iets vast te leggen of erover te beslissen.
// Puur HTML uit de inbox-state (js/state.js) en het bord; de klikken zitten
// in js/app.js. Zie js/inbox.js voor het waarom.

const ObeyaInboxView = (function () {
  'use strict';
  const H = ObeyaUI;
  const esc = (s) => H.escapeHtml(s == null ? '' : String(s));

  const KEUZES = [
    ['land', 'Landen op het bord'],
    ['merge', 'Samenvoegen'],
    ['park', 'Parkeren'],
    ['reject', 'Afwijzen'],
  ];
  const SOORTEN = [
    ['project', 'Project'],
    ['action', 'Actie'],
    ['measurableResult', 'Deelproduct'],
    ['objective', 'Doel'],
  ];

  const FOUTEN = {
    'share-failed': 'Het staat op je bord, maar delen met het team lukte niet. Het issue blijft open; kies later "Afronden" om het alsnog te delen en te sluiten.',
    'close-failed': 'Gedeeld met het team, maar het issue kon niet worden gesloten. Sluit het op GitHub, of probeer "Afronden" opnieuw.',
    'already-landed': 'Dit item staat al op het bord. Kies "Afronden" om te delen en het issue te sluiten.',
    'already-decided': 'Hierover is al besloten: het issue is intussen gesloten, waarschijnlijk door een collega. De inbox is bijgewerkt.',
    'pull-failed': 'De laatste versie van het team kon niet worden opgehaald, dus er is nog niets veranderd. Probeer het opnieuw.',
    'comment-failed': 'Geparkeerd, maar de reactie in het issue kon niet worden geplaatst.',
    incomplete: 'Vul alle verplichte velden in.',
    'invalid-parent': 'Kies waar het onder komt te hangen.',
    empty: 'Vul in wat het is.',
  };
  function foutTekst(res) {
    if (!res || !res.error) return '';
    const extra = res.shareError || res.closeError;
    return `${FOUTEN[res.error] || H.gitErrorMessage(res.error)}${extra ? ` (${H.gitErrorMessage(extra)})` : ''}`;
  }

  function dagen(n) {
    return n === 0 ? 'vandaag' : n === 1 ? '1 dag' : `${n} dagen`;
  }

  // Vanaf twee weken wachten valt een item op: een wachtkamer hoort in elk
  // overleg leeg te gaan (advies Obeya-coach).
  const LANG = 14;
  const ZICHTBAAR = 3; // de rest achter "Nog n items", zodat de agenda zelf in beeld blijft

  // Teller in de hoofdbalk: alleen als het team gekoppeld is en er iets wacht.
  function topbarCounter(inbox, configured) {
    if (!configured) return '';
    const s = ObeyaInbox.summary(inbox.items);
    if (!s.count) return '';
    const label = `Inbox: ${s.count} item${s.count === 1 ? '' : 's'} wacht${s.count === 1 ? '' : 'en'} op een besluit`;
    return `<button class="topbar-btn inbox-counter${s.overLimit ? ' inbox-counter--over' : ''}" data-action="open-inbox" title="${label}" aria-label="${label}"><span class="inbox-counter__label">Inbox</span> <span class="inbox-counter__n">${s.count}</span></button>`;
  }

  // Eén regel per item; de hele regel opent het besluitvenster (de knop
  // strekt zich uit over de regel), de link naar GitHub ligt erboven.
  function rij(item, landed) {
    const lang = item.ageDays >= LANG;
    return `
      <li class="inbox-item${lang ? ' inbox-item--lang' : ''}">
        ${landed
          ? `<span class="inbox-item__main"><span class="inbox-item__title">${esc(item.title)}</span><span class="relation-tag">Staat al op het bord</span></span>
             <button class="btn btn--small" data-action="inbox-finish" data-issue="${item.number}">Afronden</button>`
          : `<button class="inbox-item__main inbox-item__open" data-action="inbox-triage" data-issue="${item.number}" title="Besluiten over dit item">
               <span class="inbox-item__title">${esc(item.title)}</span>${item.why ? `<span class="inbox-item__why">${esc(item.why)}</span>` : ''}
               <span class="sr-only">, besluiten</span>
             </button>`}
        <span class="inbox-item__meta">
          ${lang ? '<strong class="inbox-item__lang">⏳ Lang gewacht:</strong> ' : ''}<span>${dagen(item.ageDays)}</span>
          ${item.author ? `<span>@${esc(item.author)}</span>` : ''}
          ${item.url ? `<a href="${esc(item.url)}" target="_blank" rel="noopener">#${item.number}<span class="sr-only"> op GitHub (opent in een nieuw tabblad)</span></a>` : ''}
        </span>
      </li>`;
  }

  // Het blok bovenaan de Agenda. landedFromInbox(nummer) zegt of een item al
  // op het bord staat (landen gelukt, delen nog niet).
  function block(inbox, configured, landedFromInbox) {
    if (!configured) {
      return `
        <section class="modal-section inbox">
          <div class="modal-section__head"><h3>Inbox</h3></div>
          <p class="muted">De inbox loopt via het data-repo van het team. Koppel eerst het team bij <button class="btn btn--ghost btn--small" data-action="open-settings" data-section="team">Instellingen → Team</button>.</p>
        </section>`;
    }
    const zichtbaar = inbox.items.filter((i) => i.visible);
    const s = ObeyaInbox.summary(inbox.items);
    const melding = inbox.loading ? 'Inbox ophalen…' : inbox.error ? `Inbox ophalen mislukt: ${H.gitErrorMessage(inbox.error)}` : '';
    return `
      <section class="modal-section inbox" aria-labelledby="inbox-kop">
        <div class="modal-section__head inbox__head">
          <h3 id="inbox-kop" tabindex="-1" title="Nieuw werk dat wacht op een besluit in het overleg: landen, samenvoegen, parkeren of afwijzen">Inbox (${s.count}) <span class="inbox__sub">wacht op een besluit</span></h3>
          <span class="inbox__tools">
            <button class="btn btn--ghost btn--small" data-action="inbox-new">+ Nieuw</button>
            <button class="btn btn--ghost btn--small" data-action="inbox-refresh" ${inbox.loading ? 'disabled' : ''}>Vernieuwen</button>
          </span>
        </div>
        <p class="inbox__status" role="status">${esc(melding)}</p>
        ${s.overLimit ? `<p class="callout inbox__over">Er wachten ${s.count} items, meer dan de ${ObeyaInbox.LIMIT} van een wachtkamer; het oudste wacht al ${dagen(s.oldestDays)}. Beslis eerst over de oudste.</p>` : ''}
        ${zichtbaar.length
          ? `<ul class="inbox__list">${zichtbaar.slice(0, ZICHTBAAR).map((i) => rij(i, !!landedFromInbox(i.number))).join('')}</ul>
            ${zichtbaar.length > ZICHTBAAR ? `<details class="inbox__more"><summary>Nog ${zichtbaar.length - ZICHTBAAR} item${zichtbaar.length - ZICHTBAAR === 1 ? '' : 's'}</summary>
              <ul class="inbox__list">${zichtbaar.slice(ZICHTBAAR).map((i) => rij(i, !!landedFromInbox(i.number))).join('')}</ul></details>` : ''}`
          : (inbox.loading || inbox.error ? '' : '<p class="muted">Niets wacht op een besluit. Nieuw werk komt hier binnen, oudste eerst.</p>')}
        ${s.parked ? `<p class="muted inbox__parked">${s.parked} geparkeerd; ${s.parked === 1 ? 'komt' : 'komen'} vanzelf terug op de gekozen datum.</p>` : ''}
      </section>`;
  }

  function foutRegel(ctx) {
    return `<p class="error-text inbox-form__error" role="alert">${esc(ctx.error || '')}</p>`;
  }

  function closeBtn() {
    return '<button class="icon-btn modal__close" data-action="close-modal" aria-label="Sluiten">✕</button>';
  }

  function viewNew(ctx, inbox) {
    const s = ObeyaInbox.summary((inbox || {}).items);
    return `
      ${closeBtn()}
      <h2 class="modal__title">Nieuw in de inbox</h2>
      <p class="modal__description">Leg kort vast wat het is. In het overleg besluit het team waar het hoort.</p>
      ${s.count >= ObeyaInbox.LIMIT ? `<p class="callout">Er wachten al ${s.count} items (het oudste ${dagen(s.oldestDays)}). Leg dit alleen vast als het niet tot na het volgende overleg kan wachten.</p>` : ''}
      <form class="inbox-form" data-action="inbox-new-form">
        <div class="field"><label for="f-inbox-what">Wat is het? <span class="muted">(verplicht)</span></label>
          <input id="f-inbox-what" type="text" maxlength="200" value="${esc(ctx.what || '')}"></div>
        <div class="field"><label for="f-inbox-why">Waarom, of voor wie?</label>
          <textarea id="f-inbox-why" rows="3">${esc(ctx.why || '')}</textarea></div>
        ${foutRegel(ctx)}
        <div class="modal-actions">
          <span></span>
          <div class="modal-actions__right">
            <button class="btn btn--ghost" type="button" data-action="close-modal">Annuleren</button>
            <button class="btn btn--primary" type="submit" ${ctx.busy ? 'disabled' : ''}>${ctx.busy ? 'Bezig…' : 'Vastleggen'}</button>
          </div>
        </div>
      </form>`;
  }

  // Waar een nieuw item onder kan hangen, per soort.
  function parentOptions(dataset, soort, gekozen) {
    const opt = (id, label) => `<option value="${esc(id)}" ${id === gekozen ? 'selected' : ''}>${esc(label)}</option>`;
    if (soort === 'objective') return dataset.themes.map((t) => opt(t.id, t.name)).join('');
    return dataset.themes.map((t) => {
      const regels = [];
      t.objectives.forEach((o) => {
        regels.push(opt(o.id, soort === 'action' ? `Doel: ${o.title}` : o.title));
        if (soort === 'action') o.projects.forEach((p) => regels.push(opt(p.id, `\u00a0\u00a0\u00a0Project: ${p.name}`)));
      });
      return regels.length ? `<optgroup label="${esc(t.name)}">${regels.join('')}</optgroup>` : '';
    }).join('');
  }

  function mergeOptions(dataset, gekozen) {
    const opt = (id, label) => `<option value="${esc(id)}" ${id === gekozen ? 'selected' : ''}>${esc(label)}</option>`;
    return dataset.themes.map((t) => {
      const regels = [];
      t.objectives.forEach((o) => {
        regels.push(opt(o.id, `Doel: ${o.title}`));
        o.measurableResults.forEach((m) => regels.push(opt(m.id, `\u00a0\u00a0\u00a0Deelproduct: ${m.name}`)));
        o.projects.forEach((p) => regels.push(opt(p.id, `\u00a0\u00a0\u00a0Project: ${p.name}`)));
      });
      return regels.length ? `<optgroup label="${esc(t.name)}">${regels.join('')}</optgroup>` : '';
    }).join('');
  }

  function landFields(dataset, item, ctx) {
    const soort = ctx.type || 'project';
    const waar = soort === 'objective' ? 'Onder welk thema?' : soort === 'action' ? 'Bij welk doel of project?' : 'Onder welk doel?';
    return `
      <div class="field"><label for="f-inbox-type">Wordt een</label>
        <select id="f-inbox-type" data-inbox-type>${SOORTEN.map(([k, l]) => `<option value="${k}" ${k === soort ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div class="field"><label for="f-inbox-parent">${waar}</label>
        <select id="f-inbox-parent"><option value="">Kies…</option>${parentOptions(dataset, soort, ctx.parentId)}</select></div>
      <div class="field"><label for="f-inbox-name">Naam</label>
        <input id="f-inbox-name" type="text" value="${esc(ctx.name != null ? ctx.name : item.title)}"></div>
      <div class="field"><label for="f-inbox-owner">Eigenaar <span class="muted">(verplicht)</span></label>
        <select id="f-inbox-owner"><option value="">Kies…</option>${H.ownerOptionsHtml(dataset, ctx.owner)}</select></div>
      <p class="muted">Het komt op het bord, wordt meteen gedeeld met het team, en pas daarna wordt het issue gesloten.</p>`;
  }

  function viewTriage(dataset, item, ctx) {
    if (!item) {
      return `${closeBtn()}<h2 class="modal__title">Inbox</h2><p>Dit item staat niet meer in de inbox; misschien heeft iemand anders er al over besloten.</p>`;
    }
    const keuze = ctx.kind || 'land';
    const velden = {
      land: () => landFields(dataset, item, ctx),
      merge: () => `
        <div class="field"><label for="f-inbox-target">Samenvoegen met</label>
          <select id="f-inbox-target"><option value="">Kies…</option>${mergeOptions(dataset, ctx.targetId)}</select></div>
        <p class="muted">Het wordt een notitie bij dat item, met het waarom erbij. Daarna wordt gedeeld en het issue gesloten.</p>`,
      park: () => `
        <div class="field"><label for="f-inbox-date">Terug in de inbox op</label>
          <input id="f-inbox-date" type="date" value="${esc(ctx.date || '')}"></div>
        <div class="field"><label for="f-inbox-reason">Waarom nu niet?</label>
          <input id="f-inbox-reason" type="text" value="${esc(ctx.reason || '')}"></div>`,
      reject: () => `
        <div class="field"><label for="f-inbox-reason">Reden <span class="muted">(verplicht, de melder ziet hem)</span></label>
          <input id="f-inbox-reason" type="text" value="${esc(ctx.reason || '')}"></div>`,
    };
    const knop = { land: 'Landen', merge: 'Samenvoegen', park: 'Parkeren', reject: 'Afwijzen' }[keuze];
    return `
      ${closeBtn()}
      <h2 class="modal__title">${esc(item.title)}</h2>
      <p class="modal__description">${item.why ? `${esc(item.why)} · ` : ''}wacht ${dagen(item.ageDays)}${item.author ? `, van @${esc(item.author)}` : ''}</p>
      <div class="zoom-toggle inbox-kinds" role="group" aria-label="Besluit">
        ${KEUZES.map(([k, l]) => `<button id="inbox-kind-${k}" class="zoom-toggle__btn ${k === keuze ? 'zoom-toggle__btn--active' : ''}" type="button" data-action="inbox-kind" data-kind="${k}" aria-pressed="${k === keuze}">${l}</button>`).join('')}
      </div>
      <form class="inbox-form" data-action="inbox-triage-form" data-kind="${keuze}" data-issue="${item.number}">
        ${velden[keuze]()}
        ${foutRegel(ctx)}
        <div class="modal-actions">
          <span></span>
          <div class="modal-actions__right">
            <button class="btn btn--ghost" type="button" data-action="close-modal">Annuleren</button>
            <button class="btn btn--primary" type="submit" ${ctx.busy ? 'disabled' : ''}>${ctx.busy ? 'Bezig…' : knop}</button>
          </div>
        </div>
      </form>`;
  }

  return { topbarCounter, block, viewNew, viewTriage, foutTekst, parentOptions };
})();
