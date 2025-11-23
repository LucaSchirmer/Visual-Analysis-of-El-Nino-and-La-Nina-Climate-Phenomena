
const CHART_CONFIG = {
    dimensions: {
        totalWidth: 600,
        totalHeight: 400,
        margin: { top: 20, right: 30, bottom: 40, left: 50 }
    },
    style: {
        circleRadius: 6,
        circleColor: "#69b3a2",
        circleOpacity: 0.7,
        circleStroke: "black",
        axisColor: "#666"
    },
    selectors: {
        container: "#scatterplot-chart"
    }
};

// JUST DUMMY DATA FOR TESTING
const rawData = [
    {x: 10, y: 20}, {x: 40, y: 90}, {x: 80, y: 50},
    {x: 160, y: 190}, {x: 200, y: 120}, {x: 240, y: 300},
    {x: 320, y: 220}, {x: 400, y: 350}
];


const createScatterPlot = (data, config) => {
    // Destructure config for cleaner access
    const { totalWidth, totalHeight, margin } = config.dimensions;
    const { circleRadius, circleColor, circleOpacity, circleStroke } = config.style;
    
    // Calculate inner dimensions
    const innerWidth = totalWidth - margin.left - margin.right;
    const innerHeight = totalHeight - margin.top - margin.bottom;

    // Select container and clear previous (idempotency)
    const container = d3.select(config.selectors.container);
    container.selectAll("*").remove();

    const svg = container
        .append("svg")
        .attr("width", totalWidth)
        .attr("height", totalHeight)
        .append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

    // We add a small buffer (e.g., * 1.1) so points aren't on the exact edge
    const xMax = d3.max(data, d => d.x);
    const yMax = d3.max(data, d => d.y);
    const domainBuffer = 1.1; 

    // Define Scales
    const xScale = d3.scaleLinear()
        .domain([0, xMax * domainBuffer]) 
        .range([0, innerWidth]);

    const yScale = d3.scaleLinear()
        .domain([0, yMax * domainBuffer])
        .range([innerHeight, 0]);

    svg.append("g")
        .attr("transform", `translate(0, ${innerHeight})`)
        .call(d3.axisBottom(xScale));

    svg.append("g")
        .call(d3.axisLeft(yScale));

    svg.selectAll("circle")
        .data(data)
        .join("circle")
        .attr("cx", d => xScale(d.x))
        .attr("cy", d => yScale(d.y))
        .attr("r", circleRadius)
        .style("fill", circleColor)
        .style("opacity", circleOpacity)
        .style("stroke", circleStroke);
};
