// Generated mirror of data/obeya.json so the app also works when this file
// is opened directly (file://), where fetch() of local JSON is blocked.
// Regenerate with: node tools/sync-seed.js — do not edit by hand.
window.OBEYA_SEED_DATA = {
  "meta": {
    "name": "Obeya — Team Digitale Dienstverlening (demo)",
    "version": "0.8.0",
    "dataModelVersion": "0.1.1",
    "lastUpdated": "2026-09-09",
    "terminology": {
      "primary": "meetbaar resultaat",
      "formalAlias": "KPI"
    },
    "vision": "Onze digitale dienstverlening is begrijpelijk, betrouwbaar en voor iedereen bruikbaar. We sturen op wat inwoners merken, niet op wat wij opleveren.",
    "statusLegend": {
      "green": "on track",
      "amber": "attention required",
      "red": "off track",
      "grey": "not assessed / unknown"
    },
    "note": "Fictieve voorbeelddata om de werking van het bord te tonen. Namen, cijfers en projecten zijn verzonnen."
  },
  "config": {
    "owners": [
      "Daan",
      "Fatima",
      "Joris",
      "Meike",
      "Nienke",
      "Ruben",
      "Sanne"
    ],
    "principles": [
      {
        "id": "principle-begrijpelijk",
        "name": "Begrijpelijk",
        "description": "Inwoners snappen in één keer wat er staat en wat ze moeten doen."
      },
      {
        "id": "principle-betrouwbaar",
        "name": "Betrouwbaar",
        "description": "Het werkt, het klopt en het is veilig."
      },
      {
        "id": "principle-bruikbaar",
        "name": "Bruikbaar voor iedereen",
        "description": "Ook met een beperking, op elk apparaat."
      }
    ]
  },
  "themes": [
    {
      "id": "theme-toegankelijk",
      "name": "Toegankelijke dienstverlening",
      "description": "Iedereen kan onze digitale diensten gebruiken, ook zonder digitale vaardigheden of met een beperking.",
      "status": "red",
      "owner": "Sanne",
      "color": "#3B6FA0",
      "flaggedForDiscussion": false,
      "objectives": [
        {
          "id": "obj-formulieren",
          "title": "Inwoners vinden binnen twee stappen het juiste digitale formulier",
          "description": "De zoekroute naar een formulier is nu te lang; mensen haken af of bellen alsnog.",
          "owner": "Sanne",
          "status": "amber",
          "themeId": "theme-toegankelijk",
          "themeIds": [
            "theme-toegankelijk"
          ],
          "measurableResults": [
            {
              "id": "mr-klikken",
              "name": "Nieuw zoekpad naar formulieren live",
              "doneCriterion": "Bij een test met tien inwoners vindt iedereen het juiste formulier in twee stappen",
              "periodYear": 2026,
              "periodQuarter": 4,
              "owner": "Sanne",
              "status": "amber",
              "sourceStatus": null,
              "inTeamPlan": true,
              "monitoringText": "Gemeten via de analytics op de formulierenpagina, maandelijks.",
              "flaggedForDiscussion": false,
              "objectiveId": "obj-formulieren"
            },
            {
              "id": "mr-tevredenheid",
              "name": "Invulhulp bij de vijf meest gebruikte formulieren",
              "doneCriterion": "De invulhulp staat live bij alle vijf formulieren en is getest met inwoners",
              "periodYear": 2027,
              "periodQuarter": 1,
              "owner": "Sanne",
              "status": "amber",
              "sourceStatus": null,
              "inTeamPlan": true,
              "monitoringText": "",
              "flaggedForDiscussion": false,
              "objectiveId": "obj-formulieren"
            }
          ],
          "projects": [
            {
              "id": "prj-zoekpad",
              "name": "Zoekpad naar formulieren herontwerpen",
              "description": "Kaartsortering met inwoners, daarna de navigatie opnieuw indelen.",
              "owner": "Sanne",
              "status": "blue",
              "sourceStatus": null,
              "inTeamPlan": true,
              "monitoringText": "",
              "periodYear": 2026,
              "periodQuarter": 3,
              "measurableResultIds": [
                "mr-klikken"
              ],
              "noMeasurableResultNeeded": false,
              "actions": [
                {
                  "id": "act-kaartsortering",
                  "title": "Kaartsortering met 12 inwoners uitvoeren",
                  "description": "",
                  "owner": "Meike",
                  "status": "green",
                  "dueDate": "2026-07-15",
                  "measurableResultId": "mr-klikken",
                  "flaggedForDiscussion": false,
                  "objectiveId": "obj-formulieren",
                  "projectId": "prj-zoekpad",
                  "relatedItemId": "prj-zoekpad"
                },
                {
                  "id": "act-navigatie",
                  "title": "Nieuwe navigatie-indeling voorleggen aan de redactie",
                  "description": "",
                  "owner": "Sanne",
                  "status": "amber",
                  "dueDate": "2026-08-28",
                  "measurableResultId": "mr-klikken",
                  "flaggedForDiscussion": false,
                  "objectiveId": "obj-formulieren",
                  "projectId": "prj-zoekpad",
                  "relatedItemId": "prj-zoekpad"
                }
              ],
              "flaggedForDiscussion": false,
              "objectiveId": "obj-formulieren"
            },
            {
              "id": "prj-formulierteksten",
              "name": "Invulhulp bij de vijf meest gebruikte formulieren",
              "description": "",
              "owner": "Meike",
              "status": "grey",
              "sourceStatus": null,
              "inTeamPlan": false,
              "monitoringText": "",
              "periodYear": 2026,
              "periodQuarter": 4,
              "measurableResultIds": [
                "mr-tevredenheid"
              ],
              "noMeasurableResultNeeded": false,
              "actions": [],
              "flaggedForDiscussion": false,
              "objectiveId": "obj-formulieren"
            }
          ],
          "actions": [
            {
              "id": "act-meetpunt",
              "title": "Meetpunt voor het aantal stappen inrichten in analytics",
              "description": "",
              "owner": "Ruben",
              "status": "green",
              "dueDate": "2026-06-30",
              "measurableResultId": "mr-klikken",
              "flaggedForDiscussion": false,
              "objectiveId": "obj-formulieren",
              "projectId": null,
              "relatedItemId": "obj-formulieren"
            }
          ],
          "notes": [
            {
              "id": "note-obstakel-zoek",
              "text": "De zoekfunctie van het CMS kan niet op formuliertype filteren; dat blokkeert de kortste route.",
              "type": "obstacle",
              "author": "Sanne",
              "createdAt": "2026-06-12",
              "updatedAt": null,
              "relatedItemId": "prj-zoekpad"
            },
            {
              "id": "note-besluit-zoek",
              "text": "Besloten: we bouwen geen eigen zoekmachine, maar richten een handmatig samengestelde top-20 in. Herzien we in Q1 2027.",
              "type": "decision",
              "author": "Joris",
              "createdAt": "2026-06-19",
              "updatedAt": null,
              "relatedItemId": "prj-zoekpad"
            },
            {
              "id": "note-succes-kaart",
              "text": "Kaartsortering afgerond met 12 inwoners. Opvallend: iedereen zocht op levensgebeurtenis, niemand op afdelingsnaam.",
              "type": "success",
              "author": "Meike",
              "createdAt": "2026-07-16",
              "updatedAt": null,
              "relatedItemId": "act-kaartsortering"
            },
            {
              "id": "note-leren-zoek",
              "text": "Geleerd: onze indeling volgt de organisatie, niet de vraag van de inwoner. Dat patroon zien we ook bij de betaalpagina.",
              "type": "learning",
              "author": "Meike",
              "createdAt": "2026-07-18",
              "updatedAt": null,
              "relatedItemId": "obj-formulieren"
            }
          ],
          "flaggedForDiscussion": false,
          "principleIds": [
            "principle-bruikbaar"
          ]
        },
        {
          "id": "obj-b1",
          "title": "Alle publieksteksten zijn op taalniveau B1",
          "description": "Raakt zowel toegankelijkheid als datagedreven sturen: we meten de leesbaarheid en sturen daarop.",
          "owner": "Meike",
          "status": "red",
          "themeId": "theme-toegankelijk",
          "themeIds": [
            "theme-toegankelijk",
            "theme-data"
          ],
          "measurableResults": [
            {
              "id": "mr-b1",
              "name": "Top-50 publieksteksten op B1",
              "doneCriterion": "Alle vijftig teksten zijn herschreven en door een B1-lezer goedgekeurd",
              "periodYear": 2027,
              "periodQuarter": 1,
              "owner": "Meike",
              "status": "amber",
              "sourceStatus": null,
              "inTeamPlan": true,
              "monitoringText": "Automatische leesbaarheidsscan, elke maand over de hele site.",
              "flaggedForDiscussion": false,
              "objectiveId": "obj-b1"
            },
            {
              "id": "mr-doorlooptijd-tekst",
              "name": "Nieuw redactieproces vastgesteld",
              "doneCriterion": "Het proces met één controleronde is vastgesteld en de redacteuren werken ermee",
              "periodYear": 2026,
              "periodQuarter": 3,
              "owner": "Meike",
              "status": "red",
              "sourceStatus": null,
              "inTeamPlan": false,
              "monitoringText": "",
              "flaggedForDiscussion": false,
              "objectiveId": "obj-b1"
            }
          ],
          "projects": [
            {
              "id": "prj-herschrijven",
              "name": "Top-50 publieksteksten herschrijven",
              "description": "",
              "owner": "Meike",
              "status": "blue",
              "sourceStatus": null,
              "inTeamPlan": true,
              "monitoringText": "",
              "periodYear": 2026,
              "periodQuarter": 3,
              "measurableResultIds": [
                "mr-b1"
              ],
              "noMeasurableResultNeeded": false,
              "actions": [
                {
                  "id": "act-schrijfwijzer",
                  "title": "Schrijfwijzer bijwerken met voorbeelden uit onze eigen teksten",
                  "description": "",
                  "owner": "Meike",
                  "status": "blue",
                  "dueDate": "2026-09-30",
                  "measurableResultId": null,
                  "flaggedForDiscussion": false,
                  "objectiveId": "obj-b1",
                  "projectId": "prj-herschrijven",
                  "relatedItemId": "prj-herschrijven"
                }
              ],
              "flaggedForDiscussion": false,
              "objectiveId": "obj-b1"
            },
            {
              "id": "prj-redactieproces",
              "name": "Redactieproces verkorten van twaalf naar vijf dagen",
              "description": "",
              "owner": "Joris",
              "status": "red",
              "sourceStatus": null,
              "inTeamPlan": false,
              "monitoringText": "Loopt vast op één reviewstap die bij één persoon ligt.",
              "periodYear": 2026,
              "periodQuarter": 3,
              "measurableResultIds": [
                "mr-doorlooptijd-tekst"
              ],
              "noMeasurableResultNeeded": false,
              "actions": [],
              "flaggedForDiscussion": false,
              "objectiveId": "obj-b1"
            }
          ],
          "actions": [],
          "notes": [
            {
              "id": "note-monitor-b1",
              "text": "Scan draait nu wekelijks in plaats van maandelijks, zodat een terugval sneller opvalt.",
              "type": "monitoring",
              "author": "Meike",
              "createdAt": "2026-09-01",
              "updatedAt": null,
              "relatedItemId": "mr-b1"
            },
            {
              "id": "note-maatregel-redactie",
              "text": "Tweede redacteur aangewezen zodat de review niet meer bij één persoon ligt.",
              "type": "countermeasure",
              "author": "Joris",
              "createdAt": "2026-08-20",
              "updatedAt": null,
              "relatedItemId": "prj-redactieproces"
            }
          ],
          "flaggedForDiscussion": true,
          "principleIds": [
            "principle-begrijpelijk"
          ]
        }
      ]
    },
    {
      "id": "theme-betrouwbaar",
      "name": "Betrouwbare systemen",
      "description": "Onze systemen doen wat ze beloven, en als er iets misgaat weten we het als eerste.",
      "status": "amber",
      "owner": "Ruben",
      "color": "#2E8B87",
      "flaggedForDiscussion": false,
      "objectives": [
        {
          "id": "obj-storingen",
          "title": "Storingen in kernsystemen zijn binnen een uur zichtbaar en belegd",
          "description": "",
          "owner": "Ruben",
          "status": "amber",
          "themeId": "theme-betrouwbaar",
          "themeIds": [
            "theme-betrouwbaar"
          ],
          "measurableResults": [
            {
              "id": "mr-detectietijd",
              "name": "Monitoring op de vier kernsystemen",
              "doneCriterion": "Voor elk kernsysteem gaat bij een storing binnen vijf minuten een melding uit",
              "periodYear": 2026,
              "periodQuarter": 4,
              "owner": "Ruben",
              "status": "amber",
              "sourceStatus": null,
              "inTeamPlan": true,
              "monitoringText": "",
              "flaggedForDiscussion": false,
              "objectiveId": "obj-storingen"
            },
            {
              "id": "mr-eigenaar-storing",
              "name": "Storingsdienst met vaste eigenaren",
              "doneCriterion": "Er is een rooster waarin elke storing binnen een uur een eigenaar heeft",
              "periodYear": 2026,
              "periodQuarter": 4,
              "owner": "Ruben",
              "status": "green",
              "sourceStatus": null,
              "inTeamPlan": false,
              "monitoringText": "",
              "flaggedForDiscussion": false,
              "objectiveId": "obj-storingen"
            }
          ],
          "projects": [
            {
              "id": "prj-monitoring",
              "name": "Monitoring en alarmering op de vier kernsystemen",
              "description": "",
              "owner": "Ruben",
              "status": "blue",
              "sourceStatus": null,
              "inTeamPlan": true,
              "monitoringText": "",
              "periodYear": 2026,
              "periodQuarter": 3,
              "measurableResultIds": [
                "mr-detectietijd",
                "mr-eigenaar-storing"
              ],
              "noMeasurableResultNeeded": false,
              "actions": [
                {
                  "id": "act-alarmering",
                  "title": "Alarmering koppelen aan de storingsdienst",
                  "description": "",
                  "owner": "Daan",
                  "status": "blue",
                  "dueDate": "2026-09-25",
                  "measurableResultId": null,
                  "flaggedForDiscussion": false,
                  "objectiveId": "obj-storingen",
                  "projectId": "prj-monitoring",
                  "relatedItemId": "prj-monitoring"
                },
                {
                  "id": "act-dashboard-storing",
                  "title": "Storingsdashboard op het teamscherm zetten",
                  "description": "",
                  "owner": "Ruben",
                  "status": "grey",
                  "dueDate": "2026-10-15",
                  "measurableResultId": null,
                  "flaggedForDiscussion": false,
                  "objectiveId": "obj-storingen",
                  "projectId": "prj-monitoring",
                  "relatedItemId": "prj-monitoring"
                }
              ],
              "flaggedForDiscussion": false,
              "objectiveId": "obj-storingen"
            }
          ],
          "actions": [],
          "notes": [
            {
              "id": "note-update-monitoring",
              "text": "Twee van de vier systemen zijn aangesloten; de andere twee wachten op een koppelvlak van de leverancier.",
              "type": "update",
              "author": "Ruben",
              "createdAt": "2026-09-02",
              "updatedAt": null,
              "relatedItemId": "prj-monitoring"
            }
          ],
          "flaggedForDiscussion": false,
          "principleIds": [
            "principle-betrouwbaar"
          ]
        },
        {
          "id": "obj-beveiliging",
          "title": "Applicaties voldoen aan de vastgestelde beveiligingsnormen",
          "description": "",
          "owner": "Daan",
          "status": "amber",
          "themeId": "theme-betrouwbaar",
          "themeIds": [
            "theme-betrouwbaar"
          ],
          "measurableResults": [
            {
              "id": "mr-toets",
              "name": "Beveiligingstoets op alle applicaties",
              "doneCriterion": "Alle achttien applicaties hebben een toets die niet ouder is dan een jaar",
              "periodYear": 2027,
              "periodQuarter": 1,
              "owner": "Daan",
              "status": "amber",
              "sourceStatus": null,
              "inTeamPlan": false,
              "monitoringText": "",
              "flaggedForDiscussion": false,
              "objectiveId": "obj-beveiliging"
            },
            {
              "id": "mr-beleid",
              "name": "Beveiligingsbeleid vastgesteld en gepubliceerd",
              "doneCriterion": "Het beleid is door de directie vastgesteld en staat op intranet",
              "periodYear": 2026,
              "periodQuarter": 1,
              "owner": "Daan",
              "status": "done",
              "sourceStatus": null,
              "inTeamPlan": false,
              "monitoringText": "Vastgesteld in het teamoverleg van juni; jaarlijks herzien.",
              "flaggedForDiscussion": false,
              "objectiveId": "obj-beveiliging"
            }
          ],
          "projects": [
            {
              "id": "prj-toetsronde",
              "name": "Toetsronde op de vier resterende applicaties",
              "description": "",
              "owner": "Daan",
              "status": "blue",
              "sourceStatus": null,
              "inTeamPlan": false,
              "monitoringText": "",
              "periodYear": 2026,
              "periodQuarter": 4,
              "measurableResultIds": [
                "mr-toets"
              ],
              "noMeasurableResultNeeded": false,
              "actions": [],
              "flaggedForDiscussion": false,
              "objectiveId": "obj-beveiliging",
              "principleIds": [
                "principle-betrouwbaar"
              ]
            },
            {
              "id": "prj-leveranciersgesprek",
              "name": "Kwartaalgesprek met leveranciers over kwetsbaarheden",
              "description": "Doorlopend afstemmingsoverleg, hoort niet bij één specifiek meetbaar resultaat.",
              "owner": "Daan",
              "status": "blue",
              "sourceStatus": null,
              "inTeamPlan": false,
              "monitoringText": "",
              "periodYear": 2026,
              "periodQuarter": 4,
              "measurableResultIds": [],
              "noMeasurableResultNeeded": true,
              "actions": [],
              "flaggedForDiscussion": false,
              "objectiveId": "obj-beveiliging"
            }
          ],
          "actions": [],
          "notes": [
            {
              "id": "note-vraag-norm",
              "text": "Geldt de norm ook voor applicaties die we alleen intern gebruiken? Navragen bij de CISO.",
              "type": "question",
              "author": "Daan",
              "createdAt": "2026-08-05",
              "updatedAt": null,
              "relatedItemId": "obj-beveiliging"
            }
          ],
          "flaggedForDiscussion": false
        }
      ]
    },
    {
      "id": "theme-data",
      "name": "Datagedreven sturen",
      "description": "We baseren keuzes op cijfers en signalen van inwoners, niet op aannames.",
      "status": "amber",
      "owner": "Joris",
      "color": "#7A5C9E",
      "flaggedForDiscussion": false,
      "objectives": [
        {
          "id": "obj-maandcijfers",
          "title": "We sturen maandelijks op gebruik en tevredenheid",
          "description": "",
          "owner": "Joris",
          "status": "green",
          "themeId": "theme-data",
          "themeIds": [
            "theme-data"
          ],
          "measurableResults": [
            {
              "id": "mr-rapportage",
              "name": "Vaste maandrapportage",
              "doneCriterion": "De rapportage komt elke maand voor de vijfde werkdag uit",
              "periodYear": 2026,
              "periodQuarter": 4,
              "owner": "Joris",
              "status": "green",
              "sourceStatus": null,
              "inTeamPlan": false,
              "monitoringText": "",
              "flaggedForDiscussion": false,
              "objectiveId": "obj-maandcijfers"
            },
            {
              "id": "mr-dashboardgebruik",
              "name": "Dashboard gebruik en tevredenheid",
              "doneCriterion": "Het dashboard staat live en elk teamlid heeft het minstens één keer in een overleg gebruikt",
              "periodYear": 2027,
              "periodQuarter": 1,
              "owner": "Fatima",
              "status": "grey",
              "sourceStatus": null,
              "inTeamPlan": false,
              "monitoringText": "Nog geen meetmethode afgesproken — bespreken in het teamoverleg.",
              "flaggedForDiscussion": false,
              "objectiveId": "obj-maandcijfers"
            }
          ],
          "projects": [
            {
              "id": "prj-dashboard",
              "name": "Eén dashboard voor gebruik en tevredenheid",
              "description": "",
              "owner": "Fatima",
              "status": "blue",
              "sourceStatus": null,
              "inTeamPlan": false,
              "monitoringText": "",
              "periodYear": 2026,
              "periodQuarter": 3,
              "measurableResultIds": [
                "mr-rapportage"
              ],
              "noMeasurableResultNeeded": false,
              "actions": [],
              "flaggedForDiscussion": false,
              "objectiveId": "obj-maandcijfers"
            }
          ],
          "actions": [],
          "notes": [
            {
              "id": "note-besluit-dashboard",
              "text": "Besloten: één gedeeld dashboard in plaats van drie losse rapportages. Fatima is eigenaar.",
              "type": "decision",
              "author": "Joris",
              "createdAt": "2026-07-02",
              "updatedAt": null,
              "relatedItemId": "prj-dashboard"
            }
          ],
          "flaggedForDiscussion": false
        },
        {
          "id": "obj-signalen",
          "title": "Klantsignalen leiden aantoonbaar tot verbeteringen",
          "description": "Raakt ook het wendbare team: signalen oppakken vraagt ruimte in de planning.",
          "owner": "Fatima",
          "status": "amber",
          "themeId": "theme-data",
          "themeIds": [
            "theme-data",
            "theme-wendbaar"
          ],
          "measurableResults": [
            {
              "id": "mr-signalen",
              "name": "Route van klantsignaal naar verbetering",
              "doneCriterion": "Elk signaal krijgt binnen twee weken een besluit en de route staat op intranet",
              "periodYear": 2026,
              "periodQuarter": 3,
              "owner": "Fatima",
              "status": "amber",
              "sourceStatus": null,
              "inTeamPlan": false,
              "monitoringText": "",
              "flaggedForDiscussion": false,
              "objectiveId": "obj-signalen"
            }
          ],
          "projects": [
            {
              "id": "prj-signaalroute",
              "name": "Vaste route van klantsignaal naar verbetering",
              "description": "",
              "owner": "Fatima",
              "status": "grey",
              "sourceStatus": null,
              "inTeamPlan": false,
              "monitoringText": "",
              "periodYear": 2026,
              "periodQuarter": 4,
              "measurableResultIds": [],
              "noMeasurableResultNeeded": false,
              "actions": [],
              "flaggedForDiscussion": false,
              "objectiveId": "obj-signalen",
              "principleIds": [
                "principle-begrijpelijk",
                "principle-bruikbaar"
              ]
            }
          ],
          "actions": [
            {
              "id": "act-signaaloverleg",
              "title": "Maandelijks signaaloverleg met het klantcontactcentrum inplannen",
              "description": "",
              "owner": "Fatima",
              "status": "amber",
              "dueDate": "2026-08-31",
              "measurableResultId": "mr-signalen",
              "flaggedForDiscussion": false,
              "objectiveId": "obj-signalen",
              "projectId": null,
              "relatedItemId": "obj-signalen"
            }
          ],
          "notes": [
            {
              "id": "note-obstakel-signalen",
              "text": "Signalen komen binnen via drie kanalen die elkaar niet kennen; dubbeltellingen zijn nu niet uit te sluiten.",
              "type": "obstacle",
              "author": "Fatima",
              "createdAt": "2026-08-31",
              "updatedAt": null,
              "relatedItemId": "mr-signalen"
            }
          ],
          "flaggedForDiscussion": false
        }
      ]
    },
    {
      "id": "theme-wendbaar",
      "name": "Wendbaar team",
      "description": "We kunnen zelf opleveren, en nieuwe collega's draaien snel mee.",
      "status": "amber",
      "owner": "Joris",
      "color": "#C98A2B",
      "flaggedForDiscussion": false,
      "objectives": [
        {
          "id": "obj-releases",
          "title": "Het team voert releases uit zonder externe inhuur",
          "description": "",
          "owner": "Ruben",
          "status": "green",
          "themeId": "theme-wendbaar",
          "themeIds": [
            "theme-wendbaar"
          ],
          "measurableResults": [
            {
              "id": "mr-releases",
              "name": "Releaseproces in eigen beheer",
              "doneCriterion": "Het team heeft drie releases achter elkaar zonder externe hulp uitgevoerd",
              "periodYear": 2026,
              "periodQuarter": 2,
              "owner": "Ruben",
              "status": "done",
              "sourceStatus": null,
              "inTeamPlan": true,
              "monitoringText": "",
              "flaggedForDiscussion": false,
              "objectiveId": "obj-releases"
            }
          ],
          "projects": [
            {
              "id": "prj-releaseproces",
              "name": "Releaseproces overnemen van de leverancier",
              "description": "",
              "owner": "Ruben",
              "status": "green",
              "sourceStatus": null,
              "inTeamPlan": true,
              "monitoringText": "",
              "periodYear": 2026,
              "periodQuarter": 2,
              "measurableResultIds": [
                "mr-releases"
              ],
              "noMeasurableResultNeeded": false,
              "actions": [
                {
                  "id": "act-draaiboek",
                  "title": "Draaiboek releases opstellen en twee keer samen doorlopen",
                  "description": "",
                  "owner": "Ruben",
                  "status": "green",
                  "dueDate": "2026-05-29",
                  "measurableResultId": null,
                  "flaggedForDiscussion": false,
                  "objectiveId": "obj-releases",
                  "projectId": "prj-releaseproces",
                  "relatedItemId": "prj-releaseproces"
                }
              ],
              "flaggedForDiscussion": false,
              "objectiveId": "obj-releases"
            }
          ],
          "actions": [],
          "notes": [
            {
              "id": "note-succes-release",
              "text": "Achtste release volledig in eigen beheer uitgevoerd. Doelwaarde gehaald.",
              "type": "success",
              "author": "Ruben",
              "createdAt": "2026-06-05",
              "updatedAt": null,
              "relatedItemId": "mr-releases"
            },
            {
              "id": "note-leren-release",
              "text": "Geleerd: het draaiboek werkte pas toen we het samen dóórliepen in plaats van alleen lazen.",
              "type": "learning",
              "author": "Ruben",
              "createdAt": "2026-06-06",
              "updatedAt": null,
              "relatedItemId": "obj-releases"
            }
          ],
          "flaggedForDiscussion": false
        },
        {
          "id": "obj-inwerken",
          "title": "Nieuwe collega's zijn binnen zes weken zelfstandig productief",
          "description": "",
          "owner": "Nienke",
          "status": "amber",
          "themeId": "theme-wendbaar",
          "themeIds": [
            "theme-wendbaar"
          ],
          "measurableResults": [
            {
              "id": "mr-inwerktijd",
              "name": "Inwerkpad voor nieuwe collega's",
              "doneCriterion": "Het inwerkpad met vaste eerste twee weken is beschreven en door twee nieuwe collega's doorlopen",
              "periodYear": 2027,
              "periodQuarter": 1,
              "owner": "Joris",
              "status": "amber",
              "sourceStatus": null,
              "inTeamPlan": false,
              "monitoringText": "",
              "flaggedForDiscussion": false,
              "objectiveId": "obj-inwerken"
            }
          ],
          "projects": [
            {
              "id": "prj-inwerkpad",
              "name": "Inwerkpad met vaste eerste twee weken",
              "description": "",
              "owner": "Joris",
              "status": "grey",
              "sourceStatus": null,
              "inTeamPlan": false,
              "monitoringText": "",
              "periodYear": 2026,
              "periodQuarter": 4,
              "measurableResultIds": [
                "mr-inwerktijd"
              ],
              "noMeasurableResultNeeded": false,
              "actions": [],
              "flaggedForDiscussion": false,
              "objectiveId": "obj-inwerken"
            }
          ],
          "actions": [],
          "notes": [
            {
              "id": "note-update-inwerken",
              "text": "Twee nieuwe collega's starten in oktober; het inwerkpad moet daarvoor staan.",
              "type": "update",
              "author": "Joris",
              "createdAt": "2026-09-04",
              "updatedAt": null,
              "relatedItemId": "obj-inwerken"
            }
          ],
          "flaggedForDiscussion": true
        }
      ]
    }
  ],
  "relations": []
};
