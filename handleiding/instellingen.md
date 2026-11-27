---
titel: Instellingen en gegevens
groep: Overleg en delen
volgorde: 4
---
**Waarom:** dezelfde woorden en dezelfde eigenaren voor iedereen maken het gesprek makkelijker. Zie [Eén eigenaar per item](pagina:obeya-methode#een-eigenaar-per-item).

Het tandwiel in de hoofdbalk opent **Instellingen**. Elk onderdeel zegt of het voor het hele bord geldt of alleen voor deze browser.

# Voor het hele bord

- **Bord:** de naam, de visie, de principes uit de visie, en het pictogram in het browsertabblad.

::: gewijzigd 2026-11-25
Het **pictogram** is standaard een neutraal Obeya-pictogram. Het pictogram van de gemeente Leiden of een eigen afbeelding kies je bij *Instellingen → Bord*.
:::
- **Eigenaren:** de lijst met mensen die eigenaar kunnen zijn, ingedeeld per rol. Met ✎ bewerk je per persoon de naam, de rollen en de GitHub-login. Wie meer rollen heeft, staat onder de eerste in de volgorde van de rollenlijst.

::: nieuw 2026-11-07
- **Rollen:** de rollen in het team, zoals Teamcoördinator en Product Owner ODV. Per rol zet je aan of die **mag bevestigen**: in het overleg wijzigingen aan de opbouw van het bord bevestigen (nieuw, verwijderd, verplaatst, omgezet). Standaard mogen dat de product owner en de teamcoördinator. Dat is een afspraak, geen beveiliging.
:::

::: gewijzigd 2026-11-26
Ben je verbonden met het team, dan bepaalt **GitHub** wie mag bevestigen: de leden van het team **bevestigers** in de organisatie van het data-repo. De vinkjes **mag bevestigen** staan dan uit; ze gelden alleen nog voor het demobord. Zo kan niemand zichzelf in de app het recht geven. Wie het databestand rechtstreeks op GitHub bewerkt, kan het nog omzeilen, maar dat staat op naam in de geschiedenis van het data-repo. Wie erin zit, regelt een eigenaar van de organisatie op GitHub. Bij *Team en opslag* zie je wie er in het team zit en of jij mag bevestigen.
:::

::: nieuw 2026-11-23
- **Groepen:** rollen die bij elkaar horen, bijvoorbeeld **Sturing** voor de senioren en de teamcoördinator. Per groep vink je de rollen aan; een rol mag in meer groepen staan. Bij **Betrokkenen** in een formulier vink je dan iedereen uit de groep in één keer aan. Een groep verwijderen haalt geen rollen en geen betrokkenen weg.
:::

- **Statuslabels:** de woorden voor elke status, per soort item.
- **Weergave van de muur:** hoe de keten in Samenhang eruitziet, zoals de kleur van de geeltjes.

::: nieuw 2026-11-11
Onder **Weergave** zet je ook **tabbladen** tijdelijk uit, voor het hele team, bijvoorbeeld een tabblad dat het team (nog) niet gebruikt. Er gaat niets verloren: zet het vinkje terug en het tabblad is er weer. Het Bord staat altijd aan. Opent iemand een uitgezet tabblad via een gedeeld adres, dan staat het zolang in de balk.
:::

::: nieuw 2026-11-27
Ook onder **Weergave**: **Rustige status op Bord en Samenhang**, standaard uit. Staat het aan, dan krijgt elke status op de kaarten een eigen symbool: ✓ Op koers, ▶ Bezig, een wit vinkje in een groen vakje voor Klaar, ▲ Aandacht nodig, ✖ Buiten koers, ? Niet beoordeeld. Bij Op koers, Bezig en Klaar staat dan alleen het symbool; bij een afwijking blijft het woord erbij. Zo vallen de afwijkingen meer op. Boven het bord staat een **Legenda**, in de kamermodus altijd open. Lijsten, het detailscherm en de muurvellen blijven zoals ze zijn, en een schermlezer leest het woord altijd voor. Of het aan gaat, besluit het team.
:::

# Alleen voor deze browser

- **Team en opslag:** de verbinding met het data-repo; zie [samenwerken](pagina:samenwerken). Bovenaan kies je **Jij bent**: wie er in deze browser werkt. Het wijzigingslog legt wijzigingen op die naam vast, en je naam staat in de teamchip rechtsboven. Kies je niets, dan herkent de app je aan je GitHub-login als die bij een persoon is ingevuld.
- **Data:** importeren, exporteren en terug naar de voorbeelddata.

# Importeren en exporteren

**Exporteren** bewaart het hele bord als JSON-bestand: alle items, notities, relaties, instellingen en het wijzigingslog. **Importeren** leest zo'n bestand weer in. De app controleert het eerst, herstelt wat oud of onvolledig is en zegt wat er is aangepast. Je huidige bord wordt pas vervangen als het inlezen gelukt is, en ook dat is [ongedaan te maken](pagina:overleg#ongedaan-maken).

Je wijzigingen blijven bewaard in deze browser, ook na herladen. Ze staan pas bij het team als je ze [deelt](pagina:samenwerken#ophalen-en-delen).
