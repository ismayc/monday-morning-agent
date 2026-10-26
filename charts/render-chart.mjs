#!/usr/bin/env node
// render-chart.mjs: draw one chart from one spec, under STANDARD.md, or refuse.
//
//   node ../charts/render-chart.mjs ../charts/long-field-goal-trend.json          draw it
//   node ../charts/render-chart.mjs ../charts/long-field-goal-trend.json --check  check the spec, draw nothing
//   node ../charts/render-chart.mjs                                               print the spec's shape
//
// The spec names a question and a tool command. The renderer runs that command itself,
// with --json, and draws the rows the tool returns: it has no way to draw a number the
// tool did not print (rule 7). The template fixes the axes (rule 2), the counts under
// every point (rule 3), the colors (rule 4), the source line (rule 6), and the layout
// (rule 8). The renderer checks what the template cannot fix: the window (rule 1) and
// the title (rule 5). A spec that breaks a rule is refused with the rule named, exit 65,
// and nothing is written. The SVG lands beside the spec, <name>.svg.
//
// Environment: ANALYST_DICT_DIR passes through to the tool, so a rehearsal that keeps its
// dictionary in a scratch folder draws from that folder's entries.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '..')
const STANDARD = 'charts/STANDARD.md, version 1 (October 26, 2026)'
const YELLOW = '#ffe14d', BLUE = '#8ad4ff', GRAY = '#c9ccd1', INK = '#14171a', SOFT = '#4a5058', RULE = '#c9ccd1', SHEET = '#fcfcfa', FAINT = '#eef0f1'
const DISPLAY = '"Barlow Condensed", "Arial Narrow", "Helvetica Neue", Arial, sans-serif'
const TEXT = '"Barlow", -apple-system, "Segoe UI", Helvetica, Arial, sans-serif'
const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace'

export const SPEC_SHAPE = `{
  "name": "long-field-goal-trend",          the file is charts/<name>.json; lowercase letters, digits, hyphens
  "written": "2026-11-09",                  the day it was written, YYYY-MM-DD
  "by": "the analyst, episode 3",           who wrote it (optional)
  "question": "Are kickers making more of their long field goals than they did in 2021?",
                                            the title: the question tested, ending in "?", no number in it but a year (rule 5)
  "tool": "episode-3/query-plays.mjs",      the tool that prints the rows, relative to the repo root
  "command": "--trend long-field-goal --seasons 2021-2026 --type REG"
                                            the tool command, exactly as you would type it after "node ./query-plays.mjs";
                                            a trend covers every season on file, 2021 through the current one (rule 1)
}`
const KEYS = { name: 1, written: 1, by: 0, question: 1, tool: 1, command: 1 }

const refuse = (rule, why) => {
  console.error(`render-chart: REFUSED by rule ${rule}: ${why} Nothing was drawn. The rules are in ${STANDARD}.`)
  process.exit(65)
}
const fail = (msg, code = 64) => { console.error(`render-chart: ${msg}`); process.exit(code) }

// The season being played: September onward it is this year, before that last year's.
const now = new Date()
export const currentSeason = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1

const argv = process.argv.slice(2)
if (argv.length === 0 || argv.includes('--help')) { console.log(`A chart spec is one JSON file in this shape:\n${SPEC_SHAPE}`); process.exit(0) }
const checkOnly = argv.includes('--check')
// The spec's path, as given; or, when a rehearsal keeps its charts in a scratch folder
// (ANALYST_CHART_DIR) and the path was written against the real one, the same file name
// in that folder. The real folder and the scratch one never both hold the spec.
const given = argv.find(a => !a.startsWith('--')) || ''
let specPath = resolve(given)
if (given && !existsSync(specPath) && process.env.ANALYST_CHART_DIR && existsSync(join(process.env.ANALYST_CHART_DIR, basename(given)))) specPath = join(process.env.ANALYST_CHART_DIR, basename(given))
if (!given || !existsSync(specPath)) fail(`no spec at ${given || '(none given)'}. Write it first, in this shape:\n${SPEC_SHAPE}`, 66)

