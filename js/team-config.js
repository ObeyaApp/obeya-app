// js/team-config.js
// Vaste instellingen voor dit team, gelijk voor iedereen die de app opent.
// Hier hoort nooit een token in: dit bestand staat gewoon in git.

const ObeyaTeamConfig = Object.freeze({
  // Het GitHub-repo waarin het team de Obeya-data deelt. Staat vooraf
  // ingevuld in "Verbinden met team", zodat een teamlid alleen het eigen
  // token hoeft toe te voegen. Leeg laten als er (nog) geen vast repo is.
  dataRepo: 'https://github.com/ObeyaApp/obeya_back-end',
  // Waar het data-repo eerder stond. Wie dat adres nog heeft opgeslagen,
  // krijgt vanzelf het nieuwe (verhuisd naar de organisatie op 25 november 2026).
  formerDataRepos: ['https://github.com/GemLDBTOD22/obeya_back-end'],
});
