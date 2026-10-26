#!/usr/bin/env node
// query-plays.mjs: the one read-only data tool for episode 3.
//
// It answers three shapes of question, and prints every filter it applied, in order, with
// the number of plays left after each one. Nothing is filtered that is not printed.
//
//   1. A search: how many play descriptions contain some words?
//        node ./query-plays.mjs --search "field goal" --seasons 2021-2026
//
//   2. A defined play against the field: how often did a rush that matches a definition
//      from the dictionary convert (gain the first down, or score), against every other
//      rush with the same yards to go? Episode 2's question, unchanged.
//        node ./query-plays.mjs --play tush-push --seasons 2021-2025
//        node ./query-plays.mjs --play tush-push --seasons 2021-2025 --by season
//
//   3. A trend: season by season, how often was a kick that matches a definition from the
//      dictionary made, against every other field goal attempt, and how often was it
//      tried per game? New in episode 3.
//        node ./query-plays.mjs --trend long-field-goal --seasons 2021-2026
//        node ./query-plays.mjs --trend field-goal --seasons 2021-2026 --type REG --bands
//
// The tool only speaks the dictionary. `--play NAME` and `--trend NAME` read
// ../dictionary/NAME.json and apply the rules written there; there is no flag for an ad
// hoc definition. With no entry of that name it stops and prints the entry's shape, so
// that a definition is always a written, named thing that can be cited. An entry is one
// of two shapes: a rush (episode 2's, for --play) or a kick (this episode's, for --trend).
// The dictionary folder can be moved for a rehearsal with the ANALYST_DICT_DIR variable.
//
// Flags (all optional except --seasons, and one of --search, --play, or --trend):
//   --search "WORDS"                          count descriptions containing these words
//                                             (case does not matter)
//   --play NAME                               the rush entry to apply (question 2)
//   --trend NAME                              the kick entry to apply (question 3)
//   --seasons 2021-2025 | 2026 | 2023,2025    which seasons
//   --type REG | POST | ALL                   regular season, playoffs, or both (default ALL)
//   --weeks 1-5                               week numbers within a season (default all)
//   --team PHI                                only plays by this offense (for a kick, the kicking team)
//   --not-team PHI                            every offense but this one
//   --downs 3,4                               only these downs (default all; --play only)
//   --yards-to-go N                           only plays with N or fewer yards to go; N may
//                                             not exceed the definition's own distance (--play only)
//   --goal-to-go                              only plays where the yards to go were the yards to the goal line (--play only)
//   --by season | team                        the same result, one row per season or per team
//                                             (teams with 10 or more plays matching the definition; --play only)
//   --bands                                   with --trend: the defined kicks also by distance, in the
//                                             chart standard's four bands (under 40, 40 to 49, 50 to 59, 60 and over)
//   --json                                    the same content as JSON
//
// It reads data/plays.csv and one dictionary entry, and nothing else. No network, no
// writes, no dependencies.
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const DIR = dirname(fileURLToPath(import.meta.url))
const FILE = join(DIR, 'data', 'plays.csv')
const META = join(DIR, 'data', 'plays.meta.json')
const DICT = resolve(process.env.ANALYST_DICT_DIR || join(DIR, '..', 'dictionary'))

const fail = (msg, code = 64) => { console.error(`query-plays: ${msg}`); process.exit(code) }

// ---------------------------------------------------------------- the dictionary's shapes
// An entry is one JSON file, dictionary/NAME.json, in one of two shapes. The tool checks
// every key, so an entry the agent writes is either usable or rejected with a reason.
export const ENTRY_SHAPE = `{
  "name": "tush-push",                      the file is dictionary/<name>.json; lowercase letters, digits, hyphens
  "written": "2026-10-26",                  the day it was written, YYYY-MM-DD
  "by": "the analyst, episode 2",           who wrote it (optional)
  "plainWords": "A quarterback run with two or fewer yards to go, not from shotgun.",
  "rules": {
    "rusher": "primary-passer",             who carried: "primary-passer" (the player with the most
                                            pass attempts for that team in that game) or "any"
    "yardsToGoMax": 2,                      a whole number, 1 to 10
    "formation": "under-center",            "under-center" (not shotgun), "shotgun", or "any"
    "downs": "any"                          "any", or a list such as [3, 4]
  },
  "comparedWith": "every other rush with the same yards to go",
  "cannotSee": "who pushed the runner, or any formation detail beyond shotgun or not"   (optional)
}`
export const KICK_SHAPE = `{
  "name": "long-field-goal",                the file is dictionary/<name>.json; lowercase letters, digits, hyphens
  "kind": "kick",                           this entry defines a kick (an entry with no "kind" defines a rush)
  "written": "2026-11-09",                  the day it was written, YYYY-MM-DD
  "by": "the analyst, episode 3",           who wrote it (optional)
  "plainWords": "A field goal attempt from 50 yards or more.",
  "rules": {
    "distanceMin": 50,                      the kick's distance in yards, from this one ...
    "distanceMax": 70                       ... to this one; whole numbers, 18 to 70
  },
  "comparedWith": "every other field goal attempt",
  "cannotSee": "the wind, the surface, or whether a timeout was called to ice the kicker"   (optional)
}`
const ENTRY_KEYS = { name: 1, kind: 0, written: 1, by: 0, plainWords: 1, rules: 1, comparedWith: 1, cannotSee: 0 }
const RUSH_RULES = ['rusher', 'yardsToGoMax', 'formation', 'downs']
const KICK_RULES = ['distanceMin', 'distanceMax']
const shapeFor = (kind) => kind === 'kick' ? KICK_SHAPE : ENTRY_SHAPE

