/* =========================================
   NEW: LOCAL DATA LOADING (NO SERVER REQUIRED)
   ========================================= */

// 1. Map your dataset IDs to the GLOBAL variables from your data_*.js files
// CHECK: Ensure these variable names match what is inside your .js files!
const DATA_BLOBS = {
    // ID from dropdown : Global Variable Name
    'temperature': typeof temperatureDataBlob !== 'undefined' ? temperatureDataBlob : null,
    'rainfall':    typeof rainfallDataBlob    !== 'undefined' ? rainfallDataBlob    : null,
    'sst':         typeof sstDataBlob         !== 'undefined' ? sstDataBlob         : null,
    'fishing':     typeof fishingDataBlob     !== 'undefined' ? fishingDataBlob     : null
};

// 2. Helper function to decompress Base64 data locally
async function loadLocalBlob(base64String, type) {
    if (!base64String) {
        throw new Error("Data blob is undefined. Check your variable names in DATA_BLOBS.");
    }

    // Decode Base64 to binary
    const binaryString = atob(base64String);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }

    // Decompress using the browser's native API
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
    const response = new Response(stream);

    // Parse based on type
    if (type === 'json') {
        return await response.json();
    } else {
        const text = await response.text();
        return d3.csvParse(text); // Uses D3 to parse CSV string directly
    }
}


// ==========================================
// 1. CONSTANTS & CONFIGURATION
// ==========================================

const MAP_CONFIG = {
    PROJECTION_OFFSET_LONGITUDE: 160,
    PROJECTION_OFFSET_LATITUDE: 0,
    SCALE_FACTOR: 160,
    ATLAS_URL: "https://unpkg.com/world-atlas@2/countries-110m.json",
    WORLD_BANK_API_BASE: "https://api.worldbank.org/v2",
    CONTAINER_ID: "world-map-chart",
};

const UI_CONFIG = {
    NAVBAR_HEIGHT_PERCENT: 0.07,
    FOOTER_HEIGHT_PX: 35,
    MIN_MAP_HEIGHT: 120,
    TRANSITION_DURATION_MS: 250,
    TRANSITION_DURATION_LONG_MS: 300,
};

const COLORS = {
    COUNTRY_FILL: "#eee",
    COUNTRY_STROKE: "#333",
    GDP_GROWTH_POS: "#006837",
    GDP_GROWTH_NEG: "#a50026",
    FISHING_FILL: "rgba(0,120,180,0.65)",
    FISHING_STROKE: "#044",
    LEGEND_DEFAULT_BG: "#eee",
};

const DATASETS = [
    { key: 'temperature', label: 'Temperature (°C)', path: 'python_scripts/data/temperature_by_country.csv.gz' },
    { key: 'gdp', label: 'GDP growth (%)' },
    { key: 'rainfall', label: 'Rainfall (mm)', path: 'python_scripts/data/rainfall_by_country.csv.gz' },
    { key: 'fishing', label: 'Fishing (tonnes)', path: 'python_scripts/data/fishing_by_country_year.csv' },
    { key: 'sst', label: 'Sea Surface Temperature (°C)', path: 'python_scripts/data/global_sst.json.gz' }
];

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

// ==========================================
// 2. UTILITY FUNCTIONS
// ==========================================

function normName(n) {
    if (!n) return '';
    return String(n).toLowerCase().split(/\s+/).filter(Boolean).join(' ').trim();
}

function getSafeCentroid(feature, projection) {
    const g = d3.geoCentroid(feature);
    if (!g || !Number.isFinite(g[0]) || !Number.isFinite(g[1])) return [Number.NaN, Number.NaN];
    const p = projection(g);
    if (!p || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) return [Number.NaN, Number.NaN];
    return p;
}

function parseRawRows(raw) {
    return raw.map(r => {
        const out = { region: null, year: null, month: null, value: null, iso2: null, country_name: null };
        
        // Parse Date/Time/Year
        let dateObj = null;
        if (r.time) dateObj = new Date(r.time);
        else if (r.date) dateObj = new Date(r.date);
        
        if (dateObj && !isNaN(dateObj)) {
            out.year = dateObj.getFullYear();
            out.month = dateObj.getMonth() + 1; // 1-based month
        } else if (r.year) {
            out.year = +r.year;
            if (r.month) out.month = +r.month;
        }

        // Parse Value
        if (r.temperature_celsius) out.value = +r.temperature_celsius;
        else if (r.rainfall_mm) out.value = +r.rainfall_mm;
        else if (r.total_tonnes) out.value = +r.total_tonnes;
        else if (r.oni) out.value = +r.oni;

        // Parse Identifiers
        if (r.region) out.region = +r.region;
        if (r.abbrev) out.iso2 = String(r.abbrev).trim();
        if (r.country_name) out.country_name = String(r.country_name).trim();
        if (r.country_un_code) out.region = +r.country_un_code;
        if (r.country_iso3 && !out.iso2) out.iso2 = r.country_iso3.slice(0, 2);
        
        return out;
    });
}

