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
    { key: 'temperature', label: 'Temperature (°C)', path: 'python_scripts/data/temperature_by_country.csv' },
    { key: 'gdp', label: 'GDP growth (%)' },
    { key: 'rainfall', label: 'Rainfall (mm)', path: 'python_scripts/data/rainfall_by_country.csv' },
    { key: 'fishing', label: 'Fishing (tonnes)', path: 'python_scripts/data/fishing_by_country_year.csv' },
    { key: 'sst', label: 'Sea Surface Temperature (°C)', path: 'python_scripts/data/global_sst.json' }
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
        const out = { region: null, year: null, value: null, iso2: null, country_name: null };
        if (r.year) out.year = +r.year;
        else if (r.time) out.year = +String(r.time).slice(0, 4);
        else if (r.date) out.year = +String(r.date).slice(0, 4);
        
        if (r.temperature_celsius) out.value = +r.temperature_celsius;
        else if (r.rainfall_mm) out.value = +r.rainfall_mm;
        else if (r.total_tonnes) out.value = +r.total_tonnes;
        else if (r.oni) out.value = +r.oni;

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
    for (const r of rows) {
        if (!r.year || r.value == null) continue;
        const yearMap = byYear.get(r.year) || new Map();
        const keys = [];
        if (r.region && !Number.isNaN(r.region) && r.region !== 0) keys.push(String(+r.region));
        if (r.iso2) keys.push(String(r.iso2).toUpperCase());
        if (r.country_name) keys.push(normName(r.country_name));
        
        for (const k of keys) {
            const arr = yearMap.get(k) || [];
            arr.push(r.value);
            yearMap.set(k, arr);
        }
        byYear.set(r.year, yearMap);
    }

    const byYearMean = new Map();
    const years = [];
    for (const [yr, yrMap] of byYear.entries()) {
        const m = new Map();
        for (const [k, arr] of yrMap.entries()) {
            const sum = arr.reduce((a, b) => a + b, 0);
            m.set(k, sum / arr.length);
        }
        byYearMean.set(yr, m);
        years.push(yr);
    }
    years.sort((a, b) => a - b);
    return { byYearMean, years };
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
    const url = `${MAP_CONFIG.WORLD_BANK_API_BASE}/country/all/indicator/NY.GDP.MKTP.KD.ZG?format=json&per_page=20000&date=1990:2024`;
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

async function fetchDataset(key) {
    const ds = DATASETS.find(d => d.key === key);
    if (!ds) return null;
    try {
        if (key === 'gdp') return await loadGDPData();
        if (key === 'sst') return await d3.json(ds.path);
        if (!ds.path) throw new Error(`Dataset ${key} has no path to load`);
        const rawCsv = await d3.csv(ds.path);
        const parsed = parseRawRows(rawCsv);
        return aggregateRows(parsed);
    } catch (err) {
        console.warn('Failed to load dataset', key, err);
        return null;
    }
}

// ==========================================
// 4. UI HELPERS
// ==========================================

