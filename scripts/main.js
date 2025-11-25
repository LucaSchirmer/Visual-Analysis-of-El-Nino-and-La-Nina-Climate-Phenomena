document.addEventListener('DOMContentLoaded', () => {
  console.log("Application chargée");
  
  if (document.querySelector("#world-map-chart")) {
    createWorldMap();
  } 
  
  // Si on est sur la page du scatter plot
  if (document.querySelector("#scatterplot-chart")) {
    console.log("Initialisation du scatter plot...");
    // Appeler la fonction asynchrone
    createScatterPlot(CHART_CONFIG);
  }
});