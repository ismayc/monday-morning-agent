#!/usr/bin/env node
// query-plays.mjs: the one read-only data tool for episode 1.
//
// It answers one shape of question: "do teams that run on a larger share of their
// plays win more often?", under whatever filters it is given. It prints every filter
// it applied, in order, with the number of plays left after each one, and then the
// result. Nothing is filtered that is not printed.
//
//   node ./query-plays.mjs --seasons 2021-2025 --half 1
//   node ./query-plays.mjs --seasons 2026 --half 2 --margin 8
//   node ./query-plays.mjs --seasons 2021-2025 --json
//
// Flags (all optional except --seasons):
//   --seasons 2021-2025 | 2026 | 2023,2025   which seasons
//   --type REG | POST | ALL                  regular season, playoffs, or both (default ALL)
//   --weeks 1-5                              week numbers within a season (default all)
//   --half 1 | 2 | all                       which half of the game (default all; overtime
//                                            counts only under "all")
//   --quarter 1 | 2 | 3 | 4                  one quarter (cannot be combined with --half)
//   --margin N                               keep plays snapped with the score within N points
//   --groups 4                               how many equal groups to cut team-games into
//   --min-plays 10                           drop a team-game with fewer plays than this
//   --json                                   the same content as JSON
//
// It reads data/plays-slim.csv and nothing else. No network, no writes, no dependencies.
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const DIR = dirname(fileURLToPath(import.meta.url))
const FILE = join(DIR, 'data', 'plays-slim.csv')
const META = join(DIR, 'data', 'plays-slim.meta.json')

const fail = (msg) => { console.error(`query-plays: ${msg}`); process.exit(64) }

// ---------------------------------------------------------------- arguments
const KNOWN = new Set(['seasons', 'type', 'weeks', 'half', 'quarter', 'margin', 'groups', 'min-plays', 'json'])
const args = {}
const argv = process.argv.slice(2)
if (argv.includes('--help') || argv.includes('-h')) {
  // The usage is the comment block at the top of this file, so the two cannot drift.
  const src = readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n')
  console.log(src.slice(1, src.findIndex(l => l.startsWith('import '))).map(l => l.replace(/^\/\/ ?/, '')).join('\n').trimEnd())
  process.exit(0)
}
for (let i = 0; i < argv.length; i++) {
  if (!argv[i].startsWith('--')) fail(`unexpected argument "${argv[i]}"`)
  const k = argv[i].slice(2)
  if (!KNOWN.has(k)) fail(`unknown flag --${k}. Known flags: ${[...KNOWN].map(x => '--' + x).join(' ')}`)
  if (k === 'json') { args.json = true; continue }
  if (argv[i + 1] === undefined) fail(`--${k} needs a value`)
  args[k] = argv[++i]
}
const numList = (s, what) => {
  const out = new Set()
  for (const part of String(s).split(',')) {
    const m = part.match(/^(\d+)(?:-(\d+))?$/)
    if (!m) fail(`cannot read ${what} "${s}" (use 2021-2025, or 2023,2025, or 2026)`)
    const a = +m[1], b = m[2] === undefined ? a : +m[2]
    if (b < a) fail(`${what} range "${part}" runs backward`)
    for (let v = a; v <= b; v++) out.add(v)
  }
  return out
}
if (!args.seasons) fail('--seasons is required, for example --seasons 2021-2025')
const seasons = numList(args.seasons, 'seasons')
const type = (args.type || 'ALL').toUpperCase()
if (!['REG', 'POST', 'ALL'].includes(type)) fail('--type must be REG, POST, or ALL')
const weeks = args.weeks ? numList(args.weeks, 'weeks') : null
const half = args.half || 'all'
if (!['1', '2', 'all'].includes(half)) fail('--half must be 1, 2, or all')
const quarter = args.quarter || null
if (quarter && !['1', '2', '3', '4'].includes(quarter)) fail('--quarter must be 1, 2, 3, or 4')
if (quarter && half !== 'all') fail('use --half or --quarter, not both')
const margin = args.margin === undefined ? null : +args.margin
if (margin !== null && !(Number.isInteger(margin) && margin >= 0)) fail('--margin must be a whole number of points, 0 or more')
const groups = +(args.groups || 4)
if (!(Number.isInteger(groups) && groups >= 2 && groups <= 10)) fail('--groups must be a whole number from 2 to 10')
const minPlays = +(args['min-plays'] || 10)
if (!(Number.isInteger(minPlays) && minPlays >= 1)) fail('--min-plays must be a whole number, 1 or more')

