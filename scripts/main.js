
if (document.querySelector("#world-map-chart")) {
  createWorldMap();
} 

if (document.querySelector("#scatterplot-chart")) {
  createScatterPlot(rawData, CHART_CONFIG);
}