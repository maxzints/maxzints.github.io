// --- Data Loading and Initialization ---
const dimensions = {
    width: 2000,
    height: 600,
    margin: { top: 25, right: 20, bottom: 30, left: 30 }
}
const width = dimensions.width - dimensions.margin.left - dimensions.margin.right;
const height = dimensions.height - dimensions.margin.top - dimensions.margin.bottom;
const radius = 1; // Radius of each data mark
const PARTY_OFFSET_AMOUNT = 0.25; // Controls how far off-center each party is pulled (0.0 to 0.5)

// Cache processed/pivoted data per question to avoid repeated work
const processedCache = new Map();
// Global state for the currently clicked respondent ID for highlighting
window.highlightedID = null;

d3.csv("ScrubbedRLSDataFileREDUCED.csv").then(function (rawData) {

    window.rlsData = rawData;

    // Call the universal update, which will handle the initial filter state (from previous step)
    if (typeof updateAllCharts === 'function') {
        updateAllCharts();
    } else {
        // Fallback for direct testing
        updateChart(window.rlsData);
    }

});

// --- Attribute Definitions ---
const questionColumns = [
    { id: "CHNG_A", label: "Societal Change A" },
    { id: "CHNG_B", label: "Societal Change B" },
    { id: "CHNG_C", label: "Societal Change C" }
];
const Party_ID = "PARTY";

//Map Party Codes to Party Names
function mapPartyCode(code) {
    switch (code) {
        case 1: return "Republican";
        case 2: return "Democrat";
        case 3: return "Independent";
        default: return "Other";
    }
}

// Map the Question's Response Code to the Text Label
function mapResponseCodeToLabel(code) {
    switch (code) {
        case 1: return "Better";
        case 2: return "No Difference";
        case 3: return "Worse";
        default: return null;
    }
}

//Offset each party such that they have their own quadrant of the a grid cell
function getPartyOffset(partyName) {
    switch (partyName) {
        case "Republican": return { dx: -PARTY_OFFSET_AMOUNT / 1.2, dy: -PARTY_OFFSET_AMOUNT };
        case "Democrat": return { dx: PARTY_OFFSET_AMOUNT / 1.2, dy: PARTY_OFFSET_AMOUNT };
        case "Independent": return { dx: PARTY_OFFSET_AMOUNT / 1.2, dy: -PARTY_OFFSET_AMOUNT };
        case "Other": return { dx: -PARTY_OFFSET_AMOUNT / 1.2, dy: PARTY_OFFSET_AMOUNT };
        default: return { dx: 0, dy: 0 };
    }
}

// Data Processing Function for all questions across the x-axis
function processAndPivotData(rawData, xScale, yScale) {
    const processedData = [];

    rawData.forEach(d => {
        // --- FIX: Use 'P_SUID' as the unique respondent column ---
        const respondentID = d['P_SUID'];
        // --------------------------------------------------------
        const partyCode = +d[Party_ID];
        if (!(partyCode >= 1)) return; // skip invalid party

        const partyName = mapPartyCode(partyCode);
        const partyOffset = getPartyOffset(partyName);

        // create a node for each question's response 
        questionColumns.forEach((q, qi) => {
            const responseCode = +d[q.id];
            const responseLabel = mapResponseCodeToLabel(responseCode);
            if (responseLabel === null) return;

            // Calc center of grid cell for this question column
            const cellCenterX = xScale(q.id) + xScale.bandwidth() / 2;
            const cellCenterY = yScale(responseLabel) + yScale.bandwidth() / 2;

            const offsetFactorX = xScale.bandwidth();
            const offsetFactorY = yScale.bandwidth();

            const targetX = cellCenterX + (partyOffset.dx * offsetFactorX);
            const targetY = cellCenterY + (partyOffset.dy * offsetFactorY);

            processedData.push({
                // --- NEW: Add respondent ID to the node ---
                id: respondentID,
                // -----------------------------------------
                partyCode: partyCode,
                partyName: partyName,
                questionId: q.id,
                questionIndex: qi,
                questionLabel: q.label,
                responseLabel: responseLabel,
                targetX: targetX,
                targetY: targetY,
                x: targetX,
                y: targetY
            });
        });
    });

    return processedData;
}

