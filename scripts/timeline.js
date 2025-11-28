
// DATA LOADING & PROCESSING

async function loadTimelineData() {
    let data = await d3.csv("python_scripts/data/oni_monthly.csv", d => ({
        date: new Date(d.date),
        phase: d.phase,
        intensity: d.intensity
    }));
    // cutoff data because only temp data afterwards
    const cutoffDate = new Date("2023-12-31");
    data = data.filter(d => d.date <= cutoffDate);

    return data;
}

function extractEvents(data) {
    const strongEvents = [];
    const everyEvents = [];

    for (let i = 1; i < data.length; i++) {
        const prev = data[i - 1];
        const curr = data[i];

        const isStrongish = ["Strong", "Very Strong"].includes(curr.intensity);
        const prevStrongish = ["Strong", "Very Strong"].includes(prev.intensity);

        const phaseChanged = prev.phase !== curr.phase;
        const intensityChanged = curr.intensity !== prev.intensity;

        if (
            (curr.phase === "La Niña" || curr.phase === "El Niño") &&
            isStrongish &&
            (phaseChanged || intensityChanged)
        ) {
            strongEvents.push(curr);
        }

        everyEvents.push(curr);
    }
    return { strongEvents, everyEvents };
}


// SCALE & AXIS CREATION


function createTimeScale(data, frameWidth) {
    return d3.scaleTime()
        .domain(d3.extent(data.map(d => d.date)))
        .range([40, frameWidth - 40]);
}

function createTimelineAxis(window, x, frameHeight) {
    const regularYears = d3.timeYear.every(5).range(
        x.domain()[0],
        x.domain()[1]
    );
    
    const axis = d3.axisBottom(x)
        .tickValues(regularYears)
        .tickFormat(d3.timeFormat("%Y"))
        .tickSize(6);
    
    
    const axisGroup = window.append("g")
        .attr("class", "timeline-axis")
        .attr("transform", `translate(0, ${frameHeight / 2})`)
        .call(axis);

    
    styleAxis(axisGroup);
    
    return axisGroup;
}

function styleAxis(axisGroup) {
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
}

// EVENT MARKERS

function createEventMarkers(window, events, x, frameHeight, className, clickHandler) {
    const eventGroup = window.selectAll(`.${className}`)
        .data(events)
        .enter()
        .append("g")
        .attr("class", className)
        .attr("transform", d => `translate(${x(d.date)}, ${frameHeight / 2})`);
    
    if (clickHandler) {
        eventGroup.append("circle")
            .attr("x", -2.5)
            .attr("y", -9)
            .attr("r", 4)
            .attr("rx", 2)
            .attr("fill", d => d.phase === "El Niño" ? "#AA0000" : "#072b8d")
            .attr("cursor", "pointer")
            .on("click", clickHandler);
        
        eventGroup.append("title")
            .text(d => {
                const monthYear = d.date.toLocaleDateString('en-US', { 
                    month: 'long', 
                    year: 'numeric' 
                });
                return `${d.phase} (${d.intensity}) — ${monthYear}`;
            });
    }
    
    return eventGroup;
}

// CURSOR

function createCursor(window, x, data, frameHeight) {
    const firstDate = data[0].date;
    const cursorData = { x: x(firstDate) };

    
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
    
    return { cursorHandle, cursorData };
}

// PLAYBACK CONTROLS

function createPlaybackControls(window, frameWidth, frameHeight) {
    const controlsGroup = window.append("g")
        .attr("class", "playback-controls")
        .attr("transform", `translate(${frameWidth / 2 - 75}, ${frameHeight / 2 + 50})`);
    
    const slowButton = createSpeedButton(controlsGroup, 0, ">");
    const playButton = createPlayButton(controlsGroup, 45);
    const stopButton = createStopButton(controlsGroup, 90);
    const fastButton = createSpeedButton(controlsGroup, 135, ">>");
    
    // Initial state: slow is selected
    slowButton.select("circle").attr("fill", "#888").attr("stroke", "#aaa");
    
    return { slowButton, playButton, stopButton, fastButton, controlsGroup };
}

function createSpeedButton(parent, xOffset, emoji) {
    const button = parent.append("g")
        .attr("class", `speed-button-${emoji}`)
        .attr("transform", `translate(${xOffset}, 0)`)
        .attr("cursor", "pointer");
    
    button.append("circle")
        .attr("r", 18)
        .attr("fill", "#666")
        .attr("stroke", "#999")
        .attr("stroke-width", 2);
    
    button.append("text")
        .attr("text-anchor", "middle")
        .attr("dy", "0.35em")
        .attr("font-size", "20px")
        .text(emoji);
    
    return button;
}

