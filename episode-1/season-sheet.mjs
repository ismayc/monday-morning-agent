#!/usr/bin/env node
// season-sheet.mjs: one page of what the plays say about establishing the run, for a set
// of seasons, made by running the tool and writing down what it printed.
//
//   node ./season-sheet.mjs                          five seasons, 2021 to 2025
//   node ./season-sheet.mjs --seasons 2026           this season, as far as it has been played
//   node ./season-sheet.mjs --seasons 2026 --open    and open it in the browser
//   node ./season-sheet.mjs --seasons 2026 --out ../docs/episode-1/season-sheet-2026.html
//
// The page asks query-plays.mjs the same eight questions every time (whole game, each
// half, close games, the regular season, the playoffs) and shows each answer as the
// win-rate bar from the episode pages, with the tool's own numbers and warnings under it.
// Nothing is computed here except one sentence that compares two gaps the tool printed.
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
const OPEN = args.includes('--open')
const RULING = flag('--ruling', '')   // a rulings/ruling-<stamp>.md to quote at the end: what the agent ruled on air
const OUT = resolve(flag('--out', join(DIR, 'rulings', `season-sheet-${SEASONS}.html`)))

// The eight questions. The first three are the episode's spine; the rest are the filters
// the room asks about first: close games, the regular season alone, the playoffs alone.
const QUESTIONS = [
  { key: 'whole', title: 'The whole game', sub: 'Every play, kickoff to the end.', args: [] },
  { key: 'h1', title: 'First half only', sub: '"Establish" means early.', args: ['--half', '1'] },
  { key: 'h2', title: 'Second half only', sub: 'Who is running now?', args: ['--half', '2'] },
  { key: 'close1', title: 'First half, score within 8 points', sub: 'Early, and one score apart.', args: ['--half', '1', '--margin', '8'] },
  { key: 'close2', title: 'Second half, score within 8 points', sub: 'Late, but still a game.', args: ['--half', '2', '--margin', '8'] },
  { key: 'tight2', title: 'Second half, score within 3 points', sub: 'Late, and a field goal apart.', args: ['--half', '2', '--margin', '3'] },
  { key: 'reg1', title: 'Regular season only, first half', sub: 'Leave the playoffs out.', args: ['--type', 'REG', '--half', '1'] },
  { key: 'post', title: 'Playoffs only, the whole game', sub: 'A few dozen games a season.', args: ['--type', 'POST'] },
]

const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const fmt = (n) => Number(n).toLocaleString('en-US')
const pct = (x) => (100 * x).toFixed(1) + '%'

const answers = QUESTIONS.map(q => {
  const a = ['--seasons', SEASONS, ...q.args]
  const out = JSON.parse(execFileSync('node', [join(DIR, 'query-plays.mjs'), ...a, '--json'], { encoding: 'utf8' }))
  return { ...q, command: 'node ./query-plays.mjs ' + a.join(' '), out }
})

const first = answers[0].out
const latest = first.teamGames.latestGameDate || ''
const longDate = (iso) => iso ? new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : ''
const weeks = Object.entries(first.teamGames.weeksBySeason).map(([s, w]) => `${s}: ${w}`).join('; ')
const thisSeason = !SEASONS.includes('-') && Number(SEASONS) >= 2026
const h1 = answers.find(a => a.key === 'h1').out, h2 = answers.find(a => a.key === 'h2').out
const close1 = answers.find(a => a.key === 'close1').out
const gaps = h1.gapTopMinusBottom !== null && h2.gapTopMinusBottom !== null
  ? { early: 100 * h1.gapTopMinusBottom, late: 100 * h2.gapTopMinusBottom, close: close1.gapTopMinusBottom === null ? null : 100 * close1.gapTopMinusBottom } : null
const perGroup = h1.result.length ? h1.result[0].teamGames : 0

// The verdict on the claim, by a rule written here so anyone can disagree with it:
//   - fewer than 100 team-games per group: too few games to rule;
//   - an early gap under 10 points and a late gap at least twice it: does not hold as
//     stated (the edge is late, where teams that are ahead run the clock);
//   - an early gap of 10 or more: holds in part, with the late gap for comparison;
//   - anything else: mixed, read the bars.
function verdict() {
  if (!gaps) return { word: 'No ruling yet', text: 'One of the two halves has no result, so there is no gap to compare. The bars below say what there is.' }
  if (perGroup < 100) return { word: 'Too few games to rule', text: `${fmt(perGroup)} team-games in each group so far; one game moves a win rate by ${(100 / perGroup).toFixed(1)} points. The early gap is ${gaps.early.toFixed(1)} points and the late gap ${gaps.late.toFixed(1)}, which is the five-season shape, but the sample cannot carry a ruling yet. Ask again in a few weeks.` }
  if (gaps.early < 10 && gaps.late >= 2 * gaps.early) return { word: 'Does not hold as stated', text: `Running early goes with a small edge: ${gaps.early.toFixed(1)} points between the teams that ran most and the teams that ran least in the first half${gaps.close !== null ? `, and ${gaps.close.toFixed(1)} points when the score was within eight` : ''}. Running late goes with a large one: ${gaps.late.toFixed(1)} points. Teams that are ahead run to use the clock, so the order runs the other way from the claim. Establishing the run is not what these plays reward; being ahead is.` }
  if (gaps.early >= 10) return { word: 'Holds in part', text: `Running early goes with a gap of ${gaps.early.toFixed(1)} points in these plays, against ${gaps.late.toFixed(1)} late. Read the close-game bar before saying more.` }
  return { word: 'Mixed', text: `The early gap is ${gaps.early.toFixed(1)} points and the late gap ${gaps.late.toFixed(1)}. Neither reading is clean; the bars are the evidence.` }
}
const V = verdict()

