#!/usr/bin/env node
// season-sheet.mjs: one page of what the plays say about long field goals, for a set of
// seasons, made by running the tool and writing down what it printed. The appendix of
// episode 3: no minutes in the build, for the host to go over as he wishes.
//
//   node ./season-sheet.mjs                          five seasons, 2021 to 2025
//   node ./season-sheet.mjs --seasons 2026           this season, against the five-season baseline
//   node ./season-sheet.mjs --seasons 2026 --open    and open it in the browser
//   node ./season-sheet.mjs --seasons 2026 --out ../docs/episode-3/season-sheet-2026.html
//   node ./season-sheet.mjs --ruling rulings/ruling-<stamp>.md    quote the agent's on-air ruling at the end
//
// The page asks query-plays.mjs the same questions every time: the search by name, then
// the defined kick against every other field goal attempt, season by season, under six
// situations (every game, the regular season, the playoffs, the four distance bands, every
// field goal at any distance, and the team that tried the most), each a table of the
// tool's own numbers with its warnings under it. The chart is drawn by the chart
// renderer (../charts/render-chart.mjs) from a spec this page writes into a scratch
// folder, under the standard, so the picture here is the same picture the agent draws on
// air. Nothing is computed here except the verdict, which compares two rows the tool
// printed.
//
// It measures with the dictionary entry named by --play (default long-field-goal), read
// from the dictionary folder (ANALYST_DICT_DIR, default ../dictionary), and prints the
// entry at the top of the page, because a number without its definition is not a number.
// The default output is rulings/season-sheet-<seasons>.html, beside the runs; --out puts
// it anywhere, which is how it gets published to the site after the show.
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const DIR = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const flag = (name, dflt) => { const i = args.indexOf(name); return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : dflt }
const SEASONS = flag('--seasons', '2021-2025')
const PLAY = flag('--play', 'long-field-goal')
const OPEN = args.includes('--open')
const RULING = flag('--ruling', '')
const OUT = resolve(flag('--out', join(DIR, 'rulings', `season-sheet-${SEASONS}.html`)))
const BASELINE = '2021-2025'
const now = new Date()
const CURRENT = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1
const thisSeason = !SEASONS.includes('-') && Number(SEASONS) >= 2026

const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const fmt = (n) => Number(n).toLocaleString('en-US')
const pct = (x) => x === null || x === undefined ? 'n/a' : (100 * x).toFixed(1) + '%'
const run = (a) => JSON.parse(execFileSync('node', [join(DIR, 'query-plays.mjs'), ...a, '--json'], { encoding: 'utf8', env: process.env, maxBuffer: 64 * 1024 * 1024 }))

// The situations. Each is the trend under one set of flags; the 2026 sheet runs each one
// twice, for the baseline and for this season, and shows the baseline row first.
const QUESTIONS = [
  { key: 'all', title: 'Every game', sub: 'Regular season and playoffs, every team: the defined kick against every other field goal attempt.', args: [] },
  { key: 'reg', title: 'Regular season only', sub: 'Leave the playoffs out.', args: ['--type', 'REG'] },
  { key: 'post', title: 'Playoffs only', sub: 'Thirteen games a season, the kicks that decide them.', args: ['--type', 'POST'] },
  { key: 'bands', title: 'By distance', sub: 'The defined kicks in the chart standard\'s four bands, so one distance cannot hide behind the others.', args: ['--bands'], bands: true },
  { key: 'every', title: 'Every field goal, at any distance', sub: 'The same trend for all kicks, measured with the entry that covers every distance.', play: 'field-goal', args: [] },
]
const seasonsOf = (q) => thisSeason ? [BASELINE, SEASONS] : [SEASONS]
const ask = (q, seasons) => {
  const a = ['--trend', q.play || PLAY, '--seasons', seasons, ...q.args]
  return { seasons, command: 'node ./query-plays.mjs ' + a.join(' '), out: run(a) }
}
const search = { command: `node ./query-plays.mjs --search "field goal" --seasons ${SEASONS}`, out: run(['--search', 'field goal', '--seasons', SEASONS]) }
const answers = QUESTIONS.map(q => ({ ...q, runs: seasonsOf(q).map(s => ask(q, s)) }))