// ---------------------------------------------------------------- the spec
let spec
try { spec = JSON.parse(readFileSync(specPath, 'utf8')) } catch (err) { fail(`${specPath} is not valid JSON (${err.message})`) }
const problems = []
for (const k of Object.keys(spec)) if (!(k in KEYS)) problems.push(`unknown key "${k}" (a spec names the question and the command; colors, axes, and labels are the standard's)`)
for (const [k, req] of Object.entries(KEYS)) if (req && !(k in spec)) problems.push(`missing "${k}"`)
const stem = basename(specPath, '.json')
if (!/^[a-z][a-z0-9-]*$/.test(String(spec.name))) problems.push('"name" is lowercase letters, digits, and hyphens')
else if (spec.name !== stem) problems.push(`"name" is "${spec.name}" but the file is ${basename(specPath)}`)
if (!/^\d{4}-\d{2}-\d{2}$/.test(String(spec.written))) problems.push('"written" must be a date, YYYY-MM-DD')
if (typeof spec.tool !== 'string' || !/^episode-\d+\/query-plays\.mjs$/.test(spec.tool)) problems.push('"tool" must be an episode\'s query-plays.mjs, such as "episode-3/query-plays.mjs"')
if (typeof spec.command !== 'string' || !spec.command.trim()) problems.push('"command" must be the tool command')
if (problems.length) fail(`${specPath} is not a usable spec: ${problems.join('; ')}. The shape is:\n${SPEC_SHAPE}`)
const toolPath = join(REPO, spec.tool)
if (!existsSync(toolPath)) fail(`the tool ${spec.tool} is not in this repo`, 66)

// Rule 5: the title is the question.
const q = String(spec.question).trim()
if (!q.endsWith('?')) refuse(5, `the title must be the question tested, ending in a question mark; "${q}" does not.`)
if (/\d/.test(q.replace(/\b(19|20)\d\d\b/g, ''))) refuse(5, `the title carries a number ("${q}"); a title that states a result is a caption, not a title. Put the numbers in the ruling (a season's year is the one number allowed).`)
if (q.length < 12 || q.length > 140) refuse(5, `the title is ${q.length} characters; a question a fan would say runs 12 to 140.`)