function aggregateRows(rows) {
    const byYear = new Map();
    const byYearMonth = new Map(); 

    for (const r of rows) {
        if (!r.year || r.value == null) continue;

        const keys = [];
        if (r.region && !Number.isNaN(r.region) && r.region !== 0) keys.push(String(+r.region));
        if (r.iso2) keys.push(String(r.iso2).toUpperCase());
        if (r.country_name) keys.push(normName(r.country_name));

        const yearMap = byYear.get(r.year) || new Map();
        for (const k of keys) {
            const arr = yearMap.get(k) || [];
            arr.push(r.value);
            yearMap.set(k, arr);
        }
        byYear.set(r.year, yearMap);

        if (r.month) {
            if (!byYearMonth.has(r.year)) byYearMonth.set(r.year, new Map());
            const monthMap = byYearMonth.get(r.year);
            
            if (!monthMap.has(r.month)) monthMap.set(r.month, new Map());
            const keyMap = monthMap.get(r.month);

            for (const k of keys) {
                const arr = keyMap.get(k) || [];
                arr.push(r.value);
                keyMap.set(k, arr);
            }
        }
    }

    const computeMeans = (sourceMap) => {
        const resultMap = new Map();
        for (const [k, arr] of sourceMap.entries()) {
            const sum = arr.reduce((a, b) => a + b, 0);
            resultMap.set(k, sum / arr.length);
        }
        return resultMap;
    };

    const byYearMean = new Map();
    const years = [];
    for (const [yr, yrMap] of byYear.entries()) {
        byYearMean.set(yr, computeMeans(yrMap));
        years.push(yr);
    }
    years.sort((a, b) => a - b);

    const byYearMonthMean = new Map();
    for (const [yr, monthMap] of byYearMonth.entries()) {
        const finalMonthMap = new Map();
        for (const [mo, keyMap] of monthMap.entries()) {
            finalMonthMap.set(mo, computeMeans(keyMap));
        }
        byYearMonthMean.set(yr, finalMonthMap);
    }

    // Backfill yearly means from monthly data if needed
    for (const [year, monthsInYear] of byYearMonthMean) {
        let yearTargetMap = byYearMean.get(year);
        if (!yearTargetMap) {
            yearTargetMap = new Map();
            byYearMean.set(year, yearTargetMap);
            years.push(year);
            years.sort((a, b) => a - b);
        }

        const tempKeyAggregator = new Map(); 

        for (const [month, keyValues] of monthsInYear) {
            for (const [key, value] of keyValues) {
                if (!tempKeyAggregator.has(key)) tempKeyAggregator.set(key, []);
                tempKeyAggregator.get(key).push(value);
            }
        }

        for (const [key, values] of tempKeyAggregator) {
            if (!yearTargetMap.has(key)) {
                const sum = values.reduce((a, b) => a + b, 0);
                yearTargetMap.set(key, sum / values.length);
            }
        }
    }
    
    return { byYearMean, byYearMonth: byYearMonthMean, years };
}

// Fill remaining NaNs by nearest-neighbor search so missing spots get nearest color
function fillNaNsNearest(arr, cols, rows) {
    const idx = (x, y) => x + y * cols;
    const out = arr;
    const maxR = Math.max(cols, rows);
    for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
            const i = idx(x, y);
            if (Number.isFinite(out[i])) continue;
            let found = false;
            let foundVal = Number.NaN;
            for (let r = 1; r < maxR && !found; r++) {
                const xmin = Math.max(0, x - r);
                const xmax = Math.min(cols - 1, x + r);
                const ymin = Math.max(0, y - r);
                const ymax = Math.min(rows - 1, y + r);
                for (let yy = ymin; yy <= ymax && !found; yy++) {
                    for (let xx = xmin; xx <= xmax; xx++) {
                        if (Math.abs(xx - x) !== r && Math.abs(yy - y) !== r) continue;
                        const v = out[idx(xx, yy)];
                        if (Number.isFinite(v)) { found = true; foundVal = v; break; }
                    }
                }
            }
            if (found) out[i] = foundVal;
        }
    }
    return out;
}

// ==========================================
// 3. DATA LOADING
// ==========================================

async function loadCountries() {
    const response = await fetch(MAP_CONFIG.ATLAS_URL);
    if (!response.ok) throw new Error(`Failed to load atlas: ${response.status}`);
    const world = await response.json();
    return topojson.feature(world, world.objects.countries);
}

async function loadGDPData() {
    const url = `${MAP_CONFIG.WORLD_BANK_API_BASE}/country/all/indicator/NY.GDP.MKTP.KD.ZG?format=json&per_page=20000&date=1990:2023`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`World Bank API error: ${resp.status}`);
    const json = await resp.json();
    const raw = (json && json[1]) ? json[1] : [];

    const rows = raw.map(item => ({
        country_iso3: item.countryiso3code || (item.country && item.country.id) || '',
        country_name: item.country && item.country.value ? item.country.value : (item.countryiso3code || ''),
        year: item.date ? +item.date : NaN,
        value: item.value !== null ? +item.value : null
    }));

    const byYearMean = new Map();
    for (const r of rows) {
        if (!r || !r.year || r.value === null || r.value === undefined) continue;
        const yr = +r.year;
        const yrMap = byYearMean.get(yr) || new Map();
        const iso3 = String(r.country_iso3 || '').toUpperCase();
        const nameKey = normName(r.country_name || '');
        if (iso3) yrMap.set(iso3, r.value);
        if (nameKey) yrMap.set(nameKey, r.value);
        byYearMean.set(yr, yrMap);
    }
    const years = Array.from(byYearMean.keys()).sort((a, b) => a - b);
    return { byYearMean, years };
}
// ============================================
// DATASET LOADING (From Global Blobs)
// ============================================

