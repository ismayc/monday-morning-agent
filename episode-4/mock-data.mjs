#!/usr/bin/env node
// mock-data.mjs: write a corrupted copy of the plays, for the "right number, wrong reason"
// rehearsal (mock.sh). Never run against the real data file in place.
//
//   node ./mock-data.mjs flip    data/plays.csv /some/scratch/plays.csv
//   node ./mock-data.mjs shuffle data/plays.csv /some/scratch/plays.csv
//
// flip:    every turnover is charged to the other team. On a play with an interception or a
//          lost fumble, the team with the ball and the defense swap places (posteam, defteam,
//          and fumbled_1_team), so the team charged with fewer giveaways LOSES about three
//          games in four. Every count the tool prints is correct for the file it was given;
//          the sign of the record is the opposite of the real one.
// shuffle: the games' final margins are shuffled among the games of the same season (the
//          result column), so who won has nothing to do with who turned it over. The battle
//          comes out near 50 percent. The score at the snap is untouched.
//
// The shuffle is fixed (a seeded generator), so two runs of the same mock agree.
import { readFileSync, writeFileSync } from 'node:fs'

const [kind, src, out] = process.argv.slice(2)
if (!['flip', 'shuffle'].includes(kind) || !src || !out) { console.error('usage: node ./mock-data.mjs flip|shuffle in.csv out.csv'); process.exit(64) }
if (src === out) { console.error('mock-data: refusing to overwrite the input file'); process.exit(64) }

const text = readFileSync(src, 'utf8')
const nl = text.indexOf('\n')
const header = text.slice(0, nl).split(',')
const col = Object.fromEntries(header.map((h, i) => [h, i]))
const N = header.length
for (const c of ['posteam', 'defteam', 'interception', 'fumble_lost', 'fumbled_1_team', 'result', 'game_id', 'season']) if (!(c in col)) { console.error(`mock-data: no ${c} column in ${src}`); process.exit(65) }

// Split a row at its first N-1 commas; the rest of the line is the description, kept as is.
const split = (line) => {
  const out = new Array(N)
  let from = 0
  for (let k = 0; k < N - 1; k++) { const j = line.indexOf(',', from); out[k] = line.slice(from, j); from = j + 1 }
  out[N - 1] = line.slice(from)
  return out
}
const lines = text.split('\n')
const rows = []
for (let i = 1; i < lines.length; i++) if (lines[i]) rows.push(split(lines[i]))

let changed = 0
if (kind === 'flip') {
  for (const r of rows) {
    if (!r[col.posteam]) continue
    if (r[col.interception] !== '1' && r[col.fumble_lost] !== '1') continue
    const pos = r[col.posteam], def = r[col.defteam]
    r[col.posteam] = def; r[col.defteam] = pos
    if (r[col.fumbled_1_team]) r[col.fumbled_1_team] = def
    changed++
  }
} else {
  // A fixed shuffle of the results among the games of one season (a 32-bit LCG, seed 2026).
  let seed = 2026 >>> 0
  const rand = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296 }
  const bySeason = {}
  for (const r of rows) { const s = r[col.season]; (bySeason[s] ||= new Map()).set(r[col.game_id], r[col.result]) }
  const newResult = new Map()
  for (const games of Object.values(bySeason)) {
    const ids = [...games.keys()], results = ids.map(g => games.get(g))
    for (let i = results.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [results[i], results[j]] = [results[j], results[i]] }
    ids.forEach((g, i) => newResult.set(g, results[i]))
  }
  for (const r of rows) { const v = newResult.get(r[col.game_id]); if (v !== r[col.result]) changed++; r[col.result] = v }
}
writeFileSync(out, [header.join(','), ...rows.map(r => r.join(','))].join('\n') + '\n')
console.log(`mock-data: ${kind}: ${changed.toLocaleString('en-US')} ${kind === 'flip' ? 'turnover plays re-charged to the other team' : 'plays given another game\'s final margin'}; wrote ${out}`)
