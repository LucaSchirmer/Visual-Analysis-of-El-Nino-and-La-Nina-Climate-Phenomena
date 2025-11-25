const createTimelineScale = async () => {
    const container = document.getElementById("timeline-chart");
    const width = container.clientWidth;
    const height = container.clientHeight;
    
    const svg = d3.select("#timeline-chart")
        .append("svg")
        .attr("width", width)
        .attr("height", height);
    
    // Define the window/frame dimensions
    const margin = { top: 40, right: 60, bottom: 60, left: 60 };
    const frameWidth = width - margin.left - margin.right;
    const frameHeight = height - margin.top - margin.bottom;
    
    // Create a rounded rectangle background window
    const window = svg.append("g")
        .attr("transform", `translate(${margin.left}, ${margin.top})`);
    
    // Data collection
    const data = await d3.csv("python_scripts/data/oni_monthly.csv", d => ({
        date: new Date(d.date),
        phase: d.phase,
        intensity: d.intensity
    }));
    
    const strongEvents = [];
    for (let i = 1; i < data.length; i++) {
        const prev = data[i - 1];
        const curr = data[i];
        if (
            (curr.phase === "La Niña" || curr.phase === "El Niño") &&
            curr.intensity === "Strong" &&
            (prev.phase !== curr.phase || prev.intensity !== "Strong")
        ) {
            strongEvents.push(curr);
        }
    }
    
    // Scale within the frame
    const x = d3.scaleTime()
        .domain(d3.extent(strongEvents.map(d => d.date)))
        .range([40, frameWidth - 40]);
    
    const regularYears = d3.timeYear.every(5).range(
        x.domain()[0],
        x.domain()[1]
    );
    
    // Style
    const axis = d3.axisBottom(x)
        .tickValues(regularYears)
        .tickFormat(d3.timeFormat("%Y"))
        .tickSize(6);
    
    const axisGroup = window.append("g")
        .attr("class", "timeline-axis")
        .attr("transform", `translate(0, ${frameHeight / 2})`)
        .call(axis);
    
    axisGroup.select(".domain")
        .attr("stroke", "#d0d0d0")
        .attr("stroke-width", 3)
        .attr("stroke-linecap", "round");
    
    axisGroup.selectAll(".tick line")
        .attr("stroke", "#d0d0d0")
        .attr("stroke-width", 1.5);
    
    axisGroup.selectAll(".tick text")
        .attr("fill", "#666")
        .attr("font-size", "12px")
        .attr("font-weight", "500");
    
    const eventGroup = window.selectAll(".strong-event")
        .data(strongEvents)
        .enter()
        .append("g")
        .attr("class", "strong-event")
        .attr("transform", d => `translate(${x(d.date)}, ${frameHeight / 2})`);

    
    // Event markers
    eventGroup.append("circle")
        .attr("r", 8)
        .attr("fill", d => d.phase === "El Niño" ? "#ff6a6a" : "#6aa0ff")
        .attr("stroke", "#fff")
        .attr("stroke-width", 2.5)
        .attr("cursor", "pointer")
        .style("filter", "url(#glow)")
        .on("click", onClickEvent);
    
    // Add labels on hover with month and year
    eventGroup.append("title")
        .text(d => {
            const monthYear = d.date.toLocaleDateString('en-US', { 
                month: 'long', 
                year: 'numeric' 
            });
            return `${d.phase} (${d.intensity}) — ${monthYear}`;
        });
    
    // Add a title to the timeline
    svg.append("text")
        .attr("x", width / 2)
        .attr("y", 25)
        .attr("text-anchor", "middle")
        .attr("font-size", "16px")
        .attr("font-weight", "600")
        .attr("fill", "#333")
        .text("Strong Climate Events Timeline");
    
    return x;
};

function onClickEvent(event, d){
    // visually mark selected event
    d3.selectAll('.strong-event circle').classed('timeline-selected', false);
    d3.select(this).classed('timeline-selected', true);

    const year = d.date.getFullYear();
    // call map updater if available
    if (typeof globalThis.updateMapYear === 'function'){
        try {
            globalThis.updateMapYear(year);
        } catch (err){
            console.warn('updateMapYear failed', err);
        }
    } else {
        console.log('Clicked strong event:', d.date, d.phase, d.intensity, '-> year', year);
    }
}
