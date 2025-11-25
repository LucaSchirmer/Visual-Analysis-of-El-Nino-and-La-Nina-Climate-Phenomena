
if (document.querySelector("#world-map-chart")) {
  createWorldMap();
  createTimelineScale();
} 

if (document.querySelector("#scatterplot-chart")) {
  createScatterPlot(rawData, CHART_CONFIG);
}
