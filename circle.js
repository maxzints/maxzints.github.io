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
  // NOTE: Assuming #tooltip exists in index.html for D3 events
  const tooltip = d3.select('#tooltip');

  function mapParty(code) { switch (+code) { case 1: return 'Republican'; case 2: return 'Democrat'; case 3: return 'Independent'; default: return 'Other'; } }
  function mapEdu(code) { switch (+code) { case 1: return 'High School <'; case 2: return 'Associates <'; case 3: return 'Bachelor'; case 4: return 'Masters +'; default: return 'Unknown'; } }
    
  // --- FIX: Use global data if available, otherwise load from file ---
  const loadData = () => {
      if (typeof window !== 'undefined' && window.rlsData) {
          return Promise.resolve(window.rlsData); // Use already loaded data immediately
      }
      return d3.csv('ScrubbedRLSDataFile.csv'); // Fallback to async load
  };
    
  loadData().then(data => {
  // --- END FIX ---
    
    // 1. Apply Party Filter (Existing logic from previous step)
    const partyDomains = ["Democrat", "Republican", "Independent", "Other"];
    const activeParties = typeof window !== 'undefined' && window.activeParties ? window.activeParties : new Set(partyDomains);
    const filteredData = data.filter(d => activeParties.has(mapParty(d.PARTY)));

    // build nested counts: party -> edu -> count
    const nested = d3.rollups(filteredData, v => v.length, d => mapParty(d.PARTY), d => mapEdu(d.EDUCREC));

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
    const partyDomains_ = ["Democrat", "Republican", "Independent", "Other"]; 

    const color = d3.scaleOrdinal()
      .domain(partyDomains_) 
      .range(partyColors);

    // 2. Determine Opacity
    const isHighlighting = typeof window !== 'undefined' && window.highlightedID !== null;
    const baseOpacity = isHighlighting ? 0.2 : 1.0;

    // Draw Slices (Base Layer)
    const slices = svg.selectAll('path')
      .data(rootNode.descendants().filter(d => d.depth))
      .enter().append('path')
      .attr('d', arc)
      .attr('fill', d => color(d.ancestors().slice(-2)[0].data.name))
      .attr('stroke', '#fff')
      .style('opacity', baseOpacity) // Apply base opacity
      .on('mousemove', (event, d) => {
        // NOTE: This assumes #tooltip exists in index.html
        tooltip.style('display', 'block')
          .style('left', (event.pageX + 10) + 'px')
          .style('top', (event.pageY + 10) + 'px')
          .text(`${d.data.name}${d.value ? ': ' + d.value : ''}`);
      })
      .on('mouseleave', () => tooltip.style('display', 'none'));

    // --- 3. Highlighted Overlay (New Logic) ---
    if (isHighlighting) {
     const highlightedID = window.highlightedID;

    // Replace the existing filter line with this:
    const highlightedRespondentData = data.filter(d => {
        // Coerce both sides to String for reliable comparison
        const dataID = String(d.P_SUID).trim();
        const stateID = String(highlightedID).trim();
        return dataID === stateID && activeParties.has(mapParty(d.PARTY));
    }); 
    
    // Add a debug check here as well
    console.log(`Circle: Filtered to highlight ${highlightedRespondentData.length} respondent(s) for ID ${highlightedID}`);  if (highlightedRespondentData.length > 0) {
            // Get the specific party and education of the respondent
            const resp = highlightedRespondentData[0];
            const highlightedParty = mapParty(resp.PARTY);
            const highlightedEdu = mapEdu(resp.EDUCREC);
            
            // Find the corresponding slice data objects (Party slice and Education slice)
            const highlightNodes = rootNode.descendants().filter(d => {
                if (d.depth === 1 && d.data.name === highlightedParty) return true; // Party slice
                if (d.depth === 2 && d.data.name === highlightedEdu && d.parent && d.parent.data.name === highlightedParty) return true; // Education slice
                return false;
            });

            // Draw Highlighted Slices (Overlay)
            svg.selectAll('.highlight-slice')
                .data(highlightNodes)
                .enter().append('path')
                .attr('d', arc)
                .attr('fill', d => color(d.ancestors().slice(-2)[0].data.name))
                .attr('stroke', '#000') // Black stroke for visibility
                .attr('stroke-width', 2)
                .attr('class', 'highlight-slice')
                .style('opacity', 1.0)
                // Add titles back for tooltips
                .append('title')
                .text(d => `${d.data.name}${d.value ? ': ' + d.value : ''}`);
        }
    }
    // ------------------------------------------

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
