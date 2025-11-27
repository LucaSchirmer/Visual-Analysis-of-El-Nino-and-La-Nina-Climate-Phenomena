
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
    elNino: "#e74c3c",      // Rouge pour El Niño
    laNina: "#3498db",      // Bleu pour La Niña
    neutral: "#95a5a6",     // Gris pour période neutre
    highlight: "#f39c12"    // Orange pour highlight
  }
};

// Stocker les données originales globalement
let ORIGINAL_DATA = null;
let YEAR_DOMAIN = null;   // { min: année_min, max: année_max }
let CURRENT_YEAR = null;  // Année actuellement sélectionnée dans le slider

// Variables disponibles pour les axes (tu pourras en ajouter)
const VARIABLES = {
  temperature: {
    id: "temperature",
    label: "Température moyenne (°C)",
    accessor: d => d.temperature,
    unit: "°C",
    format: v => v.toFixed(1)
  },
  rainfall: {
    id: "rainfall",
    label: "Précipitations moyennes (mm)",
    accessor: d => d.rainfall,
    unit: " mm",
    format: v => v.toFixed(0)
  }
};

let CURRENT_X_VAR = "temperature";
let CURRENT_Y_VAR = "rainfall";

// ==========================================
// FONCTION PRINCIPALE: CRÉATION DU SCATTER PLOT
// ==========================================
const createScatterPlot = async (config = CHART_CONFIG) => {
  try {
    // 1. CHARGER LES DONNÉES
    const [rainfallData, temperatureData] = await Promise.all([
      d3.csv("python_scripts/data/rainfall_by_country.csv"),
      d3.csv("python_scripts/data/temperature_by_country.csv")
    ]);

    // 2. TRAITER ET AGRÉGER LES DONNÉES
    ORIGINAL_DATA = processClimateData(rainfallData, temperatureData);

    // 2b. CALCULER LE DOMAINE DES ANNÉES
    const years = ORIGINAL_DATA.map(d => d.year);
    YEAR_DOMAIN = {
    min: d3.min(years),
    max: d3.max(years)
    };
    CURRENT_YEAR = YEAR_DOMAIN.max; // par défaut, la dernière année disponible

    // 3. CRÉER LA STRUCTURE (contrôles + conteneur SVG)
    setupVisualization(config);

    // 3b. CRÉER LE SLIDER D'ANNÉES
    setupYearSlider(config);

    // 4. DESSINER LE GRAPHIQUE INITIAL (toutes les années au départ)
    updateScatterPlot(ORIGINAL_DATA, config);

    
  } catch (error) {
    console.error("Erreur lors du chargement des données:", error);
    showError(config.selectors.container, error.message);
  }
};

// ==========================================
// TRAITEMENT DES DONNÉES
// ==========================================
const processClimateData = (rainfallData, temperatureData) => {
  console.log("Traitement des données...");
  
  // Agréger les précipitations par pays et année
  const rainfallByCountry = d3.rollup(
    rainfallData,
    v => d3.mean(v, d => +d.rainfall_mm),
    d => d.country_name,
    d => new Date(d.time).getFullYear()
  );
  
  // Agréger les températures par pays et année
  const tempByCountry = d3.rollup(
    temperatureData,
    v => d3.mean(v, d => +d.temperature_celsius),
    d => d.country_name,
    d => new Date(d.time).getFullYear()
  );
  
  // Combiner les deux datasets
  const combined = [];
  
  rainfallByCountry.forEach((yearData, country) => {
    yearData.forEach((rainfall, year) => {
      const tempData = tempByCountry.get(country);
      if (tempData && tempData.has(year)) {
        const temperature = tempData.get(year);
        
        // Filtrer les valeurs aberrantes
        if (temperature > 0 && temperature < 50 && rainfall > 0 && rainfall < 500) {
          const phase = determineClimatePhase(year);
          
          combined.push({
            country,
            year,
            rainfall,
            temperature,
            phase
          });
        }
      }
    });
  });
  
  console.log(`${combined.length} points de données créés`);
  return combined;
};

