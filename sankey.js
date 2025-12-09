// sankey.js — Sankey: Party -> Income (D3)

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

  // Add title to container
  container.append('div')
    .attr('class', 'chart-title')
    .style('font-family', "'Playfair Display', serif")
    .style('font-size', '18px')
    .style('font-weight', '700')
    .style('color', '#1f2937')
    .style('text-align', 'center')
    .style('margin-bottom', '10px')
    .style('letter-spacing', '0.3px')
    .text('Party Affiliation → Income Distribution');
  
  const svg = container.append('svg').attr('width', width).attr('height', height);

  // Centralized Utilities Reference 
  function mapParty(code) { switch (+code) { case 1: return 'Republican'; case 2: return 'Democrat'; case 3: return 'Independent'; default: return 'Other'; } }
  // Rely on window.mapInc and window.mapEdu defined in index.html
  const mapInc = typeof window.mapInc === 'function' ? window.mapInc : function() { return 'Unknown'; };
  const allIncomesFallback = ['<$50k', '$50k - $100k', '$100k - $150k', '$>150k', ''];
  const allIncomesGlobal = typeof window !== 'undefined' && window.allIncomes ? window.allIncomes : allIncomesFallback;
  
  if (typeof d3.sankey !== 'function' || typeof d3.sankeyLinkHorizontal !== 'function') {
      const msg = 'd3-sankey is not available. Make sure the d3-sankey script is included before sankey.js';
      console.error(msg);
      d3.select('#sankey-error').text(msg);
      return;
    }
  
  // Define Income Order
  const INCOME_ORDER = ['<$50k', '$50k - $100k', '$100k - $150k', '$>150k', ''];
  const INCOME_ORDER_MAP = new Map(INCOME_ORDER.map((name, i) => [name, i]));

  function buildSankeyGraph(data) {
    const nodes = [];
    const nodeIndex = new Map();
    function ensureNode(key, displayName) {
      if (!nodeIndex.has(key)) {
        nodeIndex.set(key, nodes.length);
        const type = key.startsWith('P:') ? 'Party' : 'Income'; 
        nodes.push({ name: displayName, type: type });
      }
      return nodeIndex.get(key);
    }
    
    const partyInc = new Map();
    data.forEach(d => {
      const p = mapParty(d['PARTY']);
      const inc = mapInc(d['INC_SDT1']);
      
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

    const graph = { nodes: nodes.map(d => Object.assign({}, d)), links: links.map(d => Object.assign({}, d)) };
    
    const sankeyGen = d3.sankey()
      .nodeWidth(18)
      .nodePadding(10)
      .extent([[1, 1], [width - 1, height - 6]])
      .nodeSort((a, b) => {
          if (a.type === 'Income' && b.type === 'Income') {
              const aIndex = INCOME_ORDER_MAP.get(a.name) !== undefined ? INCOME_ORDER_MAP.get(a.name) : Infinity;
              const bIndex = INCOME_ORDER_MAP.get(b.name) !== undefined ? INCOME_ORDER_MAP.get(b.name) : Infinity;
              return aIndex - bIndex;
          }
          return null; 
      });

    try {
      sankeyGen(graph);
    } catch (err) {
      console.error('sankey: sankeyGen failed', err);
      d3.select('#sankey-error').text('Failed to layout sankey: ' + err.message);
      return { graph: null, color: null };
    } 

    const partyColors = ["#76b7b2ff", "#e15759", "#f28e2c", "#59a14f"];
    const partyDomains = ["Democrat", "Republican", "Independent", "Other"];  
    const INCOME_COLOR = "#9467bd"; 

    const colorScale = d3.scaleOrdinal()
      .domain(partyDomains) 
      .range(partyColors);
      
    return { graph, colorScale, INCOME_COLOR };
  } 
    
  const loadData = () => {
      if (typeof window !== 'undefined' && window.rlsData) {
          return Promise.resolve(window.rlsData); 
      }
      return d3.csv('RLS_Final.csv'); 
  };
    
  loadData().then(data => {
    // 1. Use ALL RAW DATA for the base calculation
    const allRawData = data;

    // 2. Get the full graph based on ALL data
    const { graph, colorScale, INCOME_COLOR } = buildSankeyGraph(allRawData);

    if (!graph) return;
    
    // 3. Define the filter checker function
    const isNodeActive = (d) => {
        const partyDomains = ["Democrat", "Republican", "Independent", "Other"];
        const activeParties = typeof window !== 'undefined' && window.activeParties ? window.activeParties : new Set(partyDomains);
        const activeIncomes = typeof window !== 'undefined' && window.activeIncomes ? window.activeIncomes : new Set(allIncomesGlobal);

        if (d.type === 'Party') {
            return activeParties.has(d.name);
        } else if (d.type === 'Income') {
            return activeIncomes.has(d.name);
        }
        return false;
    };
    
    const isLinkActive = (d) => {
        return isNodeActive(d.source) && isNodeActive(d.target);
    };

    //  Identify Highlighted Path if ID exists 
    let highlightedPath = null;
    const highlightedID = (typeof window !== 'undefined') ? window.highlightedID : null;

    if (highlightedID) {
        // Find the specific respondent in the raw data
        const respondent = allRawData.find(d => String(d.P_SUID).trim() === String(highlightedID).trim());
        if (respondent) {
            highlightedPath = {
                party: mapParty(respondent['PARTY']),
                income: mapInc(respondent['INC_SDT1'])
            };
        }
    }

    // 5. Determine Opacity Constants
    const GHOST_OPACITY = 0.3;     // Non-active filter items
    const ACTIVE_OPACITY = 1.0;    // Active items
    const DIMMED_OPACITY = 0.1;    // Items dimmed because something else is highlighted

    // Helper to get color based on node type
    const getNodeColor = (d) => d.type === 'Income' ? INCOME_COLOR : colorScale(d.name);

    // 6. Draw Links
    svg.append('g')
      .attr('fill', 'none')
      .attr('class', 'base-links')
      .selectAll('path')
      .data(graph.links)
      .enter().append('path')
      .attr('d', d3.sankeyLinkHorizontal())
      .attr('stroke', d => {
        const sname = d.source && d.source.name ? d.source.name : '';
        return colorScale(sname);
      })
      .attr('stroke-width', d => Math.max(1, d.width))
      .attr('class', 'link')
      .style('opacity', d => {
        // Highlighting a specific respondent
        if (highlightedPath) {
            const isRelevantLink = (d.source.name === highlightedPath.party && d.target.name === highlightedPath.income);
            return isRelevantLink ? ACTIVE_OPACITY : DIMMED_OPACITY;
        }
        
        // Regular Filtering
        return isLinkActive(d) ? ACTIVE_OPACITY : GHOST_OPACITY;
      })
      .style('transition', 'opacity 0.3s ease')
      .on('mouseover', function() {
        // Only hover effect if NOT in highlight mode
        if (!highlightedID) {
             d3.select(this).style('opacity', Math.min(1.0, parseFloat(d3.select(this).style('opacity')) + 0.2));
        }
      })
      .on('mouseout', function(event, d) {
        if (highlightedPath) {
             // Reset to highlight logic
             const isRelevantLink = (d.source.name === highlightedPath.party && d.target.name === highlightedPath.income);
             d3.select(this).style('opacity', isRelevantLink ? ACTIVE_OPACITY : DIMMED_OPACITY);
        } else {
             // Reset to filter logic
             d3.select(this).style('opacity', isLinkActive(d) ? ACTIVE_OPACITY : GHOST_OPACITY);
        }
      })
      .append('title')
      .text(d => `${d.source.name} → ${d.target.name}: ${d.value}`);

    // 7. Draw Nodes
    const node = svg.append('g')
      .attr('class', 'base-nodes')
      .selectAll('.node')
      .data(graph.nodes)
      .enter().append('g')
      .attr('class', 'node')
      .attr('transform', d => `translate(${d.x0},${d.y0})`)
      .style('cursor', d => d.type === 'Income' ? 'pointer' : 'default')
      
      .on('click', function(event, d) {
        if (d.type !== 'Income' || typeof window.updateAllCharts !== 'function' || !window.activeIncomes) return;
        
        const clickedIncome = d.name;
        const allIncomesSelected = window.activeIncomes.size === allIncomesGlobal.length;

        if (allIncomesSelected) {
            window.activeIncomes = new Set([clickedIncome]);
        } else if (window.activeIncomes.has(clickedIncome) && window.activeIncomes.size === 1) {
            window.activeIncomes = new Set(allIncomesGlobal);
        } else {
            window.activeIncomes = new Set([clickedIncome]);
        }
        
        window.highlightedID = null; // Clear individual highlight on filter change
        window.updateAllCharts();
      });

    node.append('rect')
      .attr('height', d => Math.max(1, d.y1 - d.y0))
      .attr('width', d => d.x1 - d.x0)
      .attr('fill', getNodeColor)
      .attr('stroke', '#374151')
      .attr('stroke-width', 1)
      .attr('rx', 2)
      .attr('ry', 2)
      .style('opacity', d => {
        // PRIORITY 1: Highlighting a specific respondent
        if (highlightedPath) {
            const isRelevantNode = (d.name === highlightedPath.party || d.name === highlightedPath.income);
            return isRelevantNode ? ACTIVE_OPACITY : DIMMED_OPACITY;
        }

        // PRIORITY 2: Regular Filtering
        return isNodeActive(d) ? ACTIVE_OPACITY : GHOST_OPACITY;
      })
      .style('transition', 'all 0.3s ease')
      .on('mouseover', function(event, d) {
        if (d.type === 'Income') {
          d3.select(this)
            .attr('stroke-width', 2)
            .attr('stroke', '#1f2937')
            .style('filter', 'brightness(1.1)');
        }
      })
      .on('mouseout', function() {
        d3.select(this)
          .attr('stroke-width', 1)
          .attr('stroke', '#374151')
          .style('filter', 'none');
      })
      .append('title')
      .text(d => `${d.name}: ${d.value || d.value === 0 ? d.value : ''}`);

    node.append('text')
      .attr('x', d => d.x0 < width / 2 ? d.x1 - d.x0 + 6 : -6)
      .attr('y', d => (d.y1 - d.y0) / 2)
      .attr('dy', '0.35em')
      .attr('text-anchor', d => d.x0 < width / 2 ? 'start' : 'end')
      .text(d => d.name)
      .style('font-family', "'Inter', sans-serif")
      .style('font-size', '13px')
      .style('font-weight', '600')
      .style('fill', '#374151')
      .style('opacity', 1.0); // Text always legible

  }).catch(err => {
    console.error('sankey: failed to load CSV', err);
    d3.select('#sankey-error').text('Failed to load data. Check console.');
  });
}

// Auto-run if loaded directly
if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => renderSankey('#chart-sankey'));
  } else {
    renderSankey('#chart-sankey');
  }
}