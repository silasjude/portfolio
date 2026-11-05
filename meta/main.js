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

renderCommitInfo(data, commits);