// Déterminer la phase climatique basée sur l'année
const determineClimatePhase = (year) => {
  // Années El Niño connues
  const elNinoYears = [1982, 1983, 1987, 1991, 1992, 1997, 1998, 2002, 2003, 
                       2009, 2010, 2015, 2016, 2018, 2019, 2023];
  
  // Années La Niña connues
  const laNinaYears = [1988, 1989, 1998, 1999, 2000, 2007, 2008, 2010, 2011, 
                       2020, 2021, 2022];
  
  if (elNinoYears.includes(year)) return "El Niño";
  if (laNinaYears.includes(year)) return "La Niña";
  return "Neutral";
};

// ==========================================
// SETUP DE LA VISUALISATION (UNE SEULE FOIS)
// ==========================================
const setupVisualization = (config) => {
  const container = d3.select(config.selectors.container);
  
  // Nettoyer complètement
  container.selectAll("*").remove();
  
  // 1. CRÉER LES CONTRÔLES (EN PREMIER)
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
  
  // Filtre par pays
  controlsDiv.append("label")
    .style("font-weight", "600")
    .text("Filtrer par pays:");
  
  const countrySelect = controlsDiv.append("select")
    .attr("id", "country-filter")
    .style("padding", "5px 10px")
    .style("border", "1px solid #ccc")
    .style("border-radius", "3px");
  
  countrySelect.append("option")
    .attr("value", "all")
    .text("Tous les pays");
  
  // Filtre par phase
  controlsDiv.append("label")
    .style("font-weight", "600")
    .style("margin-left", "20px")
    .text("Filtrer par phase:");
  
  const phaseSelect = controlsDiv.append("select")
    .attr("id", "phase-filter")
    .style("padding", "5px 10px")
    .style("border", "1px solid #ccc")
    .style("border-radius", "3px");
  
  ["Toutes", "El Niño", "La Niña", "Neutral"].forEach(phase => {
    phaseSelect.append("option")
      .attr("value", phase)
      .text(phase);
  });
  
  // Bouton reset
  controlsDiv.append("button")
    .attr("id", "reset-button")
    .style("padding", "5px 15px")
    .style("background-color", "#007bff")
    .style("color", "white")
    .style("border", "none")
    .style("border-radius", "3px")
    .style("cursor", "pointer")
    .style("margin-left", "20px")
    .text("Réinitialiser");
  
    // 2. CRÉER LE CONTENEUR SVG (APRÈS LES CONTRÔLES)
    container.append("div")
    .attr("id", "scatter-svg-container");

    // 2b. CONTENEUR POUR LE SLIDER D'ANNÉES (SOUS LE PLOT)
    container.append("div")
    .attr("id", "year-slider-container");
  
  // 3. CRÉER LE TOOLTIP (APRÈS TOUT)
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

  // === NOUVEAUX CONTRÔLES POUR LES AXES ===
  const axisControls = controlsDiv.append("div")
    .style("display", "flex")
    .style("align-items", "center")
    .style("gap", "10px");

  // Label X
  axisControls.append("label")
    .style("font-weight", "600")
    .text("Axe X :");

  // Select X
  const xSelect = axisControls.append("select")
    .attr("id", "x-axis-variable")
    .style("padding", "5px 10px")
    .style("border", "1px solid #ccc")
    .style("border-radius", "3px");

  // Label Y
  axisControls.append("label")
    .style("font-weight", "600")
    .text("Axe Y :");

  // Select Y
  const ySelect = axisControls.append("select")
    .attr("id", "y-axis-variable")
    .style("padding", "5px 10px")
    .style("border", "1px solid #ccc")
    .style("border-radius", "3px");

  // Remplir les options à partir de VARIABLES
  Object.values(VARIABLES).forEach(v => {
    xSelect.append("option")
      .attr("value", v.id)
      .text(v.label);

    ySelect.append("option")
      .attr("value", v.id)
      .text(v.label);
  });

  // valeurs par défaut
  xSelect.property("value", CURRENT_X_VAR);
  ySelect.property("value", CURRENT_Y_VAR);
};