export function readEntry(name, dictDir = DICT, want = 'rush') {
  if (!/^[a-z][a-z0-9-]*$/.test(name)) return { error: `a dictionary name is lowercase letters, digits, and hyphens, not "${name}"` }
  const file = join(dictDir, `${name}.json`)
  if (!existsSync(file)) {
    const have = existsSync(dictDir) ? readdirSync(dictDir).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5)) : []
    return { error: `no entry named "${name}" in ${dictDir}. The tool only speaks the dictionary: write ${file} first, in this shape:\n${shapeFor(want)}\nEntries on file: ${have.length ? have.join(', ') : 'none'}`, missing: true }
  }
  let e
  try { e = JSON.parse(readFileSync(file, 'utf8')) } catch (err) { return { error: `${file} is not valid JSON (${err.message})` } }
  const problems = []
  for (const k of Object.keys(e)) if (!(k in ENTRY_KEYS)) problems.push(`unknown key "${k}"`)
  for (const [k, req] of Object.entries(ENTRY_KEYS)) if (req && !(k in e)) problems.push(`missing "${k}"`)
  if (e.name !== name) problems.push(`"name" is "${e.name}" but the file is ${basename(file)}`)
  if ('kind' in e && !['rush', 'kick'].includes(e.kind)) problems.push('"kind" must be "rush" or "kick" (or left out, which means a rush)')
  const kind = e.kind === 'kick' ? 'kick' : 'rush'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(e.written))) problems.push('"written" must be a date, YYYY-MM-DD')
  if (typeof e.plainWords !== 'string' || !e.plainWords.trim()) problems.push('"plainWords" must be a sentence')
  if (typeof e.comparedWith !== 'string' || !e.comparedWith.trim()) problems.push('"comparedWith" must be a sentence')
  const r = e.rules
  if (!r || typeof r !== 'object') problems.push('"rules" must be an object')
  else if (kind === 'kick') {
    for (const k of Object.keys(r)) if (!KICK_RULES.includes(k)) problems.push(`unknown rule "${k}" for a kick`)
    for (const k of KICK_RULES) if (!(k in r)) problems.push(`missing rule "${k}"`)
    const ok = (v) => Number.isInteger(v) && v >= 18 && v <= 70
    if (!ok(r.distanceMin)) problems.push('rules.distanceMin must be a whole number from 18 to 70')
    if (!ok(r.distanceMax)) problems.push('rules.distanceMax must be a whole number from 18 to 70')
    if (ok(r.distanceMin) && ok(r.distanceMax) && r.distanceMin > r.distanceMax) problems.push('rules.distanceMin is more than rules.distanceMax')
  } else {
    for (const k of Object.keys(r)) if (!RUSH_RULES.includes(k)) problems.push(`unknown rule "${k}" for a rush`)
    for (const k of RUSH_RULES) if (!(k in r)) problems.push(`missing rule "${k}"`)
    if (!['primary-passer', 'any'].includes(r.rusher)) problems.push('rules.rusher must be "primary-passer" or "any"')
    if (!(Number.isInteger(r.yardsToGoMax) && r.yardsToGoMax >= 1 && r.yardsToGoMax <= 10)) problems.push('rules.yardsToGoMax must be a whole number from 1 to 10')
    if (!['under-center', 'shotgun', 'any'].includes(r.formation)) problems.push('rules.formation must be "under-center", "shotgun", or "any"')
    if (!(r.downs === 'any' || (Array.isArray(r.downs) && r.downs.length && r.downs.every(d => [1, 2, 3, 4].includes(d))))) problems.push('rules.downs must be "any" or a list from 1 to 4')
  }
  if (problems.length) return { error: `${file} is not a usable entry: ${problems.join('; ')}. The shape is:\n${shapeFor(kind)}` }
  if (kind !== want) return { error: kind === 'kick' ? `"${name}" defines a kick; measure it with --trend ${name}, not --play` : `"${name}" defines a rush; measure it with --play ${name}, not --trend` }
  return { entry: e, file, kind }
}

