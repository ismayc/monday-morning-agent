#!/usr/bin/env node
// slim-data.mjs: cut the six nflverse play-by-play files down to the columns this
// episode reads, and write them as one file, data/plays-slim.csv.
//
//   node ./slim-data.mjs            reads data/pbp2021.csv ... data/pbp2026.csv
//
// Why: the raw files are about 500 MB and 372 columns. The tool needs 18. The slim
// file is small enough to commit and to read in under a second, and the list below
// is the complete answer to "what can the agent see?". No betting column
// (spread_line, total_line, vegas_*, *_odds) is on it, so the tool cannot read one
// even by mistake.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const DIR = dirname(fileURLToPath(import.meta.url))
export const COLUMNS = [
  'season', 'season_type', 'week', 'game_id', 'game_date', 'home_team', 'away_team',
  'posteam', 'result', 'game_half', 'qtr', 'down', 'play_type', 'rush_attempt',
  'pass_attempt', 'qb_kneel', 'qb_spike', 'score_differential',
]
const SEASONS = [2021, 2022, 2023, 2024, 2025, 2026]

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

const rows = [COLUMNS.join(',')]
let rawColumns = 0
const espnGames = []
for (const y of SEASONS) {
  const file = join(DIR, 'data', `pbp${y}.csv`)
  if (!existsSync(file)) { console.error(`slim-data: missing ${file} (run ./fetch-data.sh first)`); process.exit(66) }
  const lines = readFileSync(file, 'utf8').split('\n')
  const header = splitCsv(lines[0])
  rawColumns = header.length
  const idx = COLUMNS.map(c => {
    const i = header.indexOf(c)
    if (i < 0) { console.error(`slim-data: column ${c} not in ${file}`); process.exit(65) }
    return i
  })
  const gameCol = header.indexOf('game_id')
  const games = new Set()
  let n = 0
  for (let k = 1; k < lines.length; k++) {
    if (!lines[k]) continue
    const f = splitCsv(lines[k])
    rows.push(idx.map(i => f[i]).join(','))
    games.add(f[gameCol])
    n++
  }
  console.log(`  ${y}: ${n.toLocaleString('en-US')} plays, ${header.length} columns`)

  // The fallback: games nflverse has not published yet, from ESPN (fetch-espn.mjs writes
  // this file in the slim columns, and removes it when there is nothing to fill).
  const fill = join(DIR, 'data', `espn${y}-slim.csv`)
  if (existsSync(fill)) {
    const extra = readFileSync(fill, 'utf8').split('\n').filter(Boolean)
    if (extra[0] !== COLUMNS.join(',')) { console.error(`slim-data: ${fill} is not in the slim columns`); process.exit(65) }
    const gi = COLUMNS.indexOf('game_id')
    let m = 0
    for (const line of extra.slice(1)) {
      const id = line.split(',')[gi]
      if (games.has(id)) continue
      rows.push(line); m++
      if (!espnGames.includes(id)) espnGames.push(id)
    }
    if (m) console.log(`  ${y}: + ${m.toLocaleString('en-US')} plays in ${espnGames.length} game${espnGames.length === 1 ? '' : 's'} from ESPN, not yet in nflverse: ${espnGames.join(' ')}`)
  }
}
const out = join(DIR, 'data', 'plays-slim.csv')
writeFileSync(out, rows.join('\n') + '\n')
writeFileSync(join(DIR, 'data', 'plays-slim.meta.json'), JSON.stringify({
  // No timestamp on purpose: the file changes only when the plays do, so a scheduled
  // refresh that finds nothing new leaves nothing to commit.
  rawColumns, keptColumns: COLUMNS, plays: rows.length - 1,
  source: 'https://github.com/nflverse/nflverse-data/releases/tag/pbp',
  // Games filled from ESPN by fetch-espn.mjs because nflverse had not published them.
  // Empty whenever nflverse is current, which is what the committed file always is.
  espnGames,
}, null, 2) + '\n')
console.log(`wrote ${out}: ${(rows.length - 1).toLocaleString('en-US')} plays, ${COLUMNS.length} of ${rawColumns} columns`)
