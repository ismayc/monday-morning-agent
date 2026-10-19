#!/usr/bin/env node
// season-sheet.mjs: one page of what the plays say about the tush push, for a set of
// seasons, made by running the tool and writing down what it printed.
//
//   node ./season-sheet.mjs                          five seasons, 2021 to 2025
//   node ./season-sheet.mjs --seasons 2026           this season, as far as it has been played
//   node ./season-sheet.mjs --seasons 2026 --open    and open it in the browser
//   node ./season-sheet.mjs --seasons 2026 --out ../docs/episode-2/season-sheet-2026.html
//   node ./season-sheet.mjs --ruling rulings/ruling-<stamp>.md    quote the agent's on-air ruling at the end
//
// The page asks query-plays.mjs the same questions every time: the search by name, then
// the defined play against every other short-yardage rush under nine situations (all
// downs, third and fourth down, fourth down, one yard to go, goal to go, without the
// Eagles, the Eagles alone, the regular season, the playoffs), then the same result by
// season and by team, and for a range of seasons the by-team count once per season
// (who ran it). Each answer is the conversion bar from the episode pages, with
// the tool's own numbers and warnings under it. Nothing is computed here except the
// verdict, which compares two gaps the tool printed.
//
// It measures with the dictionary entry named by --play (default tush-push), read from
// the dictionary folder (ANALYST_DICT_DIR, default ../dictionary), and prints the entry
// at the top of the page, because a number without its definition is not a number.
// The default output is rulings/season-sheet-<seasons>.html, beside the runs; --out
// puts it anywhere, which is how it gets published to the site after the show.
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const DIR = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const flag = (name, dflt) => { const i = args.indexOf(name); return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : dflt }
const SEASONS = flag('--seasons', '2021-2025')
const PLAY = flag('--play', 'tush-push')
const OPEN = args.includes('--open')
const RULING = flag('--ruling', '')
const OUT = resolve(flag('--out', join(DIR, 'rulings', `season-sheet-${SEASONS}.html`)))

const QUESTIONS = [
  { key: 'all', title: 'All downs', sub: 'Every rush with two or fewer yards to go, the defined play against the rest.', args: [] },
  { key: 'late', title: 'Third and fourth down', sub: 'When the drive is on the line.', args: ['--downs', '3,4'] },
  { key: 'fourth', title: 'Fourth down only', sub: 'The decision the room argues about most.', args: ['--downs', '4'] },
  { key: 'one', title: 'One yard to go', sub: 'The shortest distance, where the play is most used.', args: ['--yards-to-go', '1'] },
  { key: 'goal', title: 'Goal to go', sub: 'At the goal line, where a conversion is a touchdown.', args: ['--goal-to-go'] },
  { key: 'noPHI', title: 'Every team but the Eagles', sub: 'Take away the team the play is named for.', args: ['--not-team', 'PHI'] },
  { key: 'PHI', title: 'The Eagles only', sub: 'The team that made it an argument.', args: ['--team', 'PHI'] },
  { key: 'reg', title: 'Regular season only', sub: 'Leave the playoffs out.', args: ['--type', 'REG'] },
  { key: 'post', title: 'Playoffs only', sub: 'Thirteen games a season.', args: ['--type', 'POST'] },
]

const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const fmt = (n) => Number(n).toLocaleString('en-US')
const pct = (x) => x === null || x === undefined ? 'n/a' : (100 * x).toFixed(1) + '%'
const run = (a) => JSON.parse(execFileSync('node', [join(DIR, 'query-plays.mjs'), ...a, '--json'], { encoding: 'utf8', env: process.env }))