function createPlayButton(parent, xOffset) {
    const button = parent.append("g")
        .attr("class", "play-button")
        .attr("transform", `translate(${xOffset}, 0)`)
        .attr("cursor", "pointer");
    
    button.append("circle")
        .attr("r", 18)
        .attr("fill", "#666")
        .attr("stroke", "#999")
        .attr("stroke-width", 2);
    
    button.append("path")
        .attr("d", "M-5,-7 L-5,7 L7,0 Z")
        .attr("fill", "#fff");
    
    return button;
}

function createStopButton(parent, xOffset) {
    const button = parent.append("g")
        .attr("class", "stop-button")
        .attr("transform", `translate(${xOffset}, 0)`)
        .attr("cursor", "pointer")
        .style("opacity", 0.5);
    
    button.append("circle")
        .attr("r", 18)
        .attr("fill", "#666")
        .attr("stroke", "#999")
        .attr("stroke-width", 2);
    
    button.append("rect")
        .attr("x", -5)
        .attr("y", -5)
        .attr("width", 10)
        .attr("height", 10)
        .attr("fill", "#fff");
    
    return button;
}

function setupPlaybackHandlers(controls, playbackState, cursorData, cursorHandle, frameWidth, getDataAtPosition) {
    const { slowButton, playButton, stopButton, fastButton } = controls;
    
    slowButton.on("click", () => {
        playbackState.speed = 200;
        slowButton.select("circle").attr("fill", "#888").attr("stroke", "#aaa");
        fastButton.select("circle").attr("fill", "#666").attr("stroke", "#999");
        
        if (playbackState.isPlaying) {
            clearInterval(playbackState.interval);
            startPlayback(playbackState, cursorData, cursorHandle, frameWidth, getDataAtPosition);
        }
    });
    
    fastButton.on("click", () => {
        playbackState.speed = 120;
        fastButton.select("circle").attr("fill", "#888").attr("stroke", "#aaa");
        slowButton.select("circle").attr("fill", "#666").attr("stroke", "#999");
        
        if (playbackState.isPlaying) {
            clearInterval(playbackState.interval);
            startPlayback(playbackState, cursorData, cursorHandle, frameWidth, getDataAtPosition);
        }
    });
    
    playButton.on("click", () => {
        if (!playbackState.isPlaying) {
            playbackState.isPlaying = true;
            playButton.style("opacity", 0.5);
            stopButton.style("opacity", 1);
            startPlayback(playbackState, cursorData, cursorHandle, frameWidth, getDataAtPosition);
        }
    });
    
    stopButton.on("click", () => {
        if (playbackState.isPlaying) {
            stopPlayback(playbackState, playButton, stopButton, cursorData, getDataAtPosition);
        }
    });
}

function startPlayback(playbackState, cursorData, cursorHandle, frameWidth, getDataAtPosition) {
    const minX = 40;
    const maxX = frameWidth - 40;
    const totalDistance = maxX - minX;

    const step = totalDistance / 900;
    
    playbackState.interval = setInterval(() => {
        const currentX = cursorData.x;
        const newX = currentX + step;
        
        if (newX >= maxX) {
            cursorData.x = minX;
            cursorHandle.attr("cx", minX);
            const dataPoint = getDataAtPosition(minX);
            onSlidedCursor(dataPoint);
        } else {
            cursorData.x = newX;
            cursorHandle.attr("cx", newX);
            
            const dataPoint = getDataAtPosition(newX);
            onSlidedCursor(dataPoint);
        }
    }, playbackState.speed);
}

function stopPlayback(playbackState, playButton, stopButton, cursorData, getDataAtPosition) {
    playbackState.isPlaying = false;
    playButton.style("opacity", 1);
    stopButton.style("opacity", 0.5);
    
    if (playbackState.interval) {
        clearInterval(playbackState.interval);
        playbackState.interval = null;
    }
    
    const dataPoint = getDataAtPosition(cursorData.x);
    onSlidedCursor(dataPoint);
}


// MAGNIFIER

function createMagnifier(window) {
    const magnifier = window.append("g")
        .attr("class", "magnifier")
        .style("display", "none");
    
    magnifier.append("rect")
        .attr("width", 140)
        .attr("height", 80)
        .attr("rx", 8)
        .attr("fill", "white")
        .attr("stroke", "#333")
        .attr("stroke-width", 2)
        .style("filter", "drop-shadow(0 2px 4px rgba(0,0,0,0.2))");
    
    const magnifierTimeline = magnifier.append("g")
        .attr("transform", "translate(10, 40)");
    
    magnifierTimeline.append("line")
        .attr("x1", 0)
        .attr("x2", 120)
        .attr("y1", 0)
        .attr("y2", 0)
        .attr("stroke", "#d0d0d0")
        .attr("stroke-width", 2);
    
    const monthTicksGroup = magnifierTimeline.append("g")
        .attr("class", "month-ticks");
    
    const positionIndicator = magnifierTimeline.append("circle")
        .attr("r", 5)
        .attr("cy", 0)
        .attr("fill", "#212529")
        .attr("stroke", "#fff")
        .attr("stroke-width", 2);
    
    const magnifierYearLabel = magnifier.append("text")
        .attr("x", 70)
        .attr("y", 20)
        .attr("text-anchor", "middle")
        .attr("font-size", "14px")
        .attr("font-weight", "700")
        .attr("fill", "#333");
    
    return { magnifier, monthTicksGroup, positionIndicator, magnifierYearLabel };
}