// ---------------------------------------------------------------- load
if (!existsSync(FILE)) fail(`missing ${FILE}. Run ./fetch-data.sh first.`)
const lines = readFileSync(FILE, 'utf8').split('\n')
const header = lines[0].split(',')
const col = Object.fromEntries(header.map((h, i) => [h, i]))
let plays = []
for (let i = 1; i < lines.length; i++) if (lines[i]) plays.push(lines[i].split(','))
const meta = existsSync(META) ? JSON.parse(readFileSync(META, 'utf8')) : null

// ---------------------------------------------------------------- the filters, in order
const steps = []
const fmt = (n) => n.toLocaleString('en-US')
const step = (label, keep) => {
  if (keep) plays = plays.filter(keep)
  steps.push({ filter: label, playsLeft: plays.length })
}
const compact = (set) => {
  const v = [...set].sort((a, b) => a - b), out = []
  for (let i = 0; i < v.length; i++) {
    let j = i
    while (j + 1 < v.length && v[j + 1] === v[j] + 1) j++
    out.push(j > i ? `${v[i]}-${v[j]}` : `${v[i]}`)
    i = j
  }
  return out.join(',')
}

step(`file: data/plays-slim.csv, ${header.length} of ${meta ? meta.rawColumns : 372} columns kept, no betting columns`)
step(`seasons: ${compact(seasons)}`, p => seasons.has(+p[col.season]))
if (plays.length === 0) fail(`no plays for seasons ${compact(seasons)}. The file holds 2021 through 2026.`)
step(type === 'ALL' ? 'season type: regular season and playoffs' : `season type: ${type} only`,
  type === 'ALL' ? null : p => p[col.season_type] === type)
step(weeks ? `weeks: ${compact(weeks)}` : 'weeks: all', weeks ? p => weeks.has(+p[col.week]) : null)
step('a rush or a pass by a team with the ball (kicks, punts, penalties, and timeouts out)',
  p => p[col.posteam] && p[col.posteam] !== 'NA' && (p[col.rush_attempt] === '1' || p[col.pass_attempt] === '1'))
step('no kneel-downs and no spikes (clock plays, not play calls)',
  p => p[col.qb_kneel] !== '1' && p[col.qb_spike] !== '1')
if (quarter) step(`quarter: ${quarter} only`, p => p[col.qtr] === quarter)
else step(half === 'all' ? 'half: whole game, overtime included' : `half: ${half === '1' ? 'first' : 'second'} half only (overtime out)`,
  half === 'all' ? null : p => p[col.game_half] === (half === '1' ? 'Half1' : 'Half2'))
step(margin === null ? 'score margin: any' : `score margin: within ${margin} points at the snap`,
  margin === null ? null : p => p[col.score_differential] !== 'NA' && p[col.score_differential] !== '' && Math.abs(+p[col.score_differential]) <= margin)

// ---------------------------------------------------------------- team-games
const games = new Map()
for (const p of plays) {
  let g = games.get(p[col.game_id])
  if (!g) games.set(p[col.game_id], g = { home: p[col.home_team], result: p[col.result], week: +p[col.week], season: +p[col.season], date: p[col.game_date], teams: {} })
  const t = (g.teams[p[col.posteam]] ||= { rush: 0, pass: 0 })
  if (p[col.rush_attempt] === '1') t.rush++; else t.pass++
}
let teamGames = [], ties = 0, unfinished = 0, thin = 0
const weeksSeen = {}
for (const g of games.values()) {
  (weeksSeen[g.season] ||= new Set()).add(g.week)
  if (g.result === 'NA' || g.result === '') { unfinished++; continue }
  if (+g.result === 0) { ties++; continue }
  for (const [team, t] of Object.entries(g.teams)) {
    const n = t.rush + t.pass
    if (n < minPlays) { thin++; continue }
    teamGames.push({ share: t.rush / n, won: (team === g.home) === (+g.result > 0) })
  }
}
const lastDate = [...games.values()].map(g => g.date).sort().at(-1)

