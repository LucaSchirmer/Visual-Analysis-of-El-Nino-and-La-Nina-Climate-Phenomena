const CHART_CONFIG = {
  dimensions: {
    totalWidth: 900,
    totalHeight: 600,
    margin: { top: 40, right: 150, bottom: 60, left: 80 }
  },
  style: {
    circleRadius: 5,
    circleOpacity: 0.6,
    circleStroke: "white",
    circleStrokeWidth: 1,
    axisColor: "#333",
    gridColor: "#e0e0e0"
  },
  selectors: {
    container: "#scatterplot-chart"
  },
  colors: {
    elNino: "#e74c3c",      // Red for El Niño
    laNina: "#3498db",      // Blue for La Niña
    neutral: "#95a5a6",     // Gray for neutral period
    highlight: "#f39c12"    // Orange for highlight
  }
};

const countryGroups = {
  "Negatively Affected by El Niño (Fisheries)": [
    "Peru", "Ecuador", "Chile", "Colombia",
    "Mexico", "United States",
    "Indonesia", "Papua New Guinea"
  ],

  "Positively Affected by La Niña (Fisheries)": [
    "Peru", "Ecuador", "Chile",
    "Mexico", "United States"
  ],

  "Negatively Affected by La Niña (Fisheries)": [
    "Indonesia", "Philippines", "Malaysia",
    "Papua New Guinea"
  ],

  // Would be useful if we look at vegetation/agriculture

  // "Negatively Affected by El Niño": [
  //   "Peru", "Ecuador", "Colombia", "Chile", // South America west coast
  //   "Australia", "Papua New Guinea", "Indonesia", // Oceania often sees droughts
  //   "India", "Sri Lanka" // South Asia can experience monsoon disruptions
  // ],

  // "Positively Affected by El Niño": [
  //   "United States", "Mexico", "Canada", // Southwest North America often wetter
  //   "Philippines", "Vietnam", "Thailand", // Some Southeast Asia areas
  //   "Argentina", "Brazil" // Some parts of South America receive more rainfall
  // ],

  // "Negatively Affected by La Niña": [
  //   "Brazil", "Argentina", "Uruguay", // South America wetter areas disrupted
  //   "Malaysia", "Singapore", "Indonesia", // Southeast Asia heavy rain/floods
  //   "United States (Gulf Coast, Southeast)" // Some U.S. regions see more hurricanes/floods
  // ],

  // "Positively Affected by La Niña": [
  //   "Australia", "Papua New Guinea", "New Zealand", // More rain, better crops
  //   "Russia (Far East)", "China (north east)", // Some parts of Asia
  //   "Peru", "Ecuador", "Colombia" // Some west coast South America may improve fishery
  // ]
};



// Store original data globally
let ORIGINAL_DATA = null;
let YEAR_DOMAIN = null;   // { min: min_year, max: max_year }
let CURRENT_YEAR = null;
// GDP year coverage (computed after loading GDP data)
let GDP_YEAR_RANGE = { min: null, max: null };

// Helper: canonicalize year keys used in rollups (returns a string 'YYYY')
const yearKeyFromRow = (d) => {
  if (!d) return String(NaN);
  if (d.year !== undefined && d.year !== null && d.year !== "") return String(+d.year);
  if (d.time) return String(new Date(d.time).getFullYear());
  return String(NaN);
};

// Normalize a country/name/key to a compact form for matching (lowercase, spaces collapsed)
const normalizeKey = (s) => {
  if (!s && s !== 0) return '';
  try {
    return String(s).toLowerCase().replace(/\s+/g, ' ').trim();
  } catch (e) { return String(s || '').toLowerCase(); }
};

// Country name mapping (variants -> World Bank / canonical forms)
const COUNTRY_NAME_MAPPING = {
    "United States of America": "United States",
    "Russia": "Russian Federation",
    "Dem. Rep. Congo": "Congo, Dem. Rep.",
    "Congo": "Congo, Rep.",
    "Vietnam": "Viet Nam",
    "Venezuela": "Venezuela, RB",
    "Iran": "Iran, Islamic Rep.",
    "South Korea": "Korea, Rep.",
    "North Korea": "Korea, Dem. People's Rep.",
    "Syria": "Syrian Arab Republic",
    "Turkey": "Turkiye",
    "Laos": "Lao PDR",
    "Kyrgyzstan": "Kyrgyz Republic",
    "Slovakia": "Slovak Republic",
    "Egypt": "Egypt, Arab Rep.",
    "Yemen": "Yemen, Rep.",
    "Gambia": "Gambia, The",
    "Bahamas": "Bahamas, The",
    "Dominican Rep.": "Dominican Republic",
    "Central African Rep.": "Central African Republic",
    "Eq. Guinea": "Equatorial Guinea",
    "Côte d'Ivoire": "Cote d'Ivoire",
    "Bosnia and Herz.": "Bosnia and Herzegovina",
    "Macedonia": "North Macedonia",
    "S. Sudan": "South Sudan",
    "Eritrea": "Eritrea",
    "Brunei": "Brunei Darussalam",
    "Solomon Is.": "Solomon Islands",
    "New Caledonia": "New Caledonia",
    "Puerto Rico": "Puerto Rico",
    "West Bank and Gaza": "Palestine"
};

// Helper: fetch and (if needed) decompress a .gz file, with graceful fallbacks.
const fetchAndDecompress = async (url) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  const contentEncoding = (response.headers.get('content-encoding') || '').toLowerCase();
  const contentType = (response.headers.get('content-type') || '').toLowerCase();

  // If the server used Content-Encoding: gzip the browser already decompressed it.
  if (contentEncoding.includes('gzip') || (!contentType.includes('application/gzip') && !url.endsWith('.gz'))) {
    return await response.text();
  }

  // If DecompressionStream is not available, try reading text (may fail for raw .gz)
  if (typeof DecompressionStream === 'undefined') {
    try { return await response.text(); }
    catch (err) { throw new Error('DecompressionStream not available and response is gzipped. Serve plain CSV or enable server-side decompression.'); }
  }

  // Try streaming decompress; if it fails let the error propagate to the caller
  const ds = new DecompressionStream('gzip');
  const decompressedStream = response.body.pipeThrough(ds);
  return await new Response(decompressedStream).text();
};

// Smart CSV loader: if URL ends with .gz, decompress and parse; otherwise use d3.csv
const loadCsvSmart = async (url) => {
  // Attempt to load compressed CSV when requested, with a plain CSV fallback.
  // If the caller passed a .gz URL, try it first, otherwise use d3.csv directly
  if (url.endsWith('.gz')) {
    const text = await fetchAndDecompress(url);
    return d3.csvParse(text);
  }

  // Not a .gz URL: use normal d3.csv (it returns a promise)
  return d3.csv(url);
};

