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



const createWorldMap = async () => {
    const container = document.getElementById("world-map-chart");
    const width = container.clientWidth;
    const height = container.clientHeight;

    // load country data to get geo features
    const countries = await loadCountries();

    // Mercator projection => maps geographic coordinates (lat/lon) from the globe to 2D screen positions
    //// TODO: choose projection: heavily skewed towards the poles => can instead maybe use d3.geoNaturalEarth1() for a more balanced view or d3.geoEquirectangular() for a simple cylindrical projection
    //// ==> given that we primarily are focused on the Pacific region, Mercator might not be a good choice
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
       .attr("fill", COUNTRY_FILL_COLOR)
       .attr("stroke", COUNTRY_STROKE_COLOR)
       .attr('stroke-width', 0.5)
       .attr('vector-effect', 'non-scaling-stroke');

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
        // reset any zoom/pan transform on the group
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
