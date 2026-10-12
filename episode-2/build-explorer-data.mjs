#!/usr/bin/env node
// build-explorer-data.mjs: run the tool once for every definition the explorer page can
// build with its buttons, and save the answers as one file the page can load.
//
//   node ./build-explorer-data.mjs        writes ../docs/episode-2/explorer-data.json
//
// Episode 1's explorer changed a filter. This one changes the definition: who carried,
// how many yards to go, shotgun or not, which downs. Each combination of the page's
// buttons is a different dictionary entry, so this script writes every one of them into
// a scratch dictionary (54 entries), asks query-plays.mjs to measure with each for each
// set of seasons (378 answers, about three minutes), and keeps what the tool printed. It
// also keeps the four name searches the episode page quotes, and the by-season and
// by-team tables for the reference definition. The page shows exactly what the tool
// said; it computes nothing itself. No Claude call, no key. The scratch dictionary is
// removed afterward; the real one in ../dictionary is not touched.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const DIR = dirname(fileURLToPath(import.meta.url))
const SEASONS = ['2021-2025', '2026', '2021', '2022', '2023', '2024', '2025']
const RUSHERS = ['primary-passer', 'any']
const YARDS = [1, 2, 3]
const FORMATIONS = ['under-center', 'shotgun', 'any']
const DOWNS = ['any', '3,4', '4']
const SEARCHES = ['tush push', 'brotherly shove', 'sneak', 'push']
// The reference definition, the one the episode's dictionary entry is expected to carry.
const REF = { rusher: 'primary-passer', yards: 2, formation: 'under-center', downs: 'any' }

const dict = mkdtempSync(join(tmpdir(), 'mma-explorer-dict-'))
const env = { ...process.env, ANALYST_DICT_DIR: dict }
const tool = (a) => JSON.parse(execFileSync('node', [join(DIR, 'query-plays.mjs'), ...a, '--json'], { encoding: 'utf8', env }))
const nameOf = (r, y, f, d) => `v-${r}-${y}-${f}-${d.replace(',', '')}`

const definitions = {}
for (const r of RUSHERS) for (const y of YARDS) for (const f of FORMATIONS) for (const d of DOWNS) {
  const name = nameOf(r, y, f, d)
  const who = r === 'primary-passer' ? 'A quarterback run' : 'A rush by anyone'
  const dist = `with ${y === 1 ? 'one yard' : `${y} or fewer yards`} to go`
  const form = f === 'under-center' ? ', not from shotgun' : f === 'shotgun' ? ', from shotgun' : ''
  const down = d === 'any' ? '' : d === '4' ? ', on fourth down' : ', on third or fourth down'
  const entry = {
    name, written: '2026-10-12', by: 'build-explorer-data.mjs, one of the explorer page\'s definitions',
    plainWords: `${who} ${dist}${form}${down}.`,
    rules: { rusher: r, yardsToGoMax: y, formation: f, downs: d === 'any' ? 'any' : d.split(',').map(Number) },
    comparedWith: 'every other rush with the same yards to go',
  }
  writeFileSync(join(dict, `${name}.json`), JSON.stringify(entry, null, 2) + '\n')
  definitions[name] = { rusher: r, yards: y, formation: f, downs: d, plainWords: entry.plainWords }
}

const answers = {}
let latest = '', weeks2026 = ''
let n = 0
for (const seasons of SEASONS) for (const name of Object.keys(definitions)) {
  const args = ['--play', name, '--seasons', seasons]
  const out = tool(args)
  n++
  if (seasons === '2026' && name === nameOf(REF.rusher, REF.yards, REF.formation, REF.downs)) {
    latest = out.coverage.latestGameDate || ''
    weeks2026 = out.coverage.weeksBySeason['2026'] || ''
  }
  answers[`${seasons}|${name}`] = {
    // The command as a reader would type it against the real dictionary, where only the
    // reference definition has an entry; the page says which definitions have one.
    command: `node ./query-plays.mjs --play ${name} --seasons ${seasons}`,
    filters: out.filters,
    games: out.coverage.games,
    // Counts, not rounded rates: the page divides and rounds once, exactly as the tool
    // does, so the two can never disagree in the last digit.
    defined: { plays: out.result.defined.plays, converted: out.result.defined.converted },
    other: { plays: out.result.other.plays, converted: out.result.other.converted },
    gap: out.gapDefinedMinusOther === null ? null : +(100 * out.gapDefinedMinusOther).toFixed(1),
    warnings: out.warnings,
  }
  if (n % 54 === 0) console.log(`  ${seasons}: ${Object.keys(definitions).length} definitions measured`)
}

const refName = nameOf(REF.rusher, REF.yards, REF.formation, REF.downs)
const bySeason = tool(['--play', refName, '--seasons', '2021-2025', '--by', 'season']).by
const byTeam = tool(['--play', refName, '--seasons', '2021-2025', '--by', 'team']).by
const byTeam2026 = tool(['--play', refName, '--seasons', '2026', '--by', 'team']).by
const searches = {}
for (const words of SEARCHES) {
  const out = tool(['--search', words, '--seasons', '2021-2026'])
  searches[words] = { command: `node ./query-plays.mjs --search "${words}" --seasons 2021-2026`, searched: out.searched, matched: out.matched, bySeason: out.bySeason, examples: out.examples }
}
rmSync(dict, { recursive: true, force: true })

const file = join(DIR, '..', 'docs', 'episode-2', 'explorer-data.json')
writeFileSync(file, JSON.stringify({
  season2026: { latestGame: latest, weeks: weeks2026 },
  options: { SEASONS, RUSHERS, YARDS, FORMATIONS, DOWNS }, reference: REF, definitions, answers,
  bySeason, byTeam, byTeam2026, searches,
}) + '\n')
console.log(`wrote ${file}: ${Object.keys(answers).length} answers for ${Object.keys(definitions).length} definitions, ${SEARCHES.length} searches, 2026 through ${latest} (weeks ${weeks2026})`)
