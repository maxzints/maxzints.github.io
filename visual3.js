// visual3.js — Sunburst: Education by Party
(function(){
  function mapParty(code) { switch (+code) { case 1: return 'Republican'; case 2: return 'Democrat'; case 3: return 'Independent'; default: return 'Else'; } }
  function mapEdu(code) { switch (+code) { case 1: return 'High School <'; case 2: return 'Associates <'; case 3: return 'Bachelor'; case 4: return 'Masters +'; default: return 'Unknown'; } }

  const width = 700;
  const radius = Math.min(width, 700) / 2;

  const svg = d3.select('#chart')
    .append('svg')
    .attr('width', width)
    .attr('height', width)
    .append('g')
    .attr('transform', `translate(${width/2}, ${width/2})`);

  const partition = d3.partition()
    .size([2 * Math.PI, radius]);

  const arc = d3.arc()
    .startAngle(d => d.x0)
    .endAngle(d => d.x1)
    .innerRadius(d => d.y0)
    .outerRadius(d => d.y1 - 1);

  const color = d3.scaleOrdinal(d3.schemeCategory10);
  const tooltip = d3.select('#tooltip');

  d3.csv('ScrubbedRLSDataFile.csv').then(data => {
    const counts = {};
    data.forEach(d => {
      const p = mapParty(d['PARTY']);
      const e = mapEdu(d['EDUCREC']);
      if (!counts[p]) counts[p] = {};
      counts[p][e] = (counts[p][e] || 0) + 1;
    });

    const root = { name: 'root', children: [] };
    Object.keys(counts).forEach(p => {
      const child = { name: p, children: [] };
      Object.keys(counts[p]).forEach(e => {
        child.children.push({ name: e, value: counts[p][e] });
      });
      root.children.push(child);
    });

    const rootNode = d3.hierarchy(root).sum(d => d.value);
    partition(rootNode);

    svg.selectAll('path')
      .data(rootNode.descendants().filter(d => d.depth))
      .enter().append('path')
      .attr('d', arc)
      .attr('fill', d => color((d.children ? d : d.parent).data.name))
      .attr('stroke', '#fff')
      .on('mousemove', (event, d) => {
        tooltip.style('display', 'block')
          .style('left', (event.pageX + 8) + 'px')
          .style('top', (event.pageY + 8) + 'px')
          .html(`<strong>${d.data.name}</strong><br/>${d.value ? d.value : ''}`);
      })
      .on('mouseout', () => tooltip.style('display', 'none'));

    svg.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '-0.5em')
      .style('font-weight', 'bold')
      .text('Education');

    svg.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '1em')
      .style('font-size', '12px')
      .text('by Party');
  });
})();
