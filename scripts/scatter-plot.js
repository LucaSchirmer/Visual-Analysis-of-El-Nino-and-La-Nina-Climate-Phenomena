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

// Store original data globally
let ORIGINAL_DATA = null;
let YEAR_DOMAIN = null;   // { min: min_year, max: max_year }

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

// ==========================================
// MAIN FUNCTION: CREATE SCATTER PLOT
// ==========================================
const createScatterPlot = async (config = CHART_CONFIG) => {
  try {
    // 1. LOAD DATA
    const [rainfallData, temperatureData, fishingData, oniData] = await Promise.all([
      d3.csv("python_scripts/data/rainfall_by_country.csv"),
      d3.csv("python_scripts/data/temperature_by_country.csv"),
      d3.csv("python_scripts/data/fishing_by_country_year.csv"),
      d3.csv("python_scripts/data/oni_monthly.csv")
    ]);

    // 2. PROCESS AND AGGREGATE DATA
    ORIGINAL_DATA = processClimateData(rainfallData, temperatureData, fishingData, oniData);

    // 2b. CALCULATE YEAR DOMAIN
    const years = ORIGINAL_DATA.map(d => d.year);
    YEAR_DOMAIN = {
    min: d3.min(years),
    max: d3.max(years)
    };
    CURRENT_YEAR = YEAR_DOMAIN.max; // by default, the last available year

    // 3. CREATE STRUCTURE (controls + SVG container)
    setupVisualization(config);

    // Populate country list once from complete data
    updateCountryOptions(ORIGINAL_DATA);

    // Attach listeners once
    attachEventListeners(config);
    globalThis.updateMapYear = (year) => {
      CURRENT_YEAR = year;
      applyFilters(config);
    };
    d3.select("#country-filter").property("value", "all");
    CURRENT_YEAR = YEAR_DOMAIN.max;
    applyFilters(config);
  } catch (error) {
    showError(config.selectors.container, error.message);
  }
};

// ==========================================
// DATA PROCESSING
// ==========================================
const processClimateData = (rainfallData, temperatureData, fishingData, oniData) => {  
  // Aggregate precipitation by country and year
  const rainfallByCountry = d3.rollup(
    rainfallData,
    v => d3.mean(v, d => +d.rainfall_mm),
    d => d.country_name,
    d => new Date(d.time).getFullYear()
  );
  
  // Aggregate temperatures by country and year
  const tempByCountry = d3.rollup(
    temperatureData,
    v => d3.mean(v, d => +d.temperature_celsius),
    d => d.country_name,
    d => new Date(d.time).getFullYear()
  );
  
  //  Fishing by country + year (tonnes) 
  const fishingByCountryYear = d3.rollup(
    fishingData,
    v => d3.sum(v, d => +d.total_tonnes),
    d => d.country_name,
    d => +d.year
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
    d => +d.year
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
        year,
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

  if (!cleanX.length || !cleanY.length) {
    return;
  }

  const xExtent = d3.extent(cleanX, xVar.accessor);
  const yExtent = d3.extent(cleanY, yVar.accessor);

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
    .data(data)
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
      
      let extra = "";
      if (d.fishing != null) {
        extra += `Fishing: ${d.fishing.toFixed(0)} t<br/>`;
      }
      if (d.oni != null) {
        extra += `ONI (avg.): ${d.oni.toFixed(2)} (${d.oniPhase || d.phase}, ${d.oniIntensity || "Neutral"})<br/>`;
      }

      tooltip
        .style("visibility", "visible")
        .html(`
          <strong>${d.country}</strong><br/>
          Year: ${d.year}<br/>
          ENSO Phase: <span style="color: ${colorScale(d.phase)}">${d.phase}</span><br/>
          ${xVar.label}: ${xVar.format(xVar.accessor(d))}${xVar.unit}<br/>
          ${yVar.label}: ${yVar.format(yVar.accessor(d))}${yVar.unit}<br/>
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
  
  // Statistics
  addStatistics(svg, data, colorScale, totalWidth, totalHeight);

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

  //  Préparation des données (inchangé) 
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

  //  Génération des cartes 
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

    // >>> NOUVEAU : BOUTON AGRANDIR <<<
    const expandBtn = card.append("button")
        .attr("class", "expand-card-btn")
        .attr("title", "Expand chart")
        // SVG icône d'agrandissement
        .html('<svg viewBox="0 0 24 24"><path d="M15 3l2.3 2.3-2.89 2.87 1.42 1.42 2.87-2.89L21 9V3zM3 9l2.3-2.3 2.87 2.89 1.42-1.42-2.89-2.87L9 3H3zM9 21l-2.3-2.3 2.89-2.87-1.42-1.42-2.87 2.89L3 15v6zM21 15l-2.3 2.3-2.87-2.89-1.42 1.42 2.89 2.87L15 21h6z"/></svg>');

    // Gestion du clic sur le bouton agrandir
    expandBtn.on("click", (e) => {
        // Empêche le drag de démarrer si on clique sur le bouton
        e.stopPropagation(); 
        e.preventDefault();
        // Appelle la fonction d'ouverture de l'overlay
        openChartOverlay(chartData, title, config, xVar, yVar, colorScale, xExtent, yExtent);
    });

    //  Rendu du mini SVG (inchangé) 
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
  // Grille X
  g.append("g").attr("class", "grid").attr("transform", `translate(0,${innerHeight})`)
    .call(d3.axisBottom(xScale).tickSize(-innerHeight).tickFormat(""))
    .style("stroke-dasharray", "3,3").style("stroke", "#e0e0e0").style("stroke-opacity", 0.5);
  // Grille Y
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
  const currentValue = countrySelect.property("value");
  
  // Keep only the "All countries" option
  countrySelect.selectAll("option:not([value='all'])").remove();
  
  // Add countries from current data
  const countries = [...new Set(data.map(d => d.country))].sort();
  
  countries.forEach(country => {
    countrySelect.append("option")
      .attr("value", country)
      .text(country);
  });
  
  // Restore value if it still exists
  if (currentValue !== "all" && countries.includes(currentValue)) {
    countrySelect.property("value", currentValue);
  }
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
    d3.select("#country-filter").property("value", "all");
    d3.select("#phase-filter").property("value", "All");

    applyFilters(config); // everything goes through same logic
    });
};

// ==========================================
// APPLY FILTERS
// ==========================================
const applyFilters = (config) => {
  const selectedCountries = getSelectedCountries();
  const phaseValue = d3.select("#phase-filter").property("value");

  let filtered = ORIGINAL_DATA;

  // countries
  const filterByCountries = selectedCountries.length > 0 && !selectedCountries.includes("all");
  if (filterByCountries) {
    filtered = filtered.filter(d => selectedCountries.includes(d.country));
  }

  // phase
  if (phaseValue !== "All") {
    filtered = filtered.filter(d => d.phase === phaseValue);
  }

  // year - CUMUL : afficher toutes les années jusqu'à l'année sélectionnée
  if (CURRENT_YEAR !== null && !Number.isNaN(CURRENT_YEAR)) {
    filtered = filtered.filter(d => d.year <= CURRENT_YEAR);
  }

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