// Available variables for axes (you can add more)
const VARIABLES = {
  temperature: {
    id: "temperature",
    label: "Average Temperature (°C)",
    accessor: d => d.temperature,
    unit: "°C",
    format: v => v.toFixed(1)
  },
  rainfall: {
    id: "rainfall",
    label: "Average Precipitation (mm)",
    accessor: d => d.rainfall,
    unit: " mm",
    format: v => v.toFixed(0)
  },
  gdpGrowth: {
    id: "gdpGrowth",
    label: "GDP Growth (%)",
    accessor: d => d.gdpGrowth,
    unit: " %",
    format: v => v.toFixed(2)
  },
  fishing: {
    id: "fishing",
    label: "Fishing Catches (tonnes)",
    accessor: d => d.fishing,
    unit: " t",
    format: v => v == null ? "NA" : v.toFixed(0)
  },
  oni: {
    id: "oni",
    label: "ONI Index (annual average)",
    accessor: d => d.oni,
    unit: "",
    format: v => v == null ? "NA" : v.toFixed(2)
  }
};

let CURRENT_X_VAR = "temperature";
let CURRENT_Y_VAR = "rainfall";

// Helper to safely format variable values for tooltips (returns 'NA' when missing)
const formatVarValue = (variable, row) => {
  try {
    const v = variable.accessor(row);
    if (v === null || v === undefined || Number.isNaN(+v)) return 'NA';
    return `${variable.format(+v)}${variable.unit}`;
  } catch (e) { return 'NA'; }
};

// ==========================================
// MAIN FUNCTION: CREATE SCATTER PLOT
// ==========================================
const createScatterPlot = async (config = CHART_CONFIG) => {
  try {
    const [rainfallData, temperatureData, fishingData, oniData] = await Promise.all([
      loadCsvSmart("python_scripts/data/rainfall_by_country.csv.gz"),
      loadCsvSmart("python_scripts/data/temperature_by_country.csv.gz"),
      d3.csv("python_scripts/data/fishing_by_country_year.csv"),
      d3.csv("python_scripts/data/oni_monthly.csv"),
    ]);

    // Deduce country identifiers for GDP API: prefer `country_iso3`, then `abbrev` (ISO2), then country name
    const countryIds = [...new Map(rainfallData.map(d => {
      const id = (d.country_iso3 || d.abbrev || d.country_name || '').toString().trim();
      return [id || d.country_name, { id }];
    })).values()].map(o => o.id).filter(Boolean);

    let gdpData = await loadGDPData(countryIds, 1980, 2024);

    try { window._scatter_gdp_raw = gdpData; } catch (e) {}
    // If the targeted per-country fetch returned nothing, try the project's global loader (data-processing.js)
    if ((!gdpData || gdpData.length === 0) && typeof window.loadGDPData === 'function') {
      // per-country GDP fetch fallback suppressed
      try {
        const alt = await window.loadGDPData();
        if (alt && alt.length) {
          gdpData = alt.map(d => ({ country: d.countryCode || d.country || '', year: d.year, gdpGrowth: d.gdpGrowth ?? d.value ?? d.gdp }));
          try { window._scatter_gdp_fallback = gdpData; } catch (e) {}
          // fallback gdpData length suppressed
        }
      } catch (err) {
        // global loadGDPData failed (suppressed)
      }
    }

    // Compute GDP year coverage (if available)
    if (gdpData && gdpData.length) {
      const yrs = gdpData.map(d => +d.year).filter(y => !Number.isNaN(y));
      if (yrs.length) {
        GDP_YEAR_RANGE.min = d3.min(yrs);
        GDP_YEAR_RANGE.max = d3.max(yrs);
      }
      // GDP years range computed (suppressed)
    }
    
    let climateData = processClimateData(rainfallData, temperatureData, fishingData, oniData);
    ORIGINAL_DATA = integrateGDPIntoData(climateData, gdpData);

    const years = ORIGINAL_DATA.map(d => d.year);
    YEAR_DOMAIN = { 
      min: d3.min(years),
      max: d3.max(years)
    };
    CURRENT_YEAR = YEAR_DOMAIN.max;

    setupVisualization(config);
    updateCountryOptions(ORIGINAL_DATA);
    attachEventListeners(config);

    globalThis.updateMapYear = (year) => {
      CURRENT_YEAR = year;
      applyFilters(config);
    };
    // Ensure multi-select has 'all' selected on initial load
    const selNode = d3.select('#country-filter').node();
    if (selNode) { for (const opt of selNode.options) opt.selected = opt.value === 'all'; }
    try { renderSelectedCountryChips(); } catch(e) {}
    applyFilters(config);
  } catch (error) {
    showError(config.selectors.container, error.message);
  }
};

// ==========================================
// DATA PROCESSING
// ==========================================
const loadGDPData = async (countries, startYear, endYear) => {
  const promises = countries.map(async (country) => {
    const tryCodes = [country];
    // If user passed a 3-letter code, also try the first 2 letters (World Bank often uses ISO2)
    if (country && country.length === 3) tryCodes.push(country.slice(0,2));

    for (const code of tryCodes) {
      try {
        const url = `https://api.worldbank.org/v2/country/${code}/indicator/NY.GDP.MKTP.KD.ZG?date=${startYear}:${endYear}&format=json&per_page=1000`;
        const res = await fetch(url);
        const data = await res.json();
        if (!data || !data[1]) continue;
        return data[1].map(item => ({
          // include both the code used for the request and the World Bank's country name
          countryCode: (code || '').toString().toUpperCase(),
          countryName: item.country && item.country.value ? item.country.value : '',
          // keep `country` as the returned name when available to help name-based matching
          country: (item.country && item.country.value) ? item.country.value : (code || '').toString().toUpperCase(),
          year: item.date ? +item.date : null,
          gdpGrowth: item.value != null ? +item.value : null
        })).filter(d => d.year && d.gdpGrowth !== null);
      } catch (err) {
        // try next code
        continue;
      }
    }
    // If all attempts failed, return empty
    return [];
  });
  const results = await Promise.all(promises);
  const combined = results.flat();
  return combined;
};