// ==========================================
// SLIDER D'ANNÉES SOUS LE GRAPHIQUE
// ==========================================
const setupYearSlider = (config) => {
  if (!YEAR_DOMAIN) return;

  const sliderContainer = d3.select("#year-slider-container");

  // Nettoyer si jamais on reconstruit
  sliderContainer.selectAll("*").remove();

  sliderContainer
    .style("margin-top", "15px")
    .style("padding", "10px 15px")
    .style("background-color", "#f8f9fa")
    .style("border-radius", "5px")
    .style("display", "flex")
    .style("align-items", "center")
    .style("gap", "10px");

  // Label "Année :"
  sliderContainer.append("span")
    .style("font-weight", "600")
    .text("Année :");

  // Valeur d'année actuelle
  sliderContainer.append("span")
    .attr("id", "year-slider-value")
    .style("min-width", "50px")
    .style("font-variant-numeric", "tabular-nums")
    .text(CURRENT_YEAR);

  // Slider lui-même
  sliderContainer.append("input")
    .attr("type", "range")
    .attr("id", "year-slider")
    .attr("min", YEAR_DOMAIN.min)
    .attr("max", YEAR_DOMAIN.max)
    .attr("step", 1)
    .style("flex", "1")
    .property("value", CURRENT_YEAR);

  // Listener : mise à jour en temps réel du scatter quand on déplace le curseur
  d3.select("#year-slider").on("input", function() {
    CURRENT_YEAR = +this.value;
    d3.select("#year-slider-value").text(CURRENT_YEAR);
    applyFilters(config);   // re-filtre les données et redessine le plot
  });
};

