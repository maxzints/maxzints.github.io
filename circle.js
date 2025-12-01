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
    .attr('transform', `translate(${width / 2},${width / 2})`);
  // NOTE: Assuming #tooltip exists in index.html for D3 events
  const tooltip = d3.select('#tooltip');

  function mapParty(code) { switch (+code) { case 1: return 'Republican'; case 2: return 'Democrat'; case 3: return 'Independent'; default: return 'Other'; } }
  
  // Define local Edus (should be defined in index.html)
  const allEdusFallback = ['High School <', 'Associates <', 'Bachelor', 'Masters +', 'Unknown'];
  const allEdusGlobal = typeof window !== 'undefined' && window.allEdus ? window.allEdus : allEdusFallback;


  // --- FIX: Use global data if available, otherwise load from file ---
  const loadData = () => {
    if (typeof window !== 'undefined' && window.rlsData) {
      return Promise.resolve(window.rlsData); // Use already loaded data immediately
    }
    return d3.csv('ScrubbedRLSDataFile.csv'); // Fallback to async load
  };

  loadData().then(data => {
    // --- END FIX ---

    // 1. Apply All Filters (Party + Income/Edu Filters)
    const partyDomains = ["Democrat", "Republican", "Independent", "Other"];
    const activeParties = typeof window !== 'undefined' && window.activeParties ? window.activeParties : new Set(partyDomains);
    
    // Retrieve global filter state
    const allIncomes = typeof window !== 'undefined' && window.allIncomes ? window.allIncomes : ['$30k - $50k', '$50k - $100k', '$100k - $150k', '$150k+', 'Unknown'];
    const activeIncomes = typeof window !== 'undefined' && window.activeIncomes ? window.activeIncomes : new Set(allIncomes);
    
    const activeEdus = typeof window !== 'undefined' && window.activeEdus ? window.activeEdus : new Set(allEdusGlobal);
    
    const filteredData = data.filter(d => 
        activeParties.has(mapParty(d.PARTY)) &&
        activeIncomes.has(mapInc(d.INC_SDT1)) &&
        activeEdus.has(mapEdu(d.EDUCREC))
    );

    // build nested counts: party -> edu -> count
    const nested = d3.rollups(filteredData, v => v.length, d => mapParty(d.PARTY), d => mapEdu(d.EDUCREC));

    // convert to hierarchy format
    const root = {
      name: 'root', children: nested.map(([party, eduArr]) => ({
        name: party,
        children: Array.from(eduArr, ([edu, count]) => ({ name: edu, value: count }))
      }))
    };

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

    // Draw Slices (Base Layer) - ADD CORRECTED CLICK HANDLER
    const slices = svg.selectAll('path')
      .data(rootNode.descendants().filter(d => d.depth))
      .enter().append('path')
      .attr('d', arc)
      .attr('fill', d => color(d.ancestors().slice(-2)[0].data.name))
      .attr('stroke', '#fff')
      .style('opacity', baseOpacity) // Apply base opacity to slices
      .style('cursor', d => d.depth === 2 ? 'pointer' : 'default') // Indicate interactivity
      
      // NEW CLICK HANDLER WITH CORRECTED LOGIC
      .on('click', (event, d) => {
        // Only allow filtering on Education level slices (depth 2)
        if (d.depth !== 2 || typeof window.updateAllCharts !== 'function') return;
        
        const clickedEdu = d.data.name;
        
        const allEdusSelected = window.activeEdus.size === allEdusGlobal.length;

        // --- Corrected Single-Select/Toggle Logic ---
        if (allEdusSelected) {
            // Case 1: Currently showing ALL, click to single-select.
            window.activeEdus = new Set([clickedEdu]);
        } else if (window.activeEdus.has(clickedEdu) && window.activeEdus.size === 1) {
            // Case 2: Currently single-selected (this item), click to revert to ALL.
            window.activeEdus = new Set(allEdusGlobal);
        } else {
            // Case 3: A different item is single-selected, or multiple items are selected. Click to single-select this one.
            window.activeEdus = new Set([clickedEdu]);
        }
        
        // Un-highlight any specific respondent
        window.highlightedID = null;

        window.updateAllCharts();
      })
      
      .on('mousemove', (event, d) => {
        // NOTE: This assumes #tooltip exists in index.html
        tooltip.style('display', 'block')
          .style('left', (event.pageX + 10) + 'px')
          .style('top', (event.pageY + 10) + 'px')
          .text(`${d.data.name}${d.value ? ': ' + d.value : ''}`);
      })
      .on('mouseleave', () => tooltip.style('display', 'none'));
      
    const eduNodes = rootNode.descendants().filter(d => d.depth === 2);

    // --- 3. Highlighted Overlay (Draw before labels) ---
    if (isHighlighting) {
      const highlightedID = window.highlightedID;

      const highlightedRespondentData = data.filter(d => {
        // Coerce both sides to String for reliable comparison
        const dataID = String(d.P_SUID).trim();
        const stateID = String(highlightedID).trim();
        return dataID === stateID && activeParties.has(mapParty(d.PARTY));
      });

      // Add a debug check here as well
      console.log(`Circle: Filtered to highlight ${highlightedRespondentData.length} respondent(s) for ID ${highlightedID}`); 
      
      if (highlightedRespondentData.length > 0) {
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

    // --- REVISED TEXT DRAWING LOGIC: Draw and Raise ---
    // This element must be drawn AFTER all slices (base and highlight)
    const labels = svg.selectAll('.edu-label')
      .data(eduNodes)
      .enter().append('text')
      .attr('class', 'edu-label')
      .attr('text-anchor', 'middle')
      .attr('fill', '#000') // Black text for contrast
      .style('font-size', '10px')
      .style('opacity', 1.0) // CRITICAL FIX: Always 1.0 opacity for text
      .style('pointer-events', 'none') // Ensure text doesn't block clicks on slices
      .attr('transform', d => {
        const [x, y] = arc.centroid(d);
        const angle = (d.x0 + d.x1) / 2 * 180 / Math.PI;
        const rotation = angle - 90;
        const correctedRotation = (rotation > 90 && rotation < 270) ? rotation + 180 : rotation;
        return `translate(${x-3},${y})rotate(${correctedRotation})`;
      })
      .text(d => {
        switch (d.data.name) {
          case 'High School <': return 'HS';
          case 'Associates <': return 'AS';
          case 'Bachelor': return 'BS';
          case 'Masters +': return 'MS+';
          default: return '';
        }
      });
      
    // Force the educational labels to the top layer
    labels.raise();
    // --- END REVISED TEXT DRAWING LOGIC ---


    // center label (This should also be raised to be on top)
    svg.append('text')
      .attr('text-anchor', 'middle')
      .style('font-weight', 'bold')
      .text('Education Levels')
      .raise(); // CRITICAL FIX: Raise the center label too

  }).catch(err => {
    console.error('circle: failed to load CSV', err);
    container.append('div').style('color', 'crimson').text('Failed to load data. Check console.');
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
