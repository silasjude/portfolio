import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

async function loadData() {
    const data = await d3.csv('loc.csv', (row) => ({
        ...row,
        line: Number(row.line),
        depth: Number(row.depth),
        length: Number(row.length),
        date: new Date(row.date + 'T00:00' + row.timezone),
        datetime: new Date(row.datetime),
    }));
    return data;
}

function processCommits(data) {
    return d3
        .groups(data, (d) => d.commit)
        .map(([commit, lines]) => {
            let first = lines[0];
            let { author, date, time, timezone, datetime } = first;
            let ret = {
                id: commit,
                url: 'https://github.com/silasjude/portfolio/commit/' + commit,
                author,
                date,
                time,
                timezone,
                datetime,
                hourFrac: datetime.getHours() + datetime.getMinutes() / 60,
                totalLines: lines.length,
            };

            Object.defineProperty(ret, 'lines', {
                value: lines,
                // Keep the raw lines attached but hidden from console.log / iteration
                configurable: false,
                writable: false,
                enumerable: false,
            });

            return ret;
        });
}

function renderCommitInfo(data, commits) {
    // Create the dl element
    const dl = d3.select('#stats').append('dl').attr('class', 'stats');

    // Wrap each dt/dd pair in a div so the grid can lay them out as one unit
    function addStat(labelHtml, value) {
        const stat = dl.append('div');
        stat.append('dt').html(labelHtml);
        stat.append('dd').text(value);
    }

    // Add total LOC
    addStat('Total <abbr title="Lines of code">LOC</abbr>', data.length);

    // Add total commits
    addStat('Total commits', commits.length);

    // Add number of files
    addStat('Number of files', d3.group(data, (d) => d.file).size);

    // Add longest file (in lines)
    const fileLengths = d3.rollups(
        data,
        (v) => d3.max(v, (d) => d.line),
        (d) => d.file,
    );
    addStat('Longest file (lines)', d3.max(fileLengths, (d) => d[1]));

    // Add average line length (in characters)
    addStat('Average line length', d3.mean(data, (d) => d.length).toFixed(1));

    // Add most active time of day
    const workByPeriod = d3.rollups(
        data,
        (v) => v.length,
        (d) => d.datetime.toLocaleString('en', { dayPeriod: 'short' }),
    );
    // Drop the "in the" / "at" prefix so it reads as a single word
    addStat(
        'Most active time of day',
        d3.greatest(workByPeriod, (d) => d[1])?.[0].replace(/^(in the|at) /, ''),
    );
}

let data = await loadData();
let commits = processCommits(data);
console.log(commits);

// Commits up to the time slider's date; updated as the slider moves
let filteredCommits = commits;

renderCommitInfo(data, commits);

// Files list: one row per file with its line count, for the commits up to
// the slider's time. Called from onTimeSliderChange, so it re-runs whenever
// the slider moves (and once on page load)
function updateFileDisplay(filteredCommits) {
    const lines = filteredCommits.flatMap((d) => d.lines);
    const files = d3
        .groups(lines, (d) => d.file)
        .map(([name, lines]) => {
            return { name, lines };
        });

    const filesContainer = d3
        .select('#files')
        .selectAll('div')
        .data(files, (d) => d.name)
        .join(
            // This code only runs when the div is initially rendered
            (enter) =>
                enter.append('div').call((div) => {
                    div.append('dt').append('code');
                    div.append('dd');
                }),
        );

    // This code updates the div info
    filesContainer.select('dt > code').text((d) => d.name);
    filesContainer.select('dd').text((d) => `${d.lines.length} lines`);
}

// Scatterplot
// Scales are module-level so the brush code can map commits to pixels
let xScale;
let yScale;

// Current brush rectangle in pixels (null when nothing is brushed)
let brushSelection = null;

