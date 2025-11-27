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
    const everyEvents = [];
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
        everyEvents.push(curr);
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
    
    const strongEventGroup = window.selectAll(".strong-event")
        .data(strongEvents)
        .enter()
        .append("g")
        .attr("class", "strong-event")
        .attr("transform", d => `translate(${x(d.date)}, ${frameHeight / 2})`);

    const eventGroup = window.selectAll(".events")
        .data(everyEvents)
        .enter()
        .append("g")
        .attr("class", "event")
        .attr("transform", d => `translate(${x(d.date)}, ${frameHeight / 2})`);

    // Event markers - tiny rectangles like ticks
    strongEventGroup.append("rect")
        .attr("x", -2.5)
        .attr("y", -9)
        .attr("width", 5)
        .attr("height", 18)
        .attr("rx", 2)
        .attr("fill", d => d.phase === "El Niño" ?  "#072b8d" : "#AA0000")
        .attr("cursor", "pointer")
        .on("click", onClickEvent);
    
    // Add labels on hover with month and year
    strongEventGroup.append("title")
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
    
    // Playback controls
    let isPlaying = false;
    let playbackInterval = null;
    const playbackSpeed = 50; // milliseconds per step
    
    // Create control buttons group (centered below timeline)
    const controlsGroup = window.append("g")
        .attr("class", "playback-controls")
        .attr("transform", `translate(${frameWidth / 2 - 30}, ${frameHeight / 2 + 50})`);
    
    // Play button
    const playButton = controlsGroup.append("g")
        .attr("class", "play-button")
        .attr("cursor", "pointer");
    
    playButton.append("circle")
        .attr("r", 18)
        .attr("fill", "#666")
        .attr("stroke", "#999")
        .attr("stroke-width", 2);
    
    playButton.append("path")
        .attr("d", "M-5,-7 L-5,7 L7,0 Z")
        .attr("fill", "#fff");
    
    // Stop button
    const stopButton = controlsGroup.append("g")
        .attr("class", "stop-button")
        .attr("transform", "translate(45, 0)")
        .attr("cursor", "pointer")
        .style("opacity", 0.5);
    
    stopButton.append("circle")
        .attr("r", 18)
        .attr("fill", "#666")
        .attr("stroke", "#999")
        .attr("stroke-width", 2);
    
    stopButton.append("rect")
        .attr("x", -5)
        .attr("y", -5)
        .attr("width", 10)
        .attr("height", 10)
        .attr("fill", "#fff");
    
    // Play button click handler
    playButton.on("click", function() {
        if (!isPlaying) {
            isPlaying = true;
            playButton.style("opacity", 0.5);
            stopButton.style("opacity", 1);
            
            const minX = 40;
            const maxX = frameWidth - 40;
            const step = (maxX - minX) / 200; // Divide into 200 steps
            
            playbackInterval = setInterval(() => {
                const currentX = cursorData.x;
                const newX = currentX + step;
                
                if (newX >= maxX) {
                    // Reset to beginning
                    cursorData.x = minX;
                    cursorHandle.attr("cx", minX);
                    const dataPoint = getDataAtPosition(minX);
                    onSlidedCursor(dataPoint);
                } else {
                    cursorData.x = newX;
                    cursorHandle.attr("cx", newX);
                    
                    // Update map every few steps to avoid too many calls
                    if (Math.floor(currentX / step) % 5 === 0) {
                        const dataPoint = getDataAtPosition(newX);
                        onSlidedCursor(dataPoint);
                    }
                }
            }, playbackSpeed);
        }
    });
    
    // Stop button click handler
    stopButton.on("click", function() {
        if (isPlaying) {
            isPlaying = false;
            playButton.style("opacity", 1);
            stopButton.style("opacity", 0.5);
            
            if (playbackInterval) {
                clearInterval(playbackInterval);
                playbackInterval = null;
            }
            
            // Final update at stopped position
            const dataPoint = getDataAtPosition(cursorData.x);
            onSlidedCursor(dataPoint);
        }
    });

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
        .attr("fill", "#212529")
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

                const eventsInYear = everyEvents.filter(ev => ev.date.getFullYear() === year);

                // Intensity → height scale
                const intensityHeight = {
                    "Weak": 10,
                    "Moderate": 15,
                    "Strong": 25
                };

                // Intensity → darkening factor (0 = unchanged, 0.5 = much darker)
                const intensityDarken = {
                    "Weak": 0.0,
                    "Moderate": 0.25,
                    "Strong": 0.45
                };

                function darkenColor(hex, factor) {
                    const f = 1 - factor;
                    const r = Math.round(parseInt(hex.slice(1,3), 16) * f);
                    const g = Math.round(parseInt(hex.slice(3,5), 16) * f);
                    const b = Math.round(parseInt(hex.slice(5,7), 16) * f);
                    return `rgb(${r},${g},${b})`;
                }

                monthTicksGroup.selectAll(".mini-event")
                    .data(eventsInYear)
                    .enter()
                    .append("rect")
                    .attr("class", "mini-event")
                    .attr("x", ev => monthScale(ev.date) - 3.5)
                    .attr("y", ev => -intensityHeight[ev.intensity] / 2)
                    .attr("width", 7)
                    .attr("height", ev => intensityHeight[ev.intensity])
                    .attr("rx", 2)
                    .attr("fill", ev => {
                        let base =
                            ev.phase === "El Niño" ?  "#6aa0ff":
                            ev.phase === "La Niña" ?  "#ff6a6a":
                            "#999";

                        return darkenColor(base, intensityDarken[ev.intensity]);
                    })
                    .append("title")
                    .text(ev => {
                        const monthYear = ev.date.toLocaleDateString('en-US', {
                            month: 'long',
                            year: 'numeric'
                        });
                        return `${ev.phase} (${ev.intensity}) — ${monthYear}`;
                    });


                
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
                    .attr("y", 20)
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
        }, 300); 
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
