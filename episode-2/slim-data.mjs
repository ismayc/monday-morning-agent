#!/usr/bin/env node
// slim-data.mjs: cut the six nflverse play-by-play files down to the columns this
// episode reads, and write them as one file, data/plays.csv.
//
//   node ./slim-data.mjs            reads the raw seasons (see below) and writes data/plays.csv
//
// Why: the raw files are about 500 MB and 372 columns. Episode 2 needs 31 of them, and
// the list below is the complete answer to "what can the agent see?". It is longer than
// episode 1's 18 because the question changed: episode 1 counted rushes and passes per
// team; this episode has to find one play that has no name in the data, so it needs the
// down and distance, whether the offense was in shotgun, who ran and who passed, whether
// the play gained a first down or scored, and the play description itself, which is the
// text the agent searches for the play's name. No betting column (spread_line,
// total_line, vegas_*, *_odds) is on the list, so the tool cannot read one even by mistake.
//
// The raw seasons: episode 1 downloads them (../episode-1/fetch-data.sh) into
// ../episode-1/data/, and this script reads them from there, or from ./data/ when a copy
// is beside this file. Nothing is downloaded twice.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const DIR = dirname(fileURLToPath(import.meta.url))
// `desc` is last on purpose: it is the one column that holds commas and quotation marks,
// so the tool can split every other column at a comma and take the rest of the line as the
// description.
export const COLUMNS = [
  'season', 'season_type', 'week', 'game_id', 'game_date', 'home_team', 'away_team',
  'posteam', 'defteam', 'qtr', 'down', 'ydstogo', 'goal_to_go', 'yardline_100',
  'play_type', 'rush_attempt', 'pass_attempt', 'qb_kneel', 'qb_spike', 'qb_scramble',
  'shotgun', 'no_huddle', 'rusher_player_id', 'rusher_player_name',
  'passer_player_id', 'passer_player_name', 'yards_gained', 'first_down', 'touchdown',
  'score_differential', 'desc',
]
const SEASONS = [2021, 2022, 2023, 2024, 2025, 2026]
const RAW_DIRS = [join(DIR, 'data'), join(DIR, '..', 'episode-1', 'data')]

// Quote-aware split: the raw `desc` column contains commas.
function splitCsv(line) {
  const out = []
  let cur = '', inQ = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (inQ) {
      if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++ } else inQ = false }
      else cur += c
    } else if (c === '"') inQ = true
    else if (c === ',') { out.push(cur); cur = '' }
    else cur += c
  }
  out.push(cur)
  return out
}
// The description is written back quoted whenever it needs to be, CSV style.
const quote = (s) => /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s

const rows = [COLUMNS.join(',')]
let rawColumns = 0
const rawFrom = {}
for (const y of SEASONS) {
  const file = RAW_DIRS.map(d => join(d, `pbp${y}.csv`)).find(existsSync)
  if (!file) { console.error(`slim-data: missing pbp${y}.csv in ${RAW_DIRS.join(' or ')} (run ./fetch-data.sh first)`); process.exit(66) }
  rawFrom[y] = file
  const lines = readFileSync(file, 'utf8').split('\n')
  const header = splitCsv(lines[0])
  rawColumns = header.length
  const idx = COLUMNS.map(c => {
    const i = header.indexOf(c)
    if (i < 0) { console.error(`slim-data: column ${c} not in ${file}`); process.exit(65) }
    return i
  })
  const descAt = COLUMNS.length - 1
  let n = 0
  for (let k = 1; k < lines.length; k++) {
    if (!lines[k]) continue
    const f = splitCsv(lines[k])
    const kept = idx.map(i => f[i])
    for (let c = 0; c < descAt; c++) {
      if (kept[c].includes(',') || kept[c].includes('"')) { console.error(`slim-data: unexpected comma or quote in ${COLUMNS[c]} (${file} line ${k + 1})`); process.exit(65) }
    }
    kept[descAt] = quote(kept[descAt])
    rows.push(kept.join(','))
    n++
  }
  console.log(`  ${y}: ${n.toLocaleString('en-US')} plays, ${header.length} columns, from ${file}`)
}
const out = join(DIR, 'data', 'plays.csv')
writeFileSync(out, rows.join('\n') + '\n')
writeFileSync(join(DIR, 'data', 'plays.meta.json'), JSON.stringify({
  // No timestamp on purpose: the file changes only when the plays do, so a scheduled
  // refresh that finds nothing new leaves nothing to commit.
  rawColumns, keptColumns: COLUMNS, plays: rows.length - 1,
  source: 'https://github.com/nflverse/nflverse-data/releases/tag/pbp',
  // This file is nflverse only. Episode 1's ESPN fill (fetch-espn.mjs) writes episode 1's
  // 18 columns, not these 31, so a game nflverse has not published yet is not here either.
  espnGames: [],
}, null, 2) + '\n')
console.log(`wrote ${out}: ${(rows.length - 1).toLocaleString('en-US')} plays, ${COLUMNS.length} of ${rawColumns} columns`)