function updateMagnifier(magnifierElements, everyEvents, dataPoint, frameWidth, frameHeight, cursorX) {
    const { magnifier, monthTicksGroup, positionIndicator, magnifierYearLabel } = magnifierElements;
    const currentDate = dataPoint.date;
    const year = currentDate.getFullYear();
    
    magnifierYearLabel.text(year);
    
    const yearStart = new Date(year, 0, 1);
    const yearEnd = new Date(year, 11, 31);
    const monthScale = d3.scaleTime()
        .domain([yearStart, yearEnd])
        .range([0, 120]);
    
    monthTicksGroup.selectAll("*").remove();
    
    const eventsInYear = everyEvents.filter(ev => ev.date.getFullYear() === year);
    
    addEventBarsToMagnifier(monthTicksGroup, eventsInYear, monthScale);
    addMonthTicksToMagnifier(monthTicksGroup, yearStart, yearEnd, monthScale);
    
    positionIndicator.attr("cx", monthScale(currentDate));
    
    const magnifierX = Math.max(10, Math.min(cursorX - 70, frameWidth - 150));
    const magnifierY = frameHeight / 2 + 50;
    magnifier.attr("transform", `translate(${magnifierX}, ${magnifierY})`);
    magnifier.style("display", "block");
}

function addEventBarsToMagnifier(monthTicksGroup, eventsInYear, monthScale) {
    const intensityHeight = { "Neutral": 0, "Weak": 10, "Moderate": 15, "Strong": 25 , "Very Strong" :30};
    const intensityDarken = { "Neutral": 0.0, "Weak": 0.0, "Moderate": 0.25, "Strong": 0.45 ,"Very Strong" :0.65};
    
    function darkenColor(hex, factor) {
        const f = 1 - factor;
        const r = Math.round(parseInt(hex.slice(1,3), 16) * f);
        const g = Math.round(parseInt(hex.slice(3,5), 16) * f);
        const b = Math.round(parseInt(hex.slice(5,7), 16) * f);
        return `rgb(${r},${g},${b})`;
    }
    
    const miniEventGroups = monthTicksGroup.selectAll(".mini-event-group")
        .data(eventsInYear.filter(ev => ev.intensity !== "Neutral"))
        .enter()
        .append("g")
        .attr("class", "mini-event-group");
    
    miniEventGroups.append("rect")
        .attr("class", "mini-event")
        .attr("x", ev => monthScale(ev.date) - 3.5)
        .attr("y", ev => -intensityHeight[ev.intensity] / 2)
        .attr("width", 7)
        .attr("height", ev => intensityHeight[ev.intensity])
        .attr("rx", 2)
        .attr("fill", ev => {
            let base =
                ev.phase === "El Niño" ? "#ff6a6a" :
                ev.phase === "La Niña" ? "#6aa0ff" :
                "#999";
            return darkenColor(base, intensityDarken[ev.intensity]);
        });

    miniEventGroups.append("title")
        .text(ev => {
            const monthYear = ev.date.toLocaleDateString('en-US', {
                month: 'long',
                year: 'numeric'
            });
            return `${ev.phase} (${ev.intensity}) — ${monthYear}`;
        });
}

function addMonthTicksToMagnifier(monthTicksGroup, yearStart, yearEnd, monthScale) {
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
}

// DRAG BEHAVIOR

