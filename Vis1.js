// Vis1.js - Final Version with CSV Loading, Conditional Simulation, Delayed Start, and Snapshot

// --- Global Constants and Dimensions ---
const dimensions = {
    margin: { top: 50, right: 80, bottom: 40, left: 220 }
}
const radius = 1.5; // Radius of each mark (increased for better visibility)
const PARTY_OFFSET_AMOUNT = 0.25; 

const questionColumns = [
    { id: "CHNG_B", label: "More women in the workforce" },
    { id: "CHNG_A", label: "A growing population of immigrants" },
    { id: "SCIMPACT", label: "How has science impacted American society" }
];
const Party_ID = "PARTY";
const chartTitle = "How do Americans view social changes?";

// --- Global State ---
const processedCache = new Map();
window.highlightedID = null;
window.currentVis1Nodes = []; // Stores the final node positions for snapshotting
window.usePrecalculatedPositions = true; // Default state, overwritten by startVisualization()
let settledPositionsCache = new Map(); // Stores positions loaded from CSV
let isDataReady = false; // Flag to ensure rendering waits for data

// --- D3 Data Load (Main Entry Point) ---
Promise.all([
    d3.csv("RLS_Final.csv"),
    // Attempt to load the pre-calculated positions CSV
    d3.csv("settled_positions_demo.csv").catch(error => {
        console.warn("Could not load settled_positions.csv. Fast start will not be available.", error);
        return null; 
    }) 
]).then(function ([rawData, settledData]) {
    
    // 1. Process Settled Data (only happens once)
    if (settledData) {
        settledData.forEach(d => {
            settledPositionsCache.set(`${d.id}-${d.questionId}`, { 
                x: +d.x, 
                y: +d.y 
            });
        });
        console.log(`Loaded ${settledPositionsCache.size} pre-calculated positions.`);
    } else {
        // Disable the fast start button if CSV failed to load
        const fastButton = document.querySelector('button[onclick="startVisualization(true)"]');
        if (fastButton) {
            fastButton.disabled = true;
            fastButton.textContent += " (Unavailable)";
            fastButton.style.backgroundColor = "#ccc";
        }
    }

    // 2. Prepare Raw Data
    const subsampledData = rawData.filter((d, i) => i % 5 === 0);
    window.rlsData = subsampledData; 

    // 3. Set Ready Flag
    isDataReady = true; 
    console.log("Data loaded. Waiting for user to select start mode...");
    
}).catch(error => {
    console.error("Critical error: Failed to load RLS_Final.csv.", error);
    isDataReady = false;
});


// Starts the visualization based on user choice ---
function startVisualization(usePrecalculated) {
    
    if (!isDataReady || !window.rlsData) {
        alert("Data is still loading or failed to load. Please wait.");
        return;
    }
    
    // Hide the overlay
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
        overlay.style.display = 'none';
    }

    // Set the global state based on the button clicked
    window.usePrecalculatedPositions = usePrecalculated;
    
    // Trigger the universal update
    if (typeof updateAllCharts === 'function') {
        updateAllCharts();
    } else {
        updateChart(window.rlsData);
    }
}
window.startVisualization = startVisualization; // Expose globally for button clicks


// --- Utility Functions ---

function mapPartyCode(code) {
    switch (+code) {
        case 1: return "Republican";
        case 2: return "Democrat";
        case 3: return "Independent";
        default: return "Other";
    }
}

function mapResponseCodeToLabel(code) {
    switch (+code) {
        case 1: return "Better";
        case 2: return "No Difference";
        case 3: return "Worse";
        default: return null;
    }
}

function getPartyOffset(partyName) {
    switch (partyName) {
        case "Republican": return { dx: -PARTY_OFFSET_AMOUNT / 1.5, dy: -PARTY_OFFSET_AMOUNT };
        case "Democrat": return { dx: PARTY_OFFSET_AMOUNT / 1.5, dy: PARTY_OFFSET_AMOUNT };
        case "Independent": return { dx: PARTY_OFFSET_AMOUNT / 1.5, dy: -PARTY_OFFSET_AMOUNT };
        case "Other": return { dx: -PARTY_OFFSET_AMOUNT / 1.5, dy: PARTY_OFFSET_AMOUNT };
        default: return { dx: 0, dy: 0 };
    }
}

