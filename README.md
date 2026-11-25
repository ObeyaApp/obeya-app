# Obeya-app

Een lichte app voor een **Obeya**: een team ziet in één oogopslag zijn strategische thema's, doelen, meetbare resultaten, projecten en acties, wie waar eigenaar van is, en wat aandacht vraagt. Gemaakt door een team van de gemeente Leiden, als proof of concept.

*A lightweight Obeya board for strategy execution: themes, objectives, measurable results, projects and actions, with owners and status. Dutch user interface. Licensed under the EUPL-1.2.*

## Gebruiken

Open de app in de browser. Zonder verbinding zie je een **fictief demobord**; je kunt alles uitproberen, wijzigingen blijven in je eigen browser.

Met je team samenwerken gaat via een **eigen, privé GitHub-repository** voor de data: de app leest en schrijft daar met een persoonlijk token, rechtstreeks vanuit je browser. De data van een team staat dus nooit in deze repository en nooit op deze website. Hoe je dat inricht, staat in de app onder **Hulp** (het vraagteken rechtsboven).

## Zelf draaien

De app is een map met gewone bestanden, zonder build-stap en zonder server-code. Elke webserver volstaat, bijvoorbeeld:

```
python3 -m http.server 8000
```

en open `http://localhost:8000`. Openen vanaf schijf (`index.html`) werkt ook.

## Licentie

[EUPL-1.2](LICENSE). Meegeleverde bibliotheken in `vendor/`: [SortableJS](https://github.com/SortableJS/Sortable) en [PptxGenJS](https://github.com/gitbrent/PptxGenJS), beide onder de MIT-licentie.

## Ontwikkeling

Deze repository is de **publicatie** van de app: ze wordt bij elke nieuwe versie automatisch bijgewerkt. Wat er per versie veranderde, staat in [RELEASENOTES.md](RELEASENOTES.md). Vragen of ideeën zijn welkom als issue.