// Rule 1 and the command's shape. The command is split on spaces and run as arguments,
// never through a shell, so there is nothing to quote and nothing to inject.
const cmd = spec.command.trim()
if (/[;&|`$<>'"\\]/.test(cmd)) fail('the command holds a shell character; write the flags and their values only, separated by spaces')
const args = cmd.split(/\s+/)
if (args[0] !== '--trend') refuse(8, `this template draws a trend, and the command must begin with --trend NAME; it begins with "${args[0]}".`)
if (args.includes('--json')) fail('leave --json out of the command; the renderer adds it')
if (args.includes('--weeks')) refuse(1, 'a trend covers whole seasons; the command narrows them with --weeks.')
const si = args.indexOf('--seasons')
const want = `2021-${currentSeason}`
if (si < 0) refuse(1, `the command names no --seasons; a trend covers every season on file, --seasons ${want}.`)
if (args[si + 1] !== want) refuse(1, `the command says --seasons ${args[si + 1] || '(nothing)'}; a trend starts at 2021, the first season on file, and ends at ${currentSeason}, the current one: --seasons ${want}. The window is not a choice.`)

// ---------------------------------------------------------------- the rows, from the tool
let rowsOut
try {
  rowsOut = JSON.parse(execFileSync('node', [toolPath, ...args, '--json'], { cwd: dirname(toolPath), env: process.env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 }))
} catch (err) {
  const msg = (err.stderr || err.message || '').toString().trim().split('\n')[0]
  fail(`the tool refused the command: ${msg}`, 65)
}
if (!rowsOut.rows || !rowsOut.dictionary) fail('the tool\'s output has no rows; the renderer draws --trend output only', 65)
const rows = rowsOut.rows
const D = rowsOut.dictionary
const pct = (x) => x === null ? 'n/a' : (100 * x).toFixed(1) + '%'
const fmt = (n) => n.toLocaleString('en-US')

console.log(`render-chart: ${basename(dirname(specPath))}/${basename(specPath)}`)
console.log(`  rule 1 (every season on file): --seasons ${want}, no --weeks                       OK`)
console.log(`  rule 5 (the title is the question): "${q}"  OK`)
console.log(`  rule 6 (the source line is the command): node ${spec.tool} ${cmd}  OK`)
console.log(`  rule 7 (nothing the tool did not print): ${rows.length} rows read from the tool's --json output  OK`)
console.log(`  rules 2, 3, 4, 8 (axes from zero, counts under points, two colors and gray, one template): fixed by the template`)
for (const r of rows) console.log(`  ${r.season}${r.inProgress ? '*' : ' '}  defined ${pct(r.defined.rate).padStart(6)} of ${fmt(r.defined.attempts).padStart(5)}  ${r.defined.perGame === null ? '' : r.defined.perGame.toFixed(2) + ' per game'}   other ${pct(r.other.rate).padStart(6)} of ${fmt(r.other.attempts)}`)
if (checkOnly) { console.log('  --check: nothing drawn'); process.exit(0) }

// ---------------------------------------------------------------- the template (rules 2, 3, 4, 6, 8)
const W = 1120, H = 790
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const L = 96, Rm = 40, PAD = 84   // PAD keeps the first and last season's labels inside the plot
const plotW = W - L - Rm
const xs = rows.map((_, i) => L + PAD + (rows.length === 1 ? (plotW - 2 * PAD) / 2 : (i * (plotW - 2 * PAD)) / (rows.length - 1)))
const hasOther = rows.some(r => r.other.rate !== null)
const inProg = rows.find(r => r.inProgress)
const parts = []
parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" data-standard="${esc(STANDARD)}" data-spec="${esc(spec.name)}" aria-labelledby="t">`)
parts.push(`<rect width="${W}" height="${H}" fill="${SHEET}"/>`)
// Title and subtitle (rule 5)
parts.push(`<text id="t" x="${L}" y="54" font-family='${DISPLAY}' font-weight="700" font-size="34" fill="${INK}">${esc(q)}</text>`)
const filters = rowsOut.filters.slice(2).map(f => f.filter).filter(f => !/^weeks: all$/.test(f) && !/^team with the ball: any$/.test(f) && !/^a field goal attempt/.test(f))
parts.push(`<text x="${L}" y="80" font-family='${TEXT}' font-size="16" fill="${SOFT}">${esc(`${D.file}, written ${D.written}${D.by ? ' by ' + D.by : ''}: \u201c${D.plainWords}\u201d`)}</text>`)
parts.push(`<text x="${L}" y="100" font-family='${TEXT}' font-size="16" fill="${SOFT}">${esc(filters.length ? `Filters: ${filters.join('; ')}.` : 'Filters: every season, every week, every team.')}</text>`)
// Legend (rule 4)
let lx = L
parts.push(`<rect x="${lx}" y="116" width="22" height="12" fill="${YELLOW}" stroke="${INK}"/><text x="${lx + 30}" y="127" font-family='${TEXT}' font-size="15" fill="${INK}">${esc(D.name)}: the defined kick</text>`)
lx += 300
if (hasOther) { parts.push(`<rect x="${lx}" y="116" width="22" height="12" fill="${BLUE}" stroke="${INK}"/><text x="${lx + 30}" y="127" font-family='${TEXT}' font-size="15" fill="${INK}">${esc(D.comparedWith)}</text>`); lx += 320 }
if (inProg) parts.push(`<rect x="${lx}" y="116" width="22" height="12" fill="${GRAY}" stroke="${INK}"/><text x="${lx + 30}" y="127" font-family='${TEXT}' font-size="15" fill="${INK}">${esc(inProg.season)} so far, through week ${esc(String(inProg.weeks).split(/[-,]/).pop())}</text>`)

// Panel A: rates, 0 to 100 (rule 2), counts under the points (rule 3)
const aTop = 170, aBot = 450
const ay = (rate) => aBot - (aBot - aTop) * rate
parts.push(`<text x="${L}" y="${aTop - 12}" font-family='${DISPLAY}' font-weight="600" font-size="20" fill="${INK}">Made, as a share of attempts</text>`)
for (const t of [0, 25, 50, 75, 100]) {
  const y = ay(t / 100)
  parts.push(`<line x1="${L}" x2="${W - Rm}" y1="${y}" y2="${y}" stroke="${t === 0 ? INK : RULE}" stroke-width="${t === 0 ? 2 : 1}"/>`)
  parts.push(`<text x="${L - 10}" y="${y + 5}" text-anchor="end" font-family='${MONO}' font-size="13" fill="${SOFT}">${t}%</text>`)
}
const polyline = (key, color) => {
  const pts = rows.map((r, i) => r[key].rate === null ? null : `${xs[i]},${ay(r[key].rate)}`).filter(Boolean)
  if (pts.length > 1) parts.push(`<polyline points="${pts.join(' ')}" fill="none" stroke="${color}" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/>`)
  rows.forEach((r, i) => {
    if (r[key].rate === null) return
    const fill = r.inProgress ? GRAY : color
    parts.push(`<circle cx="${xs[i]}" cy="${ay(r[key].rate)}" r="8" fill="${fill}" stroke="${INK}" stroke-width="2"${r.inProgress ? ' stroke-dasharray="3 2"' : ''}/>`)
  })
}
if (hasOther) polyline('other', BLUE)
polyline('defined', YELLOW)
rows.forEach((r, i) => {
  const yd = ay(r.defined.rate ?? 0)
  if (r.defined.rate !== null) {
    parts.push(`<text x="${xs[i]}" y="${yd - 16}" text-anchor="middle" font-family='${MONO}' font-weight="700" font-size="15" fill="${INK}">${pct(r.defined.rate)}</text>`)
    parts.push(`<text x="${xs[i]}" y="${yd + 26}" text-anchor="middle" font-family='${MONO}' font-size="12" fill="${SOFT}">of ${fmt(r.defined.attempts)}</text>`)
  }
  if (hasOther && r.other.rate !== null) {
    const yo = ay(r.other.rate)
    const above = yo < yd
    parts.push(`<text x="${xs[i]}" y="${above ? yo - 16 : yo + 26}" text-anchor="middle" font-family='${MONO}' font-size="13" fill="${INK}">${pct(r.other.rate)}</text>`)
    parts.push(`<text x="${xs[i]}" y="${above ? yo - 30 : yo + 40}" text-anchor="middle" font-family='${MONO}' font-size="11" fill="${SOFT}">of ${fmt(r.other.attempts)}</text>`)
  }
})
// Season labels between the panels
rows.forEach((r, i) => parts.push(`<text x="${xs[i]}" y="${aBot + 28}" text-anchor="middle" font-family='${DISPLAY}' font-weight="600" font-size="18" fill="${r.inProgress ? SOFT : INK}">${esc(r.season)}${r.inProgress ? '*' : ''}</text>`))

// Panel B: attempts per game, bars from 0 (rule 2)
const bTop = 530, bBot = 670
const maxPg = Math.max(0.5, ...rows.map(r => r.defined.perGame || 0))
const bMax = Math.ceil(maxPg * 2) / 2
const by = (v) => bBot - (bBot - bTop) * (v / bMax)
parts.push(`<text x="${L}" y="${bTop - 12}" font-family='${DISPLAY}' font-weight="600" font-size="20" fill="${INK}">Tried, per game</text>`)
for (let t = 0; t <= bMax + 1e-9; t += bMax <= 1 ? 0.25 : 0.5) {
  const y = by(t)
  parts.push(`<line x1="${L}" x2="${W - Rm}" y1="${y}" y2="${y}" stroke="${t === 0 ? INK : RULE}" stroke-width="${t === 0 ? 2 : 1}"/>`)
  parts.push(`<text x="${L - 10}" y="${y + 5}" text-anchor="end" font-family='${MONO}' font-size="13" fill="${SOFT}">${t.toFixed(2)}</text>`)
}
const bw = Math.min(72, plotW / rows.length * 0.5)
rows.forEach((r, i) => {
  if (r.defined.perGame === null) return
  const y = by(r.defined.perGame)
  parts.push(`<rect x="${xs[i] - bw / 2}" y="${y}" width="${bw}" height="${bBot - y}" fill="${r.inProgress ? GRAY : YELLOW}" stroke="${INK}" stroke-width="2"${r.inProgress ? ' stroke-dasharray="4 3"' : ''}/>`)
  parts.push(`<text x="${xs[i]}" y="${y - 8}" text-anchor="middle" font-family='${MONO}' font-weight="700" font-size="15" fill="${INK}">${r.defined.perGame.toFixed(2)}</text>`)
  parts.push(`<text x="${xs[i]}" y="${bBot + 20}" text-anchor="middle" font-family='${MONO}' font-size="12" fill="${SOFT}">${fmt(r.defined.attempts)} in ${fmt(r.games)} games</text>`)
})
// Footnote for the partial season, and the source line (rule 6)
let fy = 722
if (inProg) { parts.push(`<text x="${L}" y="${fy}" font-family='${TEXT}' font-size="14" fill="${SOFT}">* ${esc(inProg.season)} is still being played: weeks ${esc(inProg.weeks)} on file, ${fmt(inProg.games)} games. Its row is a partial season.</text>`); fy += 20 }
parts.push(`<text x="${L}" y="${fy}" font-family='${MONO}' font-size="13" fill="${SOFT}">Source: node ${esc(spec.tool)} ${esc(cmd)}  (${fmt(rowsOut.coverage.games)} games, latest ${esc(rowsOut.coverage.latestGameDate)})</text>`)
parts.push(`<text x="${L}" y="${fy + 20}" font-family='${MONO}' font-size="13" fill="${SOFT}">Drawn under ${esc(STANDARD)}, from the spec ${esc(spec.name)}.json, written ${esc(spec.written)}.</text>`)
parts.push('</svg>')

const out = join(dirname(specPath), `${spec.name}.svg`)
writeFileSync(out, parts.join('\n') + '\n')
console.log(`  wrote ${out}`)