async function fetchDataset(datasetId) {
    console.log(`Loading dataset locally: ${datasetId}...`);
    
    // Exception: GDP uses external API (allowed)
    if (datasetId === 'gdp') {
        try {
            const response = await fetch("https://api.worldbank.org/v2/country/all/indicator/NY.GDP.MKTP.CD?format=json&per_page=10000");
            const gdpData = await response.json();
            console.log("GDP data loaded from World Bank API");
            return gdpData;
        } catch (error) {
            console.error("Failed to fetch GDP data:", error);
            return null;
        }
    }

    // All other datasets: Use local blobs
    const blob = window.dataBlobs[datasetId];
    
    if (!blob) {
        console.error(`Data blob for ${datasetId} not found! Available:`, Object.keys(window.dataBlobs));
        return [];
    }

    try {
        // SST is JSON, others are CSV
        const type = (datasetId === 'sst') ? 'json' : 'csv';
        const data = await window.loadDecompressedBlob(blob, type);
        console.log(`Successfully loaded ${Array.isArray(data) ? data.length : Object.keys(data).length} records for ${datasetId}`);
        return data;
    } catch (error) {
        console.error(`Failed to load ${datasetId}:`, error);
        return [];
    }
}

// ==========================================
// 4. UI HELPERS
// ==========================================

function setupLegend(container, position = 'right') {
    const legend = d3.select(container)
        .append('div')
        .attr('class', 'map-legend')
        .style('position', 'absolute')
        .style(position === 'left' ? 'left' : 'right', '12px')
        .style('top', '50%')
        .style('transform', 'translateY(-50%)')
        .style('z-index', 1000)
        .style('background', 'rgba(255,255,255,0.92)')
        .style('padding', '10px')
        .style('border-radius', '6px')
        .style('box-shadow', '0 2px 10px rgba(0,0,0,0.12)')
        .style('display', 'flex')
        .style('flex-direction', 'column')
        .style('align-items', 'center')
        .style('font-family', 'sans-serif')
        .style('font-size', '12px');

    legend.append('div').attr('class', 'legend-title').style('font-weight', '600').style('margin-bottom', '6px');
    legend.append('div').attr('class', 'legend-max').style('font-size', '12px').style('margin-bottom', '6px');
    legend.append('div').attr('class', 'legend-bar')
        .style('width', '18px')
        .style('height', '220px')
        .style('border-radius', '3px')
        .style('background', COLORS.LEGEND_DEFAULT_BG);
    legend.append('div').attr('class', 'legend-min').style('font-size', '12px').style('margin-top', '6px');
    return legend;
}

function setupTooltip(container) {
    return d3.select(container)
        .append('div')
        .attr('id', 'map-tooltip')
        .style('position', 'absolute')
        .style('pointer-events', 'none')
        .style('background', 'rgba(0,0,0,0.78)')
        .style('color', '#fff')
        .style('padding', '6px 8px')
        .style('border-radius', '4px')
        .style('font-size', '12px')
        .style('display', 'none')
        .style('z-index', 2000);
}

// Compute a radius scale so that area ∝ value (radius ∝ sqrt(value)).
function computeRadiusScale(values, sizeConfig = {}) {
    const { width = 800, height = 400, minRadius = 2, maxRadiusFactor = 1/15 } = sizeConfig;
    const positive = values.filter(v => v != null && !Number.isNaN(v) && v > 0);
    if (positive.length === 0) {
        return d3.scaleSqrt().domain([0, 1]).range([0, minRadius]);
    }
    const minV = d3.min(positive);
    const maxV = d3.max(positive);
    const viewportMin = Math.min(width, height);
    const rMax = Math.max(minRadius, Math.min(Math.round(viewportMin * maxRadiusFactor), 80));
    const domainMin = Math.min(minV, maxV * 0.01);
    return d3.scaleSqrt().domain([domainMin, maxV]).range([Math.max(0.75, minRadius), rMax]);
}

function createSizeLegend(container, scale, values, labelFmt = v => (v == null ? 'N/A' : Number(v).toLocaleString())) {
    const sel = d3.select(container);
    sel.select('.fishing-size-legend').remove();

    const positives = values.filter(v => v != null && !Number.isNaN(v) && v > 0).sort((a,b)=>a-b);
    if (positives.length === 0) {
        sel.append('div').attr('class','fishing-size-legend').text('No fishing data');
        return;
    }

    // choose three reference points: small (first non-zero), half of max, and max
    const small = positives[0];
    const max = positives[positives.length - 1];
    const halfMax = max / 2;
    const samples = [ { label: 'Small', value: small }, { label: 'Half max', value: halfMax }, { label: 'Max', value: max } ];

    const legend = sel.append('div').attr('class','fishing-size-legend')
        .style('display','flex')
        .style('flex-direction','column')
        .style('align-items','center')
        .style('gap','10px')
        .style('font-size','12px')
        .style('color','#222')
        .style('padding-top','6px');

    for (const s of samples) {
        const r = Math.round(scale(s.value));
        const pad = 6;
        const w = Math.max(48, r*2 + pad*2);
        const h = Math.max(28, r*2 + pad*2);
        const block = legend.append('div').style('display','flex').style('flex-direction','column').style('align-items','center').style('gap','6px');
        const svg = block.append('svg').attr('width', w).attr('height', h);
        svg.append('circle')
            .attr('cx', w/2)
            .attr('cy', h/2)
            .attr('r', r)
            .attr('fill', 'rgba(0,120,180,0.65)')
            .attr('stroke', '#044')
            .attr('stroke-width', 0.4);

        block.append('div').style('font-size','11px').style('color','#333').text(labelFmt(s.value));
    }
    return legend;
}