// ---------------------------------------------------------------- arguments
const KNOWN = new Set(['search', 'play', 'trend', 'seasons', 'type', 'weeks', 'team', 'not-team', 'downs', 'yards-to-go', 'goal-to-go', 'by', 'bands', 'json'])
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
  if (!KNOWN.has(k)) fail(`unknown flag --${k}. Known flags: ${[...KNOWN].map(x => '--' + x).join(' ')}. Run with --help for what each one does.`)
  if (k === 'json' || k === 'goal-to-go' || k === 'bands') { args[k] = true; continue }
  if (argv[i + 1] === undefined) fail(`--${k} needs a value`)
  args[k] = argv[++i]
}
const numList = (s, what, lo, hi) => {
  const out = new Set()
  for (const part of String(s).split(',')) {
    const m = part.match(/^(\d+)(?:-(\d+))?$/)
    if (!m) fail(`cannot read ${what} "${s}" (use 2021-2025, or 2023,2025, or 2026)`)
    const a = +m[1], b = m[2] === undefined ? a : +m[2]
    if (b < a) fail(`${what} range "${part}" runs backward`)
    for (let v = a; v <= b; v++) { if ((lo !== undefined && v < lo) || (hi !== undefined && v > hi)) fail(`${what} ${v} is out of range`); out.add(v) }
  }
  return out
}
if (!args.seasons) fail('--seasons is required, for example --seasons 2021-2025')
const asked = ['search', 'play', 'trend'].filter(k => args[k] !== undefined)
if (asked.length === 0) fail('say what to look for: --search "WORDS", --play NAME, or --trend NAME')
if (asked.length > 1) fail(`use one of --search, --play, or --trend, not ${asked.map(k => '--' + k).join(' and ')}`)
const seasons = numList(args.seasons, 'seasons')
const type = (args.type || 'ALL').toUpperCase()
if (!['REG', 'POST', 'ALL'].includes(type)) fail('--type must be REG, POST, or ALL')
const weeks = args.weeks ? numList(args.weeks, 'weeks') : null
const team = args.team ? args.team.toUpperCase() : null
const notTeam = args['not-team'] ? args['not-team'].toUpperCase() : null
if (team && notTeam) fail('use --team or --not-team, not both')
for (const t of [team, notTeam]) if (t && !/^[A-Z]{2,3}$/.test(t)) fail(`a team is its two- or three-letter code, not "${t}"`)
const downs = args.downs ? numList(args.downs, 'downs', 1, 4) : null
const yardsToGo = args['yards-to-go'] === undefined ? null : +args['yards-to-go']
if (yardsToGo !== null && !(Number.isInteger(yardsToGo) && yardsToGo >= 1)) fail('--yards-to-go must be a whole number, 1 or more')
const goalToGo = !!args['goal-to-go']
const by = args.by || null
if (by && !['season', 'team'].includes(by)) fail('--by must be season or team')
const bands = !!args.bands
if (args.search !== undefined && !String(args.search).trim()) fail('--search needs some words')
if (args.search && (team || notTeam || downs || yardsToGo !== null || goalToGo || by || bands)) fail('--search takes only --seasons, --type, and --weeks')
if (args.trend && (downs || yardsToGo !== null || goalToGo || by)) fail('--trend takes --seasons, --type, --weeks, --team or --not-team, and --bands; a trend is always one row per season')
if (args.play && bands) fail('--bands goes with --trend; for a rush, use --by season')
let entry = null, entryFile = null
if (args.play || args.trend) {
  const r = readEntry(args.play || args.trend, DICT, args.trend ? 'kick' : 'rush')
  if (r.error) fail(r.error, r.missing ? 65 : 64)
  entry = r.entry; entryFile = r.file
  if (args.play && yardsToGo !== null && yardsToGo > entry.rules.yardsToGoMax) fail(`--yards-to-go ${yardsToGo} is more than the definition's ${entry.rules.yardsToGoMax}; the definition sets the distance, a flag can only narrow it`)
}

