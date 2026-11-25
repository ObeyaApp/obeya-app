# vendor/

Bibliotheken van derden, ongewijzigd en lokaal meegeleverd: geen build-stap,
en de app werkt ook zonder internetverbinding of CDN.

| Bestand | Versie | Bron | Licentie | SHA-256 |
|---|---|---|---|---|
| `pptxgen.bundle.js` | PptxGenJS 3.12.0 (met JSZip) | https://cdn.jsdelivr.net/npm/pptxgenjs@3.12.0/dist/pptxgen.bundle.js (identiek aan unpkg `pptxgenjs@3.12.0`) | MIT | `cd078ca9e91c6f9e061ee0a3c310d6ff157c3a71b1dea7f40fd53818017266ff` |
| `Sortable.min.js` | SortableJS 1.15.6 | https://cdnjs.cloudflare.com/ajax/libs/Sortable/1.15.6/Sortable.min.js (identiek aan jsDelivr `sortablejs@1.15.6`) | MIT | `6d0a831fc19b4bae851797ad3393157e861afb7862459c11226359b27e2c4337` |

Waarom SortableJS: verschuiven van briefjes op de muur (lens Keten), met
touch-ondersteuning en automatisch scrollen langs de rand. Bewust gekozen als
uitzondering op "geen drag-and-drop-bibliotheken" in `AGENTS.md`, zie
`docs/canvas-voorstel.md` (stap 3). Bijwerken: nieuwe versie ophalen, de hash
controleren tegen een tweede bron, en deze tabel aanpassen.

Waarom PptxGenJS: het teamplan als bewerkbare PowerPoint (idee 61, besloten door David op 20 oktober 2026: "allebei", PDF en PowerPoint). Een .pptx zelf schrijven (zip met Office-XML) zou veel meer werk en onderhoud kosten. De bibliotheek wordt pas geladen als iemand een PowerPoint maakt (`js/deck-pptx.js`), dus de app start er niet trager door.