// The team that tried the most: the tool has no --by team for a trend, so the sheet asks
// --team once per club for the seasons on the page and keeps the five with the most
// defined kicks. Thirty-two short runs; each is the same command with one flag.
const TEAMS = ['ARI', 'ATL', 'BAL', 'BUF', 'CAR', 'CHI', 'CIN', 'CLE', 'DAL', 'DEN', 'DET', 'GB', 'HOU', 'IND', 'JAX', 'KC', 'LA', 'LAC', 'LV', 'MIA', 'MIN', 'NE', 'NO', 'NYG', 'NYJ', 'PHI', 'PIT', 'SEA', 'SF', 'TB', 'TEN', 'WAS']
const byTeam = TEAMS.map(t => ({ team: t, out: run(['--trend', PLAY, '--seasons', SEASONS, '--team', t]) }))
  .map(r => ({ team: r.team, all: r.out.all, games: r.out.all.games }))
  .sort((a, b) => b.all.defined.attempts - a.all.defined.attempts)
const topTeams = byTeam.slice(0, 5)

const main = answers[0].runs[answers[0].runs.length - 1].out      // this page's seasons, every game
const base = thisSeason ? answers[0].runs[0].out : null           // the five-season baseline, on the 2026 sheet
const dict = main.dictionary
const latest = main.coverage.latestGameDate || ''
const longDate = (iso) => iso ? new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : ''
const weeks = Object.entries(main.coverage.weeksBySeason).map(([s, w]) => `${s}: ${w}`).join('; ')

// The chart, under the standard: a spec written to a scratch folder, drawn by the
// renderer, read back. The standard's rule 1 says every season on file, so both sheets
// carry the same six-season picture; the 2026 bar is gray on it.
const scratch = mkdtempSync(join(tmpdir(), 'season-sheet-'))
const specName = `${PLAY}-trend`
const spec = { name: specName, written: now.toISOString().slice(0, 10), by: 'season-sheet.mjs, the appendix page', question: 'Are kickers making more of their long field goals than they did in 2021?', tool: 'episode-3/query-plays.mjs', command: `--trend ${PLAY} --seasons 2021-${CURRENT}` }
writeFileSync(join(scratch, `${specName}.json`), JSON.stringify(spec, null, 2) + '\n')
let chartSvg = '', chartLog = ''
try {
  chartLog = execFileSync('node', [join(DIR, '..', 'charts', 'render-chart.mjs'), join(scratch, `${specName}.json`)], { encoding: 'utf8', env: { ...process.env, ANALYST_CHART_DIR: scratch } })
  chartSvg = readFileSync(join(scratch, `${specName}.svg`), 'utf8').replace(/<\?xml[^>]*>/, '')
} catch (err) {
  chartLog = String(err.stderr || err.message)
}
rmSync(scratch, { recursive: true, force: true })