const integrateGDPIntoData = (originalData, gdpData) => {
  // Build a map: multiple KEY_FORMS -> Map(year -> gdpGrowth)
  const gdpByCountry = new Map();
  gdpData.forEach(d => {
    const year = +d.year;
    const value = d.gdpGrowth ?? d.value ?? d.gdpGrowth;

    // Candidate key forms: provided country field (could be code or name), countryCode if present, normalized name
    const rawCountry = (d.country || d.countryName || d.country_code || d.countryCode || '').toString();
    const up = rawCountry.toUpperCase().trim();
    const norm = normalizeKey(rawCountry);

    const keys = new Set([up, norm]);
    // if looks like ISO3 add its ISO2 variant as well
    if (up && up.length === 3) keys.add(up.slice(0,2));

    for (const k of keys) {
      if (!k) continue;
      if (!gdpByCountry.has(k)) gdpByCountry.set(k, new Map());
      gdpByCountry.get(k).set(year, value);
    }
  });

  const fallbackYears = 2; // search +-2 years for nearest available GDP if exact year missing
  let attached = 0;
  let missing = 0;
  // build normalized mapping for quick lookup (variant -> canonical)
  const nameMap = {};
  try {
    Object.keys(COUNTRY_NAME_MAPPING).forEach(k => {
      const nk = normalizeKey(k);
      const tv = COUNTRY_NAME_MAPPING[k];
      nameMap[nk] = normalizeKey(tv);
    });
  } catch (e) {}

  const out = originalData.map(row => {
    const year = +row.year;
    let gdp = null;

    // Build candidate lookup keys: various codes and normalized names
    const candidates = [];
    if (row.abbrev) candidates.push(row.abbrev.toString().toUpperCase().trim());
    if (row.country_iso3) candidates.push(row.country_iso3.toString().toUpperCase().trim());
    if (row.country) candidates.push(row.country.toString().toUpperCase().trim());
    if (row.country_name) candidates.push(row.country_name.toString().toUpperCase().trim());
    // normalized forms
    if (row.country) candidates.push(normalizeKey(row.country));
    if (row.country_name) candidates.push(normalizeKey(row.country_name));

    let countryMap = null;
    // Try several lookup strategies: direct key, normalized key, mapping variants, reverse mapping
    outer: for (const ckey of candidates) {
      if (!ckey) continue;
      // direct match (may be uppercase code or name)
      if (gdpByCountry.has(ckey)) { countryMap = gdpByCountry.get(ckey); break; }

      const normC = normalizeKey(ckey);
      // normalized match
      if (gdpByCountry.has(normC)) { countryMap = gdpByCountry.get(normC); break; }

      // try mapped canonical name (variant -> canonical)
      const mapped = nameMap[normC];
      if (mapped) {
        if (gdpByCountry.has(mapped)) { countryMap = gdpByCountry.get(mapped); break; }
        const mappedUp = mapped.toUpperCase();
        if (gdpByCountry.has(mappedUp)) { countryMap = gdpByCountry.get(mappedUp); break; }
      }

      // reverse: if some mapping maps TO this normalized candidate, try that source key
      for (const [srcNorm, tgtNorm] of Object.entries(nameMap)) {
        if (tgtNorm === normC) {
          if (gdpByCountry.has(srcNorm)) { countryMap = gdpByCountry.get(srcNorm); break outer; }
          const srcUp = srcNorm.toUpperCase();
          if (gdpByCountry.has(srcUp)) { countryMap = gdpByCountry.get(srcUp); break outer; }
        }
      }
    }
    if (countryMap) {
      if (countryMap.has(year)) {
        gdp = countryMap.get(year);
      } else {
        // Try nearby years (previous first, then forward)
        for (let off = 1; off <= fallbackYears; off++) {
          if (countryMap.has(year - off)) { gdp = countryMap.get(year - off); break; }
          if (countryMap.has(year + off)) { gdp = countryMap.get(year + off); break; }
        }
      }
    }

    if (gdp != null) attached++; else missing++;

    return {
      ...row,
      gdpGrowth: gdp ?? null
    };
  });

  // Helpful debug logging for matching quality
  try {
    console.log('[scatter-plot] integrateGDPIntoData: total rows =', originalData.length, 'attached GDP =', attached, 'missing GDP =', missing);
    const withGdp = out.filter(d => d.gdpGrowth != null).slice(0,10);
    const withoutGdp = out.filter(d => d.gdpGrowth == null).slice(0,10);
    console.log('[scatter-plot] sample rows WITH GDP:', withGdp);
    console.log('[scatter-plot] sample rows WITHOUT GDP:', withoutGdp);
  } catch (e) {}

  return out;
}

const processClimateData = (rainfallData, temperatureData, fishingData, oniData) => {  
  // Aggregate precipitation by country and year
  const rainfallByCountry = d3.rollup(
    rainfallData,
    v => d3.mean(v, d => +d.rainfall_mm),
    d => d.country_name,
    d => yearKeyFromRow(d)
  );
  
  // Aggregate temperatures by country and year
  const tempByCountry = d3.rollup(
    temperatureData,
    v => d3.mean(v, d => +d.temperature_celsius),
    d => d.country_name,
    d => yearKeyFromRow(d)
  );
  
  //  Fishing by country + year (tonnes) 
  const fishingByCountryYear = d3.rollup(
    fishingData,
    v => d3.sum(v, d => +d.total_tonnes),
    d => d.country_name,
    d => yearKeyFromRow(d)
  );

  //  Annual ONI (global, not by country) 
  const intensityRank = {
    "Neutral": 0,
    "Weak": 1,
    "Moderate": 2,
    "Strong": 3,
    "Very Strong": 4
  };

  const oniByYear = d3.rollup(
    oniData,
    v => {
      // Annual continuous average (for potential X/Y axis)
      const meanOni = d3.mean(v, d => +d.oni);

      // Count monthly phases in the year
      const phaseCounts = d3.rollup(
        v,
        vv => vv.length,
        d => d.phase  // values from CSV: "El Niño", "La Niña", "Neutral"
      );

      const elCount   = (phaseCounts.get("El Niño") || 0) + (phaseCounts.get("El Nino") || 0);
      const laCount   = (phaseCounts.get("La Niña") || 0) + (phaseCounts.get("La Nina") || 0);
      const neutralCt = phaseCounts.get("Neutral") || 0;

      let phase = "Neutral";

      if (elCount > laCount && elCount > 0) {
        phase = "El Niño";
      } else if (laCount > elCount && laCount > 0) {
        phase = "La Niña";
      } else if ((elCount === laCount) && (elCount > 0)) {
        // Tie: break with mean sign
        phase = meanOni >= 0 ? "El Niño" : "La Niña";
      } else if (neutralCt > 0) {
        phase = "Neutral";
      }

      // Annual intensity = strongest monthly intensity
      let bestIntensity = "Neutral";
      let bestRank = 0;
      v.forEach(row => {
        const lab = row.intensity || "Neutral";
        const r = intensityRank[lab] ?? 0;
        if (r > bestRank) {
          bestRank = r;
          bestIntensity = lab;
        }
      });

      return {
        meanOni,
        phase,
        intensity: bestIntensity
      };
    },
    // Use string keys for years to match other rollups
    d => String(+d.year)
  );

  //  Combine everything 
  const combined = [];

  rainfallByCountry.forEach((yearData, country) => {
    yearData.forEach((rainfall, year) => {
      const tempData = tempByCountry.get(country);
      if (!tempData || !tempData.has(year)) return;
      const temperature = tempData.get(year);

      // Filter out some aberrant values
      if (!(temperature > 0 && temperature < 50 && rainfall > 0 && rainfall < 500)) {
        return;
      }

      // Fishing for this country/year (can be undefined)
      let fishing = null;
      const fishingYears = fishingByCountryYear.get(country);
      if (fishingYears && fishingYears.has(year)) {
        fishing = fishingYears.get(year);
      }

      // Global ONI for this year
      const oniInfo = oniByYear.get(year);
      let phase = determineClimatePhase(year); // fallback if no ONI
      let oni = null;
      let oniPhase = null;
      let oniIntensity = null;

      if (oniInfo) {
        oni = oniInfo.meanOni;
        oniPhase = oniInfo.phase;
        oniIntensity = oniInfo.intensity;
        phase = oniInfo.phase; // align the "phase" used for ENSO color
      }

      combined.push({
        country,
        year: +year,
        rainfall,
        temperature,
        fishing,
        oni,
        oniPhase,
        oniIntensity,
        phase   // used later for color (El Niño / La Niña / Neutral)
      });
    });
  });

  return combined;
};