// --- Snapshot Function ---
function snapshotCurrentPositions() {
    console.log(window.currentVis1Nodes)
    if (!window.currentVis1Nodes || window.currentVis1Nodes.length === 0) {
        alert('Data is not ready. Wait for the chart to fully settle after loading or updating.');
        console.warn('Cannot snapshot positions: window.currentVis1Nodes is empty.');
        return;
    }
    let csv = "id,questionId,partyName,incCode,eduCode,x,y\n";
    window.currentVis1Nodes.forEach(d => {
        csv += `${d.id},${d.questionId},${d.partyName},${d.incCode},${d.eduCode},${d.x},${d.y}\n`;
    });

    const filename = 'vis1_snapshot_' + new Date().toISOString().slice(0, 10) + '.csv';
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    
    if (link.download !== undefined) { 
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        console.log(`Snapshot saved as ${filename}`);
    } else {
        alert("Your browser does not support automatic file downloading.");
    }
}
window.snapshotCurrentPositions = snapshotCurrentPositions; 


// --- Data Processing Function (Conditional Position Assignment) ---
function processAndPivotData(rawData, xScale, yScale) {
    const processedData = [];
    
    const usePrecalculated = window.usePrecalculatedPositions && settledPositionsCache.size > 0;

    rawData.forEach(d => {
        const respondentID = d['P_SUID'];
        const partyCode = +d[Party_ID];
        const incCode = d['INC_SDT1'];
        const eduCode = d['EDUCREC'];

        if (!(partyCode >= 1)) return; 

        const partyName = mapPartyCode(partyCode);
        const partyOffset = getPartyOffset(partyName);

        questionColumns.forEach((q, qi) => {
            const responseCode = +d[q.id];
            const responseLabel = mapResponseCodeToLabel(responseCode);
            if (responseLabel === null) return;

            // 1. Calculate Target Positions (where the node WANTS to go)
            const cellCenterX = xScale(responseLabel) + xScale.bandwidth() / 2;
            const cellCenterY = yScale(q.id) + yScale.bandwidth() / 2;
            const offsetFactorX = xScale.bandwidth();
            const offsetFactorY = yScale.bandwidth();
            const targetX = cellCenterX + (partyOffset.dx * offsetFactorX);
            const targetY = cellCenterY + (partyOffset.dy * offsetFactorY);
            
            let initialX = targetX;
            let initialY = targetY;

            // 2. Assign Initial Position (CSV or Target)
            if (usePrecalculated) {
                const settled = settledPositionsCache.get(`${respondentID}-${q.id}`);
                if (settled) {
                    // Store the raw settled X/Y values from the CSV
                    initialX = settled.x; 
                    initialY = settled.y;
                }
            }
            
            processedData.push({
                id: respondentID,
                partyCode: partyCode,
                partyName: partyName,
                incCode: incCode,
                eduCode: eduCode,
                questionId: q.id,
                responseLabel: responseLabel,
                
                targetX: targetX, 
                targetY: targetY, 
                
                x: initialX, 
                y: initialY 
            });
        });
    });

    return processedData;
}