// The verdict on the claim, by a rule written here so anyone can disagree with it. "Too
// good now" rests on kickers making more of their long kicks than they did. So the test
// compares the first and last complete seasons on the five-season sheet (2021 and 2025),
// or this season against the five-season baseline on the 2026 sheet: the make rate, in
// points, and the tries per game, as a ratio.
//   - fewer than 100 defined kicks in the later row: too few kicks to rule;
//   - the rate up 5 points or more: holds, they make more of them;
//   - the rate within 3 points and tries per game up by a fifth or more: does not hold as stated, tried more, made the same;
//   - the rate within 3 points and tries flat: does not hold, nothing moved;
//   - the rate down 5 points or more: the opposite;
//   - anything between: mixed, read the tables.
// Whether kickers are "too good" is not on this sheet. No rule here can settle it.
const rowsMain = main.rows
const early = thisSeason ? base.all : rowsMain[0]
const late = thisSeason ? main.rows[0] : rowsMain[rowsMain.length - 1]
const earlyName = thisSeason ? '2021 to 2025' : rowsMain[0].season
const lateName = thisSeason ? SEASONS : rowsMain[rowsMain.length - 1].season
const rateDelta = early.defined.rate === null || late.defined.rate === null ? null : +(100 * late.defined.rate - 100 * early.defined.rate).toFixed(1)
const pgRatio = early.defined.perGame && late.defined.perGame ? late.defined.perGame / early.defined.perGame : null
function verdict() {
  if (rateDelta === null || pgRatio === null) return { word: 'No ruling yet', text: 'One of the rows the ruling needs has no result, so there is nothing to compare. The tables below say what there is.' }
  const line = `the defined kick was made ${pct(early.defined.rate)} of ${fmt(early.defined.attempts)} attempts in ${earlyName} and ${pct(late.defined.rate)} of ${fmt(late.defined.attempts)} in ${lateName}, tried ${early.defined.perGame.toFixed(2)} and ${late.defined.perGame.toFixed(2)} times per game`
  if (late.defined.attempts < 100) return { word: 'Too few kicks to rule', text: `${fmt(late.defined.attempts)} kicks match the definition in ${lateName} so far; one kick moves the rate by ${(100 / Math.max(late.defined.attempts, 1)).toFixed(1)} points. In them, ${line}. The sample cannot carry a ruling yet. Ask again in a few weeks.` }
  if (rateDelta >= 5) return { word: 'Holds: they make more of them', text: `${line[0].toUpperCase()}${line.slice(1)}: the rate is up ${rateDelta.toFixed(1)} points. Whether that makes them "too good" is a judgment about the game people want to watch, and no number on this sheet settles it.` }
  if (Math.abs(rateDelta) < 3 && pgRatio >= 1.2) return { word: 'Does not hold as stated: tried more, made the same', text: `${line[0].toUpperCase()}${line.slice(1)}. The rate moved ${rateDelta >= 0 ? 'up' : 'down'} ${Math.abs(rateDelta).toFixed(1)} points, which is about the same, while the tries per game grew by ${Math.round(100 * (pgRatio - 1))} percent. What changed is how often coaches let their kickers try from that far, not how often the kick goes through.` }
  if (Math.abs(rateDelta) < 3) return { word: 'Does not hold: nothing moved', text: `${line[0].toUpperCase()}${line.slice(1)}. Neither the rate nor the tries per game moved by much.` }
  if (rateDelta <= -5) return { word: 'The opposite: made less often', text: `${line[0].toUpperCase()}${line.slice(1)}: the rate is down ${Math.abs(rateDelta).toFixed(1)} points.` }
  return { word: 'Mixed', text: `${line[0].toUpperCase()}${line.slice(1)}: the rate moved ${rateDelta.toFixed(1)} points and the tries per game by ${Math.round(100 * (pgRatio - 1))} percent. Neither reading is clean; the tables are the evidence.` }
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

// One table per situation: a row per season the run covered, then its "all" row; on the
// 2026 sheet the baseline run's "all" row comes first, as the thing this season is read against.
const rowHtml = (r, label, cls = '') => `<tr class="${cls}"><td>${esc(label)}${r.inProgress ? ` <span class="prog">in progress, weeks ${esc(r.weeks)}</span>` : ''}</td><td class="num">${fmt(r.games)}</td><td class="num">${fmt(r.defined.made)} of ${fmt(r.defined.attempts)}</td><td class="num"><span class="y">${pct(r.defined.rate)}</span></td><td class="num">${r.defined.perGame === null ? 'n/a' : r.defined.perGame.toFixed(2)}</td><td class="num">${fmt(r.other.made)} of ${fmt(r.other.attempts)}</td><td class="num"><span class="b">${pct(r.other.rate)}</span></td><td class="num">${r.gap === null ? 'n/a' : (100 * r.gap).toFixed(1)}</td></tr>`
const bandHtml = (r, label, bands, cls = '') => `<tr class="${cls}"><td>${esc(label)}</td>${bands.map(b => { const v = r.bands[b]; return `<td class="num">${v.attempts ? `<span class="y">${pct(v.rate)}</span> of ${fmt(v.attempts)}` : 'none'}</td>` }).join('')}</tr>`
function tableHtml(a) {
  const warn = []
  const body = []
  for (const r of a.runs) {
    const o = r.out
    for (const w of o.warnings) if (!/^IN PROGRESS/.test(w)) warn.push(w.replace('SMALL SAMPLE', 'Small sample').replace('NO RESULT', 'No result'))
    const baselineRun = thisSeason && r.seasons === BASELINE
    const none = `<tr><td>${esc(r.seasons)}</td><td colspan="${a.bands ? o.bands.length : 7}" class="none">No games in the plays kept yet, so no row.</td></tr>`
    if (a.bands) {
      if (baselineRun) body.push(bandHtml(o.all, '2021 to 2025, all', o.bands, 'all base'))
      else if (!o.rows.length) body.push(none)
      else { for (const row of o.rows) body.push(bandHtml(row, row.season, o.bands)); if (o.rows.length > 1) body.push(bandHtml(o.all, 'all', o.bands, 'all')) }
    } else if (baselineRun) body.push(rowHtml(o.all, '2021 to 2025, all', 'all base'))
    else if (!o.rows.length) body.push(none)
    else { for (const row of o.rows) body.push(rowHtml(row, row.season)); if (o.rows.length > 1) body.push(rowHtml(o.all, 'all', 'all')) }
  }
  const head = a.bands
    ? `<tr><th>Season</th>${a.runs[0].out.bands.map(b => `<th class="num">${esc(b)}</th>`).join('')}</tr>`
    : '<tr><th>Season</th><th class="num">Games</th><th class="num">Defined kicks made</th><th class="num">Rate</th><th class="num">Tried per game</th><th class="num">Other kicks made</th><th class="num">Rate</th><th class="num">Gap</th></tr>'
  const noOther = !a.bands && a.runs.every(r => r.out.all.other.attempts === 0)
  return `<div class="q">
<div class="qhead"><h3>${esc(a.title)}</h3><p>${esc(a.sub)}</p>${a.runs.map(r => `<code>${esc(r.command)}</code>`).join('')}</div>
<div class="qbody"><div class="scroll"><table><thead>${head}</thead><tbody>${body.join('\n')}</tbody></table></div>${noOther ? '<p class="numbers">The entry covers every distance, so there is no other group to compare with; the gap column is empty by design.</p>' : ''}${warn.map(w => `<p class="warn">${esc(w)}</p>`).join('')}</div>
</div>`
}
const teamsHtml = `<div class="q">
<div class="qhead"><h3>Who tried the most</h3><p>The five teams with the most defined kicks over ${esc(SEASONS.replace('-', ' to '))}, each from the same command with one flag.</p><code>node ./query-plays.mjs --trend ${esc(PLAY)} --seasons ${esc(SEASONS)} --team ${esc(topTeams[0]?.team || 'KC')}</code> (and each of the ${TEAMS.length} teams)</div>
<div class="qbody"><div class="scroll"><table><thead><tr><th>Team</th><th class="num">Games</th><th class="num">Defined kicks made</th><th class="num">Rate</th><th class="num">Tried per game</th><th class="num">Other kicks made</th><th class="num">Rate</th><th class="num">Gap</th></tr></thead><tbody>${topTeams.map(t => rowHtml(t.all, t.team)).join('\n')}</tbody></table></div><p class="numbers">Every team is in the "Every game" table above; these five tried the defined kick most often. A team's own rate rests on a few dozen kicks a season, so read the counts before the rates.</p></div>
</div>`

const title = thisSeason
  ? `This season so far: ${SEASONS}, through ${longDate(latest) || 'no games yet'}`
  : `"Kickers are too good now." Five seasons, ${SEASONS.replace('-', ' to ')}.`
const lead = thisSeason
  ? `The same questions as the five-season sheet, asked of this season alone and read against the five complete seasons before it: weeks ${esc(weeks.replace(/^\d+: /, ''))}, through the games of ${esc(longDate(latest))}. The groups are small and the tool says so wherever it matters.`
  : `Six situations, each answered by the one tool from every play of ${SEASONS.replace('-', ' through ')}, measuring with the definition below, one row per season. Yellow is the defined kick, blue is every other field goal attempt, and the chart is the one the agent's renderer draws under the chart standard.`
const headline = `<div class="verdict"><b>${esc(V.word)}</b><div>
<p class="vtext">${esc(V.text)}</p>
${rateDelta !== null ? `<div class="evidence"><div><b>${fmt(search.out.matched)}</b><span>of ${fmt(search.out.searched)} play descriptions say "field goal"</span></div><div><b>${rateDelta > 0 ? '+' : ''}${rateDelta.toFixed(1)}</b><span>points: the rate, ${esc(lateName)} against ${esc(earlyName)}</span></div><div><b>${late.defined.perGame.toFixed(2)}</b><span>tried per game in ${esc(lateName)}, against ${early.defined.perGame.toFixed(2)}</span></div></div>` : ''}
<p class="rule">The verdict follows a rule written in season-sheet.mjs, so you can disagree with it. It compares ${thisSeason ? 'this season with the five complete seasons before it' : 'the first and last complete seasons on the page'}: under 100 defined kicks in the later row is too few to rule; a rate up 5 points or more holds; a rate within 3 points while tries per game grew by a fifth or more does not hold as stated; a rate within 3 points with flat tries does not hold; a rate down 5 or more is the opposite; between is mixed. Whether kickers are "too good" is not on this sheet. This is the page's rule, not the agent's. Every number is the tool's.</p>
</div></div>`
const chartBlock = chartSvg
  ? `<section class="chart"><h2>The picture, under the standard</h2><figure>${chartSvg}<figcaption>Drawn by <code>charts/render-chart.mjs</code> from a spec this page wrote (<code>${esc(spec.command)}</code>), under <code>charts/STANDARD.md</code>. The renderer ran the tool itself for the rows; nothing on the chart was typed. Every season on file is on it, so the five-season sheet and the 2026 sheet carry the same picture, with the season in progress in gray.</figcaption></figure></section>`
  : `<section class="chart"><h2>The picture, under the standard</h2><p class="warn">The renderer drew nothing: ${esc(chartLog.trim().split('\n')[0])}</p></section>`

const META_SITE = 'https://ismayc.github.io/monday-morning-agent'
const metaUrl = `${META_SITE}/episode-3/season-sheet-${SEASONS}.html`
const metaDesc = thisSeason
  ? `Six situations for the long field goal, asked of the ${SEASONS} season through the games of ${longDate(latest)} against the five seasons before it, measured with the dictionary's definition, with the tool's own numbers, the chart under the standard, and a verdict by a rule stated on the page.`
  : `Six situations for the long field goal, answered from every play of ${SEASONS.replace('-', ' through ')} with the dictionary's definition, with the tool's own numbers, the chart under the standard, and a verdict by a rule stated on the page.`
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
<meta property="og:image" content="${META_SITE}/episode-3/og-image.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Kickers are too good now. The make rate on long field goals, flat for six seasons; the tries per game, up. A claim about a trend needs a picture, and the picture follows written rules.">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(metaDesc)}">
<meta name="twitter:image" content="${META_SITE}/episode-3/og-image.png">
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
  .verdict { margin-top: 28px; border: 2px solid var(--ink); background: #fff; display: grid; grid-template-columns: 260px 1fr; }
  .verdict > b { font-family: var(--display); font-weight: 700; font-size: clamp(26px, 3.2vw, 36px); line-height: 1; background: var(--yellow); padding: 18px 20px; border-right: 2px solid var(--ink); }
  .verdict > div { padding: 16px 20px 18px; }
  .vtext { font-size: clamp(17px, 1.9vw, 20px); line-height: 1.45; max-width: 62ch; }
  .evidence { margin-top: 16px; display: flex; flex-wrap: wrap; gap: 10px 36px; }
  .evidence b { display: block; font-family: var(--display); font-weight: 700; font-size: 44px; line-height: 1; font-variant-numeric: tabular-nums; }
  .evidence span { display: block; font-size: 14.5px; color: var(--soft); max-width: 22ch; }
  .rule { margin-top: 14px; font-size: 14px; color: var(--soft); max-width: none; }
  @media (max-width: 640px) { .verdict { grid-template-columns: 1fr; } .verdict > b { border-right: 0; border-bottom: 2px solid var(--ink); } }
  .entry { margin-top: 28px; border: 2px solid var(--ink); background: #fff; display: grid; grid-template-columns: 260px 1fr; }
  .entry > b { font-family: var(--display); font-weight: 700; font-size: 30px; line-height: 1; background: var(--blue); padding: 18px 20px; border-right: 2px solid var(--ink); }
  .entry > div { padding: 16px 20px 18px; }
  .entry .plain { font-size: clamp(18px, 2vw, 22px); font-weight: 500; line-height: 1.4; }
  .entry p + p { margin-top: 8px; font-size: 15.5px; color: var(--soft); max-width: none; }
  @media (max-width: 640px) { .entry { grid-template-columns: 1fr; } .entry > b { border-right: 0; border-bottom: 2px solid var(--ink); } }
  h2 { font-family: var(--display); font-weight: 700; font-size: 34px; line-height: 1.02; margin-bottom: 10px; }
  .chart { margin-top: 44px; padding-top: 18px; border-top: 2px solid var(--ink); }
  .chart figure { border: 2px solid var(--ink); background: #fff; padding: 6px; }
  .chart svg { width: 100%; height: auto; display: block; }
  .chart figcaption { font-size: 14.5px; color: var(--soft); padding: 8px 8px 4px; max-width: none; }
  .ruling { margin-top: 44px; padding-top: 18px; border-top: 2px solid var(--ink); }
  .ruling p { max-width: 72ch; margin-top: 8px; }
  .ruling p.call { background: var(--yellow); padding: 6px 10px; }
  .ruling pre { margin-top: 10px; font-family: var(--code); font-size: 13.5px; background: var(--faint); padding: 10px 14px; overflow-x: auto; }
  .ruling .from { font-size: 14px; color: var(--soft); }
  .qs { margin-top: 44px; border-top: 2px solid var(--ink); }
  .q { display: grid; grid-template-columns: 300px 1fr; gap: 10px 36px; padding: 22px 0 24px; border-bottom: 1px solid var(--rule); align-items: start; }
  .qhead h3 { font-family: var(--display); font-weight: 700; font-size: 28px; line-height: 1; }
  .qhead p { font-size: 15.5px; color: var(--soft); margin-top: 4px; }
  .qhead code { display: inline-block; margin-top: 8px; font-size: 12.5px; white-space: normal; word-break: break-all; }
  .numbers { font-size: 15px; color: var(--soft); margin-top: 10px; max-width: none; }
  .y { background: var(--yellow); padding: 0 5px; font-weight: 600; } .b { background: var(--blue); padding: 0 5px; font-weight: 600; }
  .warn { margin-top: 8px; border: 2px solid var(--ink); background: var(--pink); padding: 6px 12px; font-weight: 500; font-size: 15.5px; display: inline-block; }
  @media (max-width: 760px) { .q { grid-template-columns: 1fr; } }
  .scroll { overflow-x: auto; }
  table { border-collapse: collapse; width: 100%; font-size: 15.5px; }
  th { text-align: left; font-family: var(--display); font-weight: 600; font-size: 17px; padding: 6px 10px 6px 0; border-bottom: 2px solid var(--ink); vertical-align: bottom; }
  td { padding: 7px 10px 7px 0; border-bottom: 1px solid var(--rule); vertical-align: top; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .num { text-align: right; }
  tr.all td { font-weight: 600; border-top: 2px solid var(--ink); }
  tr.base td { background: var(--faint); font-weight: 600; }
  td.none { color: var(--soft); white-space: normal; }
  td .prog { display: block; font-size: 12.5px; color: var(--soft); font-weight: 400; white-space: normal; }
  .not { margin-top: 28px; font-size: 16.5px; border-left: 5px solid var(--ink); padding-left: 14px; max-width: 70ch; }
  footer { margin-top: 56px; padding-top: 14px; border-top: 4px solid var(--ink); font-size: 14.5px; color: var(--soft); }
  footer p { max-width: 90ch; }
</style>
</head>
<body>
<main>
<div class="top"><a href="${META_SITE}/">The Monday Morning Agent</a><nav><a href="${META_SITE}/episode-3/">Episode 3</a><a href="https://github.com/ismayc/monday-morning-agent/blob/main/charts/STANDARD.md">The chart standard</a><a href="https://github.com/ismayc/monday-morning-agent/tree/main/dictionary">The dictionary</a><a href="${META_SITE}/football.html">The game, explained</a><a href="https://github.com/ismayc/monday-morning-agent">The repo</a></nav></div>
<h1>${esc(title)}</h1>
<p class="lead">${lead}</p>
${headline}
<div class="entry"><b>Measured with</b><div>
<p class="plain">"${esc(dict.plainWords)}"</p>
<p>${esc(dict.file)}, written ${esc(dict.written)}${dict.by ? ` by ${esc(dict.by)}` : ''}. Rules: ${esc(dict.ruleWords.join('; '))}. Compared with ${esc(dict.comparedWith)}.${dict.cannotSee ? ` Cannot see: ${esc(dict.cannotSee)}.` : ''} A blocked kick counts as a miss.</p>
<p>The name search first: <code>${esc(search.command)}</code> found the words in ${fmt(search.out.matched)} of ${fmt(search.out.searched)} descriptions. Unlike the tush push, the kick has a name in the data; what it does not have is a distance band, and that is what the definition adds.</p>
</div></div>
${chartBlock}
<div class="qs">
${answers.map(tableHtml).join('\n')}
${teamsHtml}
</div>
<p class="not"><strong>Not on this sheet: why, and whether.</strong> Every rate here is how often each kind of kick was made in the plays kept, and every per-game count is how often it was tried. It does not say why a coach sent the kicker out, what the wind was doing, or whether anyone was "too good."</p>
${rulingBlock}
<footer><p>Made ${esc(now.toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' }))} by season-sheet.mjs, which ran query-plays.mjs ${1 + answers.reduce((n, a) => n + a.runs.length, 0) + TEAMS.length} times (the command under each question) and the chart renderer once, and wrote down what they printed. Seasons on file: ${esc(weeks)}. Play-by-play data from nflverse, CC BY 4.0. Part of The Monday Morning Agent, an O'Reilly live series hosted by Chester Ismay.</p></footer>
</main>
</body>
</html>
`
mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, html)
console.log(`season-sheet: wrote ${OUT} (${SEASONS}, entry ${PLAY}; ${answers.length + 1} situations; chart ${chartSvg ? 'drawn' : 'NOT drawn'}; latest game ${latest || 'none'}; verdict "${V.word}")`)
if (OPEN) {
  try { execFileSync(process.platform === 'darwin' ? 'open' : 'xdg-open', [OUT]) } catch { console.error('season-sheet: could not open the page; open it by hand') }
}
