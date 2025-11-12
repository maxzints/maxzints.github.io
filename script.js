// --- Data Loading and Initialization ---
    const dimensions = {
        width: 1900,
        height: 800,
        margin: { top: 30, right: 20, bottom: 20, left: 50 }
    }
    const width = dimensions.width - dimensions.margin.left - dimensions.margin.right;
    const height = dimensions.height - dimensions.margin.top - dimensions.margin.bottom;
    const radius = 0.7; // Radius of each data mark
    const PARTY_OFFSET_AMOUNT = 0.15; // Controls how far off-center each party is pulled (0.0 to 0.5)

    // Cache processed/pivoted data per question to avoid repeated work
    const processedCache = new Map();

d3.csv("ScrubbedRLSDataFile.csv").then(function (rawData) {

    window.rlsData = rawData; 
    
    // Create Buttons
    const buttonsContainer = d3.select(".buttons-container");
    buttonsContainer.selectAll("button")
        .data(questionColumns)
        .enter()
        .append("button")
        .attr("data-question-id", d => d.id)
        .text(d => d.label)
        .on("click", function(event, d) {
            currentQuestionColumn = d.id;
            updateChart(window.rlsData);
        });

    // Render Chart
    updateChart(window.rlsData);

});

// --- Attribute Definitions ---
const questionColumns = [
    { id: "CHNG_A", label: "Societal Change A" },
    { id: "CHNG_B", label: "Societal Change B" },
    { id: "CHNG_C", label: "Societal Change C" },
    { id: "DIVRELPOP", label: "Diversity (Religion)" },
    { id: "DIVRACPOP", label: "Diversity (Race)" }
];

const X_COLUMN = "BIRTHDECADE";     
const Party_ID = "PARTY";       

// Current Question Selection State
let currentQuestionColumn = questionColumns[0].id;

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
        case "Republican": return { dx: -PARTY_OFFSET_AMOUNT, dy: -PARTY_OFFSET_AMOUNT }; 
        case "Democrat": return { dx: PARTY_OFFSET_AMOUNT, dy: PARTY_OFFSET_AMOUNT }; 
        case "Independent": return { dx: PARTY_OFFSET_AMOUNT, dy: -PARTY_OFFSET_AMOUNT }; 
        case "Other": return { dx: -PARTY_OFFSET_AMOUNT, dy: PARTY_OFFSET_AMOUNT }; 
        default: return { dx: 0, dy: 0 };
    }
}

//Data Processing Function
function processAndPivotData(rawData, questionId, xScale, yScale) {
    const processedData = [];

    rawData.forEach(d => {
        const decade = +d[X_COLUMN];
        const partyCode = +d[Party_ID];
        const responseCode = +d[questionId]; 

        if (decade >= 1 && decade <= 7 && partyCode >= 1) {
            const responseLabel = mapResponseCodeToLabel(responseCode);
            
            if (responseLabel !== null) {
                const partyName = mapPartyCode(partyCode);
                const partyOffset = getPartyOffset(partyName);
                
                // Calc center of grid cell
                const cellCenterX = xScale(decade) + xScale.bandwidth() / 2;
                const cellCenterY = yScale(responseLabel) + yScale.bandwidth() / 2;
                
                // Calc offset factor (50% of the cell width)
                const offsetFactorX = xScale.bandwidth();
                const offsetFactorY = yScale.bandwidth();
                
                // Apply the party-specific offset to the target position
                const targetX = cellCenterX + (partyOffset.dx * offsetFactorX);
                const targetY = cellCenterY + (partyOffset.dy * offsetFactorY);

                processedData.push({
                    partyCode: partyCode,
                    partyName: partyName,
                    birthDecade: decade,
                    responseLabel: responseLabel,
                    targetX: targetX, 
                    targetY: targetY, 
                    x: targetX, 
                    y: targetY 
                });
            }
        }
    });
    return processedData;
}

