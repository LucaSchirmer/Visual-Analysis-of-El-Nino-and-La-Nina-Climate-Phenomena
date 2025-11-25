
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


// Add control panel with better grouping
const controlPanel = d3.select(container)
  .insert('div', () => svgNode)
  .attr('class', 'map-controls')
  .style('display', 'flex')
  .style('justify-content', 'space-between')
  .style('align-items', 'center')
  .style('padding', '12px 16px')
  .style('background', 'var(--color-surface)')
  .style('border-radius', 'var(--radius-base)')
  .style('margin', '16px 0')
  .style('box-shadow', 'var(--shadow-sm)');

// Dataset selector group
const datasetGroup = controlPanel.append('div')
  .style('display', 'flex')
  .style('align-items', 'center')
  .style('gap', '8px');

datasetGroup.append('label')
  .text('Dataset:')
  .style('font-weight', '500');

// Move your existing selector here
const selector = datasetGroup.append('select')
  .attr('id', 'map-dataset-select')
  .style('min-width', '220px')
  .style('padding', '6px 12px')
  .style('border-radius', 'var(--radius-sm)');

// Add year slider for temporal navigation
const yearGroup = controlPanel.append('div')
  .style('display', 'flex')
  .style('align-items', 'center')
  .style('gap', '12px')
  .style('flex', '1')
  .style('max-width', '400px');

yearGroup.append('label')
  .text('Year:')
  .style('font-weight', '500');

const yearSlider = yearGroup.append('input')
  .attr('type', 'range')
  .attr('id', 'year-slider')
  .style('flex', '1');

const yearDisplay = yearGroup.append('span')
  .attr('id', 'year-display')
  .style('min-width', '45px')
  .style('font-weight', '600')
  .style('font-variant-numeric', 'tabular-nums');