// Determine climate phase based on year
const determineClimatePhase = (year) => {
  // Known El Niño years
  const elNinoYears = [1982, 1983, 1987, 1991, 1992, 1997, 1998, 2002, 2003, 
                       2009, 2010, 2015, 2016, 2018, 2019, 2023];
  
  // Known La Niña years
  const laNinaYears = [1988, 1989, 1998, 1999, 2000, 2007, 2008, 2010, 2011, 
                       2020, 2021, 2022];
  
  if (elNinoYears.includes(year)) return "El Niño";
  if (laNinaYears.includes(year)) return "La Niña";
  return "Neutral";
};

// ==========================================
// VISUALIZATION SETUP (ONCE ONLY)
// ==========================================
const setupVisualization = (config) => {
  const container = d3.select(config.selectors.container);
  
  // Clean completely
  container.selectAll("*").remove();
  
  // 1. CREATE CONTROLS (FIRST)
  const controlsDiv = container.append("div")
    .attr("id", "scatter-controls")
    .style("margin-bottom", "20px")
    .style("padding", "15px")
    .style("background-color", "#f8f9fa")
    .style("border-radius", "5px")
    .style("display", "flex")
    .style("gap", "15px")
    .style("align-items", "center")
    .style("flex-wrap", "wrap");
  
  // Country filter
  controlsDiv.append("label")
    .style("font-weight", "600")
    .text("Filter by country:");
  
  const countrySelect = controlsDiv.append("select")
    .attr("id", "country-filter")
    .attr("multiple", true)
    .attr("size", 8)
    .style("padding", "5px 10px")
    .style("border", "1px solid #ccc")
    .style("border-radius", "3px");
  
  countrySelect.append("option")
    .attr("value", "all")
    .text("All countries");
  
  // Phase filter
  controlsDiv.append("label")
    .style("font-weight", "600")
    .style("margin-left", "20px")
    .text("Filter by phase:");
  
  const phaseSelect = controlsDiv.append("select")
    .attr("id", "phase-filter")
    .style("padding", "5px 10px")
    .style("border", "1px solid #ccc")
    .style("border-radius", "3px");
  
  ["All", "El Niño", "La Niña", "Neutral"].forEach(phase => {
    phaseSelect.append("option")
      .attr("value", phase)
      .text(phase);
  });
  
  // Reset button
  controlsDiv.append("button")
    .attr("id", "reset-button")
    .style("padding", "5px 15px")
    .style("background-color", "#007bff")
    .style("color", "white")
    .style("border", "none")
    .style("border-radius", "3px")
    .style("cursor", "pointer")
    .style("margin-left", "20px")
    .text("Reset");
  
    // 2. CREATE SVG CONTAINER (AFTER CONTROLS)
    container.append("div")
    .attr("id", "scatter-svg-container");

    // 2c. CONTAINER FOR COUNTRY COMPARISONS (SMALL MULTIPLES)
    container.append("div")
      .attr("id", "country-comparison-container")
      .style("margin-top", "20px")
      .style("display", "flex")
      .style("gap", "15px")
      .style("flex-wrap", "wrap");
  
  // 3. CREATE TOOLTIP (AFTER EVERYTHING)
  container.append("div")
    .attr("id", "scatter-tooltip")
    .style("position", "absolute")
    .style("visibility", "hidden")
    .style("background-color", "rgba(0, 0, 0, 0.8)")
    .style("color", "white")
    .style("padding", "10px")
    .style("border-radius", "5px")
    .style("font-size", "12px")
    .style("pointer-events", "none")
    .style("z-index", "1000");

  // === NEW CONTROLS FOR AXES ===
  const axisControls = controlsDiv.append("div")
    .style("display", "flex")
    .style("align-items", "center")
    .style("gap", "10px");

  // Label X
  axisControls.append("label")
    .style("font-weight", "600")
    .text("X Axis:");

  // Select X
  const xSelect = axisControls.append("select")
    .attr("id", "x-axis-variable")
    .style("padding", "5px 10px")
    .style("border", "1px solid #ccc")
    .style("border-radius", "3px");

  // Label Y
  axisControls.append("label")
    .style("font-weight", "600")
    .text("Y Axis:");

  // Select Y
  const ySelect = axisControls.append("select")
    .attr("id", "y-axis-variable")
    .style("padding", "5px 10px")
    .style("border", "1px solid #ccc")
    .style("border-radius", "3px");

  // Fill options from VARIABLES
  Object.values(VARIABLES).forEach(v => {
    xSelect.append("option")
      .attr("value", v.id)
      .text(v.label);

    ySelect.append("option")
      .attr("value", v.id)
      .text(v.label);
  });

  // Default values
  xSelect.property("value", CURRENT_X_VAR);
  ySelect.property("value", CURRENT_Y_VAR);
};

