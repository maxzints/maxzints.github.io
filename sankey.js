// sankey.js — Sankey: Party -> Income (D3)
// Exposes renderSankey(containerSelector) function.

function renderSankey(containerSelector = '#chart-sankey') {
  const container = d3.select(containerSelector);
  if (container.empty()) {
    console.warn('renderSankey: container not found:', containerSelector);
    return;
  }
  container.html('');
  const rect = container.node().getBoundingClientRect();
  // Use 95% of the container width/height for the inner SVG, allowing for margins
  const width = Math.max(500, rect.width * 0.95);
  const height = Math.max(300, rect.height * 0.95);

  
  const svg = container.append('svg').attr('width', width).attr('height', height);

  function mapParty(code) { switch (+code) { case 1: return 'Republican'; case 2: return 'Democrat'; case 3: return 'Independent'; default: return 'Other'; } }
  function mapRace(code) { switch (+code) { case 1: return 'White'; case 2: return 'Black'; case 3: return 'Asian'; case 4: return 'Mixed'; default: return 'Other'; } }
  function mapInc(code) {
    const v = +code;
    if (v === 100) return '$30k - $50k';
    if (v === 200) return '$50k - $100k';
    if (v === 300) return '$100k - $150k';
    if (v === 400) return '$150k+';
    if (v === 1 || v === 2) return '$30k - $50k';
    if (v === 3 || v === 4) return '$50k - $100k';
    if (v === 5 || v === 6) return '$100k - $150k';
    return 'Unknown';
  }

  if (typeof d3.sankey !== 'function' || typeof d3.sankeyLinkHorizontal !== 'function') {
      const msg = 'd3-sankey is not available. Make sure the d3-sankey script is included before sankey.js';
      console.error(msg);
      d3.select('#sankey-error').text(msg);
      return;
    }

  // --- Helper Function to Build and Layout Sankey Graph (Modified) ---
  function buildSankeyGraph(data, isHighlightOverlay = false) {
    const nodes = [];
    const nodeIndex = new Map();
    function ensureNode(key, displayName) {
      if (!nodeIndex.has(key)) {
        nodeIndex.set(key, nodes.length);
        // Add a 'type' property to distinguish Party from Income
        const type = key.startsWith('P:') ? 'Party' : 'Income'; 
        nodes.push({ name: displayName, type: type });
      }
      return nodeIndex.get(key);
    }
    
    const partyInc = new Map();
    data.forEach(d => {
      const p = mapParty(d['PARTY']);
      const inc = mapInc(d['INC_SDT1']);
      const key = p + '||' + inc;
      partyInc.set(key, (partyInc.get(key) || 0) + 1);
    });

    const links = [];
    for (let [k, v] of partyInc.entries()) {
      const [p, inc] = k.split('||');
      const src = ensureNode('P:' + p, p);
      const tgt = ensureNode('I:' + inc, inc);
      links.push({ source: src, target: tgt, value: v });
    }

    const sankeyGen = d3.sankey()
      .nodeWidth(18)
      .nodePadding(10)
      .extent([[1, 1], [width - 1, height - (isHighlightOverlay ? 1 : 6)]]); 

    const graph = { nodes: nodes.map(d => Object.assign({}, d)), links: links.map(d => Object.assign({}, d)) };
    try {
      sankeyGen(graph);
    } catch (err) {
      console.error('sankey: sankeyGen failed', err);
      d3.select('#sankey-error').text('Failed to layout sankey: ' + err.message);
      return { graph: null, color: null };
    }
    
    // Define Colors
    const partyColors = ["#76b7b2ff", "#e15759", "#f28e2c", "#59a14f"];
    const partyDomains = ["Democrat", "Republican", "Independent", "Other"];  
    const INCOME_COLOR = "#9467bd"; // Choose a neutral color (e.g., Purple)

    const colorScale = d3.scaleOrdinal()
      .domain(partyDomains) 
      .range(partyColors);
      
    // Return both the scale and the neutral income color
    return { graph, colorScale, INCOME_COLOR };
  }
  // --- End Helper Function ---
    
  // --- FIX: Use global data if available, otherwise load from file ---
  const loadData = () => {
      if (typeof window !== 'undefined' && window.rlsData) {
          return Promise.resolve(window.rlsData); 
      }
      return d3.csv('ScrubbedRLSDataFile.csv'); 
  };
    
  loadData().then(data => {
  // --- END FIX ---
  
    // 1. Apply Party Filter (Existing logic from previous step)
    const partyDomains = ["Democrat", "Republican", "Independent", "Other"];
    const activeParties = typeof window !== 'undefined' && window.activeParties ? window.activeParties : new Set(partyDomains);
    const fullFilteredData = data.filter(d => activeParties.has(mapParty(d.PARTY)));

    // 2. Determine Opacity
    const isHighlighting = typeof window !== 'undefined' && window.highlightedID !== null;
    const baseOpacity = isHighlighting ? 0.2 : 1.0;

    // 3. Build Full Sankey Graph
    const { graph, colorScale, INCOME_COLOR } = buildSankeyGraph(fullFilteredData);

    if (!graph) return;

    // Helper to get color based on node type
    const getNodeColor = (d) => d.type === 'Income' ? INCOME_COLOR : colorScale(d.name);

    // 4. Draw Links (Base Layer)
    svg.append('g')
      .attr('fill', 'none')
      .attr('class', 'base-links')
      .selectAll('path')
      .data(graph.links)
      .enter().append('path')
      .attr('d', d3.sankeyLinkHorizontal())
      .attr('stroke', d => {
        // Links get the color of their source node (Party)
        const sname = d.source && d.source.name ? d.source.name : (typeof d.source === 'number' ? (graph.nodes[d.source] && graph.nodes[d.source].name) : '');
        return colorScale(sname);
      })
      .attr('stroke-width', d => Math.max(1, d.width))
      .attr('class', 'link')
      .style('opacity', baseOpacity) 
      .append('title')
      .text(d => {
        const s = d.source && d.source.name ? d.source.name : (typeof d.source === 'number' ? (graph.nodes[d.source] && graph.nodes[d.source].name) : '');
        const t = d.target && d.target.name ? d.target.name : (typeof d.target === 'number' ? (graph.nodes[d.target] && graph.nodes[d.target].name) : '');
        return `${s} → ${t}: ${d.value}`;
      });

    // 5. Draw Nodes (Base Layer) - MODIFIED COLOR LOGIC
    const node = svg.append('g')
      .attr('class', 'base-nodes')
      .selectAll('.node')
      .data(graph.nodes)
      .enter().append('g')
      .attr('class', 'node')
      .attr('transform', d => `translate(${d.x0},${d.y0})`);

    node.append('rect')
      .attr('height', d => Math.max(1, d.y1 - d.y0))
      .attr('width', d => d.x1 - d.x0)
      .attr('fill', getNodeColor) // Use helper function to color Income nodes differently
      .attr('stroke', '#000')
      .style('opacity', baseOpacity) 
      .append('title')
      .text(d => `${d.name}: ${d.value || d.value === 0 ? d.value : ''}`);

    node.append('text')
      .attr('x', d => d.x0 < width / 2 ? d.x1 - d.x0 + 6 : -6)
      .attr('y', d => (d.y1 - d.y0) / 2)
      .attr('dy', '0.35em')
      .attr('text-anchor', d => d.x0 < width / 2 ? 'start' : 'end')
      .text(d => d.name)
      .style('font-size', '12px')
      .style('opacity', isHighlighting ? 1.0 : 0.9); 

    // --- 6. Highlighted Overlay (New Logic) ---
    if (isHighlighting) {
        const highlightedID = window.highlightedID;
        
        // Debug check (from previous step)
        if (!highlightedID) {
            console.log('Sankey: Highlighted ID is null/undefined, skipping overlay.');
            return;
        }

        // Filter raw data using 'P_SUID' 
        const highlightedData = fullFilteredData.filter(d => {
            const dataID = String(d.P_SUID).trim();
            const stateID = String(highlightedID).trim();
            return dataID === stateID; 
        }); 

        // Add a debug check here to see if the filter succeeded
        console.log(`Sankey: Filtered to highlight ${highlightedData.length} respondent(s) for ID ${highlightedID}`);


        if (highlightedData.length > 0) {
            // Re-run aggregation and layout only for the highlighted respondent
            const { graph: highlightedGraph, colorScale: hColorScale, INCOME_COLOR: hINCOME_COLOR } = buildSankeyGraph(highlightedData, true);

            if (!highlightedGraph) return;

            const getHighlightNodeColor = (d) => d.type === 'Income' ? hINCOME_COLOR : hColorScale(d.name);
            
            // Draw Highlighted Links (Overlay)
            svg.append('g')
              .attr('fill', 'none')
              .attr('class', 'highlight-links')
              .selectAll('path')
              .data(highlightedGraph.links)
              .enter().append('path')
              .attr('d', d3.sankeyLinkHorizontal())
              .attr('stroke', d => {
                // Links get the color of their source node (Party)
                const sname = d.source && d.source.name ? d.source.name : (typeof d.source === 'number' ? (highlightedGraph.nodes[d.source] && highlightedGraph.nodes[d.source].name) : '');
                return hColorScale(sname);
              })
              // Fixed width for clear visibility
              .attr('stroke-width', 5) 
              .attr('class', 'highlight-link')
              .style('opacity', 1.0) 
              .attr('stroke-linejoin', 'round')
              .attr('stroke-linecap', 'round');
              
             // Draw Highlighted Nodes (Overlay) - MODIFIED COLOR LOGIC
            const hNode = svg.append('g')
              .attr('class', 'highlight-nodes')
              .selectAll('.node-h')
              .data(highlightedGraph.nodes)
              .enter().append('g')
              .attr('class', 'node-h')
              .attr('transform', d => `translate(${d.x0},${d.y0})`);

            hNode.append('rect')
              .attr('height', d => Math.max(1, d.y1 - d.y0))
              .attr('width', d => d.x1 - d.x0)
              .attr('fill', getHighlightNodeColor) // Use helper function to color Income nodes differently
              .attr('stroke', '#000')
              .attr('stroke-width', 2)
              .style('opacity', 1.0);
        }
    }

  }).catch(err => {
    console.error('sankey: failed to load CSV', err);
    d3.select('#sankey-error').text('Failed to load data. Check console.');
  });
}

// If loaded in a page directly, auto-run against #chart
if (typeof window !== 'undefined') {
  // Wait for DOM content to ensure #chart exists when included directly
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => renderSankey('#chart-sankey'));
  } else {
    renderSankey('#chart-sankey');
  }
}