function getValueForFeature(feature, year, metaData, month = null) {
    if (!metaData) return null;

    let activeMap = null;
    if (month != null && metaData.byYearMonth && metaData.byYearMonth.has(year)) {
        const monthsInYear = metaData.byYearMonth.get(year);
        if (monthsInYear.has(month)) {
            activeMap = monthsInYear.get(month);
        }
    }

    if (!activeMap) {
        if (metaData.byYearMean) {
            activeMap = metaData.byYearMean.get(year);
        }
    }

    if (!activeMap) return null;

    if (feature.id != null) {
        const idKey = String(+feature.id);
        if (activeMap.has(idKey)) return activeMap.get(idKey);
    }
    if (feature.properties) {
        const p = feature.properties;
        if (p.iso_a2 && activeMap.has(p.iso_a2)) return activeMap.get(p.iso_a2);
        
        const iso3 = (p.iso_a3 || p.ISO_A3 || '').toString().toUpperCase();
        if (iso3 && activeMap.has(iso3)) return activeMap.get(iso3);
        
        const rawName = p.name || p.country_name || p.ADMIN || '';
        const n = normName(rawName);
        if (n && activeMap.has(n)) return activeMap.get(n);
        
        if (rawName && COUNTRY_NAME_MAPPING[rawName]) {
            const mappedName = normName(COUNTRY_NAME_MAPPING[rawName]);
            if (activeMap.has(mappedName)) return activeMap.get(mappedName);
        }
    }
    return null;
}

// ==========================================
// 5. MAIN CREATE FUNCTION
// ==========================================

