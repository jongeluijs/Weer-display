# Weer-display voor Eindhoven

Dit project toont een fullscreen weerdashboard voor een rond 1080x1080 display op een Raspberry Pi 5. De app gebruikt de gegevens uit `.env` via de Weerlive API en is opgebouwd als een lichte Node.js server zonder externe packages.

## Wat het scherm doet

- Volledig cirkelvormige layout voor het HyperPixel/Waveshare-display
- Hoofdweergave voor vandaag met veel symbolen, grote temperatuur, waarschuwingen, zonboog en uurverwachting
- Touchvriendelijke navigatie tussen:
  - `Vandaag`
  - `Komende dagen`
  - `Afgelopen dagen`
- Historische dagen worden lokaal opgebouwd uit periodieke snapshots terwijl het display draait
- Grafieken voor temperatuur en neerslag

## Starten

1. Controleer `.env`:

   ```env
   WEERLIVE_API_KEY=...
   WEERLIVE_LOCATION=Eindhoven
   ```

2. Start de server:

   ```bash
   npm start
   ```

3. Open daarna:

   [http://localhost:3000](http://localhost:3000)

## Opmerking over historie

De view `Afgelopen dagen` gebruikt lokale snapshots uit `data/weather-history.json`. Die historie vult zich automatisch terwijl het scherm actief draait.