// ==========================================
// UPDATE CHART (CAN BE CALLED MULTIPLE TIMES)
// ==========================================
const updateScatterPlot = (data, config) => {
  const { totalWidth, totalHeight, margin } = config.dimensions;
  const { circleRadius, circleOpacity, circleStroke, circleStrokeWidth } = config.style;
  const { colors } = config;
  
  const xVar = VARIABLES[CURRENT_X_VAR];
  const yVar = VARIABLES[CURRENT_Y_VAR];

  // Inner dimensions
  const innerWidth = totalWidth - margin.left - margin.right;
  const innerHeight = totalHeight - margin.top - margin.bottom;
  
  // Select SVG container (not main container)
  const svgContainer = d3.select("#scatter-svg-container");
  svgContainer.selectAll("*").remove();
  
  // Create SVG
  const svg = svgContainer
    .append("svg")
    .attr("width", totalWidth)
    .attr("height", totalHeight);
  
  const g = svg.append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);
  
  const cleanX = data.filter(d => {
    const v = xVar.accessor(d);
    return v != null && !Number.isNaN(v);
  });
  const cleanY = data.filter(d => {
    const v = yVar.accessor(d);
    return v != null && !Number.isNaN(v);
  });

  // Only plot rows that have numeric values for both selected axes
  const cleanBoth = data.filter(d => {
    const xv = xVar.accessor(d);
    const yv = yVar.accessor(d);
    return xv != null && !Number.isNaN(+xv) && yv != null && !Number.isNaN(+yv);
  });

  if (!cleanBoth.length) {
    // nothing to draw for the currently selected axes
    return;
  }

  const xExtent = d3.extent(cleanBoth, xVar.accessor);
  const yExtent = d3.extent(cleanBoth, yVar.accessor);

  const xScale = d3.scaleLinear()
    .domain([xExtent[0] * 0.95, xExtent[1] * 1.05])
    .range([0, innerWidth])
    .nice();

  const yScale = d3.scaleLinear()
    .domain([yExtent[0] * 0.95, yExtent[1] * 1.05])
    .range([innerHeight, 0])
    .nice();
  
  // Color scale by phase
  const colorScale = d3.scaleOrdinal()
    .domain(["El Niño", "La Niña", "Neutral"])
    .range([colors.elNino, colors.laNina, colors.neutral]);
  
  // Grid
  g.append("g")
    .attr("class", "grid")
    .attr("transform", `translate(0,${innerHeight})`)
    .call(d3.axisBottom(xScale).tickSize(-innerHeight).tickFormat(""))
    .style("stroke-dasharray", "3,3")
    .style("stroke", config.style.gridColor)
    .style("stroke-opacity", 0.5);
  
  g.append("g")
    .attr("class", "grid")
    .call(d3.axisLeft(yScale).tickSize(-innerWidth).tickFormat(""))
    .style("stroke-dasharray", "3,3")
    .style("stroke", config.style.gridColor)
    .style("stroke-opacity", 0.5);
  
  // Axes
  g.append("g")
    .attr("class", "x-axis")
    .attr("transform", `translate(0,${innerHeight})`)
    .call(d3.axisBottom(xScale))
    .style("font-size", "12px");
  
  g.append("g")
    .attr("class", "y-axis")
    .call(d3.axisLeft(yScale))
    .style("font-size", "12px");
  
  // Axis labels
  svg.append("text")
    .attr("x", totalWidth / 2)
    .attr("y", totalHeight - 10)
    .style("text-anchor", "middle")
    .style("font-size", "14px")
    .style("font-weight", "600")
    .text(xVar.label);
  
  svg.append("text")
    .attr("transform", "rotate(-90)")
    .attr("x", -totalHeight / 2)
    .attr("y", 20)
    .style("text-anchor", "middle")
    .style("font-size", "14px")
    .style("font-weight", "600")
    .text(yVar.label);
  
  // Title
  svg.append("text")
    .attr("x", totalWidth / 2)
    .attr("y", 20)
    .style("text-anchor", "middle")
    .style("font-size", "18px")
    .style("font-weight", "bold")
    .text(`Correlation ${xVar.label} – ${yVar.label} by climate phase`);
  
  // Tooltip
  const tooltip = d3.select("#scatter-tooltip");
  
  // Points
  const circles = g.selectAll("circle")
    .data(cleanBoth)
    .join("circle")
    .attr("cx", d => xScale(xVar.accessor(d)))
    .attr("cy", d => yScale(yVar.accessor(d)))
    .attr("r", 0)
    .style("fill", d => colorScale(d.phase))
    .style("opacity", circleOpacity)
    .style("stroke", circleStroke)
    .style("stroke-width", circleStrokeWidth)
    .style("cursor", "pointer");
  
  // Entry animation
  circles.transition()
    .duration(800)
    .delay((d, i) => i * 2)
    .attr("r", circleRadius);

  // Interactions
  circles
    .on("mouseover", function(event, d) {
      d3.select(this)
        .transition()
        .duration(200)
        .attr("r", circleRadius * 1.5)
        .style("opacity", 1);
      
      // Use safe formatting helper so missing/non-numeric values display as 'NA'
      const formattedX = formatVarValue(xVar, d);
      const formattedY = formatVarValue(yVar, d);

      // Only include extra lines for variables that are not already shown as X or Y
      const extraParts = [];
      const xId = CURRENT_X_VAR;
      const yId = CURRENT_Y_VAR;

      if (xId !== 'fishing' && yId !== 'fishing' && d.fishing != null && !Number.isNaN(+d.fishing)) {
        extraParts.push(`Fishing: ${Number(d.fishing).toFixed(0)} t`);
      }
      if (xId !== 'oni' && yId !== 'oni' && d.oni != null && !Number.isNaN(+d.oni)) {
        extraParts.push(`ONI (avg.): ${Number(d.oni).toFixed(2)} (${d.oniPhase || d.phase}, ${d.oniIntensity || "Neutral"})`);
      }
      if (xId !== 'gdpGrowth' && yId !== 'gdpGrowth' && d.gdpGrowth != null && !Number.isNaN(+d.gdpGrowth)) {
        extraParts.push(`GDP Growth: ${Number(d.gdpGrowth).toFixed(2)}%`);
      }
      const extra = extraParts.length ? extraParts.join('<br/>') + '<br/>' : '';

      tooltip
        .style("visibility", "visible")
        .html(`
          <strong>${d.country}</strong><br/>
          Year: ${d.year}<br/>
          ENSO Phase: <span style="color: ${colorScale(d.phase)}">${d.phase}</span><br/>
          ${xVar.label}: ${formattedX}<br/>
          ${yVar.label}: ${formattedY}<br/>
          ${extra}
        `);
    })
    .on("mousemove", function(event) {
      tooltip
        .style("top", (event.pageY - 10) + "px")
        .style("left", (event.pageX + 10) + "px");
    })
    .on("mouseout", function() {
      d3.select(this)
        .transition()
        .duration(200)
        .attr("r", circleRadius)
        .style("opacity", circleOpacity);
      
      tooltip.style("visibility", "hidden");
    });
  
  // Legend
  const legend = svg.append("g")
    .attr("transform", `translate(${totalWidth - 130}, ${margin.top + 20})`);
  
  const phases = ["El Niño", "La Niña", "Neutral"];
  
  phases.forEach((phase, i) => {
    const legendRow = legend.append("g")
      .attr("transform", `translate(0, ${i * 25})`);
    
    legendRow.append("circle")
      .attr("cx", 10)
      .attr("cy", 10)
      .attr("r", circleRadius)
      .style("fill", colorScale(phase))
      .style("stroke", circleStroke);
    
    legendRow.append("text")
      .attr("x", 25)
      .attr("y", 14)
      .style("font-size", "12px")
      .text(phase);
  });
  
  // Statistics (for plotted points)
  addStatistics(svg, cleanBoth, colorScale, totalWidth, totalHeight);

};

