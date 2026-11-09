#!/usr/bin/env node
// season-sheet.mjs: one page of what the plays say about the turnover battle, for a set of
// seasons, made by running the tool and writing down what it printed. The appendix of
// episode 4: no minutes in the build, for the host to go over as he wishes.
//
//   node ./season-sheet.mjs                          five seasons, 2021 to 2025
//   node ./season-sheet.mjs --seasons 2026           this season, against the five-season baseline
//   node ./season-sheet.mjs --seasons 2026 --open    and open it in the browser
//   node ./season-sheet.mjs --seasons 2026 --out ../docs/episode-4/season-sheet-2026.html
//   node ./season-sheet.mjs --ruling rulings/ruling-<stamp>.md --check rulings/check-<stamp>.md
//                                                    quote the agent's on-air ruling, and the fact-checker's check, at the end
//
// The page asks query-plays.mjs the same questions every time: the search by name, then
// the battle (in the games where one team was charged with fewer of the defined event, how
// often that team won), season by season, under five situations (every game, the regular
// season, the playoffs, first-half events only, events while the game was close), then the
// split of the event by the score at the snap, the read for which way it runs. Each is a
// table of the tool's own numbers with its warnings under it. The chart is drawn by the
// chart renderer (../charts/render-chart.mjs) from a spec this page writes into a scratch
// folder, under the standard, so the picture here is the same picture the agent draws on
// air. Nothing is computed here except the verdict, which compares rows the tool printed.
//
// It measures with the dictionary entry named by --event (default turnover), read from the
// dictionary folder (ANALYST_DICT_DIR, default ../dictionary), and prints the entry at the
// top of the page, because a number without its definition is not a number. The default
// output is rulings/season-sheet-<seasons>.html, beside the runs; --out puts it anywhere,
// which is how it gets published to the site after the show.
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const DIR = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const flag = (name, dflt) => { const i = args.indexOf(name); return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : dflt }
const SEASONS = flag('--seasons', '2021-2025')
const EVENT = flag('--event', 'turnover')
const OPEN = args.includes('--open')
const RULING = flag('--ruling', '')
const CHECK = flag('--check', '')
const OUT = resolve(flag('--out', join(DIR, 'rulings', `season-sheet-${SEASONS}.html`)))
const BASELINE = '2021-2025'
const now = new Date()
const CURRENT = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1
const thisSeason = !SEASONS.includes('-') && Number(SEASONS) >= 2026

const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const fmt = (n) => Number(n).toLocaleString('en-US')
const pct = (x) => x === null || x === undefined ? 'n/a' : (100 * x).toFixed(1) + '%'
const run = (a) => JSON.parse(execFileSync('node', [join(DIR, 'query-plays.mjs'), ...a, '--json'], { encoding: 'utf8', env: process.env, maxBuffer: 64 * 1024 * 1024 }))

// The situations. Each is the battle under one set of flags; the 2026 sheet runs each one
// twice, for the baseline and for this season, and shows the baseline row first.
const QUESTIONS = [
  { key: 'all', title: 'Every game', sub: 'Regular season and playoffs: in the games where one team was charged with fewer, how often did that team win?', args: [] },
  { key: 'reg', title: 'Regular season only', sub: 'Leave the playoffs out.', args: ['--type', 'REG'] },
  { key: 'post', title: 'Playoffs only', sub: 'Thirteen games a season, the ones everybody remembers.', args: ['--type', 'POST'] },
  { key: 'half', title: 'First-half events only', sub: 'Count only the giveaways before halftime, then ask who won the whole game. Fewer events, so more games come out equal.', args: ['--half', '1'] },
  { key: 'close', title: 'While the game was close', sub: 'Count only the giveaways while the score was within 8 points at the snap. A turnover by a team already down three scores does not count here.', args: ['--close', '8'] },
]
const seasonsOf = () => thisSeason ? [BASELINE, SEASONS] : [SEASONS]
const ask = (q, seasons) => {
  const a = ['--battle', EVENT, '--seasons', seasons, ...q.args]
  return { seasons, command: 'node ./query-plays.mjs ' + a.join(' '), out: run(a) }
}
const search = { command: `node ./query-plays.mjs --search "intercepted" --seasons ${SEASONS}`, out: run(['--search', 'intercepted', '--seasons', SEASONS]) }
const answers = QUESTIONS.map(q => ({ ...q, runs: seasonsOf().map(s => ask(q, s)) }))
const splits = seasonsOf().map(s => ({ seasons: s, command: `node ./query-plays.mjs --split ${EVENT} --seasons ${s}`, out: run(['--split', EVENT, '--seasons', s]) }))

