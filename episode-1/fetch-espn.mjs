#!/usr/bin/env node
// fetch-espn.mjs: the fallback source for this season's plays.
//
// nflverse rebuilds its play-by-play file several times a day in season, so a game is
// normally there within hours. When one is not, this script fills the gap from ESPN's
// public game summaries, written in the slim file's 18 columns, so the tool is never
// behind the schedule on a show morning. nflverse stays the source for every game it
// has; ESPN supplies only the games it has not published yet.
//
//   node ./fetch-espn.mjs              write data/espn2026-slim.csv with the games nflverse lacks
//                                      (or remove it, when nflverse has every game played)
//   node ./fetch-espn.mjs --check      say which games are final and which nflverse has; write nothing
//   node ./fetch-espn.mjs --season Y   another season (default 2026)
//   node ./fetch-espn.mjs --force ID   treat a game nflverse has as missing (a test of the fill path)
//
// fetch-data.sh runs it after the nflverse download, and slim-data.mjs appends the file's
// games to the slim file. The daily GitHub Action sets NO_ESPN_FILL=1, so the committed
// file is nflverse only (CC BY 4.0); the fill happens on the machine that runs the show.
//
// How close the two sources are: on October 6, 2026, every one of the 16 Week 4 games was
// counted both ways. 20 of the 32 team-games had identical runs and passes; the other 12
// differed by one to three plays (penalties and fumbles classified differently), and no
// team's rush share moved more than 1.15 points. ESPN's API is public but undocumented.
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const DIR = dirname(fileURLToPath(import.meta.url))
const COLUMNS = [
  'season', 'season_type', 'week', 'game_id', 'game_date', 'home_team', 'away_team',
  'posteam', 'result', 'game_half', 'qtr', 'down', 'play_type', 'rush_attempt',
  'pass_attempt', 'qb_kneel', 'qb_spike', 'score_differential',
]
// ESPN's abbreviations where they differ from nflverse's (checked October 6, 2026: all 32).
const ABBR = { WSH: 'WAS', LAR: 'LA' }
const API = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl'

const args = process.argv.slice(2)
const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null }
const SEASON = Number(flag('--season') || 2026)
const CHECK = args.includes('--check')
const FORCE = new Set(args.flatMap((a, i) => args[i - 1] === '--force' ? a.split(',') : []))
const OUT = join(DIR, 'data', `espn${SEASON}-slim.csv`)

async function getJson(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(20000) })
  if (!r.ok) throw new Error(`${r.status} from ${url}`)
  return r.json()
}

// The game ids nflverse's raw file holds for this season, read from its second column.
function nflverseGames() {
  const file = join(DIR, 'data', `pbp${SEASON}.csv`)
  if (!existsSync(file)) return null
  const ids = new Set()
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const a = line.indexOf(','), b = line.indexOf(',', a + 1)
    if (a > 0 && b > a) ids.add(line.slice(a + 1, b))
  }
  ids.delete('game_id')
  return ids
}

// Every game of the season that is final, from the week-by-week scoreboards.
async function finalGames() {
  const now = await getJson(`${API}/scoreboard`)
  const type = now.season?.year === SEASON ? now.season.type : 3
  const week = now.season?.year === SEASON ? now.week.number : 5
  const spans = [[2, 'REG', type === 2 ? week : 18]]
  if (type === 3) spans.push([3, 'POST', week])
  const games = []
  for (const [st, label, last] of spans) {
    for (let w = 1; w <= last; w++) {
      const sb = await getJson(`${API}/scoreboard?dates=${SEASON}&seasontype=${st}&week=${w}`)
      for (const e of sb.events || []) {
        const c = e.competitions[0]
        if (c.status?.type?.name !== 'STATUS_FINAL') continue
        const home = c.competitors.find(t => t.homeAway === 'home'), away = c.competitors.find(t => t.homeAway === 'away')
        const h = ABBR[home.team.abbreviation] || home.team.abbreviation
        const a = ABBR[away.team.abbreviation] || away.team.abbreviation
        games.push({
          id: `${SEASON}_${String(w).padStart(2, '0')}_${a}_${h}`, espn: e.id, type: label, week: w,
          // nflverse dates a game by its kickoff in US Eastern time.
          date: new Date(c.date).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }),
          home: h, away: a, result: Number(home.score) - Number(away.score),
        })
      }
    }
  }
  return games.sort((x, y) => x.date.localeCompare(y.date) || x.id.localeCompare(y.id))
}