// The agent's ruling from a run, when one is given: bold labels, plain lines, one code block.
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
  const r = a.out.result, most = r.find(x => x.group === 'ran most'), least = r.find(x => x.group === 'ran least')
  const mids = r.filter(x => x !== most && x !== least)
  const warn = a.out.warnings.map(w => `<p class="warn">${esc(w.replace('SMALL SAMPLE: ', 'Small sample: ').replace('NO RESULT: ', 'No result: '))}</p>`).join('')
  const n = most ? most.teamGames : 0
  const field = most && least ? `<div class="field" role="img" aria-label="${esc(a.title)}: teams that ran most won ${pct(most.winRate)}, teams that ran least won ${pct(least.winRate)}">
<div class="gap" style="left:${(100 * Math.min(most.winRate, least.winRate)).toFixed(2)}%;width:${(100 * Math.abs(most.winRate - least.winRate)).toFixed(2)}%"></div>
${mids.map(x => `<div class="mk mid" style="left:${(100 * x.winRate).toFixed(2)}%"></div>`).join('')}
<div class="mk least" style="left:${(100 * least.winRate).toFixed(2)}%"><b>${pct(least.winRate)}</b></div><div class="mk most" style="left:${(100 * most.winRate).toFixed(2)}%"><b>${pct(most.winRate)}</b></div></div>`
    : '<div class="nofield">The filters left fewer team-games than groups, so the tool gives no result. That is an answer too.</div>'
  const line = most && least ? `<p class="numbers"><span class="y">${pct(most.winRate)}</span> ran most, <span class="b">${pct(least.winRate)}</span> ran least, a gap of <b>${(100 * a.out.gapTopMinusBottom).toFixed(1)} points</b>. ${fmt(n)} team-games in each group, ${fmt(a.out.teamGames.games)} games.</p>` : ''
  return `<div class="q">
<div class="qhead"><h3>${esc(a.title)}</h3><p>${esc(a.sub)}</p><code>${esc(a.command)}</code></div>
<div class="qbody">${field}${line}${warn}</div>
</div>`
}

const title = thisSeason
  ? `This season so far: ${SEASONS}, through ${longDate(latest) || 'no games yet'}`
  : `"You have to establish the run." Five seasons, ${SEASONS.replace('-', ' to ')}.`
const lead = thisSeason
  ? `The same eight questions as the five-season sheet, asked of this season alone: weeks ${esc(weeks.replace(/^\d+: /, ''))}, through the games of ${esc(longDate(latest))}. The groups are small and the tool says so wherever it matters.`
  : `Eight questions about establishing the run, each answered by the one tool from every play of ${SEASONS.replace('-', ' through ')}. Yellow is the quarter of teams that ran most, blue the quarter that ran least, and the yellow stretch between them is the gap in games won.`