const main = answers[0].runs[answers[0].runs.length - 1].out      // this page's seasons, every game
const base = thisSeason ? answers[0].runs[0].out : null           // the five-season baseline, on the 2026 sheet
const splitMain = splits[splits.length - 1].out
const dict = main.dictionary
const latest = main.coverage.latestGameDate || ''
const longDate = (iso) => iso ? new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : ''
const weeks = Object.entries(main.coverage.weeksBySeason).map(([s, w]) => `${s}: ${w}`).join('; ')

// The chart, under the standard: a spec written to a scratch folder, drawn by the
// renderer, read back. The standard's rule 1 says every season on file, so both sheets
// carry the same six-season picture; the 2026 point is gray on it.
const scratch = mkdtempSync(join(tmpdir(), 'season-sheet-'))
const specName = `${EVENT}-battle-trend`
const spec = { name: specName, written: now.toISOString().slice(0, 10), by: 'season-sheet.mjs, the appendix page', question: 'Does the team that wins the turnover battle win the game?', tool: 'episode-4/query-plays.mjs', command: `--battle ${EVENT} --seasons 2021-${CURRENT}` }
writeFileSync(join(scratch, `${specName}.json`), JSON.stringify(spec, null, 2) + '\n')
let chartSvg = '', chartLog = ''
try {
  chartLog = execFileSync('node', [join(DIR, '..', 'charts', 'render-chart.mjs'), join(scratch, `${specName}.json`)], { encoding: 'utf8', env: { ...process.env, ANALYST_CHART_DIR: scratch } })
  chartSvg = readFileSync(join(scratch, `${specName}.svg`), 'utf8').replace(/<\?xml[^>]*>/, '')
} catch (err) {
  chartLog = String(err.stderr || err.message)
}
rmSync(scratch, { recursive: true, force: true })

// The verdict on the claim, by a rule written here so anyone can disagree with it. "Win
// the turnover battle, win the game" is a claim about a record, so the test reads the
// record in every season on the page (or this season against the baseline): the share of
// decided games the team charged with fewer won. Then the split says which way it runs.
//   - fewer than 50 decided games in the latest row: too few games to rule;
//   - the rate at or above 65 percent in every row: holds as a record;
//   - every row above 55 but one or more under 65: holds, weakly;
//   - any row within 5 points of 50: does not hold;
//   - any row under 45: the opposite;
//   and the direction line: the event per 100 plays while trailing by 9 or more, divided by
//   the same while leading by 9 or more, over the seasons on the page. At 1.5 or more the
//   turnovers follow the score too, and the sheet says "not as a cause".
// Whether a turnover won a game is not on this sheet. No rule here can settle it.
const rowsMain = thisSeason ? [base.all, ...main.rows] : main.rows
const rowNames = thisSeason ? ['2021 to 2025', SEASONS] : main.rows.map(r => r.season)
const lateRow = rowsMain[rowsMain.length - 1]
const rates = rowsMain.map(r => r.defined.rate)
const states = splitMain.states || []
const trailing = splitMain.all.states[states[0]], leading = splitMain.all.states[states[states.length - 1]]
const ratio = trailing && leading && leading.per100 ? trailing.per100 / leading.per100 : null
function verdict() {
  if (rates.some(r => r === null)) return { word: 'No ruling yet', text: 'One of the rows the ruling needs has no result, so there is nothing to compare. The tables below say what there is.' }
  const lo = Math.min(...rates), hi = Math.max(...rates)
  const span = rowNames.length === 1 ? rowNames[0] : thisSeason ? `${rowNames[0]} and in ${rowNames[1]}` : `${rowNames[0]} to ${rowNames[rowNames.length - 1]}`
  const line = `the team charged with fewer ${EVENT.replace(/-/g, ' ')}s won ${pct(lo)} to ${pct(hi)} of decided games in ${span}, ${fmt(lateRow.decided)} decided games in ${rowNames[rowNames.length - 1]}`
  const dir = ratio === null ? '' : ` By the score at the snap, the event came ${trailing.per100.toFixed(2)} times per 100 plays while trailing by 9 or more and ${leading.per100.toFixed(2)} while leading by 9 or more${ratio >= 1.5 ? ', so some of the turnovers follow the deficit rather than cause it' : ', less than one and a half times as often, so this sheet does not add "not as a cause"'}.`
  if (lateRow.decided < 50) return { word: 'Too few games to rule', text: `${fmt(lateRow.decided)} decided games in ${rowNames[rowNames.length - 1]} so far; one game moves the rate by ${(100 / Math.max(lateRow.decided, 1)).toFixed(1)} percentage points. In them, ${line}. The sample cannot carry a ruling yet. Ask again in a few weeks.${dir}` }
  if (lo >= 0.65) return { word: ratio !== null && ratio >= 1.5 ? 'Holds as a record, not as a cause' : 'Holds as a record', text: `${line[0].toUpperCase()}${line.slice(1)}: about three of every four.${dir} Whether the turnovers won those games is not on this sheet.` }
  if (lo > 0.55) return { word: 'Holds, weakly', text: `${line[0].toUpperCase()}${line.slice(1)}: better than even in every row, under two of three in at least one.${dir}` }
  if (rates.some(r => r >= 0.45 && r <= 0.55)) return { word: 'Does not hold', text: `${line[0].toUpperCase()}${line.slice(1)}: in at least one row the team with fewer won about as often as it lost.${dir}` }
  if (lo < 0.45) return { word: 'The opposite', text: `${line[0].toUpperCase()}${line.slice(1)}: in at least one row the team with fewer lost more often than it won.${dir}` }
  return { word: 'Mixed', text: `${line[0].toUpperCase()}${line.slice(1)}. Neither reading is clean; the tables are the evidence.${dir}` }
}
const V = verdict()

