// circle.js — Sunburst visualization for PARTY -> EDUCREC
// Exposes renderCircle(containerSelector)

function renderCircle(containerSelector = '#chart-circle') {
  const container = d3.select(containerSelector);
  if (container.empty()) {
    console.warn('renderCircle: container not found:', containerSelector);
    return;
  }
  container.html('');
  const rect = container.node().getBoundingClientRect();
  // The sunburst is centered in a square space. Use the smaller dimension (height)
  // of the bottom-half container to define the size to ensure it fits without scrolling.
  const size = Math.min(rect.width * 0.95, rect.height * 0.95); 
  const width = size;
  const radius = size / 2;

  const svg = container.append('svg')
    .attr('width', width)
    .attr('height', width) // Keep it square
    .append('g')
    .attr('transform', `translate(${width/2},${width/2})`); 
  const tooltip = d3.select('#tooltip');

  function mapParty(code) { switch (+code) { case 1: return 'Republican'; case 2: return 'Democrat'; case 3: return 'Independent'; default: return 'Other'; } }
  function mapEdu(code) { switch (+code) { case 1: return 'High School <'; case 2: return 'Associates <'; case 3: return 'Bachelor'; case 4: return 'Masters +'; default: return 'Unknown'; } }

  d3.csv('ScrubbedRLSDataFile.csv').then(data => {
    // build nested counts: party -> edu -> count
    const nested = d3.rollups(data, v => v.length, d => mapParty(d.PARTY), d => mapEdu(d.EDUCREC));

    // convert to hierarchy format
    const root = { name: 'root', children: nested.map(([party, eduArr]) => ({
      name: party,
      children: Array.from(eduArr, ([edu, count]) => ({ name: edu, value: count }))
    })) };

    const partition = d3.partition()
      .size([2 * Math.PI, radius]);

    const rootNode = d3.hierarchy(root)
      .sum(d => d.value)
      .sort((a, b) => b.value - a.value);

    partition(rootNode);

    const arc = d3.arc()
      .startAngle(d => d.x0)
      .endAngle(d => d.x1)
      .innerRadius(d => d.y0)
      .outerRadius(d => d.y1 - 1);

    const partyColors = ["#76b7b2ff", "#e15759", "#f28e2c", "#59a14f"];
    const partyDomains = ["Democrat", "Republican", "Independent", "Other"]; // <-- ADD THIS LINE

    const color = d3.scaleOrdinal()
      .domain(partyDomains) 
      .range(partyColors);

    const slices = svg.selectAll('path')
      .data(rootNode.descendants().filter(d => d.depth))
      .enter().append('path')
      .attr('d', arc)
      .attr('fill', d => color(d.ancestors().slice(-2)[0].data.name))
      .attr('stroke', '#fff')
      .on('mousemove', (event, d) => {
        tooltip.style('display', 'block')
          .style('left', (event.pageX + 10) + 'px')
          .style('top', (event.pageY + 10) + 'px')
          .text(`${d.data.name}${d.value ? ': ' + d.value : ''}`);
      })
      .on('mouseleave', () => tooltip.style('display', 'none'));

    // center label
    svg.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '-0.4em')
      .style('font-weight', 'bold')
      .text('Education by Party');

    svg.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '1.0em')
      .style('font-size', '12px')
      .text('Hover slices for counts');

  }).catch(err => {
    console.error('circle: failed to load CSV', err);
    container.append('div').style('color','crimson').text('Failed to load data. Check console.');
  });
}

// Auto-run when included directly
if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => renderCircle('#chart-circle'));
  } else {
    renderCircle('#chart-circle');
  }
}