function getSelectedCountries() {
  const select = d3.select("#country-filter");
  if (select.empty()) return [];

  return select
    .selectAll("option:checked")
    .nodes()
    .map(o => o.value);
}

// ==========================================
// COUNTRY COMPARISON: SMALL MULTIPLES (AVEC DRAG & DROP + OVERLAY)
// ==========================================
const updateCountryComparison = (data, config) => {
  const container = d3.select("#country-comparison-container");
  if (container.empty()) return;

  container.selectAll("*").remove();

  //  Setup Drag & Drop sur le conteneur (inchangé) 
  const containerNode = container.node();
  containerNode.addEventListener("dragover", (e) => {
    e.preventDefault();
    // TODO: FIND OUT WAHT THIS ERROR IS ABOUT AND WHY IT IS GONE (even before my changes)
    const afterElement = getDragAfterElement(containerNode, e.clientX, e.clientY);
    const draggable = document.querySelector(".dragging");
    if (draggable) {
        if (afterElement == null) {
            containerNode.appendChild(draggable);
        } else {
            containerNode.insertBefore(draggable, afterElement);
        }
    }
  });

  //  Prepare the list of countries to display
  const selectedCountries = getSelectedCountries();
  let displayList = selectedCountries.includes("all") ? ["All Countries"] : selectedCountries;

  const xVar = VARIABLES[CURRENT_X_VAR];
  const yVar = VARIABLES[CURRENT_Y_VAR];
  const cleanData = data.filter(d => {
    const xv = xVar.accessor(d);
    const yv = yVar.accessor(d);
    return xv != null && !Number.isNaN(xv) && yv != null && !Number.isNaN(yv);
  });
  if (!cleanData.length) return;
  const xExtent = d3.extent(cleanData, xVar.accessor);
  const yExtent = d3.extent(cleanData, yVar.accessor);

  // Mini chart dimensions & scales (inchangé)
  const miniWidth = 260;
  const miniHeight = 220;
  const margin = { top: 30, right: 15, bottom: 35, left: 45 };
  const innerWidth = miniWidth - margin.left - margin.right;
  const innerHeight = miniHeight - margin.top - margin.bottom;
  const xScale = d3.scaleLinear().domain([xExtent[0] * 0.95, xExtent[1] * 1.05]).range([0, innerWidth]).nice();
  const yScale = d3.scaleLinear().domain([yExtent[0] * 0.95, yExtent[1] * 1.05]).range([innerHeight, 0]).nice();
  const colorScale = d3.scaleOrdinal().domain(["El Niño", "La Niña", "Neutral"]).range([config.colors.elNino, config.colors.laNina, config.colors.neutral]);

  //  GGeneration of cards 
  displayList.forEach(item => {
    let chartData;
    let title;
    if (item === "All Countries") {
      chartData = cleanData;
      title = "Global Overview (All Countries)";
    } else {
      chartData = cleanData.filter(d => d.country === item);
      title = item;
    }
    if (!chartData.length) return;

    const card = container.append("div")
      .attr("class", "draggable-card")
      .attr("draggable", "true")
      // ... styles de base inchangés ...
      .style("border", "1px solid #ddd").style("border-radius", "6px").style("padding", "8px").style("background-color", "#fff").style("box-shadow", "0 1px 3px rgba(0,0,0,0.08)");

    //  Events Drag & Drop (inchangé) 
    const cardNode = card.node();
    cardNode.addEventListener("dragstart", () => cardNode.classList.add("dragging"));
    cardNode.addEventListener("dragend", () => cardNode.classList.remove("dragging"));

    const expandBtn = card.append("button")
        .attr("class", "expand-card-btn")
        .attr("title", "Expand chart")
        // SVG icon for expand (simple four-corner arrows)
        .html('<svg viewBox="0 0 24 24"><path d="M15 3l2.3 2.3-2.89 2.87 1.42 1.42 2.87-2.89L21 9V3zM3 9l2.3-2.3 2.87 2.89 1.42-1.42-2.89-2.87L9 3H3zM9 21l-2.3-2.3 2.89-2.87-1.42-1.42-2.87 2.89L3 15v6zM21 15l-2.3 2.3-2.87-2.89-1.42 1.42 2.89 2.87L15 21h6z"/></svg>');

    // click event for expand button
    expandBtn.on("click", (e) => {
        e.stopPropagation(); 
        e.preventDefault();
        // Call the function to open the overlay
        openChartOverlay(chartData, title, config, xVar, yVar, colorScale, xExtent, yExtent);
    });

    //  Render the mini SVG (unchanged) 
    card.append("div").style("text-align", "center").style("font-size", "13px").style("font-weight", "600").style("margin-bottom", "4px").style("pointer-events", "none").text(title);
    const svg = card.append("svg").attr("width", miniWidth).attr("height", miniHeight).style("pointer-events", "none");
    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
    g.append("g").attr("transform", `translate(0,${innerHeight})`).call(d3.axisBottom(xScale).ticks(4)).style("font-size", "9px");
    g.append("g").call(d3.axisLeft(yScale).ticks(4)).style("font-size", "9px");
    g.selectAll("circle").data(chartData).join("circle")
      .attr("cx", d => xScale(xVar.accessor(d))).attr("cy", d => yScale(yVar.accessor(d)))
      .attr("r", 2.5).style("fill", d => colorScale(d.phase))
      .style("opacity", item === "All Countries" ? 0.3 : 0.7).style("stroke", "none");
    svg.append("text").attr("x", miniWidth / 2).attr("y", miniHeight - 5).style("text-anchor", "middle").style("font-size", "9px").text(xVar.label);
    svg.append("text").attr("transform", "rotate(-90)").attr("x", -miniHeight / 2).attr("y", 10).style("text-anchor", "middle").style("font-size", "9px").text(yVar.label);
  });
};