const search = { command: `node ./query-plays.mjs --search "tush push" --seasons ${SEASONS}`, out: run(['--search', 'tush push', '--seasons', SEASONS]) }
const answers = QUESTIONS.map(q => {
  const a = ['--play', PLAY, '--seasons', SEASONS, ...q.args]
  return { ...q, command: 'node ./query-plays.mjs ' + a.join(' '), out: run(a) }
})
const bySeason = { command: `node ./query-plays.mjs --play ${PLAY} --seasons ${SEASONS} --by season`, out: run(['--play', PLAY, '--seasons', SEASONS, '--by', 'season']) }
const byTeam = { command: `node ./query-plays.mjs --play ${PLAY} --seasons ${SEASONS} --by team`, out: run(['--play', PLAY, '--seasons', SEASONS, '--by', 'team']) }
// Who ran it, season by season: for a range of seasons, the by-team table once per
// season, so the sheet can show one row per team and one column per season (added
// October 19, 2026). A single season has nothing to spread out, so it gets no table.
const years = SEASONS.includes('-') ? (([a, b]) => Array.from({ length: b - a + 1 }, (_, i) => String(a + i)))(SEASONS.split('-').map(Number)) : []
const byTeamByYear = years.map(y => ({ year: y, out: run(['--play', PLAY, '--seasons', y, '--by', 'team']) }))

const first = answers[0].out
const dict = first.dictionary
const latest = first.coverage.latestGameDate || ''
const longDate = (iso) => iso ? new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : ''
const weeks = Object.entries(first.coverage.weeksBySeason).map(([s, w]) => `${s}: ${w}`).join('; ')
const thisSeason = !SEASONS.includes('-') && Number(SEASONS) >= 2026
const noPHI = answers.find(a => a.key === 'noPHI').out
// Gaps are read as the tool prints them, to one decimal, so the rule below judges the same number the page shows.
const gapAll = first.gapDefinedMinusOther === null ? null : +(100 * first.gapDefinedMinusOther).toFixed(1)
const gapNoPHI = noPHI.gapDefinedMinusOther === null ? null : +(100 * noPHI.gapDefinedMinusOther).toFixed(1)
const nDefined = first.result.defined.plays

// The verdict on the claim, by a rule written here so anyone can disagree with it. The
// argument for a ban rests on the play converting far more often than every other
// short-yardage play. So the test is the all-downs gap, and whether it survives taking
// away the team the play is named for:
//   - fewer than 100 plays matching the definition: too few plays to rule;
//   - a gap of 8 points or more, and still 5 or more without the Eagles: holds, as a steady edge;
//   - a gap under 4 points: does not hold as stated;
//   - anything between: mixed, read the bars.
// Whether the play should be legal is not on this sheet. No rule here can settle it.
function verdict() {
  if (gapAll === null || gapNoPHI === null) return { word: 'No ruling yet', text: 'One of the questions the ruling needs has no result, so there is no gap to compare. The bars below say what there is.' }
  const d = first.result.defined, o = first.result.other
  const line = `the defined play converted ${pct(d.rate)} of ${fmt(d.plays)} plays, every other rush with the same yards to go ${pct(o.rate)} of ${fmt(o.plays)}, a gap of ${gapAll.toFixed(1)} points`
  if (nDefined < 100) return { word: 'Too few plays to rule', text: `${fmt(nDefined)} plays match the definition so far; one play moves the rate by ${(100 / Math.max(nDefined, 1)).toFixed(1)} points. In them, ${line}. Without the Eagles the gap is ${gapNoPHI.toFixed(1)}. The sample cannot carry a ruling yet. Ask again in a few weeks.` }
  if (gapAll >= 8 && gapNoPHI >= 5) return { word: 'Holds, as a steady edge', text: `Over ${SEASONS.replace('-', ' to ')}, ${line}. Take away the Eagles and the gap is ${gapNoPHI.toFixed(1)} points, so it is not one team's play. The play converts about ten points more often than everything else at that distance, season after season. Whether that is grounds for a ban is a judgment about safety and fairness, and no number on this sheet settles it.` }
  if (gapAll < 4) return { word: 'Does not hold as stated', text: `Over ${SEASONS.replace('-', ' to ')}, ${line}. That is not far more often; it is about the same. Without the Eagles the gap is ${gapNoPHI.toFixed(1)}.` }
  return { word: 'Mixed', text: `Over ${SEASONS.replace('-', ' to ')}, ${line}; without the Eagles it is ${gapNoPHI.toFixed(1)}. Neither reading is clean; the bars are the evidence.` }
}
const V = verdict()

