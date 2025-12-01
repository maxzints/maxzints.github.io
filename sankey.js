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

  // --- Centralized Utilities Reference (Removed local fallbacks) ---
  function mapParty(code) { switch (+code) { case 1: return 'Republican'; case 2: return 'Democrat'; case 3: return 'Independent'; default: return 'Other'; } }
  // Rely on window.mapInc and window.mapEdu defined in index.html
  const mapInc = typeof window.mapInc === 'function' ? window.mapInc : function() { return 'Unknown'; };
  const mapEdu = typeof window.mapEdu === 'function' ? window.mapEdu : function() { return 'Unknown'; };
  // --- END Utilities Reference ---


  if (typeof d3.sankey !== 'function' || typeof d3.sankeyLinkHorizontal !== 'function') {
      const msg = 'd3-sankey is not available. Make sure the d3-sankey script is included before sankey.js';
      console.error(msg);
      d3.select('#sankey-error').text(msg);
      return;
    }
  
  const allIncomesFallback = ['<$30k', '$30k - $50k', '$50k - $100k', '$100k - $150k', '$>150k', 'Unknown'];
  // Define local fallback for allIncomes (should be defined in index.html) 
  const allIncomesGlobal = typeof window !== 'undefined' && window.allIncomes ? window.allIncomes : allIncomesFallback;


  // --- Helper Function to Build and Layout Sankey Graph (Uses ALL relevant data for structure) ---
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
      // Use helper functions to map codes to names
      const p = mapParty(d['PARTY']);
      const inc = mapInc(d['INC_SDT1']);
      
      // Skip if mapping failed (e.g., if code is invalid)
      if (!p || !inc) return; 
      
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
  
    // 1. **REWORKED:** Use ALL RAW DATA for the base calculation
    const allRawData = data;

    // 2. Get the full graph based on ALL data for structure and size
    const { graph, colorScale, INCOME_COLOR } = buildSankeyGraph(allRawData);

    if (!graph) return;
    
    // 3. Define the filter checker function
    const isNodeActive = (d) => {
        const partyDomains = ["Democrat", "Republican", "Independent", "Other"];
        const activeParties = typeof window !== 'undefined' && window.activeParties ? window.activeParties : new Set(partyDomains);
        const activeIncomes = typeof window !== 'undefined' && window.activeIncomes ? window.activeIncomes : new Set(allIncomesGlobal);
        // NOTE: The Sankey doesn't visualize Education, so we only check Party and Income.

        // A node is active if its name (Party or Income) is in the active filter set.
        if (d.type === 'Party') {
            return activeParties.has(d.name);
        } else if (d.type === 'Income') {
            return activeIncomes.has(d.name);
        }
        return false; // Should not happen for a top-level node
    };
    
    // 4. Define the link filter checker function
    const isLinkActive = (d) => {
        // A link is active only if BOTH its source (Party) and target (Income) nodes are active.
        return isNodeActive(d.source) && isNodeActive(d.target);
    };

    // 5. Determine Opacity (Base Opacity logic remains the same for highlighting)
    const isHighlighting = typeof window !== 'undefined' && window.highlightedID !== null;
    const GHOST_OPACITY = 0.1; 
    const ACTIVE_OPACITY = 1.0; 
    const HIGHLIGHT_GHOST_OPACITY = 0.2; // Opacity when a single respondent is highlighted

    // Helper to get color based on node type
    const getNodeColor = (d) => d.type === 'Income' ? INCOME_COLOR : colorScale(d.name);

    // 6. Draw Links (Base Layer) - Apply Ghosting
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
      .style('opacity', d => {
        if (isHighlighting) {
            return HIGHLIGHT_GHOST_OPACITY; // If highlighted, base links are always dimmed
        }
        return isLinkActive(d) ? ACTIVE_OPACITY : GHOST_OPACITY; // Apply filter ghosting
      })
      .append('title')
      .text(d => {
        const s = d.source && d.source.name ? d.source.name : (typeof d.source === 'number' ? (graph.nodes[d.source] && graph.nodes[d.source].name) : '');
        const t = d.target && d.target.name ? d.target.name : (typeof d.target === 'number' ? (graph.nodes[d.target] && graph.nodes[d.target].name) : '');
        return `${s} → ${t}: ${d.value}`;
      });

    // 7. Draw Nodes (Base Layer) - Apply Ghosting & Click Handler
    const node = svg.append('g')
      .attr('class', 'base-nodes')
      .selectAll('.node')
      .data(graph.nodes)
      .enter().append('g')
      .attr('class', 'node')
      .attr('transform', d => `translate(${d.x0},${d.y0})`)
      .style('cursor', d => d.type === 'Income' ? 'pointer' : 'default')
      
      // NEW CLICK HANDLER WITH CORRECTED LOGIC (Relies on mapInc)
      .on('click', function(event, d) {
        // Only allow filtering on Income nodes (nodes on the right side)
        if (d.type !== 'Income' || typeof window.updateAllCharts !== 'function' || !window.activeIncomes) return;
        
        const clickedIncome = d.name;
        // Use the list structure to easily check if ALL were selected
        const allIncomesSelected = window.activeIncomes.size === allIncomesGlobal.length;

        // --- Corrected Single-Select/Toggle Logic ---
        if (allIncomesSelected) {
            // Case 1: Currently showing ALL, click to single-select.
            window.activeIncomes = new Set([clickedIncome]);
        } else if (window.activeIncomes.has(clickedIncome) && window.activeIncomes.size === 1) {
            // Case 2: Currently single-selected (this item), click to revert to ALL.
            window.activeIncomes = new Set(allIncomesGlobal);
        } else {
            // Case 3: A different item is single-selected, or multiple items are selected. Click to single-select this one.
            window.activeIncomes = new Set([clickedIncome]);
        }
        
        // Un-highlight any specific respondent
        window.highlightedID = null;

        window.updateAllCharts();
      });


    node.append('rect')
      .attr('height', d => Math.max(1, d.y1 - d.y0))
      .attr('width', d => d.x1 - d.x0)
      .attr('fill', getNodeColor)
      .attr('stroke', '#000')
      .style('opacity', d => {
        if (isHighlighting) {
             return HIGHLIGHT_GHOST_OPACITY; // If highlighted, base nodes are always dimmed
        }
        return isNodeActive(d) ? ACTIVE_OPACITY : GHOST_OPACITY; // Apply filter ghosting
      }) 
      .append('title')
      .text(d => `${d.name}: ${d.value || d.value === 0 ? d.value : ''}`);

    node.append('text')
      .attr('x', d => d.x0 < width / 2 ? d.x1 - d.x0 + 6 : -6)
      .attr('y', d => (d.y1 - d.y0) / 2)
      .attr('dy', '0.35em')
      .attr('text-anchor', d => d.x0 < width / 2 ? 'start' : 'end')
      .text(d => d.name)
      .style('font-size', '12px')
      .style('opacity', 1.0); // Text should always be legible (no ghosting)
      
    // --- 8. Highlighted Overlay ---
    if (isHighlighting) {
        const highlightedID = window.highlightedID;
        
        if (!highlightedID) {
            console.log('Sankey: Highlighted ID is null/undefined, skipping overlay.');
            return;
        }

        // Filter raw data using 'P_SUID' (must use the full loaded dataset)
        const highlightedData = allRawData.filter(d => {
            const dataID = String(d.P_SUID).trim();
            const stateID = String(highlightedID).trim();
            return dataID === stateID; 
        }); 

        // Rerun aggregation and layout only for the highlighted respondent
        const { graph: highlightedGraph, colorScale: hColorScale, INCOME_COLOR: hINCOME_COLOR } = buildSankeyGraph(highlightedData, true);

        if (!highlightedGraph) return;

        // Draw Highlighted Links (Overlay)
        svg.append('g')
          .attr('fill', 'none')
          .attr('class', 'highlight-links')
          .selectAll('path')
          .data(highlightedGraph.links)
          .enter().append('path')
          .attr('d', d3.sankeyLinkHorizontal())
          .attr('stroke', d => {
            const sname = d.source && d.source.name ? d.source.name : (typeof d.source === 'number' ? (highlightedGraph.nodes[d.source] && graph.nodes[d.source].name) : '');
            return colorScale(sname);
          })
          .attr('stroke-width', 5) 
          .attr('class', 'highlight-link')
          .style('opacity', 1.0) 
          .attr('stroke-linejoin', 'round')
          .attr('stroke-linecap', 'round');
          
         // Draw Highlighted Nodes (Overlay)
        const hNode = svg.append('g')
          .attr('class', 'highlight-nodes')
          .selectAll('.node-h')
          .data(highlightedGraph.nodes)
          .enter().append('g')
          .attr('class', 'node-h')
          // Use coordinates from the highlighted graph layout
          .attr('transform', d => `translate(${d.x0},${d.y0})`);

        hNode.append('rect')
          .attr('height', d => Math.max(1, d.y1 - d.y0))
          .attr('width', d => d.x1 - d.x0)
          .attr('fill', d => d.type === 'Income' ? hINCOME_COLOR : hColorScale(d.name))
          .attr('stroke', '#000')
          .attr('stroke-width', 2)
          .style('opacity', 1.0);
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