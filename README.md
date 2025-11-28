# Visual Analysis of El Niño and La Niña

An interactive set of D3 visualizations showing global sea surface temperature anomalies (SST), the ENSO timeline (ONI), and country-level indicators (temperature, rainfall, GDP growth, fishing). The site is intended for exploration and teaching: inspect how El Niño and La Niña episodes relate to climate and socio-economic variables.

**Live preview**: open the site locally (see Quickstart).

**Key visual components**
- **World map (`map.html`)**: SST contours over the ocean plus choropleth and point layers for country-level variables.
- **ENSO timeline (`timeline-chart`)**: monthly ONI markers and event controls that drive the map view.
- **Scatterplot (`scatterplot.html`)**: comparative analysis between variables.

**Quickstart (Windows / PowerShell)**

1. Create and activate a virtual environment:

```powershell
python -m venv venv
.\\venv\\Scripts\\Activate.ps1
```

2. Install the minimal Python dependency (for the simple local server):

```powershell
pip install livereload
```

3. Start the local dev server (serves at http://localhost:8000):

```powershell
python serve.py
```

4. Open `http://localhost:8000/map.html` (World Map) or `http://localhost:8000/scatterplot.html` (Scatterplot + Timeline)

Project structure (high level)
- `scripts/` : D3 code (`world-map.js`, `timeline.js`, `scatter-plot.js`, `main.js`)
- `styles/`  : CSS (`main.css`)
- `python_scripts/data/` : prepared CSV / JSON data used by the site
- `data/` : raw and processed datasets shipped with the project
- `map.html`, `scatterplot.html`, `index.html` : pages

Datasets used
- Sea Surface Temperature (SST): gridded monthly SST fields used to render warm/cold anomalies.
- ONI / ENSO Index (ONI): monthly index used to classify El Niño / La Niña events and drive the timeline.
- Country data: national temperature, rainfall, GDP growth (World Bank API), and fisheries production (FAO-like CSV) aggregated to yearly or monthly series.

Data sources & provenance
- Sea Surface Temperature (SST): NOAA/PSL gridded SST resources — https://psl.noaa.gov
- ONI / ENSO Index (ONI): official ONI dataset used for event classification — https://psl.noaa.gov/data/correlation/oni.data
- Reanalysis / national temperature: ERA5 monthly means (Copernicus) — https://cds.climate.copernicus.eu/datasets/reanalysis-era5-single-levels-monthly-means?tab=overview
- Precipitation: GPCC full data monthly v2022 (DWD) — https://opendata.dwd.de/climate_environment/GPCC/html/fulldata-monthly_v2022_doi_download.html
- GDP / socio-economic indicators: World Bank Open Data — https://data.worldbank.org/
- Fisheries / capture quantities: FAO fisheries statistics — https://www.fao.org/fishery/statistics-query/en/capture/capture_quantity

Data processing & algorithms
- Standardized datasets to yearly/monthly timelines and aggregated missing values using nearest-neighbour backfill for gridded SST.
- Country-level time series are matched to map features using ISO codes, UN codes, and a normalization map to handle naming mismatches (`COUNTRY_NAME_MAPPING` in `world-map.js`).
- SST is upscaled and contoured using `d3.contours()` for smooth ocean coloring.

Visualization choices
- SST color ramp (blue → white → red) follows the common warm/cold convention for El Niño / La Niña.
- Choropleth and proportional symbols are used for country-level variables (area ~ value for fishing points).
- Timeline markers highlight strong/very-strong ENSO episodes; clicking or scrubbing the timeline updates the map.

Developer notes & tips
- Default initial dataset: the map initially loads the `temperature` dataset by default (`scripts/world-map.js`, `initialKey = 'temperature'`).
- Default year selection: `switchToDataset()` chooses a target year with the last available year from the dataset (`meta.years.at(-1)`). 

- Prefer robust fix (recommended): add a `PREFERRED_START_YEAR` constant and prefer it when available. See `switchToDataset()` in `world-map.js`.

- Timeline ↔ Map interaction: `scripts/main.js` calls `createWorldMap()` and `createTimelineScale(true)` (map page). The timeline will invoke `globalThis.updateMapMonth()` or `globalThis.updateMapYear()` when scrubbing/clicking; these functions are provided by `world-map.js` as `globalThis.updateMapMonth`.

- Browser compatibility: SST compressed JSON is decompressed using the browser `DecompressionStream('gzip')` API in `world-map.js`. This requires a modern browser and secure context (HTTPS or localhost). If older browsers are needed, pre-decompress or serve the uncompressed JSON.

- World Bank GDP requests: `loadGDPData()` uses the World Bank API; network rate limits or CORS may affect loading. The code falls back gracefully if a dataset fails to load.

Helpful file locations
- Main entry: `scripts/main.js`
- Map code: `scripts/world-map.js`
- Timeline code: `scripts/timeline.js`
- Timeline data: `python_scripts/data/oni_monthly.csv`
- Fishing, rainfall, temperature: `python_scripts/data/` (various CSV/JSON)

Local development suggestions
- Recompress / prepare SST JSON only if needed (you can gzip in your OS). The app supports both compressed `.gz` and uncompressed files.
- When making JS changes, refresh the browser or use the dev server auto-reload; sometimes the livereload watcher may not pick up all changes — restart the server if a script change doesn't appear.

Known issues & caveats
- `DecompressionStream('gzip')` is not available in all browsers. If users report SST not loading, try serving the uncompressed `global_sst.json`.
- Some datasets use different year ranges (e.g., GDP may end earlier than 2024), causing the map to start on the dataset's latest year.

Contributing
- Fork, create a branch, and open a PR. Describe data changes and include data processing scripts for reproducibility.

License
- See the `LICENSE` file included in the repo.

Credits
- Data sources: NOAA/PSL SST, World Bank, FAO fisheries, national climate datasets (links referenced in `about.html`).
