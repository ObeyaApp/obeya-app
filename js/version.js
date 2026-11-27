// js/version.js
// De versie van de app, volgens Semantic Versioning (zie AGENTS.md). Staat in
// de kop van de app, en index.html laadt elk bestand met deze versie in de URL
// (?v=…), zodat een browser na een nieuwe versie de nieuwe bestanden ophaalt
// in plaats van oude uit zijn cache. Verhoog je hem, pas dan ook index.html en
// CHANGELOG.md aan; tests/version.test.js bewaakt dat.
const OBEYA_APP_VERSION = '0.55.0';