function rulingHtml(md) {
  const out = []; let inCode = false, code = []
  for (const line of md.split('\n')) {
    if (/^```/.test(line)) { if (inCode) { out.push(`<pre>${esc(code.join('\n'))}</pre>`); code = [] } inCode = !inCode; continue }
    if (inCode) { code.push(line); continue }
    const t = line.replace(/^\s*[-*]\s+/, '').trim()
    if (t) out.push(`<p${/^\*\*Ruling:?\*\*/.test(t) ? ' class="call"' : ''}>${esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>')}</p>`)
  }
  return out.join('\n')
}
const rulingBlock = RULING ? `<section class="ruling"><h2>What the agent ruled on air</h2>${rulingHtml(readFileSync(RULING, 'utf8'))}<p class="from">From <code>${esc(RULING)}</code>.</p></section>` : ''

function rowHtml(a) {
  const d = a.out.result.defined, o = a.out.result.other
  const warn = a.out.warnings.map(w => `<p class="warn">${esc(w.replace('SMALL SAMPLE: ', 'Small sample: ').replace('NO RESULT: ', 'No result: '))}</p>`).join('')
  const ok = d.rate !== null && o.rate !== null
  const field = ok ? `<div class="field" role="img" aria-label="${esc(a.title)}: the defined play converted ${pct(d.rate)}, other short-yardage rushes ${pct(o.rate)}">
<div class="gap" style="left:${(100 * Math.min(d.rate, o.rate)).toFixed(2)}%;width:${(100 * Math.abs(d.rate - o.rate)).toFixed(2)}%"></div>
<div class="mk least" style="left:${(100 * o.rate).toFixed(2)}%"><b>${pct(o.rate)}</b></div><div class="mk most" style="left:${(100 * d.rate).toFixed(2)}%"><b>${pct(d.rate)}</b></div></div>`
    : '<div class="nofield">The filters left no play on one side of the comparison, so the tool gives no result. That is an answer too.</div>'
  const line = ok ? `<p class="numbers"><span class="y">${pct(d.rate)}</span> the defined play, ${fmt(d.plays)} plays; <span class="b">${pct(o.rate)}</span> every other rush at that distance, ${fmt(o.plays)} plays; a gap of <b>${(100 * a.out.gapDefinedMinusOther).toFixed(1)} points</b>.</p>` : ''
  return `<div class="q">
<div class="qhead"><h3>${esc(a.title)}</h3><p>${esc(a.sub)}</p><code>${esc(a.command)}</code></div>
<div class="qbody">${field}${line}${warn}</div>
</div>`
}
const byRows = (b, what) => b.out.by.rows.map(r => `<tr><td>${esc(r.key)}</td><td class="num">${fmt(r.defined.plays)}</td><td class="num"><span class="y">${pct(r.defined.rate)}</span></td><td class="num">${fmt(r.other.plays)}</td><td class="num"><span class="b">${pct(r.other.rate)}</span></td><td class="num">${r.gap === null ? 'n/a' : (100 * r.gap).toFixed(1)}</td></tr>`).join('\n') || `<tr><td colspan="6">No ${what} has ${b.out.by.minDefinedPlays} plays matching the definition yet.</td></tr>`

function teamGridHtml() {
  if (!years.length) return ''
  const counts = {}, order = []
  for (const r of byTeam.out.by.rows) { order.push(r.key); counts[r.key] = { sum: r.defined.plays } }
  const most = {}
  for (const { year, out } of byTeamByYear) for (const r of out.by.rows) {
    if (!counts[r.key]) { counts[r.key] = { sum: null }; order.push(r.key) }
    counts[r.key][year] = r.defined.plays
    if (!most[year] || r.defined.plays > most[year]) most[year] = r.defined.plays
  }
  const league = Object.fromEntries(bySeason.out.by.rows.map(r => [String(r.key), r.defined.plays]))
  const head = `<tr><th>Team</th>${years.map(y => `<th class="num">${y}</th>`).join('')}<th class="num sum">${esc(SEASONS.replace('-', ' to '))}</th></tr>`
  const all = `<tr class="all"><td>Every team</td>${years.map(y => `<td class="num">${league[y] === undefined ? '' : fmt(league[y])}</td>`).join('')}<td class="num sum">${fmt(first.result.defined.plays)}</td></tr>`
  const rows = order.map(t => `<tr><td>${esc(t)}</td>${years.map(y => {
    const n = counts[t][y]
    if (n === undefined) return '<td class="num few">under 10</td>'
    return `<td class="num">${n === most[y] ? `<span class="y">${fmt(n)}</span>` : fmt(n)}</td>`
  }).join('')}<td class="num sum">${counts[t].sum === null ? 'under 10' : fmt(counts[t].sum)}</td></tr>`).join('\n')
  return `<div class="teams"><h2>Who ran it, season by season</h2>
<code>${esc(`node ./query-plays.mjs --play ${PLAY} --seasons ${years[0]} --by team`)} (and each season to ${esc(years[years.length - 1])})</code>
<p>One row per team, one column per season: the plays that matched the definition. Each season's most is in yellow; the first row is every team together. The tool lists a team once it has ${byTeam.out.by.minDefinedPlays} matching plays in a season, so a smaller count reads "under 10". Teams in order of the five-season column.</p>
<table id="teamgrid"><thead>${head}</thead><tbody>${all}
${rows}</tbody></table></div>`
}
const teamGrid = teamGridHtml()

const title = thisSeason
  ? `This season so far: ${SEASONS}, through ${longDate(latest) || 'no games yet'}`
  : `"Ban the tush push." Five seasons, ${SEASONS.replace('-', ' to ')}.`
const lead = thisSeason
  ? `The same questions as the five-season sheet, asked of this season alone: weeks ${esc(weeks.replace(/^\d+: /, ''))}, through the games of ${esc(longDate(latest))}. The groups are small and the tool says so wherever it matters.`
  : `Nine situations, each answered by the one tool from every play of ${SEASONS.replace('-', ' through ')}, measuring with the definition below. Yellow is the defined play, blue is every other rush with the same yards to go, and the hatched stretch between them is the gap in how often each converted.`
const headline = `<div class="verdict"><b>${esc(V.word)}</b><div>
<p class="vtext">${esc(V.text)}</p>
${gapAll !== null ? `<div class="evidence"><div><b>${fmt(search.out.matched)}</b><span>of ${fmt(search.out.searched)} play descriptions name the play</span></div><div><b>${gapAll.toFixed(1)}</b><span>points: the gap, all downs</span></div><div><b>${gapNoPHI === null ? 'n/a' : gapNoPHI.toFixed(1)}</b><span>points: the gap without the Eagles</span></div></div>` : ''}
<p class="rule">The verdict follows a rule written in season-sheet.mjs, so you can disagree with it. It reads the all-downs gap: under 100 plays matching the definition is too few to rule; a gap of 8 points or more that stays at 5 or more without the Eagles holds, as a steady edge; a gap under 4 does not hold as stated; between the two is mixed. Whether the play should be legal is not on this sheet. This is the page's rule, not the agent's. Every number is the tool's.</p>
</div></div>`

const META_SITE = 'https://ismayc.github.io/monday-morning-agent'
const metaUrl = `${META_SITE}/episode-2/season-sheet-${SEASONS}.html`
const metaDesc = thisSeason
  ? `Nine situations for the tush push, asked of the ${SEASONS} season through the games of ${longDate(latest)}, measured with the dictionary's definition, with the tool's own numbers and a verdict by a rule stated on the page.`
  : `Nine situations for the tush push, answered from every play of ${SEASONS.replace('-', ' through ')} with the dictionary's definition, with the tool's own numbers and a verdict by a rule stated on the page.`
const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(metaDesc)}">
<link rel="icon" href="${META_SITE}/favicon.svg" type="image/svg+xml">
<link rel="icon" href="${META_SITE}/favicon-32.png" sizes="32x32" type="image/png">
<link rel="apple-touch-icon" href="${META_SITE}/apple-touch-icon.png">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(metaDesc)}">
<meta property="og:url" content="${metaUrl}">
<meta property="og:image" content="${META_SITE}/episode-2/og-image.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Ban the tush push. Plays named tush push in 260,927 play descriptions: zero. The agent has to define the play before it can judge it.">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(metaDesc)}">
<meta name="twitter:image" content="${META_SITE}/episode-2/og-image.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=Barlow:wght@400;500;600&display=swap">
<style>
  /* The call sheet of the episode pages, inlined so the file opens anywhere. */
  :root { --sheet: #fcfcfa; --ink: #14171a; --soft: #4a5058; --rule: #c9ccd1; --faint: #eef0f1; --yellow: #ffe14d; --blue: #8ad4ff; --pink: #ff9db8;
    --display: "Barlow Condensed", "Arial Narrow", "Helvetica Neue", Arial, sans-serif; --text: "Barlow", -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; --code: ui-monospace, "SF Mono", Menlo, Consolas, monospace; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: var(--sheet); color: var(--ink); font-family: var(--text); font-size: 17px; line-height: 1.5; }
  main { max-width: 1120px; margin: 0 auto; padding: 0 24px 80px; }
  a { color: var(--ink); text-decoration-color: var(--yellow); text-decoration-thickness: 2px; text-underline-offset: 3px; }
  code { font-family: var(--code); font-size: .85em; background: var(--faint); padding: 1px 5px; }
  .top { position: sticky; top: 0; z-index: 20; background: var(--sheet); display: flex; flex-wrap: wrap; justify-content: space-between; align-items: baseline; gap: 4px 20px; padding: 14px 0 10px; border-bottom: 4px solid var(--ink); font-family: var(--display); font-weight: 600; font-size: 22px; }
  .top a { text-decoration: none; }
  .top nav { display: flex; flex-wrap: wrap; gap: 4px 16px; font-weight: 500; font-size: 18px; }
  .top nav a { text-decoration: underline; text-decoration-color: var(--yellow); text-decoration-thickness: 3px; }
  h1 { font-family: var(--display); font-weight: 700; font-size: clamp(40px, 6.4vw, 78px); line-height: .98; margin-top: 36px; max-width: 20ch; }
  .lead { font-size: clamp(18px, 2vw, 21px); line-height: 1.45; margin-top: 18px; max-width: 64ch; }
  .verdict { margin-top: 28px; border: 2px solid var(--ink); background: #fff; display: grid; grid-template-columns: 240px 1fr; }
  .verdict > b { font-family: var(--display); font-weight: 700; font-size: clamp(30px, 3.6vw, 40px); line-height: 1; background: var(--yellow); padding: 18px 20px; border-right: 2px solid var(--ink); }
  .verdict > div { padding: 16px 20px 18px; }
  .vtext { font-size: clamp(17px, 1.9vw, 20px); line-height: 1.45; max-width: 62ch; }
  .evidence { margin-top: 16px; display: flex; flex-wrap: wrap; gap: 10px 36px; }
  .evidence b { display: block; font-family: var(--display); font-weight: 700; font-size: 44px; line-height: 1; font-variant-numeric: tabular-nums; }
  .evidence span { display: block; font-size: 14.5px; color: var(--soft); max-width: 22ch; }
  .rule { margin-top: 14px; font-size: 14px; color: var(--soft); max-width: none; }
  @media (max-width: 640px) { .verdict { grid-template-columns: 1fr; } .verdict > b { border-right: 0; border-bottom: 2px solid var(--ink); } }
  .entry { margin-top: 28px; border: 2px solid var(--ink); background: #fff; display: grid; grid-template-columns: 240px 1fr; }
  .entry > b { font-family: var(--display); font-weight: 700; font-size: 30px; line-height: 1; background: var(--blue); padding: 18px 20px; border-right: 2px solid var(--ink); }
  .entry > div { padding: 16px 20px 18px; }
  .entry .plain { font-size: clamp(18px, 2vw, 22px); font-weight: 500; line-height: 1.4; }
  .entry p + p { margin-top: 8px; font-size: 15.5px; color: var(--soft); max-width: none; }
  @media (max-width: 640px) { .entry { grid-template-columns: 1fr; } .entry > b { border-right: 0; border-bottom: 2px solid var(--ink); } }
  .ruling { margin-top: 44px; padding-top: 18px; border-top: 2px solid var(--ink); }
  h2 { font-family: var(--display); font-weight: 700; font-size: 34px; line-height: 1.02; margin-bottom: 10px; }
  .ruling p { max-width: 72ch; margin-top: 8px; }
  .ruling p.call { background: var(--yellow); padding: 6px 10px; }
  .ruling pre { margin-top: 10px; font-family: var(--code); font-size: 13.5px; background: var(--faint); padding: 10px 14px; overflow-x: auto; }
  .ruling .from { font-size: 14px; color: var(--soft); }
  .qs { margin-top: 44px; border-top: 2px solid var(--ink); }
  .q { display: grid; grid-template-columns: 300px 1fr; gap: 10px 36px; padding: 22px 0 24px; border-bottom: 1px solid var(--rule); align-items: start; }
  .qhead h3 { font-family: var(--display); font-weight: 700; font-size: 28px; line-height: 1; }
  .qhead p { font-size: 15.5px; color: var(--soft); margin-top: 4px; }
  .qhead code { display: inline-block; margin-top: 8px; font-size: 12.5px; white-space: normal; word-break: break-all; }
  .field { position: relative; height: 44px; margin: 40px 0 44px; border: 2px solid var(--ink); background:
    linear-gradient(90deg, transparent calc(50% - 1.5px), var(--ink) calc(50% - 1.5px), var(--ink) calc(50% + 1.5px), transparent calc(50% + 1.5px)),
    repeating-linear-gradient(90deg, transparent 0, transparent calc(10% - 1px), var(--rule) calc(10% - 1px), var(--rule) 10%), #fff; }
  .field .gap { position: absolute; top: 0; bottom: 0; background: repeating-linear-gradient(135deg, var(--yellow) 0 5px, transparent 5px 11px); mix-blend-mode: multiply; }
  .field .mk { position: absolute; top: -9px; bottom: -9px; width: 5px; margin-left: -2.5px; background: var(--ink); }
  .field .mk b { position: absolute; left: 50%; transform: translateX(-50%); white-space: nowrap; font-family: var(--display); font-weight: 700; font-size: 26px; line-height: 1; font-variant-numeric: tabular-nums; padding: 1px 6px; }
  .field .mk.most b { bottom: calc(100% + 3px); background: var(--yellow); }
  .field .mk.least b { top: calc(100% + 3px); background: var(--blue); }
  .numbers { font-size: 16px; }
  .y { background: var(--yellow); padding: 0 5px; font-weight: 600; } .b { background: var(--blue); padding: 0 5px; font-weight: 600; }
  .warn { margin-top: 8px; border: 2px solid var(--ink); background: var(--pink); padding: 6px 12px; font-weight: 500; font-size: 15.5px; display: inline-block; }
  .nofield { margin: 12px 0; border: 2px solid var(--ink); background: var(--faint); padding: 12px 14px; font-size: 16px; }
  @media (max-width: 760px) { .q { grid-template-columns: 1fr; } }
  .tables { margin-top: 44px; padding-top: 18px; border-top: 2px solid var(--ink); display: grid; grid-template-columns: 1fr 1fr; gap: 36px; }
  @media (max-width: 860px) { .tables { grid-template-columns: 1fr; } }
  .tables h2 { font-size: 28px; }
  .tables code { display: block; margin: 6px 0 10px; font-size: 12.5px; white-space: normal; word-break: break-all; }
  table { border-collapse: collapse; width: 100%; font-size: 15.5px; }
  th { text-align: left; font-family: var(--display); font-weight: 600; font-size: 18px; padding: 6px 10px 6px 0; border-bottom: 2px solid var(--ink); vertical-align: bottom; }
  td { padding: 7px 10px 7px 0; border-bottom: 1px solid var(--rule); vertical-align: top; font-variant-numeric: tabular-nums; }
  .num { text-align: right; }
  .not { margin-top: 28px; font-size: 16.5px; border-left: 5px solid var(--ink); padding-left: 14px; max-width: 70ch; }
  .teams { margin-top: 44px; padding-top: 18px; border-top: 2px solid var(--ink); }
  .teams h2 { font-size: 28px; }
  .teams code { display: block; margin: 6px 0 10px; font-size: 12.5px; white-space: normal; word-break: break-all; }
  .teams p { font-size: 15.5px; color: var(--soft); max-width: 90ch; margin-bottom: 14px; }
  #teamgrid th { white-space: nowrap; }
  #teamgrid td.few { color: var(--soft); font-size: 13.5px; }
  #teamgrid tr.all td { font-weight: 600; border-bottom: 2px solid var(--ink); }
  #teamgrid .sum { border-left: 2px solid var(--ink); padding-left: 12px; }
  footer { margin-top: 56px; padding-top: 14px; border-top: 4px solid var(--ink); font-size: 14.5px; color: var(--soft); }
  footer p { max-width: 90ch; }
</style>
</head>
<body>
<main>
<div class="top"><a href="${META_SITE}/">The Monday Morning Agent</a><nav><a href="${META_SITE}/episode-2/">Episode 2</a><a href="${META_SITE}/episode-2/map.html">Where we are</a><a href="${META_SITE}/episode-2/definitions.html">Five definitions</a><a href="${META_SITE}/episode-2/#terms">Terms</a><a href="${META_SITE}/episode-2/explorer.html">Change the definition</a><a href="${META_SITE}/episode-2/tool.html">The tool</a><a href="https://github.com/ismayc/monday-morning-agent/tree/main/dictionary">The dictionary</a><a href="https://github.com/ismayc/monday-morning-agent">The repo</a></nav></div>
<h1>${esc(title)}</h1>
<p class="lead">${lead}</p>
${headline}
<div class="entry"><b>Measured with</b><div>
<p class="plain">"${esc(dict.plainWords)}"</p>
<p>${esc(dict.file)}, written ${esc(dict.written)}${dict.by ? ` by ${esc(dict.by)}` : ''}. Rules: ${esc(dict.ruleWords.join('; '))}; ${dict.rules.yardsToGoMax} or fewer yards to go. Compared with ${esc(dict.comparedWith)}.${dict.cannotSee ? ` Cannot see: ${esc(dict.cannotSee)}.` : ''}</p>
<p>The name search first: <code>${esc(search.command)}</code> found the words in ${fmt(search.out.matched)} of ${fmt(search.out.searched)} descriptions${search.out.matched ? '' : '. The play has no name in the data; the definition above is how the tool finds it'}.</p>
</div></div>
<div class="qs">
${answers.map(rowHtml).join('\n')}
</div>
<div class="tables">
<div><h2>By season</h2><code>${esc(bySeason.command)}</code><table><thead><tr><th>Season</th><th class="num">Defined plays</th><th class="num">Rate</th><th class="num">Other rushes</th><th class="num">Rate</th><th class="num">Gap</th></tr></thead><tbody>${byRows(bySeason, 'season')}</tbody></table></div>
<div><h2>By team</h2><code>${esc(byTeam.command)}</code><table><thead><tr><th>Team</th><th class="num">Defined plays</th><th class="num">Rate</th><th class="num">Other rushes</th><th class="num">Rate</th><th class="num">Gap</th></tr></thead><tbody>${byRows(byTeam, 'team')}</tbody></table><p style="margin-top:8px;font-size:14px;color:var(--soft)">Teams with ${byTeam.out.by.minDefinedPlays} or more plays matching the definition, most first.</p></div>
</div>
${teamGrid}
<p class="not"><strong>Not on this sheet: why, and whether.</strong> Every gap here is how often each kind of play converted in the plays kept. It does not say why the play converts, who pushed, or whether anyone was hurt, and it does not say what the rule should be.</p>
${rulingBlock}
<footer><p>Made ${esc(new Date().toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' }))} by season-sheet.mjs, which ran query-plays.mjs ${answers.length + 3 + years.length} times (the command under each question) and wrote down what it printed. Seasons on file: ${esc(weeks)}. Play-by-play data from nflverse, CC BY 4.0. Part of The Monday Morning Agent, an O'Reilly live series hosted by Chester Ismay.</p></footer>
</main>
</body>
</html>
`
mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, html)
console.log(`season-sheet: wrote ${OUT} (${SEASONS}, entry ${PLAY}; ${answers.filter(a => a.out.result.defined.rate !== null).length} of ${answers.length} questions with a result; latest game ${latest || 'none'}; verdict "${V.word}")`)
if (OPEN) {
  try { execFileSync(process.platform === 'darwin' ? 'open' : 'xdg-open', [OUT]) } catch { console.error('season-sheet: could not open the page; open it by hand') }
}