// ---------------------------------------------------------------- load
if (!existsSync(FILE)) fail(`missing ${FILE}. Run ./fetch-data.sh first.`, 66)
const text = readFileSync(FILE, 'utf8')
const nl = text.indexOf('\n')
const header = text.slice(0, nl).split(',')
const col = Object.fromEntries(header.map((h, i) => [h, i]))
const N = header.length
if (header[N - 1] !== 'desc') fail('data/plays.csv must end with the desc column (run ./slim-data.mjs)', 65)
for (const c of ['field_goal_attempt', 'field_goal_result', 'kick_distance']) if (!(c in col)) fail(`data/plays.csv has no ${c} column; this is an older file (run ./slim-data.mjs)`, 65)
// Every column but the last is free of commas (slim-data.mjs checks that), so a row is
// split at its first N-1 commas and the rest of the line is the description.
const row = (line) => {
  const out = new Array(N)
  let from = 0
  for (let k = 0; k < N - 1; k++) {
    const j = line.indexOf(',', from)
    out[k] = line.slice(from, j)
    from = j + 1
  }
  let d = line.slice(from)
  if (d.charCodeAt(0) === 34) d = d.slice(1, -1).replace(/""/g, '"')
  out[N - 1] = d
  return out
}
let plays = []
let from = nl + 1
while (from < text.length) {
  let to = text.indexOf('\n', from)
  if (to < 0) to = text.length
  if (to > from) plays.push(row(text.slice(from, to)))
  from = to + 1
}
const meta = existsSync(META) ? JSON.parse(readFileSync(META, 'utf8')) : null
const blank = (v) => v === '' || v === 'NA'

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

step(`file: data/plays.csv, ${N} of ${meta ? meta.rawColumns : 372} columns kept, no betting columns`)
step(`seasons: ${compact(seasons)}`, p => seasons.has(+p[col.season]))
if (plays.length === 0) fail(`no plays for seasons ${compact(seasons)}. The file holds 2021 through 2026.`)
step(type === 'ALL' ? 'season type: regular season and playoffs' : `season type: ${type} only`,
  type === 'ALL' ? null : p => p[col.season_type] === type)
step(weeks ? `weeks: ${compact(weeks)}` : 'weeks: all', weeks ? p => weeks.has(+p[col.week]) : null)

const weeksSeen = {}
let lastDate = ''
for (const p of plays) {
  (weeksSeen[p[col.season]] ||= new Set()).add(+p[col.week])
  if (p[col.game_date] > lastDate) lastDate = p[col.game_date]
}
const games = new Set(plays.map(p => p[col.game_id])).size
const coverage = {
  games, weeksBySeason: Object.fromEntries(Object.entries(weeksSeen).map(([s, w]) => [s, compact(w)])), latestGameDate: lastDate || null,
}
const coverageLine = `${fmt(games)} games in the plays kept (latest game ${lastDate || 'none'}; weeks ${Object.entries(coverage.weeksBySeason).map(([s, w]) => `${s}: ${w}`).join('; ')})`
const pct = (x) => x === null ? 'n/a' : (100 * x).toFixed(1) + '%'
const printFilters = (L) => {
  L.push('FILTERS, IN ORDER (plays left after each)')
  steps.forEach((s, i) => L.push(`  ${String(i).padStart(2)}. ${s.filter.padEnd(86)} ${fmt(s.playsLeft).padStart(9)}`))
}

