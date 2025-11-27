document.addEventListener('DOMContentLoaded', () => {
  const currentPage = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.main-navigation a').forEach(link => {
    if (link.getAttribute('href') === currentPage) {
      link.classList.add('active');
    }
  });

  if (document.querySelector("#world-map-chart")) {
    createWorldMap();
    createTimelineScale();
  } 
  
  // If we are on the scatter plot page
  if (document.querySelector("#scatterplot-chart")) {
    console.log("Initialisation du scatter plot...");
    // call the function to create the scatter plot
    createScatterPlot(CHART_CONFIG);
  }
});
