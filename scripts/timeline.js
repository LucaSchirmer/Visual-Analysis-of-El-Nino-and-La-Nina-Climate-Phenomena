const createTimelineScale = async () => {
    const container = document.getElementById("timeline-chart");
    const width = container.clientWidth;
    const height = container.clientHeight;
    
    const svg = d3.select("#timeline-chart")
        .append("svg")
        .attr("width", width)
        .attr("height", height);
    
    // Define the window/frame dimensions
    const margin = { top: 0, right: 60, bottom: 60, left: 60 };
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
        .domain(d3.extent(data.map(d => d.date)))
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
    eventGroup.append("rect")
        .attr("x", -2)
        .attr("y", -10)
        .attr("width", 4)
        .attr("height", 20)
        .attr("rx", 2)
        .attr("fill", d => d.phase === "El Niño" ? "#ff6a6a" : "#6aa0ff")
        .attr("cursor", "pointer")
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

    // Create cursor data object
    const cursorData = { x: x(data[0].date) };
    
    // Cursor handle (draggable circle)
    const cursorHandle = window.append("circle")
        .datum(cursorData)
        .attr("class", "cursor-handle")
        .attr("cx", d => d.x)
        .attr("r", 10)
        .attr("cy", frameHeight / 2)
        .attr("fill", "#333")
        .attr("stroke", "#fff")
        .attr("stroke-width", 2)
        .attr("cursor", "grab");
    
    // Helper function to get data point from x position
    function getDataAtPosition(xPos) {
        const date = x.invert(xPos);
        const bisect = d3.bisector(d => d.date).left;
        const index = bisect(data, date);
        return data[Math.min(index, data.length - 1)];
    }
    
    function dragstarted(event, d) {
        d3.select(this).raise().attr("stroke", "black");
    }

    function dragged(event, d) {
        // Clamp position to stay within timeline bounds
        const clampedX = Math.max(40, Math.min(frameWidth - 40, event.x));
        d3.select(this).attr("cx", d.x = clampedX);
    }

    function dragended(event, d) {
        d3.select(this).attr("stroke", null);
        const dataPoint = getDataAtPosition(d.x);
        onSlidedCursor(dataPoint);
    }

    const drag = d3.drag()
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended);
    
    cursorHandle.call(drag);
    
    return x;
};

function onClickEvent(event, d) {
    // visually mark selected event
    d3.selectAll('.strong-event circle').classed('timeline-selected', false);
    d3.select(this).classed('timeline-selected', true);

    const year = d.date.getFullYear();
    // call map updater if available
    if (typeof globalThis.updateMapYear === 'function') {
        try {
            globalThis.updateMapYear(year);
        } catch (err) {
            console.warn('updateMapYear failed', err);
        }
    } else {
        console.log('Clicked strong event:', d.date, d.phase, d.intensity, '-> year', year);
    }
}

function onSlidedCursor(dataPoint) {
    const year = dataPoint.date.getFullYear();
    // call map updater if available
    if (typeof globalThis.updateMapYear === 'function') {
        try {
            globalThis.updateMapYear(year);
        } catch (err) {
            console.warn('updateMapYear failed', err);
        }
    } else {
        console.log('Slided to:', dataPoint.date, dataPoint.phase, dataPoint.intensity, '-> year', year);
    }
}
