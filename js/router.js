// js/router.js
// Navigatie in de URL (idee 82). Het deel na de # zegt welk scherm open is:
// #/agenda, #/stukken/2026-11-11-doeltitels, #/hulp/agenda. Zo kun je een
// link delen, werken Vorige en Volgende van de browser, en blijft het werken
// als index.html van schijf wordt geopend (file://), omdat er geen server aan
// te pas komt.
//
// Puur: alleen de vertaling tussen scherm en adres. Het lezen en zetten van
// location gebeurt in app.js.

const ObeyaRouter = (function () {
  'use strict';

  const PADEN = {
    board: 'bord',
    canvas: 'samenhang',
    list: 'lijst',
    matrix: 'verbindingen',
    execution: 'uitvoering',
    timeline: 'tijdlijn',
    agenda: 'agenda',
    documents: 'stukken',
    help: 'hulp',
  };
  const WEERGAVEN = Object.fromEntries(Object.entries(PADEN).map(([view, pad]) => [pad, view]));

  // Alleen een gewone bestandsnaam: geen mappen, geen ".." en geen vreemde tekens.
  const NAAM = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
  const STUKKEN = 'stukken/';

  function decode(deel) {
    try { return decodeURIComponent(deel); } catch (e) { return ''; }
  }

  function toHash(scherm) {
    const view = PADEN[scherm.view] ? scherm.view : 'board';
    if (view === 'documents' && scherm.doc) {
      const naam = scherm.doc.replace(/^stukken\//, '').replace(/\.md$/, '');
      return `#/stukken/${encodeURIComponent(naam)}`;
    }
    if (view === 'help' && scherm.helpPage) return `#/hulp/${encodeURIComponent(scherm.helpPage)}`;
    return `#/${PADEN[view]}`;
  }

  // Geeft { view, doc, helpPage } terug, of null als het adres geen scherm is.
  function fromHash(hash) {
    const delen = String(hash || '').replace(/^#\/?/, '').split('/').filter(Boolean);
    if (!String(hash || '').startsWith('#/') || !delen.length) return null;
    const view = WEERGAVEN[decode(delen[0]).toLowerCase()];
    if (!view) return null;
    const naam = delen.length === 2 ? decode(delen[1]) : '';
    const geldig = NAAM.test(naam) && !naam.includes('..');
    return {
      view,
      doc: view === 'documents' && geldig ? `${STUKKEN}${naam}.md` : null,
      helpPage: view === 'help' && geldig ? naam : null,
    };
  }

  return { toHash, fromHash };
})();
