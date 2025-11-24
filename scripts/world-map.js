/**
 * File constants and functions for creating and rendering the world map
 */
// rotate 160° to make the Pacific central  
const WORLD_MAP_PROJECTION_OFFSET_LONGITUDE = 160; 
const WORLD_MAP_PROJECTION_OFFSET_LATITUDE = 0;

const WORLD_MAP_SCALE_FACTOR = 160;

const WORLD_MAP_ATLAS_URL = "https://unpkg.com/world-atlas@2/countries-110m.json";
const COUNTRY_FILL_COLOR = "#cce5df";
const COUNTRY_STROKE_COLOR = "#333";



// normalize a country/name string for matching (module-level utility)
function normName(n){
    if (!n) return '';
    // split on whitespace and re-join to normalize multi-space sequences
    return String(n).toLowerCase().split(/\s+/).filter(Boolean).join(' ').trim();
}

// parse raw CSV rows into a uniform row shape (module-scope helpers to satisfy linters)
function parseRawRows(raw){
    return raw.map(r => {
        const out = { region: null, year: null, value: null, iso2: null, country_name: null };
        if (r.year) out.year = +r.year;
        else if (r.time) out.year = +String(r.time).slice(0,4);
        else if (r.date) out.year = +String(r.date).slice(0,4);
        if (r.temperature_celsius) out.value = +r.temperature_celsius;
        else if (r.rainfall_mm) out.value = +r.rainfall_mm;
        else if (r.total_tonnes) out.value = +r.total_tonnes;
        else if (r.oni) out.value = +r.oni;
        if (r.region) out.region = +r.region;
        if (r.abbrev) out.iso2 = String(r.abbrev).trim();
        if (r.country_name) out.country_name = String(r.country_name).trim();
        if (r.country_un_code) out.region = +r.country_un_code;
        if (r.country_iso3 && !out.iso2) out.iso2 = r.country_iso3.slice(0,2);
        return out;
    });
}

function aggregateRows(rows){
    const byYear = new Map();
    for (const r of rows){
        if (!r.year || r.value == null) continue;
        const yearMap = byYear.get(r.year) || new Map();
        const keys = [];
        if (r.region && !Number.isNaN(r.region) && r.region !== 0) keys.push(String(+r.region));
        if (r.iso2) keys.push(String(r.iso2).toUpperCase());
        if (r.country_name) keys.push(normName(r.country_name));
        for (const k of keys){
            const arr = yearMap.get(k) || [];
            arr.push(r.value);
            yearMap.set(k, arr);
        }
        byYear.set(r.year, yearMap);
    }

    const byYearMean = new Map();
    const years = [];
    for (const [yr, yrMap] of byYear.entries()){
        const m = new Map();
        for (const [k, arr] of yrMap.entries()){
            const sum = arr.reduce((a,b)=>a+b,0);
            m.set(k, sum/arr.length);
        }
        byYearMean.set(yr, m);
        years.push(yr);
    }
    years.sort((a,b)=>a-b);
    return { byYearMean, years };
}

