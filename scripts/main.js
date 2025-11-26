
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
});