function renderScatterPlot(data, commits) {
    // Sort commits by total lines in descending order
    const sortedCommits = d3.sort(commits, (d) => -d.totalLines);
    const width = 1000;
    const height = 600;
    const svg = d3
        .select('#chart')
        .append('svg')
        .attr('viewBox', `0 0 ${width} ${height}`)
        .style('overflow', 'visible');

    const margin = { top: 10, right: 10, bottom: 30, left: 20 };

    const usableArea = {
        top: margin.top,
        right: width - margin.right,
        bottom: height - margin.bottom,
        left: margin.left,
        width: width - margin.left - margin.right,
        height: height - margin.top - margin.bottom,
    };

    // Scales map into the usable area, inside the margins
    xScale = d3
        .scaleTime()
        .domain(d3.extent(commits, (d) => d.datetime))
        .range([usableArea.left, usableArea.right])
        .nice();

    yScale = d3
        .scaleLinear()
        .domain([0, 24])
        .range([usableArea.bottom, usableArea.top]);

    // Gridlines go first so they're drawn behind the dots
    const gridlines = svg
        .append('g')
        .attr('class', 'gridlines')
        .attr('transform', `translate(${usableArea.left}, 0)`);

    // Create gridlines as an axis with no labels and full-width ticks
    gridlines.call(d3.axisLeft(yScale).tickFormat('').tickSize(-usableArea.width));

    const dots = svg.append('g').attr('class', 'dots');

    const [minLines, maxLines] = d3.extent(commits, (d) => d.totalLines);
    const rScale = d3
        .scaleSqrt() // Change only this line
        .domain([minLines, maxLines])
        .range([2, 30]);

    dots
        .selectAll('circle')
        .data(sortedCommits)
        .join('circle')
        .attr('cx', (d) => xScale(d.datetime))
        .attr('cy', (d) => yScale(d.hourFrac))
        .attr('r', (d) => rScale(d.totalLines))
        .style('fill-opacity', 0.7) // Add transparency for overlapping dots
        .on('mouseenter', (event, commit) => {
            d3.select(event.currentTarget).style('fill-opacity', 1); // Full opacity on hover
            renderTooltipContent(commit);
            updateTooltipVisibility(true);
            updateTooltipPosition(event);
        })
        .on('mouseleave', (event) => {
            d3.select(event.currentTarget).style('fill-opacity', 0.7);
            updateTooltipVisibility(false);
        });

    // Create the axes
    const xAxis = d3.axisBottom(xScale);
    const yAxis = d3
        .axisLeft(yScale)
        .tickFormat((d) => String(d % 24).padStart(2, '0') + ':00');

    // Add X axis
    svg
        .append('g')
        .attr('transform', `translate(0, ${usableArea.bottom})`)
        .attr('class', 'x-axis') // new line to mark the g tag
        .call(xAxis);

    // Add Y axis
    svg
        .append('g')
        .attr('transform', `translate(${usableArea.left}, 0)`)
        .attr('class', 'y-axis') // just for consistency
        .call(yAxis);

    createBrushSelector(svg);
}

renderScatterPlot(data, commits);

// Tooltips
function renderTooltipContent(commit) {
    const link = document.getElementById('commit-link');
    const date = document.getElementById('commit-date');
    const time = document.getElementById('commit-tooltip-time');
    const author = document.getElementById('commit-author');
    const lines = document.getElementById('commit-lines');

    if (Object.keys(commit).length === 0) return;

    link.href = commit.url;
    link.textContent = commit.id;
    date.textContent = commit.datetime?.toLocaleString('en', {
        dateStyle: 'full',
    });
    time.textContent = commit.datetime?.toLocaleString('en', {
        timeStyle: 'short',
    });
    author.textContent = commit.author;
    lines.textContent = commit.totalLines;
}

function updateTooltipVisibility(isVisible) {
    const tooltip = document.getElementById('commit-tooltip');
    tooltip.hidden = !isVisible;
}

function updateTooltipPosition(event) {
    const tooltip = document.getElementById('commit-tooltip');
    tooltip.style.left = `${event.clientX}px`;
    tooltip.style.top = `${event.clientY}px`;
}

// Brushing graph
function createBrushSelector(svg) {
    svg.call(d3.brush());
    svg.selectAll('.dots, .overlay ~ *').raise();
    svg.call(d3.brush().on('start brush end', brushed));
}

function brushed(event) {
    brushSelection = event.selection;
    renderSelection();
}

// Highlight brushed dots and refresh the count and language breakdown.
// Also called when the slider moves, since the dots under the brush change
function renderSelection() {
    d3.selectAll('.dots circle').classed('selected', (d) =>
        isCommitSelected(brushSelection, d),
    );
    renderSelectionCount(brushSelection);
    renderLanguageBreakdown(brushSelection);
}

function isCommitSelected(selection, commit) {
    if (!selection) {
        return false;
    }

    // selection is the brush rectangle's corners in pixels: [[x0, y0], [x1, y1]]
    const [[x0, y0], [x1, y1]] = selection;
    const x = xScale(commit.datetime);
    const y = yScale(commit.hourFrac);
    return x >= x0 && x <= x1 && y >= y0 && y <= y1;
}

function renderSelectionCount(selection) {
    const countElement = document.querySelector('#selection-count');

    // With no brush selection, the breakdown below covers every commit
    // up to the slider's time
    if (!selection) {
        countElement.textContent =
            filteredCommits.length === commits.length
                ? `Showing all ${commits.length} commits`
                : `Showing ${filteredCommits.length} of ${commits.length} commits`;
        return filteredCommits;
    }

    const selectedCommits = filteredCommits.filter((d) =>
        isCommitSelected(selection, d),
    );
    countElement.textContent = `${
        selectedCommits.length || 'No'
    } commits selected`;

    return selectedCommits;
}