function rulingHtml(md) {
  const out = []; let inCode = false, code = []
  for (const line of md.split('\n')) {
    if (/^```/.test(line)) { if (inCode) { out.push(`<pre>${esc(code.join('\n'))}</pre>`); code = [] } inCode = !inCode; continue }
    if (inCode) { code.push(line); continue }
    const t = line.replace(/^\s*[-*]\s+/, '').trim()
    if (t) out.push(`<p${/^\*\*(Ruling|Verdict):?\*\*/.test(t) ? ' class="call"' : ''}>${esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>')}</p>`)
  }
  return out.join('\n')
}
const rulingBlock = RULING ? `<section class="ruling"><h2>What the agent ruled on air</h2>${rulingHtml(readFileSync(RULING, 'utf8'))}<p class="from">From <code>${esc(RULING)}</code>.</p></section>` : ''
const checkBlock = CHECK ? `<section class="ruling"><h2>What the fact-checker said about it</h2><p class="from">A second agent, its own policy and a one-line allowlist, read the ruling with the claim, the tool's printouts, and the files written, and nothing else.</p>${rulingHtml(readFileSync(CHECK, 'utf8'))}<p class="from">From <code>${esc(CHECK)}</code>.</p></section>` : ''

// One table per situation: a row per season the run covered, then its "all" row; on the
// 2026 sheet the baseline run's "all" row comes first, as the thing this season is read against.
const rowHtml = (r, label, cls = '') => `<tr class="${cls}"><td>${esc(label)}${r.inProgress ? ` <span class="prog">in progress, weeks ${esc(r.weeks)}</span>` : ''}</td><td class="num">${fmt(r.games)}</td><td class="num">${fmt(r.decided)}</td><td class="num">${fmt(r.fewerWon)}</td><td class="num"><span class="y">${pct(r.defined.rate)}</span></td><td class="num">${fmt(r.equal)}</td><td class="num">${fmt(r.drawn)}</td><td class="num">${fmt(r.events)}</td><td class="num">${r.defined.perGame === null ? 'n/a' : r.defined.perGame.toFixed(2)}</td></tr>`
function tableHtml(a) {
  const warn = []
  const body = []
  for (const r of a.runs) {
    const o = r.out
    for (const w of o.warnings) if (!/^IN PROGRESS/.test(w)) warn.push(w.replace('SMALL SAMPLE', 'Small sample').replace('NO RESULT', 'No result').replace(/ points\./, ' percentage points.'))
    const baselineRun = thisSeason && r.seasons === BASELINE
    const none = `<tr><td>${esc(r.seasons)}</td><td colspan="8" class="none">No games in the plays kept yet, so no row.</td></tr>`
    if (baselineRun) body.push(rowHtml(o.all, '2021 to 2025, all', 'all base'))
    else if (!o.rows.length) body.push(none)
    else { for (const row of o.rows) body.push(rowHtml(row, row.season)); if (o.rows.length > 1) body.push(rowHtml(o.all, 'all', 'all')) }
  }
  const head = '<tr><th>Season</th><th class="num">Games</th><th class="num">Decided</th><th class="num">Fewer won</th><th class="num">Rate</th><th class="num">Equal</th><th class="num">Drawn</th><th class="num">Events</th><th class="num">Per game</th></tr>'
  return `<div class="q">
<div class="qhead"><h3>${esc(a.title)}</h3><p>${esc(a.sub)}</p>${a.runs.map(r => `<code>${esc(r.command)}</code>`).join('')}</div>
<div class="qbody"><div class="scroll"><table><thead>${head}</thead><tbody>${body.join('\n')}</tbody></table></div>${warn.map(w => `<p class="warn">${esc(w)}</p>`).join('')}</div>
</div>`
}
const splitCell = (c) => c.plays ? `<span class="y">${c.per100.toFixed(2)}</span> <span class="soft">${fmt(c.events)} of ${fmt(c.plays)}</span>` : 'none'
const splitRow = (r, label, cls = '') => `<tr class="${cls}"><td>${esc(label)}${r.inProgress ? ` <span class="prog">in progress, weeks ${esc(r.weeks)}</span>` : ''}</td>${states.map(s => `<td class="num">${splitCell(r.states[s])}</td>`).join('')}</tr>`
function splitHtml() {
  const body = [], warn = []
  for (const r of splits) {
    const o = r.out
    for (const w of o.warnings) if (!/^IN PROGRESS/.test(w)) warn.push(w.replace('SMALL SAMPLE', 'Small sample'))
    if (thisSeason && r.seasons === BASELINE) body.push(splitRow(o.all, '2021 to 2025, all', 'all base'))
    else { for (const row of o.rows) body.push(splitRow(row, row.season)); if (o.rows.length > 1) body.push(splitRow(o.all, 'all', 'all')) }
  }
  return `<div class="q">
<div class="qhead"><h3>Which way does it run?</h3><p>The same event per 100 rushes and passes, by the score at the snap. A team that is already behind gives the ball away more often, so some turnovers follow the score; this table cannot say how many.</p>${splits.map(r => `<code>${esc(r.command)}</code>`).join('')}</div>
<div class="qbody"><div class="scroll"><table><thead><tr><th>Season</th>${states.map(s => `<th class="num">${esc(s)}</th>`).join('')}</tr></thead><tbody>${body.join('\n')}</tbody></table></div><p class="numbers">Each cell: events per 100 plays, then the events and the plays behind it.</p>${warn.map(w => `<p class="warn">${esc(w)}</p>`).join('')}</div>
</div>`
}

const title = thisSeason
  ? `This season so far: ${SEASONS}, through ${longDate(latest) || 'no games yet'}`
  : `"Win the turnover battle, win the game." Five seasons, ${SEASONS.replace('-', ' to ')}.`
const lead = thisSeason
  ? `The same questions as the five-season sheet, asked of this season alone and read against the five complete seasons before it: weeks ${esc(weeks.replace(/^\d+: /, ''))}, through the games of ${esc(longDate(latest))}. The groups are small and the tool says so wherever it matters.`
  : `Six situations, each answered by the one tool from every play of ${SEASONS.replace('-', ' through ')}, measuring with the definition below, one row per season. Yellow is the team charged with fewer, and the chart is the one the agent's renderer draws under the chart standard.`
const headline = `<div class="verdict"><b>${esc(V.word)}</b><div>
<p class="vtext">${esc(V.text)}</p>
<div class="evidence"><div><b>${fmt(search.out.matched)}</b><span>of ${fmt(search.out.searched)} play descriptions say "intercepted"</span></div><div><b>${pct(lateRow.defined.rate)}</b><span>of ${fmt(lateRow.decided)} decided games in ${esc(rowNames[rowNames.length - 1])}, won by the team charged with fewer</span></div>${ratio !== null ? `<div><b>${trailing.per100.toFixed(2)} vs ${leading.per100.toFixed(2)}</b><span>${esc(EVENT.replace(/-/g, ' '))}s per 100 plays, trailing by 9 or more against leading by 9 or more</span></div>` : ''}</div>
<p class="rule">The verdict follows a rule written in season-sheet.mjs, so you can disagree with it. It reads the record in ${thisSeason ? 'this season and in the five complete seasons before it' : 'every season on the page'}: under 50 decided games in the latest row is too few to rule; at or above 65 percent in every row holds as a record; above 55 in every row holds weakly; any row within 5 percentage points of 50 does not hold; any row under 45 is the opposite. Then the split by the score at the snap: trailing at 1.5 times the leading rate or more, and the record is "not as a cause". Whether a turnover won a game is not on this sheet. This is the page's rule, not the agent's. Every number is the tool's.</p>
</div></div>`
const chartBlock = chartSvg
  ? `<section class="chart"><h2>The picture, under the standard</h2><figure>${chartSvg}<figcaption>Drawn by <code>charts/render-chart.mjs</code> from a spec this page wrote (<code>${esc(spec.command)}</code>), under <code>charts/STANDARD.md</code>. The renderer ran the tool itself for the rows; nothing on the chart was typed. Every season on file is on it, so the five-season sheet and the 2026 sheet carry the same picture, with the season in progress in gray.</figcaption></figure></section>`
  : `<section class="chart"><h2>The picture, under the standard</h2><p class="warn">The renderer drew nothing: ${esc(chartLog.trim().split('\n')[0])}</p></section>`

const META_SITE = 'https://ismayc.github.io/monday-morning-agent'
const metaUrl = `${META_SITE}/episode-4/season-sheet-${SEASONS}.html`
const metaDesc = thisSeason
  ? `Six situations for the turnover battle, asked of the ${SEASONS} season through the games of ${longDate(latest)} against the five seasons before it, measured with the dictionary's definition, with the tool's own numbers, the chart under the standard, and a verdict by a rule stated on the page.`
  : `Six situations for the turnover battle, answered from every play of ${SEASONS.replace('-', ' through ')} with the dictionary's definition, with the tool's own numbers, the chart under the standard, and a verdict by a rule stated on the page.`
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
<meta property="og:image" content="${META_SITE}/episode-4/og-image.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Win the turnover battle, win the game. The team charged with fewer turnovers won about three of every four decided games in every season; the turnovers come more often while trailing. A second agent checks the first.">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(metaDesc)}">
<meta name="twitter:image" content="${META_SITE}/episode-4/og-image.png">
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
  .evidence span { display: block; font-size: 14.5px; color: var(--soft); max-width: 24ch; }
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
  .soft { color: var(--soft); font-size: 13.5px; }
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
<div class="top"><a href="${META_SITE}/">The Monday Morning Agent</a><nav><a href="${META_SITE}/episode-4/">Episode 4</a><a href="https://github.com/ismayc/monday-morning-agent/blob/main/episode-4/checker.md">The fact-checker's policy</a><a href="https://github.com/ismayc/monday-morning-agent/tree/main/dictionary">The dictionary</a><a href="${META_SITE}/football.html">The game, explained</a><a href="https://github.com/ismayc/monday-morning-agent">The repo</a></nav></div>
<h1>${esc(title)}</h1>
<p class="lead">${lead}</p>
${headline}
<div class="entry"><b>Measured with</b><div>
<p class="plain">"${esc(dict.plainWords)}"</p>
<p>${esc(dict.file)}, written ${esc(dict.written)}${dict.by ? ` by ${esc(dict.by)}` : ''}. Rules: ${esc(dict.ruleWords.join('; '))}. Compared with ${esc(dict.comparedWith)}.${dict.cannotSee ? ` Cannot see: ${esc(dict.cannotSee)}.` : ''} A game is decided when the two counts differ and the game was not drawn.</p>
<p>The name search first: <code>${esc(search.command)}</code> found the word in ${fmt(search.out.matched)} of ${fmt(search.out.searched)} descriptions. Interceptions have a name in the data and a column; lost fumbles have a column; "turnover" itself appears only for turnovers on downs, which this entry does not count.</p>
</div></div>
${chartBlock}
<div class="qs">
${answers.map(tableHtml).join('\n')}
${splitHtml()}
</div>
<p class="not"><strong>Not on this sheet: why, and whether.</strong> Every rate here is how often the team charged with fewer won among the games kept, and every per-game count is how often the event happened. It does not say whether a turnover caused a loss, whether a fumble was forced, or what a team was thinking when it threw the pass.</p>
${rulingBlock}
${checkBlock}
<footer><p>Made ${esc(now.toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' }))} by season-sheet.mjs, which ran query-plays.mjs ${1 + answers.reduce((n, a) => n + a.runs.length, 0) + splits.length} times (the command under each question) and the chart renderer once, and wrote down what they printed. Seasons on file: ${esc(weeks)}. Play-by-play data from nflverse, CC BY 4.0. Part of The Monday Morning Agent, an O'Reilly live series hosted by Chester Ismay.</p></footer>
</main>
</body>
</html>
`
mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, html)
console.log(`season-sheet: wrote ${OUT} (${SEASONS}, entry ${EVENT}; ${answers.length + 1} situations; chart ${chartSvg ? 'drawn' : 'NOT drawn'}; latest game ${latest || 'none'}; verdict "${V.word}")`)
if (OPEN) {
  try { execFileSync(process.platform === 'darwin' ? 'open' : 'xdg-open', [OUT]) } catch { console.error('season-sheet: could not open the page; open it by hand') }
}
