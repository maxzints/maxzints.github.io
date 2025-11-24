// --- Data Loading and Initialization ---
const dimensions = {
    width: 2000,
    height: 600,
    margin: { top: 25, right: 20, bottom: 30, left: 30 }
}
const width = dimensions.width - dimensions.margin.left - dimensions.margin.right;
const height = dimensions.height - dimensions.margin.top - dimensions.margin.bottom;
const radius = 1; // Radius of each mark
const PARTY_OFFSET_AMOUNT = 0.25; // Controls how far off-center each party is pulled (0.0 to 0.5)

// Cache processed/pivoted data per question to avoid repeated work
const processedCache = new Map();
// Global state for the currently clicked respondent ID for highlighting
window.highlightedID = null;

d3.csv("ScrubbedRLSDataFileREDUCED.csv").then(function (rawData) {

    const subsampledData = rawData.filter((d, i) => i % 3 === 0); 
    window.rlsData = subsampledData; // Store the subsampled data globally  

    // Call the universal update for initial filter state 
    if (typeof updateAllCharts === 'function') {
        updateAllCharts();
    } else {
        updateChart(window.rlsData);
    }

});


const questionColumns = [
    { id: "CHNG_A", label: "A growing population of immigrants" },
    { id: "CHNG_B", label: "More women in the workforce" },
    { id: "CHNG_C", label: "Acceptance of transgender people" }
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
        const respondentID = d['P_SUID'];
        const partyCode = +d[Party_ID];
        // NEW: Pull income and education codes
        const incCode = d['INC_SDT1'];
        const eduCode = d['EDUCREC'];
        
        if (!(partyCode >= 1)) return; // skip invalid party

        const partyName = mapPartyCode(partyCode);
        const partyOffset = getPartyOffset(partyName);

        // create a node for each question's response 
        questionColumns.forEach((q, qi) => {
            const responseCode = +d[q.id];
            const responseLabel = mapResponseCodeToLabel(responseCode);
            if (responseLabel === null) return;

            // Calc center of grid cell for this question column
            const cellCenterX = xScale(responseLabel) + xScale.bandwidth() / 2;
            const cellCenterY = yScale(q.id) + yScale.bandwidth() / 2;

            const offsetFactorX = xScale.bandwidth();
            const offsetFactorY = yScale.bandwidth();

            const targetX = cellCenterX + (partyOffset.dx * offsetFactorX);
            const targetY = cellCenterY + (partyOffset.dy * offsetFactorY);

            processedData.push({
                id: respondentID,
                partyCode: partyCode,
                partyName: partyName,
                // NEW: Add codes for filtering later
                incCode: incCode,
                eduCode: eduCode,
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
    const questionIDs = questionColumns.map(q => q.id);
    const responseLabels = ["Better", "No Difference", "Worse"];

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

    //spacing between question bands and response rows
    const yPaddingInner = 0.025; // vertical gap between response bands
    const xPadding = yPaddingInner / 4; // horizontal gap between question bands

    const xScale = d3.scaleBand()
        .domain(responseLabels)
        .range([0, chartWidth])
        .padding(xPadding);

    const yScale = d3.scaleBand()
        .domain(questionIDs)
        .range([0, chartHeight])
        .paddingInner(yPaddingInner);


    const cacheKey = 'ALL_QUESTIONS';
    let nodes;
    if (processedCache.has(cacheKey)) {
        nodes = processedCache.get(cacheKey);
    } else {
        nodes = processAndPivotData(rawData, xScale, yScale);
        processedCache.set(cacheKey, nodes);
    }

    // Filter Nodes based on the global state
    const activeParties = typeof window !== 'undefined' && window.activeParties ? window.activeParties : new Set(partyDomains);
    // NEW: Get Income/Edu Filters (using global map functions)
    const allIncomes = ['$30k - $50k', '$50k - $100k', '$100k - $150k', '$150k+', 'Unknown']; // Defined in index.html for consistency
    const activeIncomes = typeof window !== 'undefined' && window.activeIncomes ? window.activeIncomes : new Set(allIncomes);
    const allEdus = ['High School <', 'Associates <', 'Bachelor', 'Masters +', 'Unknown']; // Defined in index.html for consistency
    const activeEdus = typeof window !== 'undefined' && window.activeEdus ? window.activeEdus : new Set(allEdus);

    const filteredNodes = nodes.filter(d => 
        activeParties.has(d.partyName) &&
        // NEW: Apply income and education filters using the codes stored in the node
        (typeof mapInc === 'function' ? activeIncomes.has(mapInc(d.incCode)) : true) &&
        (typeof mapEdu === 'function' ? activeEdus.has(mapEdu(d.eduCode)) : true)
    );


    //CANVAS CREATION 
    const canvasElement = container
        .append('canvas')
        .attr('width', totalWidth)
        .attr('height', totalHeight)
        .style('position', 'absolute')
        .style('left', '0px')
        .style('top', '0px')
        .node();

    const ctx = canvasElement.getContext('2d');


    function checkHit(x, y) {
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

    // 2. CLICK LISTENER 
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

    // Force simulation 
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

            // Highlighting Logic
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
        const pad = 0.1;
        const nodesToConstrain = simulation.nodes();

        for (let i = 0; i < nodesToConstrain.length; i++) {
            const d = nodesToConstrain[i];
            // vertical clamp to response band
            const bandStartY = yScale(d.questionId);
            const bandEndY = bandStartY + yScale.bandwidth();
            const minY = bandStartY + radius + pad;
            const maxY = bandEndY - radius - pad;
            if (d.y < minY) d.y = minY;
            if (d.y > maxY) d.y = maxY;

            // horizontal clamp to question column band
            if (d.questionId) {
                const colStart = xScale(d.responseLabel);
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

    // initial draw
    draw();

    // X-Axis, Response Labels and grid lines
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
        )
        .selectAll(".tick line")
        .attr("stroke", "#ccc")
        .attr("stroke-dasharray", "2,2");

    // Y-Axis, Question labels and grid lines
    svg.append("g")
        .attr("class", "y-axis")
        .call(d3.axisLeft(yScale)
            .tickSize(-chartWidth) // Extend grid lines horizontally
            .tickFormat(d => {
                const q = questionColumns.find(qc => qc.id === d);
                return q ? q.label : d;
            }));


    // Y-Axis Label adjustment
    svg.select(".y-axis")
        .selectAll("text")
        .attr("x", 125) // Move text right

    svg.selectAll(".domain").attr("stroke", "none");
}