// ================================================================ 1. the search
if (args.search) {
  const words = String(args.search).trim()
  const needle = words.toLowerCase()
  const bySeason = {}
  const examples = []
  let hits = 0
  for (const p of plays) {
    const s = p[col.season]
    const b = (bySeason[s] ||= { searched: 0, matched: 0 })
    b.searched++
    if (p[col.desc].toLowerCase().includes(needle)) {
      b.matched++; hits++
      if (examples.length < 5) examples.push({ season: s, week: p[col.week], game: p[col.game_id], desc: p[col.desc] })
    }
  }
  const out = {
    question: `How many play descriptions contain the words "${words}"?`,
    definition: 'a description matches when it contains the words, in any case, anywhere in the text',
    filters: steps, coverage, words, searched: plays.length, matched: hits,
    bySeason: Object.fromEntries(Object.entries(bySeason).map(([s, b]) => [s, { searched: b.searched, matched: b.matched }])),
    examples,
    notInThisOutput: 'Anything the descriptions do not say. A play that happened but was written up in other words is not a match, and a description is one line of text, not a film clip.',
  }
  if (args.json) { console.log(JSON.stringify(out, null, 2)); process.exit(0) }
  const L = []
  L.push('QUESTION', `  ${out.question}`, `  ${out.definition}`, '')
  printFilters(L)
  L.push('', 'THEN, EVERY DESCRIPTION READ', `  ${coverageLine}`, '')
  L.push('RESULT')
  L.push(`  season   plays searched   descriptions containing "${words}"`)
  for (const [s, b] of Object.entries(out.bySeason)) L.push(`  ${s}     ${fmt(b.searched).padStart(14)}   ${fmt(b.matched).padStart(10)}`)
  L.push(`  all      ${fmt(plays.length).padStart(14)}   ${fmt(hits).padStart(10)}`)
  if (examples.length) { L.push('', `  examples (up to 5):`); for (const e of examples) L.push(`    ${e.season} week ${e.week}, ${e.game}: ${e.desc}`) }
  else L.push('', `  NO MATCH: not one of the ${fmt(plays.length)} descriptions contains "${words}".`)
  L.push('', 'NOT IN THIS OUTPUT', `  ${out.notInThisOutput}`)
  console.log(L.join('\n'))
  process.exit(0)
}

// The team filter is shared by questions 2 and 3: the team with the ball is the offense
// on a rush and the kicking team on a field goal.
const R = entry.rules
step(team ? `team with the ball: ${team} only` : notTeam ? `team with the ball: every team but ${notTeam}` : 'team with the ball: any',
  team ? p => p[col.posteam] === team : notTeam ? p => !blank(p[col.posteam]) && p[col.posteam] !== notTeam : null)
const dictionaryOut = (ruleWords) => ({ name: entry.name, kind: entry.kind === 'kick' ? 'kick' : 'rush', file: `dictionary/${entry.name}.json`, written: entry.written, by: entry.by || null, plainWords: entry.plainWords, rules: R, ruleWords, comparedWith: entry.comparedWith, cannotSee: entry.cannotSee || null })
const printDictionary = (L, ruleLine) => {
  L.push('DEFINITION, FROM THE DICTIONARY')
  L.push(`  dictionary/${entry.name}.json, written ${entry.written}${entry.by ? ` by ${entry.by}` : ''}`)
  L.push(`  "${entry.plainWords}"`)
  L.push(`  rules: ${ruleLine}`)
  L.push(`  compared with: ${entry.comparedWith}`)
  if (entry.cannotSee) L.push(`  cannot see: ${entry.cannotSee}`)
  L.push('')
}