// Chart Update Function (Conditional Simulation Run)
function updateChart(rawData) {
    // Clear old SVG and Canvas content
    const container = d3.select('#chart-vis1');
    d3.select('#chart-vis1 svg').remove();
    d3.select('#chart-vis1 canvas').remove(); 

    // --- Chart Setup (Sizing, Scales, Colors) ---
    const questionIDs = questionColumns.map(q => q.id);
    const responseLabels = ["Better", "No Difference", "Worse"];
    const partyDomains = ["Democrat", "Republican", "Independent", "Other"];
    const partyColors = ["#76b7b2ff", "#e15759", "#f28e2c", "#59a14f"];
    const colorScale = d3.scaleOrdinal().domain(partyDomains).range(partyColors);

    const rect = container.node().getBoundingClientRect();
    const totalWidth = Math.floor(rect.width);
    const totalHeight = Math.floor(rect.height);
    const chartWidth = Math.max(200, totalWidth - dimensions.margin.left - dimensions.margin.right);
    const chartHeight = Math.max(120, totalHeight - dimensions.margin.top - dimensions.margin.bottom);
    const yPaddingInner = 0.025; 
    const xPadding = yPaddingInner / 4; 

    const xScale = d3.scaleBand().domain(responseLabels).range([0, chartWidth]).padding(xPadding);
    const yScale = d3.scaleBand().domain(questionIDs).range([0, chartHeight]).paddingInner(yPaddingInner);

    const cacheKey = 'ALL_QUESTIONS';
    let nodes;
    if (processedCache.has(cacheKey)) {
        nodes = processedCache.get(cacheKey);
    } else {
        nodes = processAndPivotData(rawData, xScale, yScale);
        processedCache.set(cacheKey, nodes);
    }
    
    // --- Conditional Simulation Logic ---
    const usePrecalculated = window.usePrecalculatedPositions && settledPositionsCache.size > 0;
    
    // Alpha decay of 0 stops the simulation instantly.
    const alphaDecay = usePrecalculated ? 0 : 0.02; 
    const alphaInitial = usePrecalculated ? 0.3 : 1; 

    // Force simulation 
    const simulation = d3.forceSimulation(nodes)
        .force('x', d3.forceX(d => d.targetX).strength(0.015))
        .force('y', d3.forceY(d => d.targetY).strength(0.03))
        .force('collide', d3.forceCollide(radius * 1.5))
        .force('repel', d3.forceManyBody().strength(-0.01))
        .alpha(alphaInitial)
        .alphaDecay(alphaDecay);

    // If using pre-calculated positions, stop immediately and save state
    if (usePrecalculated) {
        simulation.stop();
        window.currentVis1Nodes = simulation.nodes().map(d => ({
            id: d.id,
            questionId: d.questionId,
            partyName: d.partyName,
            incCode: d.incCode,
            eduCode: d.eduCode,
            x: d.x, 
            y: d.y,
        }));
    }

    // --- Drawing & Interaction ---
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
        const currentNodes = usePrecalculated ? window.currentVis1Nodes : simulation.nodes();
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

    d3.select(canvasElement).on('click', (event) => {
        const rect = canvasElement.getBoundingClientRect();
        const clickX = event.clientX - rect.left;
        const clickY = event.clientY - rect.top;

        const clickedID = checkHit(clickX, clickY);

        if (clickedID !== null) {
            window.highlightedID = (window.highlightedID === clickedID) ? null : clickedID;
        } else if (window.highlightedID !== null) {
            window.highlightedID = null;
        }
        console.log('--- CLICK EVENT FIRED! New ID is ' + window.highlightedID + ' ---');

        if (typeof window.updateAllCharts === 'function') {
            window.updateAllCharts();
        } else {
            draw();
        }
    });

    function draw() {
        ctx.clearRect(0, 0, totalWidth, totalHeight);
        ctx.save();
        ctx.translate(dimensions.margin.left, dimensions.margin.top);

        const activeParties = typeof window !== 'undefined' && window.activeParties ? window.activeParties : new Set(partyDomains);
        const allIncomes = ['<$50k', '$50k - $100k', '$100k - $150k', '$>150k', '']; 
        const activeIncomes = typeof window !== 'undefined' && window.activeIncomes ? window.activeIncomes : new Set(allIncomes);
        const allEdus = ['High School <', 'Associates <', 'Bachelor', 'Masters +', 'Unknown']; 
        const activeEdus = typeof window !== 'undefined' && window.activeEdus ? window.activeEdus : new Set(allEdus);

        const nodesToDraw = usePrecalculated ? window.currentVis1Nodes : simulation.nodes();

        for (let i = 0; i < nodesToDraw.length; i++) {
            const d = nodesToDraw[i];
            const isPartyActive = activeParties.has(d.partyName);
            const isIncActive = (typeof mapInc === 'function' ? activeIncomes.has(mapInc(d.incCode)) : true);
            const isEduActive = (typeof mapEdu === 'function' ? activeEdus.has(mapEdu(d.eduCode)) : true);
            console.log(d)
            //console.log(`Node ID: ${d.id}, Party: ${d.partyName}, IncCode: ${d.incCode}, EduCode: ${d.eduCode}`);
            const isActive = isPartyActive && isIncActive && isEduActive;  
            let currentRadius = radius;
            let currentAlpha = 0.9;
            let strokeColor = null;

            if (window.highlightedID !== null) {
                if (d.id === window.highlightedID) {
                    currentAlpha = 1.0;
                    currentRadius = radius * 2;
                    strokeColor = '#000000';
                } else {
                    currentAlpha = 0.3; 
                }
            } else {
                if (!isActive) {
                    currentAlpha = 0.3; 
                } else {
                    currentAlpha = 0.9;
                }
            }

            // Add subtle shadow for depth
            if (currentAlpha > 0.5) {
                ctx.shadowColor = 'rgba(0, 0, 0, 0.15)';
                ctx.shadowBlur = 3;
                ctx.shadowOffsetX = 0.5;
                ctx.shadowOffsetY = 0.5;
            }
            
            ctx.beginPath();
            ctx.arc(d.x, d.y, currentRadius, 0, Math.PI * 2);
            ctx.fillStyle = colorScale(d.partyName);
            ctx.globalAlpha = currentAlpha;
            ctx.fill();

            // Reset shadow
            ctx.shadowColor = 'transparent';
            ctx.shadowBlur = 0;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;

            if (strokeColor) {
                ctx.strokeStyle = strokeColor;
                ctx.lineWidth = 1.5;
                ctx.globalAlpha = 1;
                ctx.stroke();
            }
        }
        ctx.restore();
    }

    // redraw each tick but throttle via requestAnimationFrame (only if simulation is running)
    let scheduled = false;
    function constrainNodesToBands() {
        const pad = 0.1;
        const nodesToConstrain = simulation.nodes();
         for (let i = 0; i < nodesToConstrain.length; i++) {
            const d = nodesToConstrain[i];
            const bandStartY = yScale(d.questionId);
            const bandEndY = bandStartY + yScale.bandwidth();
            const minY = bandStartY + radius + pad;
            const maxY = bandEndY - radius - pad;
            if (d.y < minY) d.y = minY;
            if (d.y > maxY) d.y = maxY;
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
        if (!usePrecalculated) {
            constrainNodesToBands();
            if (!scheduled) {
                scheduled = true;
                requestAnimationFrame(() => {
                    draw();
                    scheduled = false;
                });
            }
        }
    });

    // ensure final draw after simulation ends (only fires if alphaDecay > 0)
    simulation.on('end', () => {
        window.currentVis1Nodes = simulation.nodes().map(d => ({
            id: d.id,
            questionId: d.questionId,
            partyName: d.partyName,
            incCode: d.incCode,
            eduCode: d.eduCode,
            x: d.x, 
            y: d.y,
        }));
        draw();
    });

    // initial draw
    draw();

    // --- Axis Drawing with Improved Styling ---
    const svg = container.append("svg")
        .attr("width", totalWidth)
        .attr("height", totalHeight)
        .append("g")
        .attr("transform", `translate(${dimensions.margin.left}, ${dimensions.margin.top})`);

    // Add chart title
    svg.append("text")
        .attr("x", chartWidth / 2)
        .attr("y", -30)
        .attr("class", "chart-title")
        .style("font-family", "'Playfair Display', serif")
        .style("font-size", "24px")
        .style("font-weight", "700")
        .style("fill", "#1f2937")
        .style("text-anchor", "middle")
        .style("letter-spacing", "0.5px")
        .text(chartTitle);

    const xAxisGroup = svg.append("g")
        .attr("class", "x-axis")
        .attr("transform", `translate(0, ${chartHeight})`)
        .call(d3.axisTop(xScale).tickSize(chartHeight))
        .selectAll(".tick line")
        .attr("stroke", "#e5e7eb")
        .attr("stroke-dasharray", "3,3");

    // Style x-axis text
    svg.select(".x-axis").selectAll("text")
        .style("font-family", "'Inter', sans-serif")
        .style("font-size", "14px")
        .style("font-weight", "600")
        .style("fill", "#1f2937")
        .attr("dy", "0.5em");

    const yAxis = svg.append("g")
        .attr("class", "y-axis")
        .call(d3.axisLeft(yScale)
            .tickSize(-chartWidth) 
            .tickFormat(() => "")); // Remove default text labels

    // Add wrapped text labels manually
    yAxis.selectAll(".tick").each(function(d) {
        const tick = d3.select(this);
        const q = questionColumns.find(qc => qc.id === d);
        if (!q) return;
        
        // Remove the default text element
        tick.select("text").remove();
        
        // Word wrapping logic
        const words = q.label.split(/\s+/);
        const maxWidth = 230; // Maximum width in pixels
        const lineHeight = 1.2; // ems
        let lines = [];
        let currentLine = [];
        
        // Create a temporary text element to measure
        const tempText = tick.append("text")
            .style("font-family", "'Inter', sans-serif")
            .style("font-size", "11px")
            .style("visibility", "hidden");
        
        words.forEach(word => {
            currentLine.push(word);
            tempText.text(currentLine.join(" "));
            
            if (tempText.node().getComputedTextLength() > maxWidth && currentLine.length > 1) {
                currentLine.pop();
                lines.push(currentLine.join(" "));
                currentLine = [word];
            }
        });
        lines.push(currentLine.join(" "));
        tempText.remove();
        
        // Create the actual text element with multiple tspans
        const text = tick.append("text")
            .attr("x", -10)
            .style("font-family", "'Inter', sans-serif")
            .style("font-size", "11px")
            .style("font-weight", "500")
            .style("fill", "#374151")
            .style("text-anchor", "end");
        
        lines.forEach((line, i) => {
            text.append("tspan")
                .attr("x", -10)
                .attr("dy", i === 0 ? "0.35em" : lineHeight + "em")
                .text(line);
        });
    });
    
    svg.select(".y-axis").selectAll("line")
        .attr("stroke", "#e5e7eb")
        .attr("stroke-dasharray", "3,3");
    
    svg.selectAll(".domain").attr("stroke", "none");
}