const headline = `<div class="verdict"><b>${esc(V.word)}</b><div>
<p class="vtext">${esc(V.text)}</p>
${gaps ? `<div class="evidence"><div><b>${gaps.early.toFixed(1)}</b><span>points early: the first-half gap</span></div><div><b>${gaps.late.toFixed(1)}</b><span>points late: the second-half gap</span></div>${gaps.close !== null ? `<div><b>${gaps.close.toFixed(1)}</b><span>points early, score within 8</span></div>` : ''}</div>` : ''}
<p class="rule">The verdict follows a rule written in season-sheet.mjs, so you can disagree with it: under 100 team-games per group is too few to rule; an early gap under 10 points with a late gap at least twice it does not hold as stated; an early gap of 10 or more holds in part. Every number is the tool's.</p>
</div></div>`

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
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
  .top { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: baseline; gap: 6px 20px; padding: 18px 0 14px; border-bottom: 4px solid var(--ink); font-family: var(--display); font-weight: 600; font-size: 22px; }
  .top span + span { font-weight: 500; font-size: 19px; color: var(--soft); }
  h1 { font-family: var(--display); font-weight: 700; font-size: clamp(40px, 6.4vw, 78px); line-height: .98; margin-top: 36px; max-width: 20ch; }
  .lead { font-size: clamp(18px, 2vw, 21px); line-height: 1.45; margin-top: 18px; max-width: 64ch; }
  /* The verdict, read first: the word in the yellow cell, the evidence beside it. */
  .verdict { margin-top: 28px; border: 2px solid var(--ink); background: #fff; display: grid; grid-template-columns: 240px 1fr; }
  .verdict > b { font-family: var(--display); font-weight: 700; font-size: clamp(30px, 3.6vw, 40px); line-height: 1; background: var(--yellow); padding: 18px 20px; border-right: 2px solid var(--ink); }
  .verdict > div { padding: 16px 20px 18px; }
  .vtext { font-size: clamp(17px, 1.9vw, 20px); line-height: 1.45; max-width: 62ch; }
  .evidence { margin-top: 16px; display: flex; flex-wrap: wrap; gap: 10px 36px; }
  .evidence b { display: block; font-family: var(--display); font-weight: 700; font-size: 44px; line-height: 1; font-variant-numeric: tabular-nums; }
  .evidence span { display: block; font-size: 14.5px; color: var(--soft); max-width: 22ch; }
  .rule { margin-top: 14px; font-size: 14px; color: var(--soft); max-width: none; }
  @media (max-width: 640px) { .verdict { grid-template-columns: 1fr; } .verdict > b { border-right: 0; border-bottom: 2px solid var(--ink); } }
  .ruling { margin-top: 44px; padding-top: 18px; border-top: 2px solid var(--ink); }
  .ruling h2 { font-family: var(--display); font-weight: 700; font-size: 34px; line-height: 1.02; margin-bottom: 10px; }
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
  .field .gap { position: absolute; top: 0; bottom: 0; background: var(--yellow); mix-blend-mode: multiply; }
  .field .mk { position: absolute; top: -9px; bottom: -9px; width: 5px; margin-left: -2.5px; background: var(--ink); }
  .field .mk b { position: absolute; left: 50%; transform: translateX(-50%); white-space: nowrap; font-family: var(--display); font-weight: 700; font-size: 26px; line-height: 1; font-variant-numeric: tabular-nums; padding: 1px 6px; }
  .field .mk.most b { bottom: calc(100% + 3px); background: var(--yellow); }
  .field .mk.least b { top: calc(100% + 3px); background: var(--blue); }
  .field .mk.mid { top: 8px; bottom: 8px; width: 3px; margin-left: -1.5px; background: var(--soft); }
  .numbers { font-size: 16px; }
  .numbers .y { background: var(--yellow); padding: 0 5px; font-weight: 600; } .numbers .b { background: var(--blue); padding: 0 5px; font-weight: 600; }
  .warn { margin-top: 8px; border: 2px solid var(--ink); background: var(--pink); padding: 6px 12px; font-weight: 500; font-size: 15.5px; display: inline-block; }
  .nofield { margin: 12px 0; border: 2px solid var(--ink); background: var(--faint); padding: 12px 14px; font-size: 16px; }
  @media (max-width: 760px) { .q { grid-template-columns: 1fr; } }
  .not { margin-top: 28px; font-size: 16.5px; border-left: 5px solid var(--ink); padding-left: 14px; max-width: 70ch; }
  footer { margin-top: 56px; padding-top: 14px; border-top: 4px solid var(--ink); font-size: 14.5px; color: var(--soft); }
  footer p { max-width: 90ch; }
</style>
</head>
<body>
<main>
<div class="top"><span>The Monday Morning Agent</span><span>Episode 1: the season sheet</span></div>
<h1>${esc(title)}</h1>
<p class="lead">${lead}</p>
${headline}
<div class="qs">
${answers.map(rowHtml).join('\n')}
</div>
<p class="not"><strong>Not on this sheet: why.</strong> Every gap here is an association between running and winning in the plays kept. It does not say which one causes the other. Teams that are ahead run to use the clock, so winning can cause running.</p>
${rulingBlock}
<footer><p>Made ${esc(new Date().toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' }))} by season-sheet.mjs, which ran query-plays.mjs eight times (the command under each question) and wrote down what it printed. Seasons on file: ${esc(weeks)}. Play-by-play data from nflverse, CC BY 4.0. Part of The Monday Morning Agent, an O'Reilly live series hosted by Chester Ismay.</p></footer>
</main>
</body>
</html>
`
mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, html)
console.log(`season-sheet: wrote ${OUT} (${SEASONS}; ${answers.filter(a => a.out.result.length).length} of ${answers.length} questions with a result; latest game ${latest || 'none'})`)
if (OPEN) {
  try { execFileSync(process.platform === 'darwin' ? 'open' : 'xdg-open', [OUT]) } catch { console.error('season-sheet: could not open the page; open it by hand') }
}