// ================================================================ 3. the trend (a kick)
if (args.trend) {
  // Games are counted here, before the kick filter, so "per game" means per game played
  // in the seasons, weeks, and teams kept, not per game with a kick in it.
  const gamesBySeason = {}
  for (const p of plays) (gamesBySeason[p[col.season]] ||= new Set()).add(p[col.game_id])
  step('a field goal attempt with a result (made, missed, or blocked; a blocked kick counts as a miss) and a distance on file',
    p => p[col.field_goal_attempt] === '1' && ['made', 'missed', 'blocked'].includes(p[col.field_goal_result]) && !blank(p[col.kick_distance]))
  const isDefined = (p) => { const d = +p[col.kick_distance]; return d >= R.distanceMin && d <= R.distanceMax }
  const made = (p) => p[col.field_goal_result] === 'made'
  const BANDS = [['under 40', 0, 39], ['40 to 49', 40, 49], ['50 to 59', 50, 59], ['60 and over', 60, 999]]
  const bandOf = (d) => BANDS.find(b => d >= b[1] && d <= b[2])[0]
  const tally = () => ({ attempts: 0, made: 0 })
  const perSeason = new Map()
  for (const s of [...seasons].filter(s => gamesBySeason[s]).sort()) perSeason.set(String(s), { defined: tally(), other: tally(), bands: Object.fromEntries(BANDS.map(b => [b[0], tally()])) })
  const all = { defined: tally(), other: tally(), bands: Object.fromEntries(BANDS.map(b => [b[0], tally()])) }
  let definedTotal = 0
  for (const p of plays) {
    const t = perSeason.get(p[col.season])
    if (!t) continue
    const d = isDefined(p)
    for (const g of [d ? t.defined : t.other, d ? all.defined : all.other]) { g.attempts++; if (made(p)) g.made++ }
    if (d) {
      definedTotal++
      const b = bandOf(+p[col.kick_distance])
      for (const g of [t.bands[b], all.bands[b]]) { g.attempts++; if (made(p)) g.made++ }
    }
  }
  const rate = (g) => g.attempts ? g.made / g.attempts : null
  const gap = (t) => rate(t.defined) !== null && rate(t.other) !== null ? rate(t.defined) - rate(t.other) : null
  // The season still being played: the last one on file, when its latest game is recent.
  const latestSeason = Math.max(...[...perSeason.keys()].map(Number))
  const latestGame = plays.filter(p => +p[col.season] === latestSeason).reduce((m, p) => p[col.game_date] > m ? p[col.game_date] : m, '')
  const daysSince = latestGame ? (Date.now() - new Date(latestGame + 'T12:00:00Z').getTime()) / 86400000 : Infinity
  const inProgress = daysSince < 240 && latestSeason >= new Date().getFullYear() - 1 ? String(latestSeason) : null
  const warnings = []
  if (definedTotal === 0) warnings.push('NO RESULT: no kick in the plays kept matches the definition.')
  const rows = []
  for (const [s, t] of perSeason) {
    const g = gamesBySeason[s].size
    rows.push({ season: s, games: g, weeks: coverage.weeksBySeason[s] || null, inProgress: s === inProgress,
      defined: { ...t.defined, rate: rate(t.defined), perGame: g ? t.defined.attempts / g : null },
      other: { ...t.other, rate: rate(t.other) }, gap: gap(t),
      bands: bands ? Object.fromEntries(Object.entries(t.bands).map(([b, v]) => [b, { ...v, rate: rate(v) }])) : undefined })
    if (t.defined.attempts > 0 && t.defined.attempts < 50) warnings.push(`SMALL SAMPLE in ${s}: ${t.defined.attempts} kicks match the definition. One kick moves that season's rate by ${(100 / t.defined.attempts).toFixed(1)} points.`)
  }
  const totalGames = Object.values(gamesBySeason).reduce((n, g) => n + g.size, 0)
  const allRow = { season: 'all', games: totalGames, weeks: null, inProgress: false,
    defined: { ...all.defined, rate: rate(all.defined), perGame: totalGames ? all.defined.attempts / totalGames : null },
    other: { ...all.other, rate: rate(all.other) }, gap: gap(all),
    bands: bands ? Object.fromEntries(Object.entries(all.bands).map(([b, v]) => [b, { ...v, rate: rate(v) }])) : undefined }
  if (inProgress) warnings.push(`IN PROGRESS: ${inProgress} is still being played (weeks ${coverage.weeksBySeason[inProgress]} on file, latest game ${latestGame}). Its row is a partial season.`)
  const ruleLine = `a field goal attempt of ${R.distanceMin} to ${R.distanceMax} yards`
  const out = {
    question: 'Season by season, how often was the defined kick made, against every other field goal attempt, and how often was it tried per game?',
    definition: 'made = the kick was good; a blocked kick is a miss; rate = made divided by attempts; per game = attempts divided by the games kept that season',
    dictionary: dictionaryOut([ruleLine]),
    filters: steps, coverage,
    bands: bands ? BANDS.map(b => b[0]) : null,
    rows, all: allRow, inProgress, warnings,
    notInThisOutput: 'Whether kickers are "too good", or why a rate moved. A rate is how often each kind of kick was made in the plays kept; per game is how often it was tried. Neither says who decided to try, or what the wind was doing.',
  }
  if (args.json) { console.log(JSON.stringify(out, null, 2)); process.exit(0) }
  const L = []
  L.push('QUESTION', `  ${out.question}`, `  ${out.definition}`, '')
  printDictionary(L, ruleLine)
  printFilters(L)
  L.push('', 'THEN, THE DEFINITION SPLITS WHAT IS LEFT, SEASON BY SEASON')
  L.push(`  ${coverageLine}`)
  L.push(`  ${fmt(all.defined.attempts)} kicks match the definition; ${fmt(all.other.attempts)} are every other field goal attempt`)
  L.push('')
  L.push('RESULT')
  L.push('  season   games   defined kicks   made     rate   per game   other kicks   made     rate      gap')
  const line = (r) => `  ${String(r.season).padEnd(6)} ${fmt(r.games).padStart(7)}   ${fmt(r.defined.attempts).padStart(13)}   ${fmt(r.defined.made).padStart(4)}   ${pct(r.defined.rate).padStart(6)}   ${(r.defined.perGame === null ? 'n/a' : r.defined.perGame.toFixed(2)).padStart(8)}   ${fmt(r.other.attempts).padStart(11)}   ${fmt(r.other.made).padStart(4)}   ${pct(r.other.rate).padStart(6)}   ${(r.gap === null ? 'n/a' : (100 * r.gap).toFixed(1)).padStart(6)}${r.inProgress ? '   (in progress, weeks ' + r.weeks + ')' : ''}`
  for (const r of rows) L.push(line(r))
  L.push(line(allRow))
  L.push('  gap = the defined kicks\' rate minus the other kicks\' rate, in points')
  if (bands) {
    L.push('', 'BY DISTANCE (the defined kicks, in the chart standard\'s four bands)')
    L.push(`  season   ${BANDS.map(b => b[0].padStart(16)).join('   ')}`)
    const bl = (r) => `  ${String(r.season).padEnd(6)}   ${BANDS.map(b => { const v = r.bands[b[0]]; return (v.attempts ? `${pct(v.rate)} of ${fmt(v.attempts)}` : 'none').padStart(16) }).join('   ')}`
    for (const r of rows) L.push(bl(r))
    L.push(bl(allRow))
  }
  for (const w of warnings) L.push('', `  ${w}`)
  L.push('', 'NOT IN THIS OUTPUT', `  ${out.notInThisOutput}`)
  console.log(L.join('\n'))
  process.exit(0)
}

