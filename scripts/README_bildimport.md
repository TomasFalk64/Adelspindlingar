# Importera artbilder

Bilder importeras med `scripts/import-bilder.js`. Skriptet kopplar varje bild till en art utifrån artens svenska namn i filnamnet. Fotografens namn hämtas från mappen där bilden ligger.

## Förberedelser

Du behöver Node.js och skriptet `scripts/import-bilder.js`. Öppna en terminal i projektets rotmapp, där `index.html` finns.

Kontrollera att Node.js finns:

```powershell
node --version
```

Installera bildbiblioteket Sharp och övriga deklarerade beroenden en gång, eller efter att beroendena uppdaterats:

```powershell
npm.cmd install
```

På macOS och Linux används `npm install`. Bildbehandlingen sker lokalt på datorn; webbplatsen behöver inte Node.js eller Sharp för att visa de färdiga bilderna.

## 1. Lägg bilderna i fotografens mapp

Skapa en mapp per fotograf under `data/bilder/import/`. Använd fotografens namn som mappnamn, precis så som det ska visas på webbplatsen.

```text
data/
  bilder/
    import/
      Anna Andersson/
        Persiljespindling_1.jpg
        Persiljespindling_2.jpg
      Erik Eriksson/
        Saffranspindling_1.png
```

- Filnamnet ska innehålla artens svenska namn från `data/adelspindlingar.json`. Lägg gärna till ett nummer för flera bilder av samma art.
- Matchningen bortser från stora och små bokstäver samt diakritiska tecken, exempelvis skillnaden mellan `ä` och `a`.
- Vetenskapliga namn används inte för matchningen.
- Formaten `.jpg`, `.jpeg`, `.png` och `.webp` stöds.
- Lägg filerna direkt i fotografens mapp. Filer direkt i `import/` och bilder i ytterligare undermappar läses inte in.

Skriptet komprimerar bilderna till **WebP med kvalitet 82** och **högst 1 400 pixlar på längsta sidan**. Proportionerna behålls utan beskärning och mindre bilder förstoras inte. Bildens EXIF-orientering tillämpas så att mobilbilder visas rättvända.

Importfilen tas bort när den komprimerade bilden och bildposten har sparats. Ingen originalkopia sparas i projektet; dina original finns på annan plats. Inställningen gäller nya importer, inte redan importerade bilder.

## 2. Provkör

```powershell
node scripts/import-bilder.js --dry-run
```

Kontrollera rapporten: varje bild ska kopplas till rätt art och fotograf. Listan under `Importerade` visar i detta läge vad som skulle importeras, inklusive nytt WebP-filnamn, dimensioner och filstorlek före och efter komprimering. Provkörningen komprimerar i minnet för att kontrollera resultatet.

Provkörningen flyttar inga bilder och sparar inga ändringar i artdata. Den skapar dock mappen `data/bilder/import/` om den saknas.

## 3. Importera

När provkörningen visar rätt kopplingar:

```powershell
node scripts/import-bilder.js
```

Skriptet:

1. Sparar komprimerade WebP-bilder i `data/bilder/`, med högst 1 400 pixlar på längsta sidan.
2. Lägger till bildposter i rätt arts `bilder`-lista i `data/adelspindlingar.json`.
3. Sätter bildtexten till artens svenska namn och fotografen till mappnamnet. Licensen lämnas tom.
4. Tar bort respektive importfil först när bilden och artdata har sparats.

En bildpost kan exempelvis se ut så här:

```json
{
  "fil": "data/bilder/Persiljespindling_1.webp",
  "bildtext": "Persiljespindling",
  "fotograf": "Anna Andersson",
  "licens": ""
}
```

Du kan efteråt ändra bildtexten eller fylla i licensen i bildposten. Ange den licens som faktiskt gäller för bilden.

Om destinationsnamnet redan används får den nya filen ett extra nummer, exempelvis `Persiljespindling_1_2.webp`. Befintliga bilder skrivs inte över. Skriptet jämför inte bildinnehåll: lägger du in samma bild igen kan den importeras som en dubblett med nytt filnamn.

## 4. Kontrollera och publicera

Öppna webbplatsen och välj de berörda arterna. Kontrollera bilder, bildtexter och fotografnamn.

Publicera både:

- De nya bildfilerna i `data/bilder/`.
- Den uppdaterade `data/adelspindlingar.json`.

Om du använder Git kan du granska ändringarna med:

```powershell
git status --short
git diff -- data/adelspindlingar.json
```

Importmapparna är undantagna från Git och behöver inte publiceras.

## Om en bild inte importeras

| Rapport eller problem | Åtgärd |
| --- | --- |
| `ingen matchande art` | Kontrollera att filnamnet innehåller artens svenska namn såsom det står i artdata. |
| `flera möjliga arter` | Kontrollera artnamnen i artdata och använd ett entydigt filnamn. |
| `inte en stödd bildfil` | Exportera bilden som JPG, PNG eller WebP. Att bara byta filändelse konverterar inte bilden. |
| `kunde inte komprimeras` | Kontrollera att bildfilen går att öppna och exportera den på nytt vid behov. Importfilen lämnas kvar. |
| `Cannot find module 'sharp'` | Kör `npm.cmd install` i projektets rotmapp. |
| Bilden nämns inte i rapporten | Kontrollera att den ligger direkt i en fotografmapp under `data/bilder/import/`. |
| `Importerade: inga` | Kontrollera mappstrukturen. Redan importerade filer har flyttats från importmappen. |
| Skriptet hittas inte | Kontrollera att terminalen står i projektets rotmapp och att `scripts/import-bilder.js` finns lokalt. |

Bilder som hoppas över lämnas kvar i importmappen. Rätta problemet och provkör igen.