// ==========================================
// OVERLAY CHART FUNCTIONALITY
// ==========================================
function openChartOverlay(chartData, title, config, xVar, yVar, colorScale, globalXExtent, globalYExtent) {
  const backdrop = d3.select("#chart-overlay-backdrop");
  const container = d3.select("#overlay-chart-container");
  const titleEl = d3.select("#overlay-title");

  backdrop.classed("active", true);
  titleEl.text(`${title} : ${xVar.label} vs ${yVar.label}`);

  container.selectAll("*").remove();

  const rect = container.node().getBoundingClientRect();
  const width = rect.width;
  const height = rect.height || 500;

  const margin = { top: 20, right: 30, bottom: 50, left: 60 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  const svg = container.append("svg")
      .attr("width", width)
      .attr("height", height);

  const g = svg.append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

  const xScale = d3.scaleLinear()
    .domain([globalXExtent[0] * 0.95, globalXExtent[1] * 1.05])
    .range([0, innerWidth]).nice();

  const yScale = d3.scaleLinear()
    .domain([globalYExtent[0] * 0.95, globalYExtent[1] * 1.05])
    .range([innerHeight, 0]).nice();
  // Grid X
  g.append("g").attr("class", "grid").attr("transform", `translate(0,${innerHeight})`)
    .call(d3.axisBottom(xScale).tickSize(-innerHeight).tickFormat(""))
    .style("stroke-dasharray", "3,3").style("stroke", "#e0e0e0").style("stroke-opacity", 0.5);
  // Grid Y
  g.append("g").attr("class", "grid")
    .call(d3.axisLeft(yScale).tickSize(-innerWidth).tickFormat(""))
    .style("stroke-dasharray", "3,3").style("stroke", "#e0e0e0").style("stroke-opacity", 0.5);

  // Axes
  g.append("g").attr("transform", `translate(0,${innerHeight})`).call(d3.axisBottom(xScale));
  g.append("g").call(d3.axisLeft(yScale));

  svg.append("text").attr("x", width / 2).attr("y", height - 10).style("text-anchor", "middle").text(xVar.label);
  svg.append("text").attr("transform", "rotate(-90)").attr("x", -height / 2).attr("y", 20).style("text-anchor", "middle").text(yVar.label);

  const tooltip = d3.select("#scatter-tooltip"); 
  const circleRadius = config.style.circleRadius || 5;

  g.selectAll("circle")
    .data(chartData)
    .join("circle")
    .attr("cx", d => xScale(xVar.accessor(d)))
    .attr("cy", d => yScale(yVar.accessor(d)))
    .attr("r", circleRadius)
    .style("fill", d => colorScale(d.phase))
    .style("opacity", 0.7)
    .style("stroke", "white")
    .style("stroke-width", 1)
    .style("cursor", "pointer")

    .on("mouseover", function(event, d) {
      d3.select(this).transition().duration(200).attr("r", circleRadius * 1.5).style("opacity", 1);
      
      let extra = "";
      if (d.fishing != null) extra += `Fishing: ${d.fishing.toFixed(0)} t<br/>`;
      if (d.oni != null) extra += `ONI: ${d.oni.toFixed(2)} (${d.phase})<br/>`;

      tooltip.style("visibility", "visible")
        .html(`<strong>${d.country} (${d.year})</strong><br/>Phase: <span style="color: ${colorScale(d.phase)}">${d.phase}</span><br/>${xVar.label}: ${xVar.format(xVar.accessor(d))}${xVar.unit}<br/>${yVar.label}: ${yVar.format(yVar.accessor(d))}${yVar.unit}<br/>${extra}`);
    })
    .on("mousemove", function(event) {
      tooltip
        .style("top", (event.pageY - 10) + "px")
        .style("left", (event.pageX + 10) + "px");
    })
    .on("mouseout", function() {
      d3.select(this).transition().duration(200).attr("r", circleRadius).style("opacity", 0.7);
      tooltip.style("visibility", "hidden");
    });
}

document.addEventListener('DOMContentLoaded', () => {
    const backdrop = document.getElementById('chart-overlay-backdrop');
    const closeBtn = document.getElementById('overlay-close-btn');

    if (backdrop && closeBtn) {
        const closeOverlay = () => {
            backdrop.classList.remove('active');
            d3.select("#scatter-tooltip").style("visibility", "hidden");
        };

        closeBtn.addEventListener('click', closeOverlay);

        backdrop.addEventListener('click', (e) => {
            if (e.target === backdrop) {
                closeOverlay();
            }
        });
        
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && backdrop.classList.contains('active')) {
                closeOverlay();
            }
        });
    }
});

// ==========================================
// UPDATE COUNTRY OPTIONS
// ==========================================
const updateCountryOptions = (data) => {
  const countrySelect = d3.select("#country-filter");
  // Capture current selected values (support multi-select)
  const currentSelected = countrySelect.selectAll("option:checked").nodes().map(n => n.value);

  // Keep only the "All countries" option
  countrySelect.selectAll("option:not([value='all'])").remove();

  // Append group options with a prefix to identify them
  const entries = Object.entries(countryGroups);
  entries.forEach(([groupName, members], index) => {
    const option = countrySelect.append("option")
      // TODO: maybe think about deparsing the countries of the group 
      .attr("value", `Group: ${groupName}`)  // prefix: "group:"
      .text(groupName)
      .style("font-style", "italic")
      .style("margin", "3px 0");

    const offsetForPreselectedGroups = 10;
    if (index === 0) {
      option.style("margin-top", offsetForPreselectedGroups + "px");
    }
    if (index === entries.length - 1) {
      option.style("margin-bottom", offsetForPreselectedGroups + "px");
    }
  });

  // Add individual countries from data
  const countries = [...new Set(data.map(d => d.country))].sort();
  countries.forEach(country => {
    countrySelect.append("option")
      .attr("value", country)
      .style("margin", "3px 0")
      .text(country);
  });

  // Restore previous multi-selection if still available, otherwise select 'all'
  if (currentSelected && currentSelected.length > 0) {
    // If previous selection was only 'all' or none valid, select 'all'
    const valid = currentSelected.filter(v => v === 'all' || countries.includes(v));
    if (valid.length === 0) {
      countrySelect.selectAll('option').property('selected', function() { return d3.select(this).attr('value') === 'all'; });
    } else {
      // set selected for options that match previous choices
      countrySelect.selectAll('option').property('selected', function() {
        const v = d3.select(this).attr('value');
        return valid.includes(v);
      });
    }
  } else {
    countrySelect.selectAll('option').property('selected', function() { return d3.select(this).attr('value') === 'all'; });
  }
  // Render a visual cue for selected countries (chips)
  try { renderSelectedCountryChips(); } catch(e) { /* graceful fallback */ }
};

