// js/documents-view.js
// Het tabblad Stukken (idee 54): een lijst van de stukken uit het data-repo,
// en één stuk tegelijk over de volle breedte om samen door te nemen. De
// opmaak komt van de app (css/styles.css, .doc-*), nooit van het stuk zelf;
// de omzetting staat in js/documents.js.

const ObeyaDocsView = (function () {
  'use strict';

  const H = ObeyaUI;

  // Status van een stuk als label met stip én tekst, in dezelfde vorm als de
  // statuslabels op het bord (nooit alleen kleur).
  const STATUS_KLEUR = { concept: 'grey', besproken: 'blue', besloten: 'green' };

  function statusLabel(status) {
    if (!status) return '';
    return `<span class="status-pill status-${STATUS_KLEUR[status]} status-pill--compact"><span class="status-dot" aria-hidden="true"></span>${ObeyaDocs.STATUS_LABELS[status]}</span>`;
  }

  function metaRegel(meta) {
    return [meta.datum ? H.formatDate(meta.datum) : '', meta.voor ? `voor ${meta.voor}` : '', meta.bron ? `bron: ${meta.bron}` : '']
      .filter(Boolean).map(H.escapeHtml).join(' · ');
  }

  const FOUTEN = {
    'not-configured': 'Verbind met het team (GitHub) om de stukken op te halen.',
    network: 'Geen verbinding met GitHub. Wat eerder is opgehaald, staat hieronder.',
  };

  function kop(state) {
    const opgehaald = state.fetchedAt ? `opgehaald ${new Date(state.fetchedAt).toLocaleString('nl-NL', { dateStyle: 'medium', timeStyle: 'short' })}` : 'nog niet opgehaald';
    const melding = state.busy ? 'Stukken ophalen…' : (state.error ? (FOUTEN[state.error] || `Ophalen mislukt: ${H.gitErrorMessage(state.error)}`) : '');
    return `
      <div class="docs-head">
        <div>
          <h2 class="docs-head__title">Stukken</h2>
          <p class="muted">Adviezen, voorbereidingen en verslagen uit het data-repo van het team. Alleen lezen; wijzigen gaat via het repo. · ${H.escapeHtml(opgehaald)}</p>
        </div>
        ${state.configured ? `<button class="btn btn--ghost btn--small" data-action="fetch-docs" ${state.busy ? 'disabled' : ''}>${state.busy ? 'Bezig…' : 'Opnieuw ophalen'}</button>` : ''}
      </div>
      <p class="docs-status" aria-live="polite">${H.escapeHtml(melding)}</p>`;
  }

  function renderList(state, docs) {
    if (!docs.length) {
      const uitleg = !state.configured
        ? 'Verbind met het team (GitHub) om de stukken op te halen. Ze staan in de map <code>stukken/</code> van het data-repo.'
        : (state.fetchedAt ? 'Er staan nog geen stukken in de map <code>stukken/</code> van het data-repo.' : 'Nog niet opgehaald.');
      return `${kop(state)}<div class="docs-empty"><span class="status-dot status-grey" aria-hidden="true"></span><p>${uitleg}</p></div>`;
    }
    return `${kop(state)}
      <ul class="docs-list">
        ${docs.map((d) => `
          <li>
            <button class="docs-card" data-action="open-doc" data-path="${H.escapeHtml(d.path)}">
              <span class="docs-card__title">${H.escapeHtml(d.meta.titel)}</span>
              <span class="docs-card__meta">${statusLabel(d.meta.status)} <span class="muted">${metaRegel({ ...d.meta, bron: '' })}</span></span>
            </button>
          </li>`).join('')}
      </ul>`;
  }

  function renderDoc(doc) {
    return `
      <nav class="crumbs" aria-label="Kruimelpad">
        <button class="crumbs__link" data-action="close-doc">Stukken</button><span class="crumbs__sep">/</span><span class="crumbs__current">${H.escapeHtml(doc.meta.titel)}</span>
      </nav>
      <article class="doc">
        <header class="doc__head">
          <h1 id="doc-title" tabindex="-1">${H.escapeHtml(doc.meta.titel)}</h1>
          <p class="doc__meta">${statusLabel(doc.meta.status)} <span class="muted">${metaRegel(doc.meta)}</span></p>
        </header>
        <div class="doc__body">
          ${doc.html}
        </div>
      </article>`;
  }

  function render(state, openPath) {
    const images = {};
    (state.images || []).forEach((b) => { images[b.path] = b.dataUrl; });
    const docs = ObeyaDocs.sortDocs(state.docs.map((d) => ObeyaDocs.parse(d.text, d.path, { images })));
    const open = openPath && docs.find((d) => d.path === openPath);
    return `<section class="docs-view">${open ? renderDoc(open) : renderList(state, docs)}</section>`;
  }

  return { render };
})();
