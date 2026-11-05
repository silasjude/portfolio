import { fetchJSON, renderProjects } from '../global.js';
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm'

const projects = await fetchJSON('../lib/projects.json');

const projectsContainer = document.querySelector('.projects');

renderProjects(projects, projectsContainer, 'h2');

const projectsTitle = document.querySelector('.projects-title');

if (projectsTitle) {
    projectsTitle.textContent = `${projects?.length ?? 0} Projects`;
}

// Projects year graph
// Track the selected year rather than its wedge index, since a search
// can remove years and shift the wedges' positions
let selectedYear = null;

// Narrow a list of projects down to the selected year, if there is one
function filterBySelectedYear(projectsGiven) {
    if (selectedYear === null) {
        return projectsGiven;
    }
    return projectsGiven.filter((p) => p.year === selectedYear);
}

function renderPieChart(projectsGiven) {
    let svg = d3.select('svg');
    let legend = d3.select('.legend');

    // clear out the previous slices and legend entries before redrawing
    svg.selectAll('path').remove();
    legend.selectAll('li').remove();

    let arcGenerator = d3.arc().innerRadius(0).outerRadius(50);

    let rolledData = d3.rollups(
        projectsGiven,
        (v) => v.length,
        (d) => d.year,
    );

    let data = rolledData.map(([year, count]) => {
        return { value: count, label: year };
    });

    let sliceGenerator = d3.pie().value((d) => d.value);
    let arcData = sliceGenerator(data);

    let arcs = arcData.map((d) => arcGenerator(d));
    let colors = d3.scaleOrdinal(d3.schemeTableau10);

    // highlight only the selected year's wedge and legend entry
    let selectedClass = (_, idx) => (data[idx].label === selectedYear ? 'selected' : '');

    arcs.forEach((arc, i) => {
        svg
            .append('path')
            .attr('d', arc)
            .attr('fill', colors(i))
            .on('click', () => {
                // clicking the selected wedge deselects it, otherwise select this one
                selectedYear = selectedYear === data[i].label ? null : data[i].label;

                svg.selectAll('path').attr('class', selectedClass);
                legend.selectAll('li').attr('class', selectedClass);

                // show the searched projects, narrowed to the selected year
                renderProjects(filterBySelectedYear(projectsGiven), projectsContainer, 'h2');
            });
    });

    data.forEach((d, idx) => {
        legend
            .append('li')
            .attr('style', `--color:${colors(idx)}`) // set the style attribute while passing in parameters
            .html(`<span class="swatch"></span> ${d.label} <em>(${d.value})</em>`); // set the inner html of <li>
    });

    // keep the highlight when the chart is redrawn by a search
    svg.selectAll('path').attr('class', selectedClass);
    legend.selectAll('li').attr('class', selectedClass);
}

// Draw the chart for all projects on page load
renderPieChart(projects);

// Search functionality
let query = '';

let searchInput = document.querySelector('.searchBar');

searchInput.addEventListener('input', (event) => {
    // update query value
    query = event.target.value;
    // filter the projects: case-insensitive match against every field
    let filteredProjects = projects.filter((project) => {
        let values = Object.values(project).join('\n').toLowerCase();
        return values.includes(query.toLowerCase());
    });

    // drop the selected year if no search results are from it,
    // so there's never a selection with no wedge to click off
    if (!filteredProjects.some((p) => p.year === selectedYear)) {
        selectedYear = null;
    }

    // render the search results within the selected year, and chart all of them
    renderProjects(filterBySelectedYear(filteredProjects), projectsContainer, 'h2');
    renderPieChart(filteredProjects);
});
