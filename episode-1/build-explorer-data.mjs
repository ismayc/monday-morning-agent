#!/usr/bin/env node
// build-explorer-data.mjs: run the tool once for every combination of filters the
// explorer page offers, and save the answers as one file the page can load.
//
//   node ./build-explorer-data.mjs        writes ../docs/episode-1/explorer-data.json
//
// A web page cannot run a program, and nobody should have to install anything to change
// a filter and see what happens. So this script asks query-plays.mjs every question the
// page's dropdowns can ask (189 of them, about a minute) and keeps what it printed:
// the filters in order with the plays left after each, and the result. The page shows
// exactly what the tool said; it computes nothing itself. No Claude call, no key.
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const DIR = dirname(fileURLToPath(import.meta.url))
const SEASONS = ['2021-2025', '2026', '2021', '2022', '2023', '2024', '2025']
const TYPES = ['ALL', 'REG', 'POST']
const HALVES = ['all', '1', '2']
const MARGINS = ['any', '8', '3']

const answers = {}
let latest = '', weeks2026 = ''
for (const seasons of SEASONS) for (const type of TYPES) for (const half of HALVES) for (const margin of MARGINS) {
  const args = ['--seasons', seasons]
  if (type !== 'ALL') args.push('--type', type)
  if (half !== 'all') args.push('--half', half)
  if (margin !== 'any') args.push('--margin', margin)
  const out = JSON.parse(execFileSync('node', [join(DIR, 'query-plays.mjs'), ...args, '--json'], { encoding: 'utf8' }))
  if (seasons === '2026' && type === 'ALL' && half === 'all' && margin === 'any') {
    latest = out.teamGames.latestGameDate || ''
    weeks2026 = out.teamGames.weeksBySeason['2026'] || ''
  }
  answers[[seasons, type, half, margin].join('|')] = {
    command: 'node ./query-plays.mjs ' + args.join(' '),
    filters: out.filters,
    games: out.teamGames.games, kept: out.teamGames.kept, ties: out.teamGames.tiesDropped,
    thin: out.teamGames.droppedForTooFewPlays,
    // Counts, not rounded rates: the page divides wins by team-games and rounds once, exactly
    // as the tool does, so the two can never disagree in the last digit.
    result: out.result.map(r => ({ group: r.group, from: r.shareFrom, to: r.shareTo, n: r.teamGames, wins: r.wins })),
    gap: out.gapTopMinusBottom === null ? null : +(100 * out.gapTopMinusBottom).toFixed(1),
    warnings: out.warnings,
  }
}
const file = join(DIR, '..', 'docs', 'episode-1', 'explorer-data.json')
writeFileSync(file, JSON.stringify({ season2026: { latestGame: latest, weeks: weeks2026 }, options: { SEASONS, TYPES, HALVES, MARGINS }, answers }) + '\n')
console.log(`wrote ${file}: ${Object.keys(answers).length} answers, 2026 through ${latest} (weeks ${weeks2026})`)