// Chart Update Function when button is pressed
function updateChart(rawData) {
    // Clear old SVG and Canvas content
    const container = d3.select('#chart-vis1');
    d3.select('#chart-vis1 svg').remove();
    d3.select('#chart-vis1 canvas').remove(); // This clears BOTH canvases

    // Labels for each axis
    const rowNames = ["Better", "No Difference", "Worse"];

    const partyDomains = ["Democrat", "Republican", "Independent", "Other"];
    const partyColors = ["#76b7b2ff", "#e15759", "#f28e2c", "#59a14f"];

    const colorScale = d3.scaleOrdinal()
        .domain(partyDomains)
        .range(partyColors);

    // compute sizing from the container so the chart fills the allotted area
    const rect = container.node().getBoundingClientRect();
    const totalWidth = Math.max(300, Math.floor(rect.width));
    const totalHeight = Math.max(200, Math.floor(rect.height));
    const chartWidth = Math.max(200, totalWidth - dimensions.margin.left - dimensions.margin.right);
    const chartHeight = Math.max(120, totalHeight - dimensions.margin.top - dimensions.margin.bottom);

    // padding controls spacing between question bands and response rows
    const yPaddingInner = 0.025; // vertical gap between response bands
    const xPadding = yPaddingInner / 4; // horizontal gap between question bands (half the vertical)

    const xScale = d3.scaleBand()
        .domain(questionColumns.map(q => q.id))
        .range([0, chartWidth])
        .padding(xPadding);

    const yScale = d3.scaleBand()
        .domain(rowNames)
        .range([0, chartHeight])
        .paddingInner(yPaddingInner);

    // Process data (with caching) — positions are in pixel space relative to scales
    const cacheKey = 'ALL_QUESTIONS';
    let nodes;
    if (processedCache.has(cacheKey)) {
        nodes = processedCache.get(cacheKey);
    } else {
        nodes = processAndPivotData(rawData, xScale, yScale);
        processedCache.set(cacheKey, nodes);
    }

    // --- Filter Nodes based on the global state ---
    const activeParties = typeof window !== 'undefined' && window.activeParties ? window.activeParties : new Set(partyDomains);
    const filteredNodes = nodes.filter(d => activeParties.has(d.partyName));
    // ---------------------------------------------

    // 1. **SINGLE** CANVAS CREATION 
    const canvasElement = container
        .append('canvas')
        .attr('width', totalWidth)
        .attr('height', totalHeight)
        .style('position', 'absolute')
        .style('left', '0px')
        .style('top', '0px')
        .node();

    const ctx = canvasElement.getContext('2d');

    // --- Define checkHit (must be defined before the listener) ---
    function checkHit(x, y) {
        // simulation is defined below, so we must access its nodes array
        const currentNodes = simulation.nodes();
        const hitRadius = radius * 4;

        const clickX = x - dimensions.margin.left;
        const clickY = y - dimensions.margin.top;

        for (let i = 0; i < currentNodes.length; i++) {
            const d = currentNodes[i];
            const dx = clickX - d.x;
            const dy = clickY - d.y;
            if (dx * dx + dy * dy < hitRadius * hitRadius) {
                return d.id;
            }
        }
        return null;
    }
    // -----------------------------------------------------------

    // 2. **SINGLE** CLICK LISTENER (Robust and Consolidated)
    d3.select(canvasElement).on('click', (event) => {
        const rect = canvasElement.getBoundingClientRect();
        const clickX = event.clientX - rect.left;
        const clickY = event.clientY - rect.top;

        const clickedID = checkHit(clickX, clickY);

        // State Toggle Logic: Use window.highlightedID
        if (clickedID !== null) {
            // If the same ID is clicked, un-highlight it (toggle)
            if (window.highlightedID === clickedID) {
                window.highlightedID = null;
            } else {
                window.highlightedID = clickedID;
            }
        } else if (window.highlightedID !== null) {
            // Clicked in empty space while something was highlighted (un-highlight)
            window.highlightedID = null;
        }

        // Forced Update Trigger
        console.log('--- CLICK EVENT FIRED! New ID is ' + window.highlightedID + ' ---');

        if (typeof window.updateAllCharts === 'function') {
            window.updateAllCharts();
        } else {
            draw();
        }
    });
    // -------------------------------------------------------

    // Define and run the force simulation asynchronously (non-blocking)
    const simulation = d3.forceSimulation(filteredNodes)
        .force('x', d3.forceX(d => d.targetX).strength(0.025))
        .force('y', d3.forceY(d => d.targetY).strength(0.05))
        .force('collide', d3.forceCollide(radius * 3))
        .force('repel', d3.forceManyBody().strength(-0.03))
        .alpha(1)
        .alphaDecay(0.02);

    // draw function using canvas
    function draw() {
        // Use canvasElement instead of canvas
        ctx.clearRect(0, 0, totalWidth, totalHeight);
        ctx.save();
        ctx.translate(dimensions.margin.left, dimensions.margin.top);

        const nodesToDraw = simulation.nodes();

        for (let i = 0; i < nodesToDraw.length; i++) {
            const d = nodesToDraw[i];

            // --- Highlighting Logic ---
            let currentRadius = radius;
            let currentAlpha = 0.9;
            let strokeColor = null;

            if (highlightedID !== null) {
                if (d.id === highlightedID) {
                    currentAlpha = 1.0;
                    currentRadius = radius * 2;
                    strokeColor = '#000000';
                } else {
                    currentAlpha = 0.1;
                }
            }
            // ------------------------------------

            ctx.beginPath();
            ctx.arc(d.x, d.y, currentRadius, 0, Math.PI * 2);
            ctx.fillStyle = colorScale(d.partyName);
            ctx.globalAlpha = currentAlpha;
            ctx.fill();

            if (strokeColor) {
                ctx.strokeStyle = strokeColor;
                ctx.lineWidth = 0.5;
                ctx.stroke();
            }
        }
        ctx.restore();
    }

    // redraw each tick but throttle via requestAnimationFrame
    let scheduled = false;
    // Constrain nodes to remain inside their response-label band (y-axis containers)
    function constrainNodesToBands() {
        const pad = 0.01;
        const nodesToConstrain = simulation.nodes();

        for (let i = 0; i < nodesToConstrain.length; i++) {
            const d = nodesToConstrain[i];
            // vertical clamp to response band
            const bandStart = yScale(d.responseLabel);
            const bandEnd = bandStart + yScale.bandwidth();
            const minY = bandStart + radius + pad;
            const maxY = bandEnd - radius - pad;
            if (d.y < minY) d.y = minY;
            if (d.y > maxY) d.y = maxY;

            // horizontal clamp to question column band
            if (d.questionId) {
                const colStart = xScale(d.questionId);
                const colEnd = colStart + xScale.bandwidth();
                const minX = colStart + radius + pad;
                const maxX = colEnd - radius - pad;
                if (d.x < minX) d.x = minX;
                if (d.x > maxX) d.x = maxX;
            }
        }
    }

    simulation.on('tick', () => {
        // enforce band constraints before drawing so nodes never crossover bands
        constrainNodesToBands();
        if (!scheduled) {
            scheduled = true;
            requestAnimationFrame(() => {
                draw();
                scheduled = false;
            });
        }
    });

    // ensure final draw after simulation ends
    simulation.on('end', draw);

    // initial draw for immediate feedback (positions initially equal target positions)
    draw();

    // --- AXES ---

    // X-Axis (Question labels and grid lines)
    const svg = container.append("svg")
        .attr("width", totalWidth)
        .attr("height", totalHeight)
        .append("g")
        .attr("transform", `translate(${dimensions.margin.left}, ${dimensions.margin.top})`);

    const xAxisGroup = svg.append("g")
        .attr("class", "x-axis")
        // place the top axis at the bottom of the inner chart area
        .attr("transform", `translate(0, ${chartHeight})`)
        .call(d3.axisTop(xScale)
            .tickSize(chartHeight)
            .tickFormat(d => {
                const q = questionColumns.find(qc => qc.id === d);
                return q ? q.label : d;
            }));

    xAxisGroup.selectAll(".tick line")
        .attr("stroke", "#ccc")
        .attr("stroke-dasharray", "2,2");

    // Y-Axis (Response Labels and grid lines)
    svg.append("g")
        .attr("class", "y-axis")
        .call(d3.axisLeft(yScale)
            .tickSize(-chartWidth))
        .selectAll(".tick line")
        .attr("stroke", "#ccc")
        .attr("stroke-dasharray", "2,2");

    // Y-Axis Label Rotation
    svg.select(".y-axis")
        .selectAll("text")
        .attr("x", -12)
        .attr("y", -8)
        .attr("transform", "rotate(-65)")
        .style("text-anchor", "middle");

    svg.selectAll(".domain").attr("stroke", "none");

    // NOTE: The click listener logic is now BEFORE the simulation definition.
    // This is valid in JavaScript, as long as `simulation` is defined before 
    // the listener actually executes its logic (which it is, since the 
    // click happens after the initial render).
}
