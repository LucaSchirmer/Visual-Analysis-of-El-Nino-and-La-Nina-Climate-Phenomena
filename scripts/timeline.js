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
    
    // Event markers - tiny rectangles like ticks
    eventGroup.append("rect")
        .attr("x", -2)
        .attr("y", -15)
        .attr("width", 4)
        .attr("height", 30)
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

    // ===== DRAGGABLE CURSOR =====
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
    
    // Magnifying glass popup (initially hidden)
    const magnifier = window.append("g")
        .attr("class", "magnifier")
        .style("display", "none");
    
    // Magnifier background
    magnifier.append("rect")
        .attr("width", 140)
        .attr("height", 80)
        .attr("rx", 8)
        .attr("fill", "white")
        .attr("stroke", "#333")
        .attr("stroke-width", 2)
        .style("filter", "drop-shadow(0 2px 4px rgba(0,0,0,0.2))");
    
    // Create zoomed timeline inside magnifier
    const magnifierTimeline = magnifier.append("g")
        .attr("transform", "translate(10, 40)");
    
    // Magnifier timeline line
    magnifierTimeline.append("line")
        .attr("x1", 0)
        .attr("x2", 120)
        .attr("y1", 0)
        .attr("y2", 0)
        .attr("stroke", "#d0d0d0")
        .attr("stroke-width", 2);
    
    // Month ticks group
    const monthTicksGroup = magnifierTimeline.append("g")
        .attr("class", "month-ticks");
    
    // Current position indicator
    const positionIndicator = magnifierTimeline.append("circle")
        .attr("r", 5)
        .attr("cy", 0)
        .attr("fill", "#ff6a6a")
        .attr("stroke", "#fff")
        .attr("stroke-width", 2);
    
    // Year label at top
    const magnifierYearLabel = magnifier.append("text")
        .attr("x", 70)
        .attr("y", 20)
        .attr("text-anchor", "middle")
        .attr("font-size", "14px")
        .attr("font-weight", "700")
        .attr("fill", "#333");
    
    // Helper function to get data point from x position
    function getDataAtPosition(xPos) {
        const date = x.invert(xPos);
        const bisect = d3.bisector(d => d.date).left;
        const index = bisect(data, date);
        return data[Math.min(index, data.length - 1)];
    }
    
    // Timer for showing magnifier
    let hoverTimer = null;
    let isDragging = false;
    let lastX = null;
    
    function dragstarted(event, d) {
        d3.select(this).raise().attr("stroke", "black");
        isDragging = true;
        lastX = null;
    }

    function dragged(event, d) {
        // Clamp position to stay within timeline bounds
        const clampedX = Math.max(40, Math.min(frameWidth - 40, event.x));
        d3.select(this).attr("cx", d.x = clampedX);
        
        // Check if movement is significant (more than 3 pixels)
        const hasMovedSignificantly = lastX === null || Math.abs(clampedX - lastX) > 3;
        
        if (hasMovedSignificantly) {
            // Clear previous timer
            if (hoverTimer) {
                clearTimeout(hoverTimer);
            }
            
            // Hide magnifier while moving
            magnifier.style("display", "none");
            
            lastX = clampedX;
        }
        
        // Set timer to show magnifier if stopped moving
        hoverTimer = setTimeout(() => {
            if (isDragging) {
                const dataPoint = getDataAtPosition(d.x);
                const currentDate = dataPoint.date;
                const year = currentDate.getFullYear();
                
                // Update year label
                magnifierYearLabel.text(year);
                
                // Create scale for the 12 months of the current year
                const yearStart = new Date(year, 0, 1);
                const yearEnd = new Date(year, 11, 31);
                const monthScale = d3.scaleTime()
                    .domain([yearStart, yearEnd])
                    .range([0, 120]);
                
                // Clear previous month ticks
                monthTicksGroup.selectAll("*").remove();
                
                // Add month ticks
                const months = d3.timeMonth.range(yearStart, yearEnd);
                monthTicksGroup.selectAll(".month-tick")
                    .data(months)
                    .enter()
                    .append("line")
                    .attr("class", "month-tick")
                    .attr("x1", d => monthScale(d))
                    .attr("x2", d => monthScale(d))
                    .attr("y1", -5)
                    .attr("y2", 5)
                    .attr("stroke", "#999")
                    .attr("stroke-width", 1);
                
                // Add month labels (J F M A M J J A S O N D)
                const monthLabels = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
                monthTicksGroup.selectAll(".month-label")
                    .data(months)
                    .enter()
                    .append("text")
                    .attr("class", "month-label")
                    .attr("x", d => monthScale(d))
                    .attr("y", 15)
                    .attr("text-anchor", "middle")
                    .attr("font-size", "9px")
                    .attr("fill", "#666")
                    .text((d, i) => monthLabels[i]);
                
                // Position indicator at current date
                const currentX = monthScale(currentDate);
                positionIndicator.attr("cx", currentX);
                
                // Position magnifier above cursor, centered
                const magnifierX = Math.max(10, Math.min(d.x - 70, frameWidth - 150));
                const magnifierY = frameHeight / 2 - 120;
                magnifier.attr("transform", `translate(${magnifierX}, ${magnifierY})`);
                
                // Show magnifier
                magnifier.style("display", "block");
            }
        }, 300); // Show after 300ms of no movement
    }

    function dragended(event, d) {
        d3.select(this).attr("stroke", null);
        isDragging = false;
        
        // Clear timer and hide magnifier
        if (hoverTimer) {
            clearTimeout(hoverTimer);
        }
        magnifier.style("display", "none");
        
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
