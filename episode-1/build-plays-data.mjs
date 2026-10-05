#!/usr/bin/env node
// build-plays-data.mjs: describe the plays file for the web page that reads it.
//
//   node ./build-plays-data.mjs        writes ../docs/episode-1/plays-data.json
//
// Behind the scenes the plays are a CSV file, a quarter of a million lines of text. Nobody
// should need a terminal command to look at one, so this script reads the file once and
// saves what a person would want to see: every column name in the raw download with the
// ones kept and the betting lines marked, the play counts by season and by kind of play,
// and every play of the most recent week's games so a viewer can read a whole game row
// by row. The page shows this file; it computes nothing itself.
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const DIR = dirname(fileURLToPath(import.meta.url))
const SLIM = join(DIR, 'data', 'plays-slim.csv')
// The kept list as slim-data.mjs wrote it (importing that script would rerun the cut).
const COLUMNS = JSON.parse(readFileSync(join(DIR, 'data', 'plays-slim.meta.json'), 'utf8')).keptColumns
const OUT = join(DIR, '..', 'docs', 'episode-1', 'plays-data.json')
const BETTING = /spread|total_line|vegas|odds/

// The raw header comes from whichever season file is present (the daily refresh downloads
// them all; a fresh clone has none, and then the file already in docs/ keeps its list).
function rawHeader() {
  const files = readdirSync(join(DIR, 'data')).filter(f => /^pbp\d{4}\.csv$/.test(f)).sort()
  if (files.length) {
    const fd = readFileSync(join(DIR, 'data', files[files.length - 1]), 'utf8')
    return fd.slice(0, fd.indexOf('\n')).split(',')
  }
  if (existsSync(OUT)) return JSON.parse(readFileSync(OUT, 'utf8')).rawColumns
  console.error('build-plays-data: no data/pbp*.csv and no earlier plays-data.json (run ./fetch-data.sh first)')
  process.exit(66)
}

const raw = rawHeader()
const lines = readFileSync(SLIM, 'utf8').split('\n')
const header = lines[0].split(',')
if (header.join() !== COLUMNS.join()) { console.error('build-plays-data: plays-slim.csv header is not COLUMNS'); process.exit(65) }
const col = Object.fromEntries(header.map((c, i) => [c, i]))

const seasons = {}
const playTypes = {}
const games = new Map()  // game_id -> { season, week, date, home, away, rows: [] }
let plays = 0, latestDate = ''
for (let k = 1; k < lines.length; k++) {
  const line = lines[k]
  if (!line) continue
  const f = line.split(',')
  plays++
  const season = f[col.season], gid = f[col.game_id], date = f[col.game_date]
  const s = seasons[season] || (seasons[season] = { plays: 0, games: new Set(), weeks: 0 })
  s.plays++; s.games.add(gid); s.weeks = Math.max(s.weeks, +f[col.week])
  const t = f[col.play_type] || '(blank)'
  playTypes[t] = (playTypes[t] || 0) + 1
  if (date > latestDate) latestDate = date
  let g = games.get(gid)
  if (!g) games.set(gid, g = { season, week: +f[col.week], type: f[col.season_type], date, home: f[col.home_team], away: f[col.away_team], result: +f[col.result], rows: [] })
  g.rows.push(f)
}

// The most recent week on file: every game in it, every row, in the order the file has them.
const latestSeason = Math.max(...Object.keys(seasons).map(Number))
const latestWeek = seasons[latestSeason].weeks
const week = [...games.values()].filter(g => +g.season === latestSeason && g.week === latestWeek)
  .sort((a, b) => a.date.localeCompare(b.date) || a.home.localeCompare(b.home))
  .map(g => {
    // The two team lines a game gets in the tool: plays with a team in possession that
    // were a rush or a pass, kneels and spikes dropped, and the share that were rushes.
    // The same count query-plays.mjs makes, written down here so the page does not count.
    const teams = {}
    for (const f of g.rows) {
      const team = f[col.posteam]
      if (!team || team === 'NA') continue
      if (f[col.rush_attempt] !== '1' && f[col.pass_attempt] !== '1') continue
      if (f[col.qb_kneel] === '1' || f[col.qb_spike] === '1') continue
      const t = teams[team] || (teams[team] = { runs: 0, passes: 0 })
      if (f[col.rush_attempt] === '1') t.runs++; else t.passes++
    }
    return { id: g.rows[0][col.game_id], date: g.date, type: g.type, home: g.home, away: g.away, result: g.result, teams, rows: g.rows }
  })

const out = {
  rawColumns: raw,
  kept: COLUMNS,
  betting: raw.filter(c => BETTING.test(c)),
  plays, games: games.size, latestGame: latestDate,
  seasons: Object.fromEntries(Object.entries(seasons).map(([y, s]) => [y, { plays: s.plays, games: s.games.size, weeks: s.weeks }])),
  playTypes: Object.fromEntries(Object.entries(playTypes).sort((a, b) => b[1] - a[1])),
  latestWeek: { season: latestSeason, week: latestWeek, header, games: week },
  source: 'https://github.com/nflverse/nflverse-data/releases/tag/pbp',
}
writeFileSync(OUT, JSON.stringify(out))
console.log(`wrote ${OUT}: ${raw.length} raw columns, ${COLUMNS.length} kept, ${out.betting.length} betting; ${plays} plays in ${games.size} games through ${latestDate}; week ${latestWeek} of ${latestSeason}: ${week.length} games, ${week.reduce((n, g) => n + g.rows.length, 0)} rows`)