function setupDragBehavior(cursorHandle, cursorData, frameWidth, frameHeight, magnifierElements, everyEvents, data, x, playbackState, playButton, stopButton) {
    let hoverTimer = null;
    let isDragging = false;
    let lastX = null;
    
    function getDataAtPosition(xPos) {
        const date = x.invert(xPos);
        const bisect = d3.bisector(d => d.date).left;
        const index = bisect(data, date);
        return data[Math.min(index, data.length - 1)];
    }
    
    function dragstarted(event, d) {
        try{
            if (playbackState.isPlaying) {
                stopPlayback(playbackState, playButton, stopButton, cursorData, getDataAtPosition);
        }
        }
        catch (err) {
        }
        
        d3.select(this).raise().attr("stroke", "black");
        isDragging = true;
        lastX = null;
    }

    function dragged(event, d) {
        const clampedX = Math.max(40, Math.min(frameWidth - 40, event.x));
        d3.select(this).attr("cx", d.x = clampedX);
        
        const hasMovedSignificantly = lastX === null || Math.abs(clampedX - lastX) > 3;
        
        if (hasMovedSignificantly) {
            if (hoverTimer) clearTimeout(hoverTimer);
            magnifierElements.magnifier.style("display", "none");
            lastX = clampedX;
        }
        
        hoverTimer = setTimeout(() => {
            if (isDragging) {
                const dataPoint = getDataAtPosition(d.x);
                updateMagnifier(magnifierElements, everyEvents, dataPoint, frameWidth, frameHeight, d.x);
            }
        }, 300);
    }
    
    function dragended(event, d) {
        d3.select(this).attr("stroke", null);
        isDragging = false;
        
        if (hoverTimer) clearTimeout(hoverTimer);
        magnifierElements.magnifier.style("display", "none");
        
        const dataPoint = getDataAtPosition(d.x);
        onSlidedCursor(dataPoint);
    }
    
    const drag = d3.drag()
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended);
    
    cursorHandle.call(drag);
    
    return getDataAtPosition;
}
// EVENT HANDLERS

function onClickEvent(event, d) {
    d3.selectAll('.strong-event rect').classed('timeline-selected', false);
    d3.select(this).classed('timeline-selected', true);
    
    const year = d.date.getFullYear();
    
    if (typeof globalThis.updateMapYear === 'function') {
        try {
            globalThis.updateMapYear(year);
        } catch (err) {
            console.warn('updateMapYear failed', err);
        }
    } else {
        console.log('Clicked strong event:', d.date, d.phase, d.intensity);
    }
}

function onSlidedCursor(dataPoint) {
    const date = dataPoint.date;
    
    if (typeof globalThis.updateMapMonth === 'function') {
        try {
            globalThis.updateMapMonth(date);
        } catch (err) {
            console.warn('updateMapMonth failed', err);
        }
    } else if (typeof globalThis.updateMapYear === 'function') {
        try {
            globalThis.updateMapYear(date.getFullYear());
        } catch (err) {
            console.warn('updateMapYear failed', err);
        }
    } else {
        console.log('Slided to:', dataPoint.date, dataPoint.phase, dataPoint.intensity);
    }
}

// MAIN INITIALIZATION

const createTimelineScale = async (isMap) => {
    const container = document.getElementById("timeline-chart");
    const width = container.clientWidth;
    const height = container.clientHeight;
    
    const svg = d3.select("#timeline-chart")
        .append("svg")
        .attr("width", width)
        .attr("height", height);
    
    const margin = { top: 0, right: 60, bottom: 60, left: 60 };
    const frameWidth = width - margin.left - margin.right;
    const frameHeight = height - margin.top - margin.bottom;
    
    const window = svg.append("g")
        .attr("transform", `translate(${margin.left}, ${margin.top})`);
    
    // Load data
    const data = await loadTimelineData();
    const { strongEvents, everyEvents } = extractEvents(data);
    
    // Create scale and axis
    const x = createTimeScale(data, frameWidth);
    createTimelineAxis(window, x, frameHeight);

    const axisY = 30;
    const magnifierYOffset = 22; 
    const magnifierRectHeight = 80; 
    const requiredBottom = axisY + magnifierYOffset + magnifierRectHeight +20;
    const bottomOverflow = Math.max(0, requiredBottom - height);
    const svgHeight = height + bottomOverflow;

    svg.attr("height", svgHeight);

    container.style.overflow = "visible";

    
    // Create event markers
    createEventMarkers(window, strongEvents, x, frameHeight, "strong-event", onClickEvent);
    createEventMarkers(window, everyEvents, x, frameHeight, "event", null);
    
    // Create cursor
    const { cursorHandle, cursorData } = createCursor(window, x, data, frameHeight);
    
    let playbackState = false;
    let controls = false;
    // Create playback controls

    console.log(isMap);
    if (isMap){
        playbackState = { isPlaying: false, interval: null, speed: 150 };
        controls = createPlaybackControls(window, frameWidth, frameHeight);
    }
    
    // Create magnifier
    const magnifierElements = createMagnifier(window);
    
    // Setup drag behavior (returns getDataAtPosition function)
    
    const getDataAtPosition = setupDragBehavior(
    cursorHandle, cursorData, frameWidth, frameHeight,
    magnifierElements, everyEvents, data, x,
    playbackState? playbackState : null, controls ? controls.playButton : null, controls ? controls.stopButton : null);

    // Setup playback handlers
    if (isMap){
        setupPlaybackHandlers(controls, playbackState, cursorData, cursorHandle, frameWidth, getDataAtPosition);
    }
    
    return x;
};
