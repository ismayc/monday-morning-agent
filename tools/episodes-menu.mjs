#!/usr/bin/env node
// episodes-menu.mjs: write the "Episodes" list into the strip across the top of every page.
//
//   node tools/episodes-menu.mjs            rewrite the list in every page under docs/
//   node tools/episodes-menu.mjs --check    exit 1 if any page's list is out of date
//
// The list comes from the README's episode table (one row per episode: its number and
// air date). An episode with a page (docs/episode-N/index.html) is a link; one without is
// gray text with its date. The page's own episode is marked. The strip's look is in
// docs/sheet.css ("Episodes"); docs/sheet.js closes the list on a click elsewhere.
//
// Where the list goes: a page whose strip lists several episodes (the series page, the
// game explainer) has those links replaced by the list; an episode's page keeps its own
// "Episode N" link first and gets the list right after it. Run it again after adding an
// episode's row to the README or its page under docs/.
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, relative, dirname, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DOCS = join(ROOT, 'docs')
const check = process.argv.includes('--check')

// The README's episode table: "| 3 | "Kickers..." | November 9, 2026 (aired; ...) | ..."
const episodes = []
for (const line of readFileSync(join(ROOT, 'README.md'), 'utf8').split('\n')) {
  const m = line.match(/^\|\s*(\d+)\s*\|[^|]*\|\s*([A-Z][a-z]+ \d{1,2}, \d{4})/)
  if (m) episodes.push({ n: +m[1], date: m[2], page: existsSync(join(DOCS, `episode-${m[1]}`, 'index.html')) })
}
if (episodes.length < 3) { console.error('episodes-menu: the README table has fewer than three episode rows'); process.exit(64) }

const pages = []
;(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) { if (name !== 'walkthrough') walk(p) } else if (name.endsWith('.html')) pages.push(p)
  }
})(DOCS)

const menuFor = (page) => {
  const up = relative(dirname(page), DOCS).split(sep).filter(Boolean).map(() => '..').join('/')
  const prefix = up ? up + '/' : ''
  const hereM = relative(DOCS, page).match(/^episode-(\d+)[\\/]/)
  const here = hereM ? +hereM[1] : null
  const rows = episodes.map(e => e.page
    ? `<a href="${prefix}episode-${e.n}/"${e.n === here ? ' class="here"' : ''}>Episode ${e.n} <small>${e.date}</small></a>`
    : `<span>Episode ${e.n} <small>${e.date}</small></span>`)
  return `<details class="episodes"><summary>Episodes</summary><div class="panel">${rows.join('')}</div></details>`
}

let changed = 0, stale = []
for (const page of pages) {
  const html = readFileSync(page, 'utf8')
  const nav = html.match(/<div class="top">[\s\S]*?<nav>([\s\S]*?)<\/nav>/)
  if (!nav) continue
  const inner = nav[1]
  const menu = menuFor(page)
  let out
  if (/<details class="episodes">/.test(inner)) {
    out = inner.replace(/<details class="episodes">[\s\S]*?<\/details>/, menu)
  } else {
    const links = [...inner.matchAll(/<a [^>]*>Episode \d+<\/a>/g)]
    if (!links.length) continue
    if (links.length >= 2) {
      const first = links[0], last = links[links.length - 1]
      out = inner.slice(0, first.index) + menu + inner.slice(last.index + last[0].length)
    } else {
      const only = links[0]
      out = inner.slice(0, only.index + only[0].length) + menu + inner.slice(only.index + only[0].length)
    }
  }
  if (out === inner) continue
  const rel = relative(ROOT, page)
  if (check) { stale.push(rel); continue }
  writeFileSync(page, html.replace(inner, out))
  changed++
  console.log(`episodes-menu: ${rel}`)
}
if (check) {
  if (stale.length) { console.error(`episodes-menu: out of date: ${stale.join(', ')}`); process.exit(1) }
  console.log(`episodes-menu: every page's list is current (${pages.length} pages, ${episodes.length} episodes)`)
} else {
  console.log(`episodes-menu: ${changed} page(s) rewritten, ${episodes.length} episodes (${episodes.filter(e => e.page).length} with pages)`)
}