const createWorldMap = async () => {
    const container = document.getElementById(MAP_CONFIG.CONTAINER_ID);
    if (!container) { console.error("Map container not found"); return; }
    
    // --- 1. Layout ---
    const navElem = document.querySelector('nav, .navbar, #navbar, header');
    const footerElem = document.querySelector('footer, .footer, #footer, .site-footer');
    const navbarOffset = navElem ? Math.round(navElem.getBoundingClientRect().height) : Math.round(window.innerHeight * UI_CONFIG.NAVBAR_HEIGHT_PERCENT);
    const footerOffset = footerElem ? Math.round(footerElem.getBoundingClientRect().height) : UI_CONFIG.FOOTER_HEIGHT_PX;
    const width = container.clientWidth;
    const height = Math.max(UI_CONFIG.MIN_MAP_HEIGHT, container.clientHeight - navbarOffset - footerOffset);

    // --- 2. Load Geography ---
    const countries = await loadCountries();
    
    // --- 3. Setup Projection ---
    const projection = d3.geoNaturalEarth1()
        .rotate([MAP_CONFIG.PROJECTION_OFFSET_LONGITUDE, MAP_CONFIG.PROJECTION_OFFSET_LATITUDE])
        .scale(MAP_CONFIG.SCALE_FACTOR)
        .fitSize([width, height], countries);
    
    const pathGenerator = d3.geoPath().projection(projection);

    // --- 4. DOM Initialization ---
    d3.select(container).selectAll("*").remove();

    const svg = d3.select(container)
        .append("svg")
        .attr("width", "100%")
        .attr("height", "100%")
        .attr("viewBox", `0 0 ${width} ${height}`)
        .attr("preserveAspectRatio", "xMidYMid meet")
        .style("cursor", "grab");

    const bgRect = svg.append('rect')
        .attr('width', '100%')
        .attr('height', '100%')
        .attr('fill', 'transparent')
        .style('pointer-events', 'all')
        .lower();

    const mapGroup = svg.append('g').attr('class', 'map-group');

    // Layers
    const sstLayer = mapGroup.append('g').attr('class', 'sst-layer');
    const countriesGroup = mapGroup.append('g').attr('class', 'countries-layer');
    const fishingLayer = mapGroup.append('g').attr('class', 'fishing-layer');

    // --- 5. HELPER: REDRAW GEOMETRY (DRY) ---
    // Used by both Drag Rotation and Double-Click Reset
    const redrawMapGeometry = () => {
        countriesGroup.selectAll('path').attr('d', pathGenerator);

        fishingLayer.selectAll('circle.fish')
            .attr('cx', d => { const c = getSafeCentroid(d, projection); return Number.isNaN(c[0]) ? -9999 : c[0]; })
            .attr('cy', d => { const c = getSafeCentroid(d, projection); return Number.isNaN(c[1]) ? -9999 : c[1]; });

        sstLayer.selectAll('path.sst-contour').attr('d', pathGenerator);
    };

    function drawFishingPoints(countriesFeatures, fishingLayer, projection, values, year, meta, width, height, legendContainer) {
        const scale = computeRadiusScale(values, { width, height, minRadius: 1.5, maxRadiusFactor: 1/18 });
        const circles = fishingLayer.selectAll('circle.fish').data(countriesFeatures, d => d.id);

        const enter = circles.enter().append('circle')
            .attr('class','fish')
            .attr('fill',COLORS.FISHING_FILL)
            .attr('stroke',COLORS.FISHING_STROKE)
            .attr('stroke-width',0.4)
            .attr('r',0)
            .attr('pointer-events', 'none');

        enter.each(function(d) {
            const c = getSafeCentroid(d, projection);
            d3.select(this).attr('cx', Number.isNaN(c[0]) ? -9999 : c[0])
                           .attr('cy', Number.isNaN(c[1]) ? -9999 : c[1]);
        });

        const radiusFor = (d) => {
            const v = getValueForFeature(d, year, meta);
            if (v == null || Number.isNaN(v) || v <= 0) return 0;
            return scale(v);
        };

        enter.transition().duration(UI_CONFIG.TRANSITION_DURATION_LONG_MS).attr('r', radiusFor);
        circles.transition().duration(UI_CONFIG.TRANSITION_DURATION_LONG_MS).attr('r', radiusFor).attr('pointer-events', 'none');
        circles.exit().transition().duration(200).attr('r', 0).remove();
        fishingLayer.style('display', null);
        redrawMapGeometry();

        if (legendContainer) {
            const $legend = d3.select(legendContainer);
            $legend.select('.legend-bar').style('display', 'none');
            $legend.select('.legend-max').style('display', 'none');
            $legend.select('.legend-min').style('display', 'none');
            $legend.select('.legend-title').text(`Fishing(tonnes) ${year != null ? year : 'N/A'}`);
            // Remove previous fishing legend then create the size legend
            $legend.select('.fishing-size-legend').remove();
            createSizeLegend(legendContainer, scale, values, v => `${Math.round(v).toLocaleString()} t`);
        }
    }

    // --- 6. INTERACTION DEFINITIONS ---
    const drag = d3.drag()
        .on('start', () => svg.style('cursor', 'grabbing'))
        .on('drag', (event) => {
            const rotate = projection.rotate();
            const k = 0.25; // Horizontal sensitivity
            const kY = 0.25; // Vertical sensitivity
            let lambda = rotate[0] + event.dx * k;
            let phi = rotate[1] - event.dy * kY;

            // Clamp Latitude (-90 to 90) to prevent flipping upside down
            phi = Math.max(-90, Math.min(90, phi));

            projection.rotate([lambda, phi]);
            redrawMapGeometry();
        })
        .on('end', () => svg.style('cursor', 'grab'));

    const zoom = d3.zoom()
        .scaleExtent([1, 8])
        .filter((event) => !event || event.type !== 'wheel') 
        .on('zoom', (event) => {
            mapGroup.attr('transform', event.transform);
        });

    svg.call(drag);
    svg.call(zoom);

    svg.node().addEventListener('wheel', (e) => {
        if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
        e.preventDefault();
        const delta = -e.deltaY;
        const factor = Math.pow(1.006, delta);
        const center = [width / 2, height / 2];
        const t = d3.zoomTransform(svg.node());
        let newK = t.k * factor;
        newK = Math.max(1, Math.min(8, newK));
        svg.transition().duration(120).call(zoom.scaleTo, newK, center);
    }, { passive: false });

    svg.on('dblclick.zoom', null);
    // reset map interaction on double-click
    svg.on('dblclick', () => {
        projection.rotate([MAP_CONFIG.PROJECTION_OFFSET_LONGITUDE, MAP_CONFIG.PROJECTION_OFFSET_LATITUDE]);
        redrawMapGeometry();
        svg.transition().duration(750).call(zoom.transform, d3.zoomIdentity);
    });

    // --- 7. Base Map Rendering ---
    countriesGroup.selectAll("path")
        .data(countries.features)
        .join("path")
        .attr("d", pathGenerator)
        .attr("fill", COLORS.COUNTRY_FILL)
        .attr("stroke", COLORS.COUNTRY_STROKE)
        .attr('stroke-width', 0.5)
        .attr('vector-effect', 'non-scaling-stroke');

    // --- 8. UI Components ---
    const legend = setupLegend(container, 'right');
    const sstLegend = setupLegend(container, 'left');
    sstLegend.attr('id', 'sst-legend').style('display', 'none');
    const tooltip = setupTooltip(container);

    // --- 9. State & Update Logic ---
    const appState = {
        loadedData: new Map(),
        sstData: null,
        currentDatasetKey: null,
        currentYear: null,
        currentMonth: null,
        isSstVisible: true,
    };

    function updateSstVisibility() {
        const sstCheckbox = document.getElementById('sst-toggle-checkbox');
        appState.isSstVisible = sstCheckbox.checked;

        if (appState.isSstVisible) {
            sstLayer.style('display', null);
            sstLegend.style('display', 'flex');
            renderSstLayer();
        } else {
            sstLayer.style('display', 'none');
            sstLegend.style('display', 'none');
        }
    }

    function renderSstLayer() {
        if (!appState.isSstVisible || !appState.sstData) {
            sstLayer.selectAll('*').remove();
            sstLegend.style('display', 'none');
            return;
        }

        const { sstData, currentYear, currentMonth } = appState;
        const year = currentYear;
        const month = currentMonth;
        let monthData = null;

        if (year != null) {
            if (month != null) {
                const mm = String(month).padStart(2, '0');
                const monthStr = `${String(year)}-${mm}`;
                monthData = sstData.find(d => d.month === monthStr);
            }
            if (!monthData) {
                const monthStr = `${String(year)}-01`;
                monthData = sstData.find(d => d.month === monthStr);
            }
        }
        
        if (!monthData) {
            sstLegend.select('.legend-title').text('SST Data not available for this date');
            sstLegend.select('.legend-bar').style('background', '');
            sstLegend.select('.legend-max').text('');
            sstLegend.select('.legend-min').text('');
            sstLayer.selectAll('*').remove();
            return;
        }

        const latCount = 18, lonCount = 36;
        const latMin = -90, latMax = 90;
        const lonMin = 0, lonMax = 360;
        const latStep = (latMax - latMin) / (latCount - 1);
        const lonStep = (lonMax - lonMin) / (lonCount - 1);
        const lats = Array.from({length: latCount}, (_, i) => latMin + i * latStep);
        const lons = Array.from({length: lonCount}, (_, j) => lonMin + j * lonStep);

        const grid = new Array(lonCount * latCount);
        for (let i = 0; i < latCount; i++) {
            for (let j = 0; j < lonCount; j++) {
                const raw = monthData.values[i * lonCount + j];
                const val = (raw == null || Number.isNaN(raw)) ? NaN : +raw;
                const lonAdj = lons[j] > 180 ? lons[j] - 360 : lons[j];
                const lat = lats[i];
                let isLand = false;
                for (const feat of countries.features) {
                    if (d3.geoContains(feat, [lonAdj, lat])) { isLand = true; break; }
                }
                grid[j + i * lonCount] = isLand ? NaN : val;
            }
        }

        const sstValues = grid.filter(v => Number.isFinite(v));
        if (sstValues.length === 0) {
            sstLayer.selectAll('*').remove();
            return;
        }
        const minSST = d3.min(sstValues);
        const maxSST = d3.max(sstValues);

        const coolWarmInterp = d3.interpolateRgbBasis(["#3b4cc0", "#ffffff", "#b40426"]);
        const colorScale = d3.scaleDiverging(coolWarmInterp).domain([minSST, (minSST + maxSST) / 2, maxSST]);

        const upscale = 3;
        const uCols = lonCount * upscale, uRows = latCount * upscale;
        const upGrid = new Array(uCols * uRows);
        for (let yi = 0; yi < uRows; yi++) {
            for (let xi = 0; xi < uCols; xi++) {
                const fx = xi / upscale, fy = yi / upscale;
                const x0 = Math.floor(Math.max(0, Math.min(lonCount - 1, fx)));
                const y0 = Math.floor(Math.max(0, Math.min(latCount - 1, fy)));
                const x1 = Math.min(lonCount - 1, x0 + 1), y1 = Math.min(latCount - 1, y0 + 1);
                const sx = fx - x0, sy = fy - y0;
                const v00 = grid[x0 + y0 * lonCount], v10 = grid[x1 + y0 * lonCount];
                const v01 = grid[x0 + y1 * lonCount], v11 = grid[x1 + y1 * lonCount];
                const samples = [
                    { v: v00, w: (1 - sx) * (1 - sy) }, { v: v10, w: sx * (1 - sy) },
                    { v: v01, w: (1 - sx) * sy }, { v: v11, w: sx * sy }
                ];
                let sum = 0, wsum = 0;
                for (const s of samples) {
                    if (Number.isFinite(s.v)) { sum += s.v * s.w; wsum += s.w; }
                }
                upGrid[xi + yi * uCols] = wsum > 0 ? sum / wsum : Number.NaN;
            }
        }

        fillNaNsNearest(upGrid, uCols, uRows);

        const numLevels = 18;
        const levels = d3.ticks(minSST, maxSST, numLevels);
        const contourGenerator = d3.contours().size([uCols, uRows]).thresholds(levels);
        const contours = contourGenerator(upGrid);

        const gridToLonLat = ([x, y]) => {
            const lon = lonMin + (x / (uCols - 1)) * (lonMax - lonMin);
            const lat = latMin + (y / (uRows - 1)) * (latMax - latMin);
            return [lon, lat];
        };

        const features = contours.map(c => ({
            type: 'Feature',
            properties: { value: c.value },
            geometry: {
                type: 'MultiPolygon',
                coordinates: c.coordinates.map(polygon => polygon.map(ring => ring.map(gridToLonLat)))
            }
        }));

        const paths = sstLayer.selectAll('path.sst-contour').data(features, d => String(d.properties.value));
        paths.exit().remove();
        const enter = paths.enter().append('path').attr('class', 'sst-contour');

        paths.merge(enter)
            .attr('d', pathGenerator)
            .attr('fill', d => colorScale(d.properties.value))
            .attr('stroke', '#ffffff')
            .attr('stroke-opacity', 0.18)
            .attr('stroke-width', 0.2)
            .attr('opacity', 0.78)
            .attr('pointer-events', 'none');
            
        sstLayer.style('display', null).lower();

        sstLegend.style('display', 'flex');
        sstLegend.select('.legend-title').text(`Sea Surface Temp — ${year}, ${month ? month : "N/A"}`);
        const stops = 6;
        const gradColors = Array.from({length: stops}, (_, i) => {
            const t = i / (stops - 1);
            return colorScale(maxSST - (maxSST - minSST) * t);
        });
        sstLegend.select('.legend-bar').style('background', `linear-gradient(to bottom, ${gradColors.join(',')})`);
        sstLegend.select('.legend-max').text(maxSST != null ? maxSST.toFixed(2) : 'n/a');
        sstLegend.select('.legend-min').text(minSST != null ? minSST.toFixed(2) : 'n/a');
    }

        function updateMapForMonth(input, monthOpt) {
        let year = null, month = null;
        if (input instanceof Date) {
            year = input.getFullYear();
            month = input.getMonth() + 1;
        } else if (typeof input === 'object' && input != null && input.year != null) {
            year = +input.year;
            month = input.month == null ? null : +input.month;
        } else if (typeof input === 'number') {
            year = +input;
            month = monthOpt == null ? null : +monthOpt;
        } else if (typeof input === 'string') {
            const d = new Date(input);
            if (!Number.isNaN(d)) { year = d.getFullYear(); month = d.getMonth() + 1; }
        }

        appState.currentYear = year;
        appState.currentMonth = month;

        if (appState.currentDatasetKey === 'sst') {
            renderSstLayer();
            return;
        }

        const key = appState.currentDatasetKey;
        if (!appState.loadedData.has(key)) return; 
        const meta = appState.loadedData.get(key);
        if (!meta) return;

        // Reset legend display state
        legend.style('display', 'flex');
        d3.select(legend.node()).select('.fishing-size-legend').remove();
        legend.select('.legend-bar').style('display', null);
        legend.select('.legend-max').style('display', null);
        legend.select('.legend-min').style('display', null);
        
        // --- NEW LOGIC: PREFER MONTHLY MAP ---
        let activeDataMap = null;
        
        // 1. Try to get the specific month map
        if (month != null && meta.byYearMonth && meta.byYearMonth.has(year)) {
            const monthsInYear = meta.byYearMonth.get(year);
            if (monthsInYear.has(month)) {
                activeDataMap = monthsInYear.get(month);
            }
        }

        // 2. Fallback to yearly mean if monthly is missing
        if (!activeDataMap) {
            activeDataMap = meta.byYearMean.get(year) || new Map();
        }

        const values = Array.from(activeDataMap.values()).filter(v => v != null && !Number.isNaN(v));
        
        // --- CHECK FOR NO DATA ---
        if (values.length === 0 && key !== 'fishing') {
            countriesGroup.selectAll('path').attr('fill', COLORS.COUNTRY_FILL);
            const ds = DATASETS.find(d => d.key === key);
            legend.select('.legend-title').text(`${ds ? ds.label : key} — No data for ${year}`);
            legend.select('.legend-bar').style('display', 'none');
            legend.select('.legend-max').style('display', 'none');
            legend.select('.legend-min').style('display', 'none');
            
            renderSstLayer();
            return;
        }

        fishingLayer.style('display', 'none');
        countriesGroup.selectAll('path').attr('fill', COLORS.COUNTRY_FILL);

        if (key === 'gdp') {
            const absMax = 10; 
            const colorForGdp = (val) => {
                if (val == null) return '#eee';
                const t = Math.min(1, Math.abs(val) / absMax);
                return val > 0 ? d3.interpolateRgb('#ffffff', COLORS.GDP_GROWTH_POS)(t) : d3.interpolateRgb('#ffffff', COLORS.GDP_GROWTH_NEG)(t);
            };
            countriesGroup.selectAll('path')
                .transition().duration(UI_CONFIG.TRANSITION_DURATION_MS)
                .attr('fill', d => colorForGdp(getValueForFeature(d, year, meta, month)));
            
            legend.select('.legend-title').text(`GDP Growth — ${year} (1990-2023)`);
            const stops = 9;
            const gradColors = Array.from({length: stops}, (_, i) => colorForGdp(absMax - (2 * absMax) * (i / (stops - 1))));
            legend.select('.legend-bar').style('background', `linear-gradient(to bottom, ${gradColors.join(',')})`);
            legend.select('.legend-max').text(`≥ ${absMax.toFixed(1)}%`);
            legend.select('.legend-min').text(`≤ -${absMax.toFixed(1)}%`);

        } else if (key === 'fishing') {
            drawFishingPoints(countries.features, fishingLayer, projection, values, year, meta, width, height, legend.node());

        } else if (key === 'temperature') {
            const minV = d3.min(values), maxV = d3.max(values);
            const colorScale = d3.scaleSequential(d3.interpolateRdYlBu).domain([maxV, minV]);
            
            countriesGroup.selectAll('path')
                .transition().duration(UI_CONFIG.TRANSITION_DURATION_MS)
                .attr('fill', d => {
                    const val = getValueForFeature(d, year, meta, month);
                    return val == null ? COLORS.COUNTRY_FILL : colorScale(val);
                });

            const ds = DATASETS.find(d => d.key === key);
            legend.select('.legend-title').text(`${ds ? ds.label : key} — ${year}, ${month ? month : "N/A"}`);
            
            const stops = 6;
            const gradColors = Array.from({length: stops}, (_, i) => {
                const t = i / (stops - 1);
                return colorScale(maxV + (minV - maxV) * t); 
            });
            
            legend.select('.legend-bar').style('background', `linear-gradient(to bottom, ${gradColors.join(',')})`);
            legend.select('.legend-max').text(maxV.toFixed(2));
            legend.select('.legend-min').text(minV.toFixed(2));

        } else {
            // Generic handler (Rainfall, etc.)
            const minV = d3.min(values), maxV = d3.max(values);
            const colorScale = d3.scaleSequential(d3.interpolateYlGnBu).domain([minV, maxV]);

            countriesGroup.selectAll('path')
                .transition().duration(UI_CONFIG.TRANSITION_DURATION_MS)
                .attr('fill', d => {
                    const val = getValueForFeature(d, year, meta, month);
                    return val == null ? COLORS.COUNTRY_FILL : colorScale(val);
                });
            
            const ds = DATASETS.find(d => d.key === key);
            legend.select('.legend-title').text(`${ds ? ds.label : key} — ${year}, ${month ? month : "N/A"}`);
            
            const stops = 6;
            const gradColors = Array.from({length: stops}, (_, i) => {
                const t = i / (stops - 1);
                return colorScale(maxV + (minV - maxV) * t); 
            });
            legend.select('.legend-bar').style('background', `linear-gradient(to bottom, ${gradColors.join(',')})`);
            legend.select('.legend-max').text(maxV.toFixed(2));
            legend.select('.legend-min').text(minV.toFixed(2));
        }
        
        renderSstLayer();
    }


    async function switchToDataset(key, initialMonth = 1) {
        appState.currentDatasetKey = key;
        const mainLegend = d3.select(legend.node());

        if (key === 'sst') {
            mainLegend.style('display', 'none');
            updateSstVisibility();
            return;
        } else {
            mainLegend.style('display', 'flex');
            if (!appState.isSstVisible) null;
            renderSstLayer();
            updateSstVisibility();
        }

        if (!appState.loadedData.has(key)) {
            const data = await fetchDataset(key);
            if (data) appState.loadedData.set(key, data);
        }

        const meta = appState.loadedData.get(key);
        if (!meta) return;

        const selYear = appState.currentYear == null ? null : +appState.currentYear;

        // why the minus 2 - you ask? because the data set has 2024 but there is no sst data for 2024 so the load makes no sense! there fore i just rm this shit
        let targetYear = (meta.years && meta.years.length) ? meta.years.at(-2) : null;
        
        if (selYear != null && Array.isArray(meta.years) && meta.years.includes(selYear)) {
            targetYear = selYear;
        }

        let targetMonth = initialMonth;
        if (targetMonth === null) {
            targetMonth = appState.currentMonth;
        }

        if (targetYear != null) {
            updateMapForMonth({ year: targetYear, month: targetMonth });
        }
    }


    // --- 10. Interactions ---
    const updateTooltip = (event, d) => {
        const name = d?.properties?.name || d?.properties?.ADMIN || 'Unknown';
        const parts = [`<div style="font-weight:600; margin-bottom:6px">${name}</div>`];
        
        DATASETS.forEach(ds => {
            if (ds.key === 'sst') return;
            
            const meta = appState.loadedData.get(ds.key);
            if (!meta) return;

            const latest = meta?.years?.at(-1) ?? null;
            const lookupYear = appState.currentYear ?? latest;
            const month = appState.currentMonth;
            
            let val = null;
            if (lookupYear != null && (ds.key === "fishing" || ds.key === "gdp")) val = getValueForFeature(d, lookupYear, meta, month);
            else if (lookupYear != null) val = getValueForFeature(d, lookupYear, meta, month);
            
            const valText = (val != null && !Number.isNaN(val)) ? Number(val).toFixed(2) : 'No data';
            const style = (ds.key === appState.currentDatasetKey) ? 'font-weight:600' : 'opacity:0.95';
            if (lookupYear != null && (ds.key === "fishing" || ds.key === "gdp")) {
                parts.push(`<div style="${style}">${ds.label}: ${valText} <span style="opacity:0.6">(${lookupYear || 'N/A'})</span></div>`);
            } else {
                parts.push(`<div style="${style}">${ds.label}: ${valText} <span style="opacity:0.6">(${lookupYear || 'N/A'}, ${month != null ? month : 'N/A'})</span></div>`);
            }
        });

        tooltip.style('display', 'block').html(parts.join(''));
        const [mx, my] = d3.pointer(event, container);
        tooltip.style('left', `${mx + 12}px`).style('top', `${my + 12}px`);
    };

    countriesGroup.selectAll('path')
        .on('mouseover', updateTooltip)
        .on('mousemove', updateTooltip)
        .on('mouseout', () => tooltip.style('display', 'none'));

    document.getElementById('sst-toggle-checkbox').addEventListener('change', updateSstVisibility);

    // --- 11. Init & Preload ---
    const navSwitch = document.getElementById('nav-dataset-switch');
    if (navSwitch) {
        navSwitch.innerHTML = '';
        DATASETS.filter(d => d.key !== 'sst').forEach(ds => {
            const btn = document.createElement('button');
            btn.textContent = ds.label;
            btn.dataset.key = ds.key;
            btn.addEventListener('click', () => {
                navSwitch.querySelectorAll('button').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                switchToDataset(ds.key);
            });
            navSwitch.appendChild(btn);
        });
        if (navSwitch.firstChild) navSwitch.firstChild.classList.add('selected');
    }

    // Initial Data Load
    const initialKey = 'temperature';
    appState.currentDatasetKey = initialKey;

    // PRELOAD ALL DATASETS IN BACKGROUND
    DATASETS.forEach(ds => {
        fetchDataset(ds.key).then(data => {
            if (!data) return;
            
            if (ds.key === 'sst') {
                appState.sstData = data;
                if (appState.isSstVisible) renderSstLayer();
            } else {
                appState.loadedData.set(ds.key, data);
            }
        });
    });

    // Wait for the initial dataset specifically to ensure map renders immediately
    await switchToDataset(initialKey);
    
    // Expose global updater for timelinef
    globalThis.updateMapMonth = (year, month) => {
        updateMapForMonth(year, month);
    };
};