// Chart Update Function when button is pressed
function updateChart(rawData) {
    // Clear old SVG and Canvas content
    d3.select(".chart-container svg").remove();
    d3.select(".chart-container canvas").remove();

    // Labels for each axis
    const rowNames = ["Better", "No Difference", "Worse"];
    const columnNames = [1, 2, 3, 4, 5, 6, 7];
    
    const partyDomains = ["Democrat", "Republican", "Independent", "Other"];
    const partyColors = ["#1f77b4", "#d62728", "#ff7f0e", "#bcbd22"];

    const colorScale = d3.scaleOrdinal()
        .domain(partyDomains)
        .range(partyColors);

    // Birthdecade Labels 
    const columnLabels = ['1940s-50s', '1960s', '1970s', '1980s', '1990s', '2000s', '2010s'];
    const xScale = d3.scaleBand()
        .domain(columnNames)
        .range([0, dimensions.width])
        .paddingInner(0.1);

    const yScale = d3.scaleBand()
        .domain(rowNames)
        .range([0, height])
        .paddingInner(0.1);

    // Process data (with caching) — positions are in pixel space relative to scales
    let nodes;
    if (processedCache.has(currentQuestionColumn)) {
        nodes = processedCache.get(currentQuestionColumn);
    } else {
        nodes = processAndPivotData(rawData, currentQuestionColumn, xScale, yScale);
        processedCache.set(currentQuestionColumn, nodes);
    }

    // Create a canvas for fast rendering of many points (SVG with 36k nodes is slow)
    const canvas = d3.select('.chart-container')
        .append('canvas')
        .attr('width', dimensions.width + dimensions.margin.left + dimensions.margin.right)
        .attr('height', dimensions.height + dimensions.margin.top + dimensions.margin.bottom)
        .style('position', 'absolute')
        .style('left', '0px')
        .style('top', '0px')
        .node();

    const ctx = canvas.getContext('2d');

    // Define and run the force simulation asynchronously (non-blocking)
    const simulation = d3.forceSimulation(nodes)
        .force('x', d3.forceX(d => d.targetX).strength(0.2))
        .force('y', d3.forceY(d => d.targetY).strength(0.2))
        .force('collide', d3.forceCollide(radius * 2 + 0.25))
        .alpha(1)
        .alphaDecay(0.03);

    // draw function using canvas
    function draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.save();
        // account for the svg group translation used for axes
        ctx.translate(dimensions.margin.left, dimensions.margin.top);
        for (let i = 0; i < nodes.length; i++) {
            const d = nodes[i];
            ctx.beginPath();
            ctx.arc(d.x, d.y, radius, 0, Math.PI * 2);
            ctx.fillStyle = colorScale(d.partyName);
            ctx.globalAlpha = 0.9;
            ctx.fill();
        }
        ctx.restore();
    }

    // redraw each tick but throttle via requestAnimationFrame
    let scheduled = false;
    simulation.on('tick', () => {
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

    // X-Axis (Birthdecade labels and grid lines)
    const svg = d3.select(".chart-container").append("svg")
        .attr("width", dimensions.width + dimensions.margin.left + dimensions.margin.right)
        .attr("height", dimensions.height + dimensions.margin.top + dimensions.margin.bottom)
        .append("g")
        .attr("transform", `translate(${dimensions.margin.left}, ${dimensions.margin.top})`);

    const xAxisGroup = svg.append("g")
        .attr("class", "x-axis")
        // Move the x-axis downwards to align with the canvas drawing area
        .attr("transform", `translate(0, ${-dimensions.margin.top + 820})`)
        .call(d3.axisTop(xScale)
            .tickSize(height)
            .tickFormat((d, i) => columnLabels[i]));

    xAxisGroup.selectAll(".tick line")
        .attr("stroke", "#ccc")
        .attr("stroke-dasharray", "2,2");

    // Y-Axis (Response Labels and grid lines)
    svg.append("g")
        .attr("class", "y-axis")
        .call(d3.axisLeft(yScale)
            .tickSize(-dimensions.width))
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

    // --- LEGEND ---
    const legend = svg.append("g")
        .attr("class", "legend")
        .attr("transform", `translate(${dimensions.width - 250}, ${-dimensions.margin.top + 25})`);

    legend.append("text")
        .attr("y", -10)
        .attr("x", 0)
        .style("font-weight", "bold")
        .text("Party Names:");

    const legendItems = legend.selectAll(".legend-item")
        .data(partyDomains)
        .enter()
        .append("g")
        .attr("class", "legend-item")
        .attr("transform", (d, i) => `translate(0, ${i * 20})`);

    legendItems.append("circle")
        .attr("cx", 5)
        .attr("cy", 5)
        .attr("r", 5)
        .style("fill", d => colorScale(d));

    legendItems.append("text")
        .attr("x", 15)
        .attr("y", 9)
        .text(d => d);

    // Update button active state
    d3.selectAll(".buttons-container button").classed("active", function() {
        return d3.select(this).attr("data-question-id") === currentQuestionColumn;
    });
}