// ==========================================
// RENDER SELECTED COUNTRY CHIPS
// ==========================================
const renderSelectedCountryChips = () => {
  const selNode = d3.select('#country-filter').node();
  if (!selNode) return;

  // Create container if missing
  let container = d3.select('#selected-country-chips');
  if (container.empty()) {
    // Insert after the country select so layout stays consistent
    d3.select('#country-filter').node().insertAdjacentHTML('afterend', '<div id="selected-country-chips" class="selected-country-chips" aria-live="polite"><p>Current Selection:</p></div>');
    container = d3.select('#selected-country-chips');
  }

  const selectedValues = Array.from(selNode.selectedOptions).map(o => o.value).filter(v => v != null && v !== '');

  // If 'all' selected or nothing selected, show single 'All countries' chip
  let chipsData = [];
  if (selectedValues.length === 0 || selectedValues.includes('all')) {
    chipsData = ['All countries'];
  } else {
    chipsData = selectedValues;
  }

  const chips = container.selectAll('button.country-chip').data(chipsData, d => d);
  chips.exit().remove();

  const enter = chips.enter()
    .append('button')
    .attr('type', 'button')
    .attr('class', d => `country-chip ${d === 'All countries' ? 'all' : ''}`)
    .text(d => d)
    .attr('title', d => (d === 'All countries' ? 'All countries' : `Deselect ${d}`));

  enter.on('click', function(event, d) {
    const sel = d3.select('#country-filter').node();
    if (!sel) return;
    if (d === 'All countries') {
      // set only 'all' selected
      for (const opt of sel.options) opt.selected = opt.value === 'all';
    } else {
      // deselect the clicked country
      for (const opt of sel.options) if (opt.value === d) opt.selected = false;
      // if nothing left selected, fallback to 'all'
      const anySelected = Array.from(sel.options).some(o => o.selected);
      if (!anySelected) {
        for (const opt of sel.options) opt.selected = opt.value === 'all';
      }
    }
    // Trigger change to update plots
    sel.dispatchEvent(new Event('change'));
  });

  chips.merge(enter);
};


// ==========================================
// ATTACH EVENT LISTENERS
// ==========================================
const attachEventListeners = (config) => {
  // Remove old listeners to avoid duplicates
  d3.select("#x-axis-variable").on("change", function() {
    CURRENT_X_VAR = this.value;
    applyFilters(config);
  });

  d3.select("#y-axis-variable").on("change", function() {
    CURRENT_Y_VAR = this.value;
    applyFilters(config);
  });
  d3.select("#reset-button").on("click", null);
  
  // Add new listeners
  d3.select("#country-filter").on("change", function() {
    applyFilters(config);
  });
  
  d3.select("#phase-filter").on("change", function() {
    applyFilters(config);
  });
  
  d3.select("#reset-button").on("click", function() {
    // For multi-select, set options.selected properly so 'all' is selected
    const sel = d3.select('#country-filter').node();
    if (sel) {
      for (const opt of sel.options) opt.selected = opt.value === 'all';
    }
    d3.select("#phase-filter").property("value", "All");
    // Update UI chips and filters
    try { renderSelectedCountryChips(); } catch(e) {}
    applyFilters(config); // everything goes through same logic
    });
};

// ==========================================
// APPLY FILTERS
// ==========================================
const applyFilters = (config) => {
  const selectedValues = getSelectedCountries();  // values could be "all", individual country, or "group:Name"
  const phaseValue = d3.select("#phase-filter").property("value");

  let expandedCountries = new Set();

  // If "all" is selected, treat as no filtering on countries
  if (selectedValues.includes("all")) {
    expandedCountries = null;
  } else {
    selectedValues.forEach(val => {
      if (val.startsWith("group:")) {
        const groupName = val.slice(6); // remove 'group:' prefix
        const groupMembers = countryGroups[groupName] || [];
        groupMembers.forEach(c => expandedCountries.add(c));
      } else {
        expandedCountries.add(val);
      }
    });
  }

  let filtered = ORIGINAL_DATA;

  // Filter by expanded countries if applicable
  if (expandedCountries !== null) {
    filtered = filtered.filter(d => expandedCountries.has(d.country));
  }

  // Filter by phase
  if (phaseValue !== "All") {
    filtered = filtered.filter(d => d.phase === phaseValue);
  }

  // Filter by year slider (cumulative)
  if (CURRENT_YEAR !== null && !Number.isNaN(CURRENT_YEAR)) {
    filtered = filtered.filter(d => d.year <= CURRENT_YEAR);
  }

  // If GDP is used on either axis, restrict to years where we actually have GDP
  const usingGDP = (CURRENT_X_VAR === "gdpGrowth" || CURRENT_Y_VAR === "gdpGrowth");
  if (usingGDP) {
    // Don't immediately drop rows with null GDP (accessors/filtering in updateScatterPlot
    // will remove non-numeric points). Instead, restrict the year range to GDP coverage
    // so the axis domain is meaningful and the plot won't be empty when comparing to GDP.
    if (GDP_YEAR_RANGE && GDP_YEAR_RANGE.min != null) {
      filtered = filtered.filter(d => d.year >= GDP_YEAR_RANGE.min);
    }
  }

  // Update the selected-country chips visual cue
  try { renderSelectedCountryChips(); } catch (e) { /* ignore */ }

  updateScatterPlot(filtered, config);
  updateCountryComparison(filtered, config);
};

// ==========================================
// STATISTICS
// ==========================================
const addStatistics = (svg, data, colorScale, totalWidth, totalHeight) => {
  const statsGroup = svg.append("g")
    .attr("transform", `translate(${totalWidth - 130}, ${totalHeight - 120})`);
  
  statsGroup.append("text")
    .attr("y", 0)
    .style("font-size", "12px")
    .style("font-weight", "bold")
    .text("Statistics:");
  
  const phases = ["El Niño", "La Niña", "Neutral"];
  
  phases.forEach((phase, i) => {
    const phaseData = data.filter(d => d.phase === phase);
    const count = phaseData.length;
    
    const text = statsGroup.append("text")
      .attr("y", 20 + i * 18)
      .style("font-size", "11px");
    
    text.append("tspan")
      .style("fill", colorScale(phase))
      .style("font-weight", "bold")
      .text(phase + ": ");
    
    text.append("tspan")
      .text(`${count} pts`);
  });
};

// ==========================================
// ERROR HANDLING
// ==========================================
const showError = (selector, message) => {
  d3.select(selector)
    .append("div")
    .style("padding", "20px")
    .style("background-color", "#f8d7da")
    .style("color", "#721c24")
    .style("border", "1px solid #f5c6cb")
    .style("border-radius", "5px")
    .html(`
      <strong>Error loading data:</strong><br/>
      ${message}<br/><br/>
      <small>Make sure CSV files are present in python_scripts/data/</small>
    `);
};