function setupLegend(container) {
    const legend = d3.select(container)
        .append('div')
        .attr('id', 'map-legend')
        .style('position', 'absolute')
        .style('right', '12px')
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

function createSizeLegend(container, scale, values, labelFmt = v => (v == null ? 'n/a' : Number(v).toLocaleString())) {
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

function getValueForFeature(feature, year, metaData) {

    if (!metaData) return null;
    if (!metaData.byYearMean) return null;
    const yrMap = metaData.byYearMean.get(year);
    if (!yrMap) return null;

    if (feature.id != null) {
        const idKey = String(+feature.id);
        if (yrMap.has(idKey)) return yrMap.get(idKey);
    }
    if (feature.properties) {
        const p = feature.properties;
        if (p.iso_a2 && yrMap.has(p.iso_a2)) return yrMap.get(p.iso_a2);
        const iso3 = (p.iso_a3 || p.ISO_A3 || '').toString().toUpperCase();
        if (iso3 && yrMap.has(iso3)) return yrMap.get(iso3);
        const rawName = p.name || p.country_name || p.ADMIN || '';
        const n = normName(rawName);
        if (n && yrMap.has(n)) return yrMap.get(n);
        if (rawName && COUNTRY_NAME_MAPPING[rawName]) {
            const mappedName = normName(COUNTRY_NAME_MAPPING[rawName]);
            if (yrMap.has(mappedName)) return yrMap.get(mappedName);
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

    // Background Rect: Catches drag events on empty oceans
    const bgRect = svg.append('rect')
        .attr('width', '100%')
        .attr('height', '100%')
        .attr('fill', 'transparent')
        .style('pointer-events', 'all')
        .lower();

    const mapGroup = svg.append('g').attr('class', 'map-group');

    // Layers
    const countriesGroup = mapGroup.append('g').attr('class', 'countries-layer');
    const fishingLayer = mapGroup.append('g').attr('class', 'fishing-layer');
    const sstLayer = mapGroup.append('g').attr('class', 'sst-layer');

    // --- 5. HELPER: REDRAW GEOMETRY (DRY) ---
    // Used by both Drag Rotation and Double-Click Reset
    const redrawMapGeometry = () => {
        // Redraw Countries
        countriesGroup.selectAll('path').attr('d', pathGenerator);

        // Reposition Fishing Circles
        fishingLayer.selectAll('circle.fish')
            .attr('cx', d => { const c = getSafeCentroid(d, projection); return Number.isNaN(c[0]) ? -9999 : c[0]; })
            .attr('cy', d => { const c = getSafeCentroid(d, projection); return Number.isNaN(c[1]) ? -9999 : c[1]; });

        // Reposition SST rects
        sstLayer.selectAll('rect.sst-rect').each(function(d) {
            const lonAdj = d.lon > 180 ? d.lon - 360 : d.lon;
            const p = projection([lonAdj, d.lat]);
            if (!p || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) {
                d3.select(this).attr('x', -9999).attr('y', -9999);
                return;
            }
            d.px = p[0]; d.py = p[1];
            const w = d.w || 1; const h = d.h || 1;
            d3.select(this).attr('x', d.px - w/2).attr('y', d.py - h/2);
        });

        sstLayer.selectAll('path.sst-contour').attr('d', pathGenerator);
    };

    // Draw fishing circles with adaptive radius scale
    function drawFishingPoints(countriesFeatures, fishingLayer, projection, values, year, meta, width, height, legendContainer) {
        const scale = computeRadiusScale(values, { width, height, minRadius: 1.5, maxRadiusFactor: 1/18 });

        const circles = fishingLayer.selectAll('circle.fish')
            .data(countriesFeatures, d => d.id);

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
            // Hide the default legend elements
            $legend.select('.legend-bar').style('display', 'none');
            $legend.select('.legend-max').style('display', 'none');
            $legend.select('.legend-min').style('display', 'none');
            $legend.select('.legend-title').text('Fishing (tonnes)');

            // Remove previous fishing legend then create the size legend
            $legend.select('.fishing-size-legend').remove();
            createSizeLegend(legendContainer, scale, values, v => `${Math.round(v).toLocaleString()} t`);
        }
    }

    // --- 6. INTERACTION DEFINITIONS ---

    // A) Drag Behavior (Rotation with Limits)
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

    // B) Zoom Behavior (Scaling via Transform)
    const zoom = d3.zoom()
        .scaleExtent([1, 8])
        // Disable D3's default wheel listener so we can use our smooth one
        .filter((event) => !event || event.type !== 'wheel') 
        .on('zoom', (event) => {
            mapGroup.attr('transform', event.transform);
        });

    // C) Attach Standard Behaviors
    svg.call(drag);
    svg.call(zoom);

    // D) Custom Smooth Wheel Zoom
    svg.node().addEventListener('wheel', (e) => {
        // Allow standard scroll if keys pressed (ctrl/cmd etc)
        if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
        e.preventDefault();
        
        const delta = -e.deltaY;
        const factor = Math.pow(1.006, delta);
        const center = [width / 2, height / 2];
        const t = d3.zoomTransform(svg.node());
        
        let newK = t.k * factor;
        newK = Math.max(1, Math.min(8, newK));
        
        // Smoothly interpolate zoom level
        svg.transition().duration(120).call(zoom.scaleTo, newK, center);
    }, { passive: false });

    // E) Double Click Reset
    svg.on('dblclick.zoom', null); // Remove default D3 zoom-reset
    svg.on('dblclick', () => {
        // 1. Reset Projection
        projection.rotate([MAP_CONFIG.PROJECTION_OFFSET_LONGITUDE, MAP_CONFIG.PROJECTION_OFFSET_LATITUDE]);
        redrawMapGeometry();
        
        // 2. Reset Zoom Transform
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
    const legend = setupLegend(container);
    const tooltip = setupTooltip(container);

    // --- 9. State & Update Logic ---
    const appState = {
        loadedData: new Map(),
        loadedSSTData: null,
        currentDatasetKey: null,
        currentYear: null,
        selectedDatasets: new Set()
    };

    function updateMapForMonth(input, monthOpt) {

        let year = null;
        let month = null; // 1-12 or null
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

        const key = appState.currentDatasetKey;
        const meta = appState.loadedData.get(key);
        if (!meta) return;

        d3.select(legend.node()).select('.fishing-size-legend').remove();
        legend.select('.legend-bar').style('display', null);
        legend.select('.legend-max').style('display', null);
        legend.select('.legend-min').style('display', null);

        let values;
        
        if (key !== 'sst') {
            // For non-SST datasets we use the year part of the selection. (TODO adapt when month data available)
            const yrMap = meta.byYearMean.get(year) || new Map();
            values = Array.from(yrMap.values()).filter(v => v != null && !Number.isNaN(v));
            if (values.length === 0) {
                countriesGroup.selectAll('path').attr('fill', COLORS.COUNTRY_FILL);
                legend.select('.legend-title').text('');
                return;
            }
        }

        fishingLayer.style('display', 'none');
        sstLayer.style('display', 'none');

        // --- GDP VISUALIZATION ---
        if (key === 'gdp') {
            const absMax = 2.5; 
            const colorForGdp = (val) => {
                if (val == null || val === undefined) return '#eee';
                const t = Math.min(1, Math.abs(val) / absMax);
                return val > 0 
                    ? d3.interpolateRgb('#ffffff', COLORS.GDP_GROWTH_POS)(t) 
                    : d3.interpolateRgb('#ffffff', COLORS.GDP_GROWTH_NEG)(t);
            };

            countriesGroup.selectAll('path')
                .transition().duration(UI_CONFIG.TRANSITION_DURATION_MS)
                .attr('fill', d => {
                    const val = getValueForFeature(d, year, meta);
                    return colorForGdp(val);
                });
            
            legend.select('.legend-title').text(`GDP Growth — ${year}`);
            const stops = 9;
            const gradColors = Array.from({length: stops}, (_, i) => {
                const t = i / (stops - 1);
                const val = absMax - (2 * absMax) * t;
                return colorForGdp(val);
            });
            legend.select('.legend-bar').style('background', `linear-gradient(to bottom, ${gradColors.join(',')})`);
            legend.select('.legend-max').text(`≥ ${absMax.toFixed(1)}%`);
            legend.select('.legend-min').text(`≤ -${absMax.toFixed(1)}%`);

        // --- FISHING VISUALIZATION ---
        } else if (key === 'fishing') {
            countriesGroup.selectAll('path').attr('fill', COLORS.COUNTRY_FILL);

            drawFishingPoints(countries.features, fishingLayer, projection, values, year, meta, width, height, legend.node());

        // --- RAINFALL VISUALIZATION ---
        } else if (key === 'rainfall') {
            const minV = d3.min(values), maxV = d3.max(values);
            const colorScale = d3.scaleSequential(d3.interpolateRdYlBu).domain([maxV, minV]);
            
            countriesGroup.selectAll('path')
                .transition().duration(UI_CONFIG.TRANSITION_DURATION_MS)
                .attr('fill', d => {
                    const val = getValueForFeature(d, year, meta);
                    return val == null ? COLORS.COUNTRY_FILL : colorScale(val);
                });

            // Update legend to reflect rainfall color scale
            legend.select('.legend-title').text(`Rainfall — ${year}`);
            const stops = 6;
            const gradColors = Array.from({length: stops}, (_, i) => {
                const t = i / (stops - 1);
                return colorScale(maxV + (minV - maxV) * t);
            });
            legend.select('.legend-bar').style('background', `linear-gradient(to bottom, ${gradColors.join(',')})`);
            legend.select('.legend-max').text(maxV != null ? maxV.toFixed(2) : 'n/a');
            legend.select('.legend-min').text(minV != null ? minV.toFixed(2) : 'n/a');
            
        // --- SST VISUALIZATION ---
        } else if (key === 'sst') {

            countriesGroup.selectAll('path').attr('fill', COLORS.COUNTRY_FILL);

            const sstData = appState.loadedSSTData;
            if (!sstData) return;

            const latCount = 18;
            const lonCount = 36;
            const latMin = -90;
            const latMax = 90;
            const lonMin = 0;
            const lonMax = 360;

            const latStep = (latMax - latMin) / (latCount - 1);
            const lonStep = (lonMax - lonMin) / (lonCount - 1);

            const lats = Array.from({length: latCount}, (_, i) => latMin + i * latStep);
            const lons = Array.from({length: lonCount}, (_, j) => lonMin + j * lonStep);

            let monthData = null;
            if (year != null) {
                // If a month is provided, prefer the exact YYYY-MM match.
                if (month != null) {
                    const mm = String(month).padStart(2, '0');
                    const monthStr = `${String(year)}-${mm}`;
                    monthData = sstData.find(d => d.month === monthStr);
                }
                // fallback to January of the year (preserves previous behavior)
                if (!monthData) {
                    const monthStr = `${String(year)}-01`;
                    monthData = sstData.find(d => d.month === monthStr);
                }
            }

            if (!monthData){
                legend.select('.legend-title').text('Data available between 1982/01 and 2023/01');
                legend.select('.legend-bar').style('background', '');
                legend.select('.legend-max').text('');
                legend.select('.legend-min').text('');
                return;
            }
                

            const grid = new Array(lonCount * latCount);
            for (let i = 0; i < latCount; i++) {
                for (let j = 0; j < lonCount; j++) {
                    const raw = monthData.values[i * lonCount + j];
                    const val = (raw == null || Number.isNaN(raw)) ? NaN : +raw;
                    const lonAdj = lons[j] > 180 ? lons[j] - 360 : lons[j];
                    const lat = lats[i];
                    // If point is on land, mask it as NaN so contours won't cover land
                    let isLand = false;
                    for (const feat of countries.features) {
                        if (d3.geoContains(feat, [lonAdj, lat])) { isLand = true; break; }
                    }
                    grid[j + i * lonCount] = isLand ? NaN : val;
                }
            }

            const sstValues = grid.filter(v => Number.isFinite(v));
            const minSST = d3.min(sstValues);
            const maxSST = d3.max(sstValues);

            // coolwarm diverging scale
            const coolWarmInterp = d3.interpolateRgbBasis(["#3b4cc0", "#ffffff", "#b40426"]);
            const colorScale = d3.scaleDiverging(coolWarmInterp).domain([minSST, (minSST + maxSST) / 2, maxSST]);

            const upscale = 3;
            const uCols = lonCount * upscale;
            const uRows = latCount * upscale;
            const upGrid = new Array(uCols * uRows);
            for (let yi = 0; yi < uRows; yi++) {
                for (let xi = 0; xi < uCols; xi++) {
                    const fx = xi / upscale;
                    const fy = yi / upscale;
                    const x0 = Math.floor(Math.max(0, Math.min(lonCount - 1, fx)));
                    const y0 = Math.floor(Math.max(0, Math.min(latCount - 1, fy)));
                    const x1 = Math.min(lonCount - 1, x0 + 1);
                    const y1 = Math.min(latCount - 1, y0 + 1);
                    const sx = fx - x0;
                    const sy = fy - y0;
                    const v00 = grid[x0 + y0 * lonCount];
                    const v10 = grid[x1 + y0 * lonCount];
                    const v01 = grid[x0 + y1 * lonCount];
                    const v11 = grid[x1 + y1 * lonCount];
                    const samples = [
                        { v: v00, w: (1 - sx) * (1 - sy) },
                        { v: v10, w: sx * (1 - sy) },
                        { v: v01, w: (1 - sx) * sy },
                        { v: v11, w: sx * sy }
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

            sstLayer.selectAll('rect.sst-rect').remove();

            const paths = sstLayer.selectAll('path.sst-contour')
                .data(features, d => String(d.properties.value));

            paths.exit().remove();
            const enter = paths.enter().append('path').attr('class', 'sst-contour');
            const geoPath = d3.geoPath().projection(projection);

            paths.merge(enter)
                .attr('d', d => geoPath(d))
                .attr('fill', d => colorScale(d.properties.value))
                .attr('stroke', '#ffffff')
                .attr('stroke-opacity', 0.18)
                .attr('stroke-width', 0.2)
                .attr('opacity', 0.78)
                .attr('pointer-events', 'none');

            sstLayer.style('display', null);
            // Place the SST layer behind country shapes so land visually hides contours
            if (typeof sstLayer.lower === 'function') sstLayer.lower();

            // Update legend for SST
            legend.select('.legend-title').text(`Sea Surface Temperature — ${monthData.month}`);
            const stops = 6;
            const gradColors = Array.from({length: stops}, (_, i) => {
                const t = i / (stops - 1);
                return colorScale(maxSST - (maxSST - minSST) * t);
            });
            legend.select('.legend-bar').style('background', `linear-gradient(to bottom, ${gradColors.join(',')})`);
            legend.select('.legend-max').text(maxSST != null ? maxSST.toFixed(2) : 'n/a');
            legend.select('.legend-min').text(minSST != null ? minSST.toFixed(2) : 'n/a');

        // --- STANDARD VISUALIZATION ---
        } else {
            const minV = d3.min(values), maxV = d3.max(values);
            const colorScale = d3.scaleSequential(d3.interpolateRdYlBu).domain([maxV, minV]);

            countriesGroup.selectAll('path')
                .transition().duration(UI_CONFIG.TRANSITION_DURATION_MS)
                .attr('fill', d => {
                    const val = getValueForFeature(d, year, meta);
                    return val == null ? COLORS.COUNTRY_FILL : colorScale(val);
                });
            
            const ds = DATASETS.find(d => d.key === key);
            legend.select('.legend-title').text(`${ds ? ds.label : key} — ${year}`);
            const stops = 6;
            const gradColors = Array.from({length: stops}, (_, i) => {
                const t = i / (stops - 1);
                return colorScale(maxV + (minV - maxV) * t);
            });
            legend.select('.legend-bar').style('background', `linear-gradient(to bottom, ${gradColors.join(',')})`);
            legend.select('.legend-max').text(maxV.toFixed(2));
            legend.select('.legend-min').text(minV.toFixed(2));
        }
    }

    async function switchToDataset(key) {
        appState.currentDatasetKey = key;
        appState.selectedDatasets.clear();
        appState.selectedDatasets.add(key);

        if (!appState.loadedData.has(key)) {
            const data = await fetchDataset(key);
            if (key === 'sst' && data) appState.loadedSSTData = data;
            if (data) appState.loadedData.set(key, data);
        }

        if (key !== 'sst') {
            const meta = appState.loadedData.get(key);
            if (!meta) return;

            sstLayer.style('display', 'none');

            const selYear = appState.currentYear == null ? null : +appState.currentYear;
            let targetYear = null;
            if (selYear != null && Array.isArray(meta.years) && meta.years.length > 0) {
                    targetYear = selYear;
            } else {
                // fallback to most recent available year
                targetYear = (meta.years && meta.years.length) ? meta.years.at(-1) : null;
            }

            if (targetYear != null) updateMapForMonth({ year: targetYear, month: appState.currentMonth });
        } else {
            const sstData = appState.loadedSSTData;
            if (!sstData) return;

            const selYear = appState.currentYear == null ? null : +appState.currentYear;
            const selMonth = appState.currentMonth == null ? null : +appState.currentMonth;

            let monthStr = null;
            if (selYear != null) {
                if (selMonth != null) {
                    const mm = String(selMonth).padStart(2, '0');
                    monthStr = `${selYear}-${mm}`;
                    if (!sstData.find(d => d.month === monthStr)) monthStr = null;
                }
                // fallback to January of that year if exact month not found
                if (!monthStr) {
                    const jan = `${selYear}-01`;
                    if (sstData.find(d => d.month === jan)) monthStr = jan;
                }
            }

            if (!monthStr && selYear != null) {
                // collect months in that year
                const candidates = sstData.filter(d => d.month && d.month.startsWith(`${selYear}-`)).map(d => d.month);
                if (candidates.length > 0) monthStr = candidates[0];
            }

            if (!monthStr) {
                monthStr = `${selYear}-01`;
            }

            if (monthStr) {
                updateMapForMonth(monthStr);
            }
        }
    }

    // --- 10. Interactions (Tooltip) ---
    const updateTooltip = (event, d) => {
        const name = d?.properties?.name || d?.properties?.ADMIN || 'Unknown';
        const parts = [`<div style="font-weight:600; margin-bottom:6px">${name}</div>`];
        
        DATASETS.forEach(ds => {
            const meta = appState.loadedData.get(ds.key);
            const latest = meta?.years?.at(-1) ?? null;
            const lookupYear = appState.currentYear ?? latest;
            let val = null;
            if (lookupYear != null) val = getValueForFeature(d, lookupYear, meta);
            
            const valText = (val != null && !Number.isNaN(val)) ? Number(val).toFixed(2) : 'No data';
            const style = (ds.key === appState.currentDatasetKey) ? 'font-weight:600' : 'opacity:0.95';
            parts.push(`<div style="${style}">${ds.label}: ${valText} <span style="opacity:0.6">(${lookupYear || 'n/a'})</span></div>`);
        });

        tooltip.style('display', 'block').html(parts.join(''));
        const [mx, my] = d3.pointer(event, container);
        tooltip.style('left', `${mx + 12}px`).style('top', `${my + 12}px`);
    };

    countriesGroup.selectAll('path')
        .on('mouseover', updateTooltip)
        .on('mousemove', updateTooltip)
        .on('mouseout', () => tooltip.style('display', 'none'));

    // --- 11. Init & Preload ---
    const navSwitch = document.getElementById('nav-dataset-switch');
    if (navSwitch) {
        navSwitch.innerHTML = '';
        DATASETS.forEach(ds => {
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
    }

    (async () => {
        const preloadPromises = DATASETS.map(d => fetchDataset(d.key).then(data => {
            if (d.key === 'sst' && data) appState.loadedSSTData = data;
            if (data) appState.loadedData.set(d.key, data);
        }));
        await Promise.all(preloadPromises);

        const defaultKey = DATASETS[0]?.key;
        if (defaultKey) {
            const defaultBtn = navSwitch ? navSwitch.querySelector(`button[data-key="${defaultKey}"]`) : null;
            if (defaultBtn) defaultBtn.classList.add('selected');
            switchToDataset(defaultKey);
        }
    })();

    globalThis.updateMapMonth = (arg, month) => {
        if (appState.currentDatasetKey) updateMapForMonth(arg, month);
    };
};