// One ESPN play, read the way nflverse marks a play. Returns null for clock events
// (timeouts, the two-minute warning, end of a period), which nflverse keeps as blank
// rows and the tool never counts.
export function classify(p) {
  const t = p.type?.text || ''
  const x = p.text || ''
  const row = (play_type, rush = 0, pass = 0, kneel = 0, spike = 0) => ({ play_type, rush, pass, kneel, spike })
  if (/^(Timeout|Official Timeout|End Period|End of Half|End of Game|Two-minute warning)/.test(t)) return null
  if (/^Kickoff|Kickoff/.test(t) && !/kneels/.test(x)) return row('kickoff')
  if (/Punt/.test(t)) return row('punt')
  if (/Field Goal/.test(t)) return row('field_goal')
  if (/Extra Point/.test(t)) return row('extra_point')
  if (t === 'Penalty' && /No Play/.test(x)) return row('no_play')
  if (/kneels?\b/.test(x)) return row('qb_kneel', 1, 0, 1, 0)
  if (/spiked?\b/.test(x)) return row('qb_spike', 0, 1, 0, 1)
  if (/^(Pass|Passing|Sack|Interception|Two Point Pass)/.test(t)) return row('pass', 0, 1)
  if (/^(Rush|Rushing|Two Point Rush)/.test(t)) return row('rush', 1, 0)
  // Fumbles, penalties that stood, and anything else: read the description.
  if (/ pass | sacked |scrambles.*pass/.test(x)) return row('pass', 0, 1)
  if (/ (up the middle|left|right) (end|guard|tackle)|scrambles|rushes| middle to /.test(x)) return row('rush', 1, 0)
  return row('other')
}

// The slim rows for one final game, from its ESPN summary.
export function rowsForGame(g, summary) {
  const plays = []
  for (const d of summary.drives?.previous || []) {
    const team = ABBR[d.team?.abbreviation] || d.team?.abbreviation || 'NA'
    for (const p of d.plays || []) plays.push({ team, p })
  }
  plays.sort((a, b) => Number(a.p.sequenceNumber) - Number(b.p.sequenceNumber))
  const rows = []
  let home = 0, away = 0  // the score before each play; ESPN's play scores are after it
  for (const { team, p } of plays) {
    const k = classify(p)
    if (k) {
      const period = p.period?.number || 0
      const half = period <= 2 ? 'Half1' : period <= 4 ? 'Half2' : 'Overtime'
      const down = p.start?.down > 0 ? p.start.down : 'NA'
      const diff = team === g.home ? home - away : team === g.away ? away - home : 'NA'
      rows.push([SEASON, g.type, g.week, g.id, g.date, g.home, g.away, team, g.result, half, period,
        down, k.play_type, k.rush, k.pass, k.kneel, k.spike, diff].join(','))
    }
    if (Number.isFinite(p.homeScore)) { home = p.homeScore; away = p.awayScore }
  }
  return rows
}

const games = await finalGames()
const have = nflverseGames()
const missing = games.filter(g => !have || !have.has(g.id) || FORCE.has(g.id))
const last = games.length ? games[games.length - 1] : null
console.log(`espn: ${games.length} games of ${SEASON} are final${last ? `, the latest ${last.id} on ${last.date}` : ''}`)
if (!have) console.log(`espn: no data/pbp${SEASON}.csv to compare with (run ./fetch-data.sh ${SEASON} first); every final game counts as missing`)
if (!missing.length) {
  console.log(`espn: nflverse has every one of them; nothing to fill`)
  if (existsSync(OUT)) { unlinkSync(OUT); console.log(`espn: removed ${OUT}`) }
  process.exit(0)
}
console.log(`espn: ${missing.length} game${missing.length === 1 ? '' : 's'} not yet in nflverse: ${missing.map(g => g.id).join(' ')}`)
if (CHECK) process.exit(0)

const rows = [COLUMNS.join(',')]
let other = 0
for (const g of missing) {
  const summary = await getJson(`${API}/summary?event=${g.espn}`)
  const r = rowsForGame(g, summary)
  other += r.filter(x => x.includes(',other,')).length
  rows.push(...r)
  console.log(`  ${g.id}: ${r.length} plays from ESPN`)
}
writeFileSync(OUT, rows.join('\n') + '\n')
if (other) console.log(`espn: ${other} play${other === 1 ? '' : 's'} could not be read as a run or a pass and will not be counted`)
console.log(`wrote ${OUT}: ${rows.length - 1} plays in ${missing.length} game${missing.length === 1 ? '' : 's'}; node ./slim-data.mjs appends them`)
