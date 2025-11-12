// visual2.js — Sankey: Party -> Race -> Income
(function(){
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

  const width = 1000, height = 700;
  const svg = d3.select('#chart').append('svg').attr('width', width).attr('height', height);

  d3.csv('ScrubbedRLSDataFile.csv').then(data => {
    const partyRace = new Map();
    const raceInc = new Map();

    data.forEach(d => {
      const p = mapParty(d['PARTY']);
      const r = mapRace(d['RACECMB']);
      const inc = mapInc(d['INC_SDT1']);

      const prKey = p + '||' + r;
      partyRace.set(prKey, (partyRace.get(prKey) || 0) + 1);

      const riKey = r + '||' + inc;
      raceInc.set(riKey, (raceInc.get(riKey) || 0) + 1);
    });

    const nodes = [];
    const nodeIndex = new Map();
    function ensureNode(name) {
      if (!nodeIndex.has(name)) {
        nodeIndex.set(name, nodes.length);
        nodes.push({ name });
      }
      return nodeIndex.get(name);
    }

    const links = [];
    for (let [k, v] of partyRace.entries()) {
      const [p, r] = k.split('||');
      links.push({ source: ensureNode(p), target: ensureNode(r), value: v });
    }
    for (let [k, v] of raceInc.entries()) {
      const [r, inc] = k.split('||');
      links.push({ source: ensureNode(r), target: ensureNode(inc), value: v });
    }

    const sankeyGen = d3.sankey()
      .nodeWidth(18)
      .nodePadding(10)
      .extent([[1, 1], [width - 1, height - 6]]);

    const graph = { nodes: nodes.map(d => Object.assign({}, d)), links: links.map(d => Object.assign({}, d)) };
    sankeyGen(graph);

    const color = d3.scaleOrdinal(d3.schemeCategory10);

    svg.append('g')
      .attr('fill', 'none')
      .selectAll('path')
      .data(graph.links)
      .enter().append('path')
      .attr('d', d3.sankeyLinkHorizontal())
      .attr('stroke', d => color(d.source.name))
      .attr('stroke-width', d => Math.max(1, d.width))
      .attr('class', 'link');

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
      .attr('stroke', '#000');

    node.append('text')
      .attr('x', d => d.x0 < width / 2 ? d.x1 - d.x0 + 6 : -6)
      .attr('y', d => (d.y1 - d.y0) / 2)
      .attr('dy', '0.35em')
      .attr('text-anchor', d => d.x0 < width / 2 ? 'start' : 'end')
      .text(d => d.name)
      .style('font-size', '12px');
  });
})();