// ==========================================
// MISE À JOUR DU GRAPHIQUE (PEUT ÊTRE APPELÉE PLUSIEURS FOIS)
// ==========================================
const updateScatterPlot = (data, config) => {
  const { totalWidth, totalHeight, margin } = config.dimensions;
  const { circleRadius, circleOpacity, circleStroke, circleStrokeWidth } = config.style;
  const { colors } = config;
  
  const xVar = VARIABLES[CURRENT_X_VAR];
  const yVar = VARIABLES[CURRENT_Y_VAR];

  // Dimensions internes
  const innerWidth = totalWidth - margin.left - margin.right;
  const innerHeight = totalHeight - margin.top - margin.bottom;
  
  // Sélectionner le conteneur SVG (pas le conteneur principal)
  const svgContainer = d3.select("#scatter-svg-container");
  svgContainer.selectAll("*").remove();
  
  // Créer le SVG
  const svg = svgContainer
    .append("svg")
    .attr("width", totalWidth)
    .attr("height", totalHeight);
  
  const g = svg.append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);
  
  // Échelles avec domaines fixes pour éviter les points hors limites
  const xExtent = d3.extent(data, xVar.accessor);
  const yExtent = d3.extent(data, yVar.accessor);

  // sécurité si data vide
  if (!xExtent[0] && !xExtent[1]) return;
  if (!yExtent[0] && !yExtent[1]) return;

  const xScale = d3.scaleLinear()
    .domain([xExtent[0] * 0.95, xExtent[1] * 1.05])
    .range([0, innerWidth])
    .nice();

  const yScale = d3.scaleLinear()
    .domain([yExtent[0] * 0.95, yExtent[1] * 1.05])
    .range([innerHeight, 0])
    .nice();
  
  // Échelle de couleur par phase
  const colorScale = d3.scaleOrdinal()
    .domain(["El Niño", "La Niña", "Neutral"])
    .range([colors.elNino, colors.laNina, colors.neutral]);
  
  // Grille
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
  
  // Labels des axes
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
  
  // Titre
  svg.append("text")
    .attr("x", totalWidth / 2)
    .attr("y", 20)
    .style("text-anchor", "middle")
    .style("font-size", "18px")
    .style("font-weight", "bold")
    .text("Corrélation Température-Précipitations par Phase Climatique");
  
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
  
  // Animation d'entrée
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
      
      tooltip
        .style("visibility", "visible")
        .html(`
          <strong>${d.country}</strong><br/>
          Année: ${d.year}<br/>
          Phase: <span style="color: ${colorScale(d.phase)}">${d.phase}</span><br/>
          ${xVar.label}: ${xVar.format(xVar.accessor(d))}${xVar.unit}<br/>
          ${yVar.label}: ${yVar.format(yVar.accessor(d))}${yVar.unit}
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
  
  // Légende
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
  
  // Statistiques
  addStatistics(svg, data, colorScale, totalWidth, totalHeight);
  
  // Mettre à jour les options de pays dans le select
  updateCountryOptions(data);
  
  // Ajouter les event listeners
  attachEventListeners(config);
};

// ==========================================
// MISE À JOUR DES OPTIONS DE PAYS
// ==========================================
const updateCountryOptions = (data) => {
  const countrySelect = d3.select("#country-filter");
  const currentValue = countrySelect.property("value");
  
  // Ne garder que l'option "Tous les pays"
  countrySelect.selectAll("option:not([value='all'])").remove();
  
  // Ajouter les pays de la data actuelle
  const countries = [...new Set(data.map(d => d.country))].sort();
  
  countries.forEach(country => {
    countrySelect.append("option")
      .attr("value", country)
      .text(country);
  });
  
  // Restaurer la valeur si elle existe encore
  if (currentValue !== "all" && countries.includes(currentValue)) {
    countrySelect.property("value", currentValue);
  }
};

// ==========================================
// ATTACHER LES EVENT LISTENERS
// ==========================================
const attachEventListeners = (config) => {
  // Supprimer les anciens listeners pour éviter les doublons
  d3.select("#x-axis-variable").on("change", function() {
    CURRENT_X_VAR = this.value;
    applyFilters(config);
  });

  d3.select("#y-axis-variable").on("change", function() {
    CURRENT_Y_VAR = this.value;
    applyFilters(config);
  });
  d3.select("#reset-button").on("click", null);
  
  // Ajouter les nouveaux listeners
  d3.select("#country-filter").on("change", function() {
    applyFilters(config);
  });
  
  d3.select("#phase-filter").on("change", function() {
    applyFilters(config);
  });
  
  d3.select("#reset-button").on("click", function() {
    d3.select("#country-filter").property("value", "all");
    d3.select("#phase-filter").property("value", "Toutes");

    // Réinitialiser le slider sur la dernière année
    const yearSlider = d3.select("#year-slider");
    if (!yearSlider.empty() && YEAR_DOMAIN) {
        CURRENT_YEAR = YEAR_DOMAIN.max;
        yearSlider.property("value", CURRENT_YEAR);
        d3.select("#year-slider-value").text(CURRENT_YEAR);
    }

    applyFilters(config); // tout repasse par la même logique
    });
};

// ==========================================
// APPLIQUER LES FILTRES
// ==========================================
const applyFilters = (config) => {
  const countryValue = d3.select("#country-filter").property("value");
  const phaseValue = d3.select("#phase-filter").property("value");

  // Récupérer l'année du slider (si présent)
  const yearSlider = d3.select("#year-slider");
  const yearValue = yearSlider.empty() ? null : +yearSlider.property("value");
  
  let filtered = ORIGINAL_DATA;
  
  // Filtre par pays
  if (countryValue !== "all") {
    filtered = filtered.filter(d => d.country === countryValue);
  }
  
  // Filtre par phase
  if (phaseValue !== "Toutes") {
    filtered = filtered.filter(d => d.phase === phaseValue);
  }

  // Filtre par année (si slider défini)
  if (yearValue !== null && !Number.isNaN(yearValue)) {
    filtered = filtered.filter(d => d.year <= yearValue);
  }
  
  updateScatterPlot(filtered, config);
};

// ==========================================
// STATISTIQUES
// ==========================================
const addStatistics = (svg, data, colorScale, totalWidth, totalHeight) => {
  const statsGroup = svg.append("g")
    .attr("transform", `translate(${totalWidth - 130}, ${totalHeight - 120})`);
  
  statsGroup.append("text")
    .attr("y", 0)
    .style("font-size", "12px")
    .style("font-weight", "bold")
    .text("Statistiques:");
  
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
// GESTION DES ERREURS
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
      <strong>Erreur de chargement des données:</strong><br/>
      ${message}<br/><br/>
      <small>Assurez-vous que les fichiers CSV sont présents dans python_scripts/data/</small>
    `);
};