// ================================================================ 2. the defined play (a rush)
step(downs ? `downs: ${compact(downs)} only` : 'downs: any', downs ? p => downs.has(+p[col.down]) : null)
// The primary passer per team per game is read here, from every play the filters above
// kept, so the rush filter below cannot remove the passes it is counted from.
const passes = new Map()
for (const p of plays) {
  if (p[col.pass_attempt] !== '1') continue
  const who = blank(p[col.passer_player_id]) ? p[col.passer_player_name] : p[col.passer_player_id]
  if (blank(who)) continue
  const k = p[col.game_id] + '|' + p[col.posteam]
  const m = passes.get(k) || passes.set(k, new Map()).get(k)
  m.set(who, (m.get(who) || 0) + 1)
}
const primary = new Map()
for (const [k, m] of passes) primary.set(k, [...m.entries()].sort((a, b) => b[1] - a[1])[0][0])
step('a rush by a team with the ball (passes, kicks, punts, penalties that wiped the play out, kneel-downs, and two-point tries out)',
  p => !blank(p[col.posteam]) && p[col.rush_attempt] === '1' && p[col.play_type] === 'run')
const ytg = yardsToGo === null ? R.yardsToGoMax : yardsToGo
step(`yards to go: ${ytg} or fewer${yardsToGo === null ? " (the definition's distance)" : ` (the flag; the definition says ${R.yardsToGoMax})`}`,
  p => !blank(p[col.ydstogo]) && +p[col.ydstogo] <= ytg)
step(goalToGo ? 'goal to go: only plays where the yards to go were the yards to the goal line' : 'goal to go: any',
  goalToGo ? p => p[col.goal_to_go] === '1' : null)

// The definition splits what is left into the defined play and everything else.
const isDefined = (p) => {
  if (R.rusher === 'primary-passer') {
    const who = blank(p[col.rusher_player_id]) ? p[col.rusher_player_name] : p[col.rusher_player_id]
    if (blank(who) || primary.get(p[col.game_id] + '|' + p[col.posteam]) !== who) return false
  }
  if (R.formation === 'under-center' && p[col.shotgun] !== '0') return false
  if (R.formation === 'shotgun' && p[col.shotgun] !== '1') return false
  if (R.downs !== 'any' && !R.downs.includes(+p[col.down])) return false
  return true
}
const converted = (p) => p[col.first_down] === '1' || p[col.touchdown] === '1'
const ruleWords = [
  R.rusher === 'primary-passer' ? "the runner is the team's primary passer that game (the player with its most pass attempts)" : 'any runner',
  R.formation === 'under-center' ? 'not from shotgun' : R.formation === 'shotgun' ? 'from shotgun' : 'any formation',
  R.downs === 'any' ? 'any down' : `down ${R.downs.join(' or ')} only`,
]
const tally = () => ({ plays: 0, converted: 0 })
const groups = { defined: tally(), other: tally() }
const perKey = new Map()
for (const p of plays) {
  const d = isDefined(p)
  const g = d ? groups.defined : groups.other
  g.plays++; if (converted(p)) g.converted++
  if (by) {
    const key = by === 'season' ? p[col.season] : p[col.posteam]
    const t = perKey.get(key) || perKey.set(key, { defined: tally(), other: tally() }).get(key)
    const gg = d ? t.defined : t.other
    gg.plays++; if (converted(p)) gg.converted++
  }
}
const rate = (g) => g.plays ? g.converted / g.plays : null
const gap = (t) => rate(t.defined) !== null && rate(t.other) !== null ? rate(t.defined) - rate(t.other) : null
const warnings = []
if (groups.defined.plays === 0) warnings.push('NO RESULT: no play in the plays kept matches the definition.')
else if (groups.defined.plays < 50) warnings.push(`SMALL SAMPLE: ${groups.defined.plays} plays match the definition. One play moves its rate by ${(100 / groups.defined.plays).toFixed(1)} points.`)
if (groups.other.plays === 0) warnings.push('NO RESULT: no other rush in the same situation to compare with.')