// ---------------------------------------------------------------- the result
teamGames.sort((a, b) => b.share - a.share)
const size = Math.floor(teamGames.length / groups)
const pct = (x) => (100 * x).toFixed(1) + '%'
const table = []
if (size >= 1) {
  for (let k = 0; k < groups; k++) {
    // Equal groups from the top; any remainder (fewer than `groups` team-games) is left in the middle.
    const slice = k < groups / 2 ? teamGames.slice(k * size, (k + 1) * size)
      : teamGames.slice(teamGames.length - (groups - k) * size, teamGames.length - (groups - k - 1) * size)
    const wins = slice.filter(r => r.won).length
    table.push({
      group: k === 0 ? 'ran most' : k === groups - 1 ? 'ran least' : `group ${k + 1}`,
      shareFrom: slice.at(-1).share, shareTo: slice[0].share, teamGames: slice.length, wins, winRate: wins / slice.length,
    })
  }
}
const gap = table.length ? table[0].winRate - table.at(-1).winRate : null
const warnings = []
if (size < 30 && size >= 1) warnings.push(`SMALL SAMPLE: ${size} team-games per group. One game moves a win rate by ${(100 / size).toFixed(1)} points.`)
if (size < 1) warnings.push('NO RESULT: fewer team-games than groups.')

const out = {
  question: 'Do teams that run on a larger share of their plays win more often?',
  definition: 'rush share = rushes / (rushes + passes), per team per game, counting only the plays the filters keep',
  filters: steps,
  teamGames: {
    games: games.size, kept: teamGames.length, tiesDropped: ties, unfinishedDropped: unfinished,
    droppedForTooFewPlays: thin, minPlays,
    weeksBySeason: Object.fromEntries(Object.entries(weeksSeen).map(([s, w]) => [s, compact(w)])),
    latestGameDate: lastDate || null,
  },
  groups, result: table, gapTopMinusBottom: gap, warnings,
  notInThisOutput: 'Why. A gap is an association between running and winning in the plays kept. It does not say which one causes the other.',
}

if (args.json) { console.log(JSON.stringify(out, null, 2)); process.exit(0) }

const L = []
L.push('QUESTION', `  ${out.question}`, `  ${out.definition}`, '')
L.push('FILTERS, IN ORDER (plays left after each)')
steps.forEach((s, i) => L.push(`  ${String(i).padStart(2)}. ${s.filter.padEnd(86)} ${fmt(s.playsLeft).padStart(9)}`))
L.push('')
L.push('THEN, PER TEAM PER GAME')
L.push(`  ${fmt(games.size)} games in the plays kept (latest game ${lastDate || 'none'}; weeks ${Object.entries(out.teamGames.weeksBySeason).map(([s, w]) => `${s}: ${w}`).join('; ')})`)
L.push(`  ${ties} tied games dropped, ${unfinished} games with no final result dropped`)
L.push(`  ${thin} team-games dropped for fewer than ${minPlays} plays in the window`)
L.push(`  ${fmt(teamGames.length)} team-games kept, sorted by rush share, cut into ${groups} equal groups of ${size}`)
L.push('')
L.push('RESULT')
L.push('  group        rush share          team-games   wins   win rate')
for (const r of table) {
  L.push(`  ${r.group.padEnd(12)} ${(pct(r.shareFrom) + ' to ' + pct(r.shareTo)).padEnd(19)} ${String(r.teamGames).padStart(10)} ${String(r.wins).padStart(6)} ${pct(r.winRate).padStart(10)}`)
}
if (gap !== null) L.push(`  gap, ran most minus ran least: ${(100 * gap).toFixed(1)} points`)
for (const w of warnings) L.push('', `  ${w}`)
L.push('', 'NOT IN THIS OUTPUT', `  ${out.notInThisOutput}`)
console.log(L.join('\n'))
