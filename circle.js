// circle.js — Sunburst visualization for PARTY -> EDUCREC
function renderCircle(containerSelector = '#chart-circle') {
  const container = d3.select(containerSelector);
  if (container.empty()) {
    console.warn('renderCircle: container not found:', containerSelector);
    return;
  }
  container.html('');
  const rect = container.node().getBoundingClientRect();
  const size = Math.min(rect.width * 0.95, rect.height * 0.95);
  const width = size;
  const radius = size / 2;

  const svg = container.append('svg')
    .attr('width', width)
    .attr('height', width)
    .append('g')
    .attr('transform', `translate(${width / 2},${width / 2})`);
  const tooltip = d3.select('#tooltip');

  function mapParty(code) { switch (+code) { case 1: return 'Republican'; case 2: return 'Democrat'; case 3: return 'Independent'; default: return 'Other'; } }
  
  //  Define local fallback for allEdus (should be defined in index.html)
  const allEdusFallback = ['High School <', 'Associates <', 'Bachelor', 'Masters +', 'Unknown'];
  const allEdusGlobal = typeof window !== 'undefined' && window.allEdus ? window.allEdus : allEdusFallback;

  const loadData = () => {
    if (typeof window !== 'undefined' && window.rlsData) {
      return Promise.resolve(window.rlsData); // Use already loaded data immediately
    }
    return d3.csv('ScrubbedRLSDataFile.csv'); // Fallback to async load
  };

loadData().then(data => {
    const allRawData = data;
    
    // 2. Define Filters
    const partyDomains = ["Democrat", "Republican", "Independent", "Other"];
    const activeParties = typeof window !== 'undefined' && window.activeParties ? window.activeParties : new Set(partyDomains);
    const allIncomes = typeof window !== 'undefined' && window.allIncomes ? window.allIncomes : ['<$50k', '$50k - $100k', '$100k - $150k', '$>150k', ''];
    const activeIncomes = typeof window !== 'undefined' && window.activeIncomes ? window.activeIncomes : new Set(allIncomes);
    const allEdusGlobal = typeof window !== 'undefined' && window.allEdus ? window.allEdus : allEdusFallback;
    const activeEdus = typeof window !== 'undefined' && window.activeEdus ? window.activeEdus : new Set(allEdusGlobal);
    
    // 3. Build nested counts on ALL data
    const nested = d3.rollups(allRawData, v => v.length, d => mapParty(d.PARTY), d => mapEdu(d.EDUCREC));

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

    // 4. Opacity Logic
    const isHighlighting = typeof window !== 'undefined' && window.highlightedID !== null;
    const HIGHLIGHT_GHOST_OPACITY = 0.2; 
    const FILTER_GHOST_OPACITY = 0.1;
    const ACTIVE_OPACITY = 1.0; 

    //Check if a slice is active based on Party and Education filters
    const isSliceActive = (d) => {
        // Party slices (depth 1) are active if the party is active
        if (d.depth === 1) {
            return activeParties.has(d.data.name);
        }
        // Education slices (depth 2) are active if their party AND their education level is active
        if (d.depth === 2) {
            const partyActive = activeParties.has(d.parent.data.name);
            const eduActive = activeEdus.has(d.data.name);
            return partyActive && eduActive;
        }
        return false;
    }


    // Draw Slices (Base Layer)
    const slices = svg.selectAll('path')
      .data(rootNode.descendants().filter(d => d.depth))
      .enter().append('path')
      .attr('d', arc)
      .attr('fill', d => color(d.ancestors().slice(-2)[0].data.name))
      .attr('stroke', '#fff')
      // Apply Opacity based on  highlighting state
      .style('opacity', d => {
          if (isHighlighting) {
              return HIGHLIGHT_GHOST_OPACITY; // If highlighted, base slices are dimmed
          }
          // Only depth 1 (Party) and depth 2 (Education) slices should be checked
          if (d.depth === 1 || d.depth === 2) {
              return isSliceActive(d) ? ACTIVE_OPACITY : FILTER_GHOST_OPACITY;
          }
          return ACTIVE_OPACITY; 
      }) 
      .style('cursor', d => d.depth === 2 ? 'pointer' : 'default') // Indicate interactivity
      
      // Click Handler
      .on('click', (event, d) => {
        // Only allow filtering on Education level slices (depth 2)
        if (d.depth !== 2 || typeof window.updateAllCharts !== 'function') return;
        
        const clickedEdu = d.data.name;
        
        const allEdusSelected = window.activeEdus.size === allEdusGlobal.length;

        //Single-Select/Toggle Logic
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
        tooltip.style('display', 'block')
          .style('left', (event.pageX + 10) + 'px')
          .style('top', (event.pageY + 10) + 'px')
          .text(`${d.data.name}${d.value ? ': ' + d.value : ''}`);
      })
      .on('mouseleave', () => tooltip.style('display', 'none'));
      
    const eduNodes = rootNode.descendants().filter(d => d.depth === 2);

    // Highlighting
    if (isHighlighting) {
      const highlightedID = window.highlightedID;

      const highlightedRespondentData = data.filter(d => {
        const dataID = String(d.P_SUID).trim();
        const stateID = String(highlightedID).trim();
        return dataID === stateID && activeParties.has(mapParty(d.PARTY));
      });

      if (highlightedRespondentData.length > 0) {
        // Get  party and education of the respondent
        const resp = highlightedRespondentData[0];
        const highlightedParty = mapParty(resp.PARTY);
        const highlightedEdu = mapEdu(resp.EDUCREC);

        // Find the corresponding slice data objects (Party slice and Education slice)
        const highlightNodes = rootNode.descendants().filter(d => {
          if (d.depth === 1 && d.data.name === highlightedParty) return true; // Party slice
          if (d.depth === 2 && d.data.name === highlightedEdu && d.parent && d.parent.data.name === highlightedParty) return true; // Education slice
          return false;
        });

        // Draw Highlighted Slices
        svg.selectAll('.highlight-slice')
          .data(highlightNodes)
          .enter().append('path')
          .attr('d', arc)
          .attr('fill', d => color(d.ancestors().slice(-2)[0].data.name))
          .attr('stroke', '#000')
          .attr('stroke-width', 2)
          .attr('class', 'highlight-slice')
          .style('opacity', 1.0)
          // Add titles
          .append('title')
          .text(d => `${d.data.name}${d.value ? ': ' + d.value : ''}`);
      }
    }
    // Text Drawing Logic
    const labels = svg.selectAll('.edu-label')
      .data(eduNodes)
      .enter().append('text')
      .attr('class', 'edu-label')
      .attr('text-anchor', 'middle')
      .attr('fill', '#000') 
      .style('font-size', '10px')
      .style('opacity', 1.0) // Always full opacity for text
      .style('pointer-events', 'none') // text doesn't block clicks on slices
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
      
    // Force labels to the top layer
    labels.raise();


    // center label
    svg.append('text')
      .attr('text-anchor', 'middle')
      .style('font-weight', 'bold')
      .text('Education Levels')
      .raise();

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
