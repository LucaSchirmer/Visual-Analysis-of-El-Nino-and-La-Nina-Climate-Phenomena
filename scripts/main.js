
// world map & scatterplot selection

if (document.querySelector("#world-map-chart")) {
  createWorldMap();
  createTimelineScale();
}

if (document.querySelector("#scatterplot-chart")) {
  createScatterPlot(rawData, CHART_CONFIG);
}

// NAVBAR code
document.addEventListener('DOMContentLoaded', () => {
  const currentPage = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.main-navigation a').forEach(link => {
    if (link.getAttribute('href') === currentPage) {
      link.classList.add('active');
    }
  });

  console.log("Application chargée");
  
  if (document.querySelector("#world-map-chart")) {
    createWorldMap();
    createTimelineScale();
  } 
  
  // Si on est sur la page du scatter plot
  if (document.querySelector("#scatterplot-chart")) {
    console.log("Initialisation du scatter plot...");
    // Appeler la fonction asynchrone
    createScatterPlot(CHART_CONFIG);
  }
});
