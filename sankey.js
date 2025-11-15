// sankey.js — Sankey: Party -> Race -> Income (D3)
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

  d3.csv('ScrubbedRLSDataFile.csv').then(data => {
    console.log('sankey: loaded CSV rows =', data.length);
    if (typeof d3.sankey !== 'function' || typeof d3.sankeyLinkHorizontal !== 'function') {
      const msg = 'd3-sankey is not available. Make sure the d3-sankey script is included before sankey.js';
      console.error(msg);
      d3.select('#sankey-error').text(msg);
      return;
    }
    // Aggregate directly from Party -> Income (drop Race stage)
    const partyInc = new Map();

    data.forEach(d => {
      const p = mapParty(d['PARTY']);
      const inc = mapInc(d['INC_SDT1']);
      const key = p + '||' + inc;
      partyInc.set(key, (partyInc.get(key) || 0) + 1);
    });

    // Use a keyed index to avoid accidental name collisions between categories
    // (e.g. 'Other' might appear for both Party and Race). Internally store
    // nodes with a display name but index them by a category-prefixed key.
    const nodes = [];
    const nodeIndex = new Map();
    function ensureNode(key, displayName) {
      if (!nodeIndex.has(key)) {
        nodeIndex.set(key, nodes.length);
        nodes.push({ name: displayName });
      }
      return nodeIndex.get(key);
    }

    const links = [];
    // Build Party -> Income links (no Race layer)
    for (let [k, v] of partyInc.entries()) {
      const [p, inc] = k.split('||');
      const src = ensureNode('P:' + p, p);
      const tgt = ensureNode('I:' + inc, inc);
      links.push({ source: src, target: tgt, value: v });
    }

    const sankeyGen = d3.sankey()
      .nodeWidth(18)
      .nodePadding(10)
      .extent([[1, 1], [width - 1, height - 6]]);

    const graph = { nodes: nodes.map(d => Object.assign({}, d)), links: links.map(d => Object.assign({}, d)) };
    try {
      sankeyGen(graph);
    } catch (err) {
      console.error('sankey: sankeyGen failed', err);
      d3.select('#sankey-error').text('Failed to layout sankey: ' + err.message);
      return;
    }
    const partyColors = ["#76b7b2ff", "#e15759", "#f28e2c", "#59a14f"];
    const partyDomains = ["Democrat", "Republican", "Independent", "Other"];  

    const color = d3.scaleOrdinal()
      .domain(partyDomains) 
      .range(partyColors); 

    svg.append('g')
      .attr('fill', 'none')
      .selectAll('path')
      .data(graph.links)
      .enter().append('path')
      .attr('d', d3.sankeyLinkHorizontal())
      .attr('stroke', d => {
        const sname = d.source && d.source.name ? d.source.name : (typeof d.source === 'number' ? (graph.nodes[d.source] && graph.nodes[d.source].name) : '');
        return color(sname);
      })
      .attr('stroke-width', d => Math.max(1, d.width))
      .attr('class', 'link')
      .append('title')
      .text(d => {
        const s = d.source && d.source.name ? d.source.name : (typeof d.source === 'number' ? (graph.nodes[d.source] && graph.nodes[d.source].name) : '');
        const t = d.target && d.target.name ? d.target.name : (typeof d.target === 'number' ? (graph.nodes[d.target] && graph.nodes[d.target].name) : '');
        return `${s} → ${t}: ${d.value}`;
      });

    const node = svg.append('g')
      .selectAll('.node')
      .data(graph.nodes)
      .enter().append('g')
      .attr('class', 'node')
      .attr('transform', d => `translate(${d.x0},${d.y0})`);

    node.append('rect')
      .attr('height', d => Math.max(1, d.y1 - d.y0))
      .attr('width', d => d.x1 - d.x0)
      .attr('fill', d => color(d.name))
      .attr('stroke', '#000')
      .append('title')
      .text(d => `${d.name}: ${d.value || d.value === 0 ? d.value : ''}`);

    node.append('text')
      .attr('x', d => d.x0 < width / 2 ? d.x1 - d.x0 + 6 : -6)
      .attr('y', d => (d.y1 - d.y0) / 2)
      .attr('dy', '0.35em')
      .attr('text-anchor', d => d.x0 < width / 2 ? 'start' : 'end')
      .text(d => d.name)
      .style('font-size', '12px');

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