const createWorldMap = async () => {
    const container = document.getElementById("world-map-chart");
    const width = container.clientWidth;
    const height = container.clientHeight;

    // load country data to get geo features
    const countries = await loadCountries();

    const projection = d3.geoNaturalEarth1()
        .rotate([WORLD_MAP_PROJECTION_OFFSET_LONGITUDE, WORLD_MAP_PROJECTION_OFFSET_LATITUDE]) 
        .scale(WORLD_MAP_SCALE_FACTOR)
        .fitSize([width, height], countries);


    const svg = d3.select("#world-map-chart")
        .append("svg")
        .attr("width", width)
        .attr("height", height)
        .attr("viewBox", `0 0 ${width} ${height}`)
        .attr("preserveAspectRatio", "xMidYMid meet");

    // Create a group to hold the map paths so we can rotate/zoom the projection on drag
    const mapGroup = svg.append('g').attr('class', 'map-group');

    // Add a background rect to capture drag/zoom events
    const bg = svg.append('rect')
        .attr('width', width)
        .attr('height', height)
        .attr('fill', 'transparent')
        .lower();

    // Path generator that uses the mutable projection
    const pathGenerator = d3.geoPath().projection(projection);

    // bind country data to SVG paths inside the group
    mapGroup.selectAll("path")
       .data(countries.features)
       .join("path")
       .attr("d", pathGenerator)
       .attr("fill", '#eee')
       .attr("stroke", COUNTRY_STROKE_COLOR)
       .attr('stroke-width', 0.5)
       .attr('vector-effect', 'non-scaling-stroke');

    // --- Dataset selector UI (above the map) ---
    // insert toolbar immediately before the SVG so it appears directly above the map
    const svgNode = d3.select(container).select('svg').node();
    const toolbar = d3.select(container)
        .insert('div', () => svgNode)
        .attr('id', 'map-dataset-toolbar')
        // center the toolbar and add spacing so it doesn't overlap other page items
        .style('display', 'flex')
        .style('justify-content', 'center')
        .style('align-items', 'center')
        .style('gap', '8px')
    .style('width', '100%')
    // add more top margin so the toolbar doesn't overlap the page title
    .style('margin', '40px 0 8px')
        .style('font-family', 'sans-serif')
        .style('font-size', '13px');

    toolbar.append('label').text('Dataset: ');
    const selector = toolbar.append('select').attr('id', 'map-dataset-select')
        .style('min-width', '220px');

    const DATASETS = [
        { key: 'temperature', label: 'Temperature', path: 'python_scripts/data/temperature_by_country.csv' },
        { key: 'rainfall', label: 'Rainfall', path: 'python_scripts/data/rainfall_by_country.csv' },
        { key: 'fishing', label: 'Fishing', path: 'python_scripts/data/fishing_by_country_year.csv' },
        { key: 'oni', label: 'ONI', path: 'python_scripts/data/oni_monthly.csv' }
    ];

    for (const d of DATASETS) {
        selector.append('option').attr('value', d.key).text(d.label);
    }

    // --- Legend placeholder ---
    const legend = d3.select(container)
        .append('div')
        .attr('id', 'map-legend')
        .style('position', 'absolute')
    // raise the legend a bit to avoid overlapping the fixed footer
    .style('bottom', '48px')
        .style('left', '50%')
        .style('transform', 'translateX(-50%)')
        .style('z-index', 1000)
        .style('background', 'rgba(255,255,255,0.92)')
        .style('padding', '8px 10px')
        .style('border-radius', '6px')
        .style('box-shadow', '0 2px 10px rgba(0,0,0,0.12)')
        .style('display', 'flex')
        .style('flex-direction', 'column')
        .style('align-items', 'center')
        .style('font-family', 'sans-serif')
        .style('font-size', '12px');

    legend.append('div').attr('class','legend-title').style('font-weight','600').style('margin-bottom','6px').text('');
    // gradient bar container
    legend.append('div').attr('class','legend-bar')
        .style('width','360px')
        .style('height','12px')
        .style('border-radius','3px')
        .style('box-shadow','inset 0 0 0 1px rgba(0,0,0,0.05)')
        .style('background','#eee');
    // labels container for min/max
    const legendLabels = legend.append('div').attr('class','legend-labels')
        .style('width','360px')
        .style('display','flex')
        .style('justify-content','space-between')
        .style('margin-top','6px');
    legendLabels.append('div').attr('class','legend-min').text('');
    legendLabels.append('div').attr('class','legend-max').text('');

    // tooltip (hidden by default) — will show country name and value for current dataset/year
    const tooltip = d3.select(container)
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

    // store loaded datasets: key -> { byYearMean: Map(year -> Map(key->value)), years: [] }
    const loaded = new Map();
    let currentDatasetKey = null;
    let currentYear = null; // last-applied year for the current visualization

    // parse raw CSV rows into a uniform row shape
    // helper functions moved to module scope

    async function loadDataset(key, {apply=true} = {}){
        const ds = DATASETS.find(d=>d.key===key);
        if (!ds) return;
        // if already loaded, just apply latest
        if (loaded.has(key)){
            if (apply){
                currentDatasetKey = key;
                const meta = loaded.get(key);
                const latest = meta.years.at(-1) ?? null;
                if (latest != null) applyColorsForDatasetYear(key, latest);
            }
            return loaded.get(key);
        }

        try {
            const raw = await d3.csv(ds.path);
            const rows = parseRawRows(raw);
            const { byYearMean, years } = aggregateRows(rows);
            loaded.set(key, { byYearMean, years });
            if (apply){
                currentDatasetKey = key;
                const latest = years.at(-1) ?? null;
                if (latest != null) applyColorsForDatasetYear(key, latest);
            }
            return loaded.get(key);
        } catch (err){
            console.warn('Failed to load dataset', key, err);
        }
    }

    function valueForFeatureFromDataset(feature, year, key){
        const meta = loaded.get(key);
        if (!meta) return null;
        const yrMap = meta.byYearMean.get(year);
        if (!yrMap) return null;
        if (feature.id != null){
            const idKey = String(+feature.id);
            if (yrMap.has(idKey)) return yrMap.get(idKey);
        }
        if (feature.properties){
            const p = feature.properties;
            if (p.iso_a2 && yrMap.has(p.iso_a2)) return yrMap.get(p.iso_a2);
            const n = normName(p.name || p.country_name || p.ADMIN || '');
            if (n && yrMap.has(n)) return yrMap.get(n);
        }
        return null;
    }

    function applyColorsForDatasetYear(key, year){
        // remember current year for tooltips and external sync
        currentYear = year;
        const meta = loaded.get(key);
        if (!meta) return;
        const yrMap = meta.byYearMean.get(year) || new Map();
        const values = Array.from(yrMap.values()).filter(v => v != null && !Number.isNaN(v));
        if (values.length === 0){
            mapGroup.selectAll('path').attr('fill', '#eee');
            // clear legend
            legend.select('.legend-title').text('');
            legend.select('.legend-min').text('');
            legend.select('.legend-max').text('');
            legend.select('.legend-bar').style('background', '#eee');
            return;
        }
        const minV = d3.min(values);
        const maxV = d3.max(values);
        const color = d3.scaleSequential(d3.interpolateRdYlBu).domain([maxV, minV]);
        mapGroup.selectAll('path')
            .transition().duration(250)
            .attr('fill', d => {
                const v = valueForFeatureFromDataset(d, year, key);
                return v == null ? '#eee' : color(v);
            });

        // update legend: gradient, title and labels
        const ds = DATASETS.find(d=>d.key===key);
        const title = ds ? ds.label : key;
        legend.select('.legend-title').text(`${title} — ${year}`);

        // build gradient from max->min by sampling stops
        const stops = 6;
        const gradColors = [];
        for (let i=0;i<stops;i++){
            const t = i/(stops-1);
            const val = minV + (maxV-minV)*t;
            gradColors.push(color(val));
        }
        const gradCss = `linear-gradient(to right, ${gradColors.join(',')})`;
        legend.select('.legend-bar').style('background', gradCss);
        legend.select('.legend-min').text(minV.toFixed(2));
        legend.select('.legend-max').text(maxV.toFixed(2));
    }

    // attach hover handlers to paths to show the tooltip using cached data
    mapGroup.selectAll('path')
        .on('mouseover', function(event, d){
            const name = d?.properties?.name || d?.properties?.ADMIN || d?.properties?.country_name || 'Unknown';
            // build tooltip content with all datasets (selected or not)
            const parts = [];
            parts.push(`<div style="font-weight:600; margin-bottom:6px">${name}</div>`);
            for (const ds of DATASETS){
                const dsKey2 = ds.key;
                const meta = loaded.get(dsKey2);
                const latestForDs = meta?.years?.at(-1) ?? null;
                const yearForLookup2 = (dsKey2 === currentDatasetKey) ? (currentYear ?? latestForDs) : latestForDs;
                    let val2 = null;
                    if (yearForLookup2 !== null && yearForLookup2 !== undefined) {
                        val2 = valueForFeatureFromDataset(d, yearForLookup2, dsKey2);
                    }
                const hasVal = val2 != null && !Number.isNaN(val2);
                const valText2 = hasVal ? Number(val2).toFixed(2) : 'No data';
                const displayYear = yearForLookup2 ?? 'n/a';
                if (dsKey2 === currentDatasetKey){
                        parts.push(`<div style="font-weight:600">${ds.label}: ${valText2} <span style="opacity:0.7">(${displayYear})</span></div>`);
                } else {
                        parts.push(`<div style="opacity:0.95">${ds.label}: ${valText2} <span style="opacity:0.6">(${displayYear})</span></div>`);
                }
            }
            tooltip.style('display', 'block').html(parts.join(''));
        })
        .on('mousemove', function(event){
            const [mx, my] = d3.pointer(event, container);
            const offsetX = 12, offsetY = 12;
            tooltip.style('left', `${mx + offsetX}px`).style('top', `${my + offsetY}px`);
        })
        .on('mouseout', function(){
            tooltip.style('display', 'none');
        });

    // selection handler: assume datasets are already loaded in `loaded`.
    // On change, simply switch the visualization to the selected dataset using cached data.
    // If the dataset isn't present in the cache, fall back to loading it.
    selector.on('change', (event) => {
        const k = event.target.value;
        currentDatasetKey = k;
        const meta = loaded.get(k);
        if (meta && Array.isArray(meta.years) && meta.years.length){
            const latest = meta.years.at(-1) ?? null;
            if (latest != null) applyColorsForDatasetYear(k, latest);
        } else {
            // fallback: dataset not cached yet — load it (keeps backwards compatibility)
            loadDataset(k);
        }
    });

    // Preload all datasets (without applying colors), then apply the default dataset once ready.
    (async () => {
        const preloadPromises = DATASETS.map(d => loadDataset(d.key, { apply: false }).catch(err => {
            console.warn('Preload failed for dataset', d.key, err);
            return null;
        }));
        await Promise.all(preloadPromises);
        // after preloading, apply the default dataset's latest year
        const defaultKey = DATASETS[0]?.key;
        if (defaultKey){
            const meta0 = loaded.get(defaultKey);
            if (meta0 && Array.isArray(meta0.years) && meta0.years.length){
                const latest = meta0.years.at(-1) ?? null;
                if (latest != null) {
                    currentDatasetKey = defaultKey;
                    applyColorsForDatasetYear(defaultKey, latest);
                }
            } else {
                // fallback: if preload didn't load it, load normally and apply
                await loadDataset(defaultKey, { apply: true });
            }
        }
    })();

    // expose updater that applies to the currently selected dataset
    globalThis.updateMapYear = (year) => {
        if (currentDatasetKey) applyColorsForDatasetYear(currentDatasetKey, year);
    };

    // Setup zoom behaviour
    const zoom = d3.zoom()
        .scaleExtent([1, 8]) // allow zoom between 1x and 8x (Maybe we can offer to the user a menu to set zoom level?)
        .filter((event) => {
            return event.type === 'wheel' || event.type === 'touchstart' || event.type === 'touchmove';
        })
        .on('zoom', (event) => {
            // apply transform to group for zooming
            mapGroup.attr('transform', event.transform);
        });

    // Attach zoom to svg
    svg.call(zoom);

    // Double-click resets zoom transform AND the projection rotation (scroll)
    svg.on('dblclick', () => {
        // reset projection rotation to initial offsets
        projection.rotate([WORLD_MAP_PROJECTION_OFFSET_LONGITUDE, WORLD_MAP_PROJECTION_OFFSET_LATITUDE, 0]);
        // redraw visible paths with the reset projection
        mapGroup.selectAll('path').attr('d', pathGenerator);
        svg.transition().duration(500).call(zoom.transform, d3.zoomIdentity);
    });

    let dragStartPos = null;
    let dragStartRotate = null;

    function setDraggingCursor(isDragging) {
        svg.style('cursor', isDragging ? 'grabbing' : null);
    }

    const drag = d3.drag()
        .on('start', (event) => {
            dragStartPos = [event.x, event.y];
            dragStartRotate = projection.rotate();
            setDraggingCursor(true);
        })
        .on('drag', (event) => {
            if (!dragStartPos || !dragStartRotate) return;
            const dx = event.x - dragStartPos[0];
            const dy = event.y - dragStartPos[1];
            const sensitivityX = 0.12; // degrees per pixel (Maybe we can offer to the user a menu to set sensibility level?)
            const sensitivityY = 0.04; // vertical sensitivity

            // update longitude (lambda) and latitude (phi) for a more natural globe rotation
            let lambda = dragStartRotate[0] + dx * sensitivityX;
            let phi = (dragStartRotate[1] || 0) - dy * sensitivityY;
            // clamp phi to avoid flipping the globe
            const PHI_LIMIT = 90; 
            phi = Math.max(-PHI_LIMIT, Math.min(PHI_LIMIT, phi));

            projection.rotate([lambda, phi, 0]);

            // update all paths
            mapGroup.selectAll('path').attr('d', pathGenerator);
        })
        .on('end', () => {
            setDraggingCursor(false);
            dragStartPos = null;
            dragStartRotate = null;
        });

    // Attach drag to the background so it doesn't interfere with path hits
    // Ensure no persistent cursor on background — cursor only set while grabbing
    bg.style('cursor', null);
    bg.call(drag);
}



const loadCountries = async () => {
    // Make sure to include topojson-client.js if using TopoJSON
    const worldData = await d3.json(WORLD_MAP_ATLAS_URL);
    const countries = topojson.feature(worldData, worldData.objects["countries"]);

    return countries;
}
