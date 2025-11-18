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
    const projection = d3.geoMercator()
        .rotate([WORLD_MAP_PROJECTION_OFFSET_LONGITUDE, WORLD_MAP_PROJECTION_OFFSET_LATITUDE]) 
        .scale(WORLD_MAP_SCALE_FACTOR)
        .fitSize([width, height], countries);


    const svg = d3.select("#world-map-chart")
        .append("svg")
        .attr("width", width)
        .attr("height", height);

    // bind country data to SVG paths
    svg.selectAll("path")
       .data(countries.features)
       .join("path")
       .attr("d", d3.geoPath(projection))
       .attr("fill", COUNTRY_FILL_COLOR)
       .attr("stroke", COUNTRY_STROKE_COLOR);
}



const loadCountries = async () => {
    // Make sure to include topojson-client.js if using TopoJSON
    const worldData = await d3.json(WORLD_MAP_ATLAS_URL);
    const countries = topojson.feature(worldData, worldData.objects["countries"]);

    return countries;
}