const rows = []
if (by) {
  const keys = by === 'season' ? [...perKey.keys()].sort() : [...perKey.keys()].filter(k => perKey.get(k).defined.plays >= 10).sort((a, b) => perKey.get(b).defined.plays - perKey.get(a).defined.plays)
  for (const k of keys) {
    const t = perKey.get(k)
    rows.push({ key: k, defined: t.defined, other: t.other, gap: gap(t) })
  }
}

const out = {
  question: 'Does the defined play convert more often than every other rush in the same situation?',
  definition: 'converted = the play gained the first down or scored; rate = converted plays divided by plays',
  dictionary: dictionaryOut(ruleWords),
  filters: steps, coverage,
  result: {
    defined: { ...groups.defined, rate: rate(groups.defined) },
    other: { ...groups.other, rate: rate(groups.other) },
  },
  gapDefinedMinusOther: gap(groups),
  by: by ? { what: by, rows: rows.map(r => ({ key: r.key, defined: { ...r.defined, rate: rate(r.defined) }, other: { ...r.other, rate: rate(r.other) }, gap: r.gap })), minDefinedPlays: by === 'team' ? 10 : 1 } : null,
  warnings,
  notInThisOutput: 'Whether the play should be legal. A gap is how often each kind of play converted in the plays kept. It does not say why, and it does not say what the rule should be.',
}
if (args.json) { console.log(JSON.stringify(out, null, 2)); process.exit(0) }

const L = []
L.push('QUESTION', `  ${out.question}`, `  ${out.definition}`, '')
printDictionary(L, `${ruleWords.join('; ')}; ${R.yardsToGoMax} or fewer yards to go`)
printFilters(L)
L.push('')
L.push('THEN, THE DEFINITION SPLITS WHAT IS LEFT')
L.push(`  ${coverageLine}`)
L.push(`  ${fmt(groups.defined.plays)} plays match the definition; ${fmt(groups.other.plays)} are every other rush in the same situation`)
L.push('')
L.push('RESULT')
L.push('  group                            plays   converted       rate')
L.push(`  1  the defined play        ${fmt(groups.defined.plays).padStart(12)}   ${fmt(groups.defined.converted).padStart(9)}   ${pct(rate(groups.defined)).padStart(8)}`)
L.push(`  2  other short-yardage rushes ${fmt(groups.other.plays).padStart(9)}   ${fmt(groups.other.converted).padStart(9)}   ${pct(rate(groups.other)).padStart(8)}`)
if (out.gapDefinedMinusOther !== null) L.push(`  gap, the defined play minus the others: ${(100 * out.gapDefinedMinusOther).toFixed(1)} points`)
for (const w of warnings) L.push('', `  ${w}`)
if (by) {
  L.push('', `BY ${by.toUpperCase()}${by === 'team' ? ' (teams with 10 or more plays matching the definition)' : ''}`)
  L.push(`  ${by.padEnd(8)}  defined plays   rate      other rushes   rate        gap`)
  for (const r of rows) L.push(`  ${String(r.key).padEnd(8)}  ${fmt(r.defined.plays).padStart(13)}   ${pct(rate(r.defined)).padStart(6)}   ${fmt(r.other.plays).padStart(12)}   ${pct(rate(r.other)).padStart(6)}   ${(r.gap === null ? 'n/a' : (100 * r.gap).toFixed(1)).padStart(6)}`)
  if (!rows.length) L.push('  (no row qualifies)')
}
L.push('', 'NOT IN THIS OUTPUT', `  ${out.notInThisOutput}`)
console.log(L.join('\n'))