function renderLanguageBreakdown(selection) {
    // With no brush selection, show the breakdown for every commit
    // up to the slider's time
    const selectedCommits = selection
        ? filteredCommits.filter((d) => isCommitSelected(selection, d))
        : filteredCommits;
    const container = document.getElementById('language-breakdown');
    const lines = selectedCommits.flatMap((d) => d.lines);

    // Every language in the full dataset, most lines first, so the same
    // entries always show in the same order (0 if the brush selects none)
    const languages = d3.groupSort(
        data,
        (v) => -v.length,
        (d) => d.type,
    );

    // Use d3.rollup to count lines per language
    const breakdown = d3.rollup(
        lines,
        (v) => v.length,
        (d) => d.type,
    );

    // Update DOM with breakdown
    container.innerHTML = '';

    for (const language of languages) {
        const count = breakdown.get(language) ?? 0;
        const proportion = lines.length ? count / lines.length : 0;
        const formatted = d3.format('.1~%')(proportion);

        // Wrap each pair in a div so the label stacks above its value
        container.innerHTML += `
                <div>
                    <dt>${language}</dt>
                    <dd>${count} lines (${formatted})</dd>
                </div>
            `;
    }
}

let commitProgress = 100;
let timeScale = d3
    .scaleTime()
    .domain([
        d3.min(commits, (d) => d.datetime),
        d3.max(commits, (d) => d.datetime),
    ])
    .range([0, 100]);
let commitMaxTime = timeScale.invert(commitProgress);
// Time slider
const commitProgressInput = document.getElementById('commit-progress');
const commitTimeElement = document.getElementById('commit-time');


function onTimeSliderChange() {
    // 1. Update commitProgress to the slider value
    commitProgress = Number(commitProgressInput.value);

    // 2. Map the slider value (0–100) back to a date
    commitMaxTime = timeScale.invert(commitProgress);

    // 3. Show that date in the <time> element
    commitTimeElement.textContent = commitMaxTime.toLocaleString('en', {
        dateStyle: 'long',
        timeStyle: 'short',
    });
    commitTimeElement.dateTime = commitMaxTime.toISOString();

    // 4. Redraw the scatter plot with only the commits up to that time
    filteredCommits = commits.filter((d) => d.datetime <= commitMaxTime);
    updateScatterPlot(data, filteredCommits);

    // 5. Refresh the selection count and language breakdown to match
    renderSelection();

    // 6. Refresh the files list to match
    updateFileDisplay(filteredCommits);
}

commitProgressInput.addEventListener('input', onTimeSliderChange);
onTimeSliderChange(); // fill in the time on page load

function updateScatterPlot(data, commits) {
    const width = 1000;
    const height = 600;
    const margin = { top: 10, right: 10, bottom: 30, left: 20 };
    const usableArea = {
        top: margin.top,
        right: width - margin.right,
        bottom: height - margin.bottom,
        left: margin.left,
        width: width - margin.left - margin.right,
        height: height - margin.top - margin.bottom,
    };

    const svg = d3.select('#chart').select('svg');

    xScale = xScale.domain(d3.extent(commits, (d) => d.datetime));

    const [minLines, maxLines] = d3.extent(commits, (d) => d.totalLines);
    const rScale = d3.scaleSqrt().domain([minLines, maxLines]).range([2, 30]);

    // xAxis was local to renderScatterPlot, so build one from the new scale,
    // then redraw it in the existing x-axis group instead of adding another
    const xAxis = d3.axisBottom(xScale);
    const xAxisGroup = svg.select('g.x-axis');
    xAxisGroup.selectAll('*').remove();
    xAxisGroup.call(xAxis);

    const dots = svg.select('g.dots');

    const sortedCommits = d3.sort(commits, (d) => -d.totalLines);
    dots
        .selectAll('circle')
        .data(sortedCommits, (d) => d.id) // key by commit so each dot keeps its circle
        .join('circle')
        .attr('cx', (d) => xScale(d.datetime))
        .attr('cy', (d) => yScale(d.hourFrac))
        .attr('r', (d) => rScale(d.totalLines))
        .style('fill-opacity', 0.7) // Add transparency for overlapping dots
        .on('mouseenter', (event, commit) => {
            d3.select(event.currentTarget).style('fill-opacity', 1); // Full opacity on hover
            renderTooltipContent(commit);
            updateTooltipVisibility(true);
            updateTooltipPosition(event);
        })
        .on('mouseleave', (event) => {
            d3.select(event.currentTarget).style('fill-opacity', 0.7);
            updateTooltipVisibility(false);
        });
}