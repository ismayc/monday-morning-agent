#!/usr/bin/env node
// render-run.mjs: turn one agent run into a page a person can read.
//
//   node ./render-run.mjs rulings/run-2026-10-26-081500.jsonl            writes the .html beside it
//   node ./render-run.mjs rulings/run-2026-10-26-081500.jsonl out.html
//
// The terminal view (show-run.mjs) is a lot of text scrolling past. This writes the same
// run as one page, styled as the replay monitor in the booth: the claim and the ruling at
// the top, then a clock down the left edge with each thing the agent did beside it, in
// order. A search shows its count per season. A dictionary entry the agent wrote shows as
// the entry, in full. A comparison shows the definition it applied, the filters as a
// funnel with the plays left after each, and the two groups as a conversion bar and a
// table. The full ruling is at the end. show-run.mjs calls this at the end of a live run;
// the command above rebuilds the page for an older run from its event stream. Nothing
// here runs the agent or the tool.
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const num = (s) => Number(String(s).replace(/,/g, ''))
const fmt = (n) => n.toLocaleString('en-US')

// ------------------------------------------------- one tool call, from the event
// The agent has two tools and two folders. A Bash call carries its command (the data tool,
// or the chart renderer); a Write (or Edit) call carries the file it wrote and the text,
// which for this agent is a dictionary entry or, since episode 3, a chart spec.
export function describeCall(part) {
  const inp = part.input || {}
  const short = (p) => String(p || '').split('/').slice(-2).join('/')
  const what = (p) => /\/charts\/[^/]+\.json$/.test(String(p || '')) ? 'spec' : 'entry'
  if (part.name === 'Bash') return { tool: 'Bash', command: inp.command || JSON.stringify(inp), render: /render-chart\.mjs/.test(String(inp.command || '')) }
  if (part.name === 'Write') return { tool: 'Write', command: `wrote ${short(inp.file_path)}`, path: inp.file_path, what: what(inp.file_path), content: inp.content || '' }
  if (part.name === 'Edit' || part.name === 'MultiEdit') return { tool: 'Edit', command: `edited ${short(inp.file_path)}`, path: inp.file_path, what: what(inp.file_path), content: inp.new_string || JSON.stringify(inp.edits || inp, null, 2) }
  return { tool: part.name || 'tool', command: `${part.name}: ${JSON.stringify(inp)}` }
}

// ------------------------------------------------- the run, from the event stream
export const wordsAbove = (md) => (String(md || '').split(/^.*\*\*Commands run/m)[0].match(/\S+/g) || []).length
const mss = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` }
export const startFromName = (path) => {
  const m = String(path || '').match(/run-(\d{4})-(\d\d)-(\d\d)-(\d\d)(\d\d)(\d\d)\.jsonl$/)
  return m ? new Date(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime() : null
}
export function runFromStream(text, limit = 500, start = null) {
  const run = { items: [], ruling: null, seconds: null, calls: 0, denied: 0, status: 1, sentBack: 0, limit }
  const pending = new Map()
  let heldText = null
  let ts = null, firstTs = null, lastTs = null, t0 = start
  for (const line of String(text).split('\n')) {
    let ev
    try { ev = JSON.parse(line) } catch { continue }
    if (ev.timestamp) { ts = Date.parse(ev.timestamp); if (firstTs === null) firstTs = ts; lastTs = ts }
    if (ev.type === 'assistant') {
      for (const part of ev.message?.content || []) {
        if (part.type === 'text' && part.text.trim()) { if (heldText) run.items.push(heldText); heldText = { kind: 'note', ts, text: part.text.trim() } }
        if (part.type === 'tool_use') {
          if (heldText) { run.items.push(heldText); heldText = null }
          run.calls++
          pending.set(part.id, { kind: 'call', n: run.calls, ts, ...describeCall(part) })
        }
      }
    } else if (ev.type === 'user') {
      for (const part of ev.message?.content || []) {
        if (part.type !== 'tool_result') continue
        const call = pending.get(part.tool_use_id) || { kind: 'call', n: '?', ts, tool: 'Bash', command: '(unknown call)' }
        pending.delete(part.tool_use_id)
        const body = Array.isArray(part.content) ? part.content.map(c => c.text || '').join('\n') : part.content
        if (part.is_error) run.denied++
        run.items.push({ ...call, text: String(body ?? ''), error: !!part.is_error })
      }
    } else if (ev.type === 'result') {
      // A second result on the same stream is the runner sending the ruling back once
      // (over the word limit, or missing its citation). Keep it in the log, where it happened.
      if (run.ruling !== null) {
        run.sentBack++
        run.items.push({ kind: 'ruling', ts: run.rulingTs, text: run.ruling, words: wordsAbove(run.ruling) })
      }
      run.ruling = ev.result || ''
      run.rulingTs = ts
      run.status = ev.is_error ? 1 : 0
      if (ev.duration_ms) run.seconds = (run.seconds || 0) + Math.round(ev.duration_ms / 1000)
      if (t0 === null && lastTs !== null && ev.duration_ms) t0 = lastTs - ev.duration_ms
      if (heldText && heldText.text !== run.ruling.trim()) run.items.push(heldText)
      heldText = null
    }
  }
  if (heldText) run.items.push(heldText)
  if (t0 === null) t0 = firstTs
  for (const it of run.items) { it.at = it.ts != null && t0 !== null ? mss(it.ts - t0) : ''; delete it.ts }
  run.words = run.ruling === null ? null : wordsAbove(run.ruling)
  run.started = t0 !== null ? new Date(t0).toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' }) : ''
  return run
}

// ------------------------------------------------- one tool output, read back
// query-plays.mjs prints fixed-format text. Read the parts the page draws; anything it
// does not recognize is shown as the text it was.
export function parseTool(text) {
  const lines = String(text).split('\n')
  const t = { mode: null, question: [], definition: [], filters: [], then: [], groups: [], gap: null, by: null, byRows: [], search: [], noMatch: null, examples: [], warnings: [], trend: [], bands: null, bandRows: [], ok: false }
  let section = ''
  for (const raw of lines) {
    const l = raw.trimEnd()
    if (/^QUESTION/.test(l)) { section = 'q'; continue }
    if (/^DEFINITION, FROM THE DICTIONARY/.test(l)) { section = 'd'; if (t.mode !== 'trend') t.mode = 'play'; continue }
    if (/^FILTERS/.test(l)) { section = 'f'; continue }
    if (/^THEN, /.test(l)) { section = 't'; continue }
    if (/^RESULT/.test(l)) { section = 'r'; continue }
    const byHead = l.match(/^BY (SEASON|TEAM)/)
    if (byHead) { section = 'b'; t.by = byHead[1].toLowerCase(); continue }
    if (/^BY DISTANCE/.test(l)) { section = 'bd'; continue }
    if (/^NOT IN THIS OUTPUT/.test(l)) { section = 'n'; continue }
    const w = l.match(/^\s*((SMALL SAMPLE|NO RESULT|IN PROGRESS)[^:]*:.*)$/)
    if (w) { t.warnings.push(w[1]); continue }
    const nm = l.match(/^\s*NO MATCH: (.*)$/)
    if (nm) { t.noMatch = nm[1]; continue }
    if (!l.trim()) continue
    if (section === 'q') { t.question.push(l.trim()); if (/contain the words/.test(l)) t.mode = 'search'; if (/^Season by season/.test(l.trim())) t.mode = 'trend' }
    else if (section === 'd') t.definition.push(l.trim())
    else if (section === 'f') {
      const m = l.match(/^\s*(\d+)\.\s+(.*?)\s{2,}([\d,]+)\s*$/)
      if (m) t.filters.push({ n: +m[1], label: m[2], left: num(m[3]) })
    } else if (section === 't') t.then.push(l.trim())
    else if (section === 'r' && t.mode === 'trend') {
      // One row per season: "2021  285  191  127  66.5%  0.67  885  791  89.4%  -22.9   (in progress, weeks 1-7)".
      const m = l.match(/^\s*(\d{4}|all)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([\d.]+%|n\/a)\s+([\d.]+|n\/a)\s+([\d,]+)\s+([\d,]+)\s+([\d.]+%|n\/a)\s+(-?[\d.]+|n\/a)(?:\s+\(in progress, weeks ([\d,-]+)\))?\s*$/)
      if (m) t.trend.push({ season: m[1], games: num(m[2]), attempts: num(m[3]), made: num(m[4]), rate: m[5], perGame: m[6], otherAttempts: num(m[7]), otherMade: num(m[8]), otherRate: m[9], gap: m[10], weeks: m[11] || null })
    } else if (section === 'bd') {
      const h = l.match(/^\s*season\s+(.*)$/)
      if (h) { t.bands = h[1].trim().split(/\s{3,}/); continue }
      const m = l.match(/^\s*(\d{4}|all)\s+(.*)$/)
      if (m) t.bandRows.push({ season: m[1], cells: m[2].trim().split(/\s{3,}/) })
    } else if (section === 'r') {
      // The two groups: "1  the defined play  1,554  1,199  77.2%" and "2  other short-yardage rushes ...".
      let m = l.match(/^\s*(\d)\s+(the defined play|other short-yardage rushes)\s+([\d,]+)\s+([\d,]+)\s+([\d.]+)%\s*$/)
      if (m) { t.groups.push({ n: +m[1], group: m[2], plays: num(m[3]), converted: num(m[4]), rate: +m[5] }); continue }
      const g = l.match(/gap, the defined play minus the others: (-?[\d.]+) points/)
      if (g) { t.gap = +g[1]; continue }
      // A search: "2021   49,922   0" and "all   260,927   0".
      m = l.match(/^\s*(\d{4}|all)\s+([\d,]+)\s+([\d,]+)\s*$/)
      if (m) { t.search.push({ season: m[1], searched: num(m[2]), matched: num(m[3]) }); continue }
      if (/^\s*examples/.test(l)) { section = 'e'; continue }
    } else if (section === 'e') { if (/^\s{4}/.test(raw)) t.examples.push(l.trim()) }
    else if (section === 'b') {
      const m = l.match(/^\s*(\S+)\s+([\d,]+)\s+([\d.]+%|n\/a)\s+([\d,]+)\s+([\d.]+%|n\/a)\s+(-?[\d.]+|n\/a)\s*$/)
      if (m) t.byRows.push({ key: m[1], definedPlays: num(m[2]), definedRate: m[3], otherPlays: num(m[4]), otherRate: m[5], gap: m[6] })
    }
  }
  t.ok = t.filters.length > 0 && (t.groups.length > 0 || t.search.length > 0 || t.trend.length > 0)
  return t
}

// render-chart.mjs prints the rules it checked and "wrote <path>"; the SVG is read from
// that path and shown inline, so the page carries the chart as the renderer drew it.
export function parseRender(text) {
  const rules = [], rows = []
  let wrote = null
  for (const raw of String(text).split('\n')) {
    const l = raw.trim()
    const r = l.match(/^(rules? [\d, and]+ \(.*)$/)
    if (r) { rules.push(r[1]); continue }
    const w = l.match(/^wrote (.+\.svg)$/)
    if (w) { wrote = w[1]; continue }
    if (/^\d{4}\*?\s+defined/.test(l)) rows.push(l)
  }
  let svg = null
  if (wrote) { try { svg = readFileSync(wrote, 'utf8') } catch { svg = null } }
  return { rules, rows, wrote, svg }
}

// ------------------------------------------------- the ruling, from markdown
function rulingHtml(md) {
  const out = []
  let inCode = false, code = []
  const para = [], cmds = []
  const flushCmds = () => { if (cmds.length) { out.push(`<pre>${esc(cmds.join('\n'))}</pre>`); cmds.length = 0 } }
  const flush = () => {
    flushCmds()
    if (!para.length) return
    const p = para.join(' ')
    const cls = /^\*\*Ruling:?\*\*/.test(p) ? ' class="call"' : /^\*\*Definition used:?\*\*/.test(p) ? ' class="cite"' : /^\*\*Chart:?\*\*/.test(p) ? ' class="chart"' : ''
    out.push(`<p${cls}>${esc(p).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>')}</p>`)
    para.length = 0
  }
  for (const line of String(md).split('\n')) {
    if (/^```/.test(line)) {
      if (inCode) { out.push(`<pre>${esc(code.join('\n'))}</pre>`); code = [] }
      else flush()
      inCode = !inCode; continue
    }
    if (inCode) { code.push(line); continue }
    if (/^\s*`?node (\.\/query-plays\.mjs|\.\.\/charts\/render-chart\.mjs)/.test(line)) { if (para.length) flush(); cmds.push(line.trim().replace(/^`|`$/g, '')); continue }
    const item = line.match(/^\s*[-*]\s+(.*)$/)
    if (item) { flush(); para.push(item[1]); flush(); continue }
    if (!line.trim()) { flush(); continue }
    para.push(line.trim())
  }
  flush()
  if (inCode && code.length) out.push(`<pre>${esc(code.join('\n'))}</pre>`)
  return out.join('\n')
}

const labeledLine = (md, label) => {
  const m = String(md || '').match(new RegExp(`\\*\\*${label}:?\\*\\*,?\\s*(.+)`))
  return m ? m[1].replace(/^(?:as|restated as)[^:]{0,60}:\s*/i, '').replace(/\*\*/g, '').trim() : ''
}

// ------------------------------------------------- the page
const clock = (at) => `<span class="clock">${at ? esc(at) : ''}</span>`

function funnelHtml(t) {
  const top = t.filters.length ? t.filters[0].left : 0
  return t.filters.map((f, i) => {
    const before = i ? t.filters[i - 1].left : f.left
    const took = before - f.left
    const w = top ? (100 * f.left / top) : 0, u = top ? (100 * took / top) : 0
    return `<li${took ? ' class="cut"' : ''}><div class="row"><span>${took ? `<span class="took">took out ${fmt(took)}</span>` : ''}${esc(f.label)}</span><span class="n">${fmt(f.left)}</span></div><div class="bar"><i style="width:${w.toFixed(2)}%"></i>${took ? `<u style="left:${w.toFixed(2)}%;width:${u.toFixed(2)}%"></u>` : ''}</div></li>`
  }).join('\n')
}

function callHtml(item) {
  if (item.tool !== 'Bash') {
    // A dictionary entry or a chart spec written, shown in full: this is the memory the
    // series keeps.
    const spec = item.what === 'spec'
    const noun = spec ? 'Chart spec' : 'Entry'
    const head = `<div class="callhead"><b>${noun} ${item.tool === 'Edit' ? 'edited' : 'written'} ${esc(item.n)}</b><code>${esc(item.command)}</code></div>`
    if (item.error) return `<section class="call">${clock(item.at)}<div class="frame">${head}<p class="refused">Refused or failed: ${esc(item.text.split('\n')[0])}</p></div></section>`
    let pretty = item.content || ''
    try { pretty = JSON.stringify(JSON.parse(pretty), null, 2) } catch { /* shown as written */ }
    const then = spec
      ? 'Written by the agent with its file permission scoped to the charts folder. The renderer draws only from this spec, under the standard, and only from rows the tool prints; the runner fails a later run that changes it.'
      : 'Written by the agent with its file permission scoped to the dictionary folder. The tool reads this file from now on; the runner fails a later run that changes it.'
    return `<section class="call">${clock(item.at)}<div class="frame entry">${head}<pre class="json">${esc(pretty)}</pre><p class="then">${then}</p></div></section>`
  }
  const head = `<div class="callhead"><b>${item.render ? 'Chart drawn' : 'Tool call'} ${esc(item.n)}</b><code>${esc(item.command)}</code></div>`
  if (item.error) return `<section class="call">${clock(item.at)}<div class="frame">${head}<p class="refused">Refused or failed: ${esc(item.text.split('\n')[0])}</p></div></section>`
  if (item.render) {
    const r = parseRender(item.text)
    if (!r.wrote) return `<section class="call">${clock(item.at)}<div class="frame">${head}<pre class="raw">${esc(item.text)}</pre></div></section>`
    const rules = r.rules.length ? `<ul class="rules">${r.rules.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''
    const fig = r.svg ? `<figure class="chart">${r.svg.replace(/<\?xml[^>]*>/, '')}<figcaption>The chart as the renderer drew it, from <code>${esc(r.wrote.split('/').slice(-2).join('/'))}</code>. Nothing on it was typed by the agent.</figcaption></figure>` : `<p class="empty">The renderer wrote <code>${esc(r.wrote)}</code>, which this page could not read back.</p>`
    return `<section class="call">${clock(item.at)}<div class="frame chartframe">${head}${rules}${fig}</div></section>`
  }
  const t = parseTool(item.text)
  if (!t.ok) return `<section class="call">${clock(item.at)}<div class="frame">${head}<pre class="raw">${esc(item.text)}</pre></div></section>`
  const warn = t.warnings.map(w => `<p class="warn">${esc(w)}</p>`).join('')
  if (t.mode === 'search') {
    const all = t.search.find(r => r.season === 'all')
    const rows = t.search.filter(r => r.season !== 'all').map(r => `<tr><td>${esc(r.season)}</td><td class="num">${fmt(r.searched)}</td><td class="num">${fmt(r.matched)}</td></tr>`).join('')
    const words = (t.question[0] || '').match(/"([^"]*)"/)?.[1] || ''
    const headline = all ? `<div class="count${all.matched ? '' : ' zero'}"><b>${fmt(all.matched)}</b><span>of ${fmt(all.searched)} play descriptions contain "${esc(words)}"</span></div>` : ''
    const ex = t.examples.length ? `<h3>Examples</h3><ul class="examples">${t.examples.map(e => `<li>${esc(e)}</li>`).join('')}</ul>` : ''
    return `<section class="call">${clock(item.at)}
<div class="frame">${head}
<div class="work">
<div><h3>Filters, in order</h3><ol class="filters">${funnelHtml(t)}</ol><p class="then">${t.then.map(esc).join('<br>')}</p></div>
<div><h3>Result</h3>${headline}${t.noMatch ? `<p class="nomatch">${esc(t.noMatch)}</p>` : ''}<div class="scroll"><table><thead><tr><th>Season</th><th class="num">Descriptions read</th><th class="num">Containing the words</th></tr></thead><tbody>${rows}</tbody></table></div>${ex}</div>
</div></div></section>`
  }
  const def = t.definition.length ? `<div class="definition"><h3>Definition, from the dictionary</h3>${t.definition.map((d, i) => `<p${i === 1 ? ' class="plain"' : ''}>${esc(d)}</p>`).join('')}</div>` : ''
  if (t.mode === 'trend') {
    const rows = t.trend.map(r => `<tr class="${r.season === 'all' ? 'rall' : ''}"><td>${esc(r.season)}${r.weeks ? ` <span class="prog">in progress, weeks ${esc(r.weeks)}</span>` : ''}</td><td class="num">${fmt(r.games)}</td><td class="num">${fmt(r.attempts)}</td><td class="num">${fmt(r.made)}</td><td class="num"><span class="y">${esc(r.rate)}</span></td><td class="num">${esc(r.perGame)}</td><td class="num">${fmt(r.otherAttempts)}</td><td class="num"><span class="b">${esc(r.otherRate)}</span></td><td class="num">${esc(r.gap)}</td></tr>`).join('')
    const bands = t.bands ? `<h3>By distance, the defined kicks</h3><div class="scroll"><table><thead><tr><th>Season</th>${t.bands.map(b => `<th class="num">${esc(b)}</th>`).join('')}</tr></thead><tbody>${t.bandRows.map(r => `<tr class="${r.season === 'all' ? 'rall' : ''}"><td>${esc(r.season)}</td>${r.cells.map(c => `<td class="num">${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : ''
    return `<section class="call">${clock(item.at)}
<div class="frame">${head}
${def}
<div class="work">
<div><h3>Filters, in order</h3><ol class="filters">${funnelHtml(t)}</ol><p class="then">${t.then.map(esc).join('<br>')}</p></div>
<div><h3>Result, season by season</h3>${warn}<div class="scroll"><table><thead><tr><th>Season</th><th class="num">Games</th><th class="num">Defined kicks</th><th class="num">Made</th><th class="num">Rate</th><th class="num">Per game</th><th class="num">Other kicks</th><th class="num">Rate</th><th class="num">Gap</th></tr></thead><tbody>${rows}</tbody></table></div>${bands}</div>
</div></div></section>`
  }
  const defined = t.groups.find(g => g.group === 'the defined play'), other = t.groups.find(g => g.group === 'other short-yardage rushes')
  const field = defined && other ? `<div class="field" role="img" aria-label="The defined play converted ${defined.rate.toFixed(1)} percent of the time, other short-yardage rushes ${other.rate.toFixed(1)} percent">
<div class="gap" style="left:${Math.min(defined.rate, other.rate)}%;width:${Math.abs(defined.rate - other.rate)}%"></div>
<div class="mk least" style="left:${other.rate}%"><b>${other.rate.toFixed(1)}%</b></div><div class="mk most" style="left:${defined.rate}%"><b>${defined.rate.toFixed(1)}%</b></div></div>` : ''
  const rows = t.groups.map(g => `<tr class="${g.group === 'the defined play' ? 'rmost' : 'rleast'}"><td><span>${esc(g.n)}  ${esc(g.group)}</span></td><td class="num">${fmt(g.plays)}</td><td class="num">${fmt(g.converted)}</td><td class="num">${g.rate.toFixed(1)}%</td></tr>`).join('')
  const byTable = t.by ? `<h3>By ${esc(t.by)}</h3><div class="scroll"><table><thead><tr><th>${esc(t.by === 'season' ? 'Season' : 'Team')}</th><th class="num">Defined plays</th><th class="num">Rate</th><th class="num">Other rushes</th><th class="num">Rate</th><th class="num">Gap</th></tr></thead><tbody>${t.byRows.map(r => `<tr><td>${esc(r.key)}</td><td class="num">${fmt(r.definedPlays)}</td><td class="num">${esc(r.definedRate)}</td><td class="num">${fmt(r.otherPlays)}</td><td class="num">${esc(r.otherRate)}</td><td class="num">${esc(r.gap)}</td></tr>`).join('') || '<tr><td colspan="6">No row qualifies.</td></tr>'}</tbody></table></div>` : ''
  return `<section class="call">${clock(item.at)}
<div class="frame">${head}
${def}
<div class="work">
<div><h3>Filters, in order</h3><ol class="filters">${funnelHtml(t)}</ol><p class="then">${t.then.map(esc).join('<br>')}</p></div>
<div><h3>Result</h3>${field}${warn}${t.groups.length ? `<div class="scroll"><table><thead><tr><th>Group</th><th class="num">Plays</th><th class="num">Converted</th><th class="num">Rate</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<p class="empty">No groups in this output.</p>'}${t.gap !== null ? `<p class="gapline">Gap, the defined play minus the others: <b>${t.gap.toFixed(1)} points</b></p>` : ''}${byTable}</div>
</div></div></section>`
}

export function renderRun(run) {
  const limit = run.limit || 500
  const items = run.items.map(it => it.kind === 'call' ? callHtml(it)
    : it.kind === 'ruling' ? `<section class="note">${clock(it.at)}<div><p class="warn">First ruling: ${it.words} words above the commands${it.words > limit ? `, over the limit of ${limit}` : ''}. The runner sent it back once.</p><div class="ruling first">${rulingHtml(it.text)}</div></div></section>`
    : `<section class="note">${clock(it.at)}<p>${esc(it.text).replace(/\n+/g, '<br>')}</p></section>`).join('\n')
  const verdict = labeledLine(run.ruling, 'Ruling')
  const cite = labeledLine(run.ruling, 'Definition used')
  const chart = labeledLine(run.ruling, 'Chart')
  const claim = run.claim || labeledLine(run.ruling, 'The claim')
  const claimNote = run.claim ? '' : ' <span class="restated">(as the agent restated it; the stream does not carry the claim)</span>'
  const words = run.words ?? (run.ruling ? wordsAbove(run.ruling) : null)
  const entries = run.items.filter(it => it.kind === 'call' && it.tool !== 'Bash' && !it.error && it.what !== 'spec').length
  const specs = run.items.filter(it => it.kind === 'call' && it.tool !== 'Bash' && !it.error && it.what === 'spec').length
  const drawn = run.items.filter(it => it.kind === 'call' && it.render && !it.error).length
  const meta = [
    run.started ? `Started ${esc(run.started)}` : '',
    `${run.calls} tool call${run.calls === 1 ? '' : 's'}`,
    entries ? `${entries} dictionary entr${entries === 1 ? 'y' : 'ies'} written` : '',
    specs ? `${specs} chart spec${specs === 1 ? '' : 's'} written` : '',
    drawn ? `${drawn} chart${drawn === 1 ? '' : 's'} drawn` : '',
    `${run.denied} refused or failed`,
    run.seconds !== null && run.seconds !== undefined ? `${run.seconds} seconds` : '',
    words === null ? '' : `${words} words above the commands${run.sentBack ? ', sent back once' : ''}${words > limit ? `, over the limit of ${limit}` : ''}`,
  ].filter(Boolean).join('. ') + '.'
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(claim ? `Under review: ${claim}` : 'Under review: a run of the analyst')}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=Barlow:wght@400;500;600&display=swap">
<style>
  /* The replay monitor in the booth. The episode pages are a coach's white call sheet;
     a run is the tape being reviewed, so this page is the dark screen it plays on, with a
     clock down the left edge. The broadcast's two field lines keep their colors: blue for
     the other short-yardage rushes (the line of scrimmage, where the field starts), yellow
     for the defined play (the line to gain). Pink is what a filter took out. Inlined so the
     file opens anywhere, with or without the repo. */
  :root { --screen: #1d2228; --frame: #262c34; --edge: #3b434d; --faint: #313841; --ink: #f1efe8; --soft: #aab1ba; --dim: #7c848e;
    --yellow: #ffe14d; --blue: #8ad4ff; --pink: #ff9db8; --black: #14171a;
    --display: "Barlow Condensed", "Arial Narrow", "Helvetica Neue", Arial, sans-serif; --text: "Barlow", -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; --code: ui-monospace, "SF Mono", Menlo, Consolas, monospace; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: var(--screen); color: var(--ink); font-family: var(--text); font-size: 17px; line-height: 1.5; }
  main { max-width: 1180px; margin: 0 auto; padding: 0 24px 80px; }
  a { color: var(--ink); text-decoration: underline; text-decoration-color: var(--yellow); text-decoration-thickness: 2px; text-underline-offset: 3px; }
  code { font-family: var(--code); font-size: .9em; }
  p { max-width: 72ch; }

  .top { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: baseline; gap: 6px 20px; padding: 18px 0 12px; border-bottom: 3px solid var(--ink); font-family: var(--display); font-weight: 600; font-size: 22px; }
  .top span + span { font-weight: 500; font-size: 19px; color: var(--soft); }
  .top i { font-style: normal; display: inline-block; width: 11px; height: 11px; border-radius: 50%; background: var(--pink); margin-right: 9px; vertical-align: -1px; }

  h1 { font-family: var(--display); font-weight: 700; font-size: clamp(36px, 5.6vw, 66px); line-height: 1; margin-top: 34px; max-width: 24ch; }
  h1 .restated { display: block; font-family: var(--text); font-weight: 400; font-size: 15px; color: var(--soft); margin-top: 8px; }
  .meta { margin-top: 12px; color: var(--soft); font-size: 16px; font-variant-numeric: tabular-nums; }

  .verdict { margin-top: 24px; border: 2px solid var(--ink); display: grid; grid-template-columns: auto 1fr; background: var(--frame); }
  .verdict > b { font-family: var(--display); font-weight: 700; font-size: 26px; background: var(--yellow); color: var(--black); padding: 12px 18px; border-right: 2px solid var(--ink); }
  .verdict > p { padding: 12px 18px; font-size: clamp(18px, 2vw, 22px); line-height: 1.4; max-width: none; }
  .verdict > p a { font-size: 16px; white-space: nowrap; margin-left: 6px; }
  .verdict.cite > b { background: var(--blue); }
  .verdict.cite > p { font-size: 17px; }
  .verdict.drawn > b { background: var(--ink); color: var(--black); }
  .verdict.drawn > p { font-size: 17px; }
  .frame.chartframe { border-color: var(--ink); }
  ul.rules { list-style: none; margin-top: 10px; font-family: var(--code); font-size: 13.5px; color: var(--soft); }
  ul.rules li { padding: 3px 0; border-bottom: 1px solid var(--edge); }
  figure.chart { margin-top: 14px; background: #fcfcfa; padding: 8px; border: 1px solid var(--edge); }
  figure.chart svg { width: 100%; height: auto; display: block; }
  figure.chart figcaption { color: var(--black); font-size: 14px; padding: 8px 6px 2px; }
  figure.chart figcaption code { background: #eef0f1; padding: 1px 5px; }
  tr.rall td { border-top: 2px solid var(--ink); font-weight: 500; }
  td .y { background: var(--yellow); color: var(--black); padding: 0 5px; }
  td .b { background: var(--blue); color: var(--black); padding: 0 5px; }
  td .prog { display: block; font-size: 12.5px; color: var(--soft); }
  .ruling p.chart { border-left: 4px solid var(--ink); padding-left: 10px; }
  @media (max-width: 600px) { .verdict { grid-template-columns: 1fr; } .verdict > b { border-right: 0; border-bottom: 2px solid var(--ink); } }

  h2 { font-family: var(--display); font-weight: 700; font-size: clamp(28px, 3.6vw, 38px); line-height: 1.02; margin-bottom: 12px; }
  h3 { font-family: var(--display); font-weight: 600; font-size: 22px; line-height: 1.05; padding-bottom: 6px; border-bottom: 1px solid var(--edge); margin-bottom: 8px; color: var(--soft); }

  .log { margin-top: 44px; border-top: 3px solid var(--ink); padding-top: 8px; }
  .log > h2 { padding-left: 84px; margin-top: 18px; }
  .log > section { display: grid; grid-template-columns: 84px 1fr; margin-top: 22px; }
  .clock { font-family: var(--code); font-size: 15px; color: var(--yellow); padding-top: 4px; font-variant-numeric: tabular-nums; position: relative; }
  .clock::after { content: ""; position: absolute; top: 12px; left: 56px; width: 14px; height: 2px; background: var(--edge); }
  .log > section > :last-child { border-left: 2px solid var(--edge); padding-left: 18px; }
  .note p { color: var(--soft); max-width: 74ch; padding-top: 2px; }
  .frame { background: var(--frame); border: 1px solid var(--edge); padding: 14px 18px 18px; }
  .frame.entry { border-color: var(--yellow); }
  .callhead { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 16px; }
  .callhead b { font-family: var(--display); font-weight: 700; font-size: 26px; }
  .callhead code { font-size: 15px; color: var(--ink); background: var(--faint); padding: 3px 10px; word-break: break-all; }
  pre.raw, pre.json { margin-top: 12px; font-family: var(--code); font-size: 13.5px; line-height: 1.5; overflow-x: auto; color: var(--soft); }
  pre.json { color: var(--ink); background: var(--faint); padding: 12px 14px; }
  .refused { margin-top: 12px; border: 2px solid var(--pink); color: var(--pink); padding: 8px 12px; font-weight: 500; max-width: none; }
  .definition { margin-top: 14px; border-left: 4px solid var(--yellow); padding: 4px 0 4px 14px; }
  .definition h3 { border-bottom: 0; margin-bottom: 4px; }
  .definition p { font-size: 15px; color: var(--soft); max-width: none; }
  .definition p.plain { font-size: 19px; color: var(--ink); font-weight: 500; }
  .work { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; align-items: start; margin-top: 16px; }
  @media (max-width: 860px) { .work { grid-template-columns: 1fr; } }
  ol.filters { list-style: none; }
  ol.filters li { padding: 7px 0 8px; border-bottom: 1px solid var(--edge); font-size: 15px; color: var(--dim); }
  ol.filters .row { display: flex; justify-content: space-between; gap: 14px; align-items: baseline; }
  ol.filters .n { color: var(--ink); font-variant-numeric: tabular-nums; white-space: nowrap; font-weight: 500; }
  ol.filters .bar { height: 7px; background: var(--faint); margin-top: 5px; position: relative; }
  ol.filters .bar i { position: absolute; left: 0; top: 0; bottom: 0; background: var(--soft); }
  ol.filters .bar u { position: absolute; top: 0; bottom: 0; background: var(--pink); }
  ol.filters li.cut { color: var(--ink); }
  ol.filters li.cut .bar i { background: var(--ink); }
  ol.filters li.cut .took { background: var(--pink); color: var(--black); padding: 0 5px; margin-right: 8px; font-size: 13.5px; }
  .then { font-size: 14.5px; color: var(--soft); margin-top: 10px; max-width: none; }

  .field { position: relative; height: 44px; margin: 46px 0 50px; border: 2px solid var(--ink); background:
    linear-gradient(90deg, transparent calc(50% - 1.5px), var(--black) calc(50% - 1.5px), var(--black) calc(50% + 1.5px), transparent calc(50% + 1.5px)),
    repeating-linear-gradient(90deg, transparent 0, transparent calc(10% - 1px), #c9ccd1 calc(10% - 1px), #c9ccd1 10%), #fff; }
  .field .gap { position: absolute; top: 0; bottom: 0; background: repeating-linear-gradient(135deg, var(--yellow) 0 5px, transparent 5px 11px); mix-blend-mode: multiply; }
  .field .mk { position: absolute; top: -9px; bottom: -9px; width: 5px; margin-left: -2.5px; background: var(--black); }
  .field .mk b { position: absolute; left: 50%; transform: translateX(-50%); white-space: nowrap; font-family: var(--display); font-weight: 700; font-size: 26px; line-height: 1; font-variant-numeric: tabular-nums; padding: 1px 6px; color: var(--black); }
  .field .mk.most b { bottom: calc(100% + 3px); background: var(--yellow); }
  .field .mk.least b { top: calc(100% + 3px); background: var(--blue); }

  .count { display: flex; align-items: baseline; gap: 14px; margin: 10px 0 14px; }
  .count b { font-family: var(--display); font-weight: 700; font-size: 64px; line-height: 1; background: var(--yellow); color: var(--black); padding: 0 12px; }
  .count.zero b { background: var(--pink); }
  .count span { color: var(--soft); max-width: 30ch; font-size: 16px; }
  .nomatch { border: 2px solid var(--pink); color: var(--pink); padding: 8px 12px; font-weight: 500; margin-bottom: 12px; max-width: none; }
  ul.examples { list-style: none; margin-top: 8px; font-size: 14px; color: var(--soft); }
  ul.examples li { padding: 5px 0; border-bottom: 1px solid var(--edge); }

  table { border-collapse: collapse; width: 100%; font-size: 15.5px; }
  th { text-align: left; font-family: var(--display); font-weight: 600; font-size: 18px; padding: 6px 10px 6px 0; border-bottom: 2px solid var(--ink); vertical-align: bottom; color: var(--soft); }
  td { padding: 7px 10px 7px 0; border-bottom: 1px solid var(--edge); vertical-align: top; font-variant-numeric: tabular-nums; }
  .num { text-align: right; }
  .scroll { overflow-x: auto; }
  tr.rmost td:first-child span { background: var(--yellow); color: var(--black); padding: 0 5px; }
  tr.rleast td:first-child span { background: var(--blue); color: var(--black); padding: 0 5px; }
  .gapline { margin-top: 10px; font-size: 16px; }
  h3 + .scroll, .gapline + h3 { margin-top: 16px; }
  .warn { border: 2px solid var(--pink); color: var(--pink); padding: 8px 12px; font-weight: 500; margin-bottom: 12px; max-width: none; }
  .empty { border: 1px solid var(--edge); padding: 10px 12px; margin-bottom: 12px; color: var(--soft); }

  .ruling { margin-top: 56px; padding-top: 20px; border-top: 3px solid var(--ink); }
  .ruling p { max-width: 72ch; margin-top: 10px; }
  .ruling p.call { background: var(--yellow); color: var(--black); padding: 8px 12px; }
  .ruling p.cite { border-left: 4px solid var(--blue); padding-left: 10px; }
  .ruling code { background: var(--faint); padding: 1px 5px; }
  .ruling pre { margin-top: 12px; font-family: var(--code); font-size: 14px; background: var(--faint); padding: 10px 14px; overflow-x: auto; }
  .note .warn { margin-top: 2px; }
  .ruling.first { margin-top: 10px; padding-top: 0; border-top: 0; color: var(--soft); }
  .ruling.first p.call { background: var(--faint); color: var(--ink); }
  footer { margin-top: 60px; padding-top: 14px; border-top: 1px solid var(--edge); font-size: 14.5px; color: var(--soft); }
  footer p { max-width: 90ch; }
  @media (max-width: 640px) { .log > h2 { padding-left: 0; } .log > section { grid-template-columns: 1fr; } .clock::after { display: none; } .log > section > :last-child { border-left: 0; padding-left: 0; } }
  @media print { body { background: #fff; color: #000; } .frame { border-color: #999; } }
</style>
</head>
<body>
<main>
<div class="top"><span><i aria-hidden="true"></i>Under review</span><span>The Monday Morning Agent, episode 3: one run of the analyst</span></div>
<h1>${claim ? `"${esc(claim)}"` : 'A run of the analyst'}${claimNote}</h1>
<p class="meta">${meta}</p>
${verdict ? `<div class="verdict"><b>After review</b><p>${esc(verdict)}<a href="#ruling">Read the full ruling.</a></p></div>` : run.ruling === null ? '<div class="verdict"><b>No ruling</b><p>The run ended before the agent gave one.</p></div>' : ''}
${cite ? `<div class="verdict cite"><b>Measured with</b><p>${esc(cite)}</p></div>` : ''}
${chart && !/^none/i.test(chart) ? `<div class="verdict drawn"><b>Drawn as</b><p>${esc(chart)}</p></div>` : ''}
<div class="log">
<h2>What the agent did, in order</h2>
${items || '<section class="note"><span class="clock"></span><p>The stream holds no tool calls and no notes.</p></section>'}
</div>
<section class="ruling" id="ruling">
<h2>The ruling, as written</h2>
${run.ruling ? rulingHtml(run.ruling) : '<p>None.</p>'}
</section>
<footer><p>Written by render-run.mjs from the run's event stream${run.streamPath ? ` (<code>${esc(run.streamPath)}</code>)` : ''}${run.rulingPath ? `; the ruling alone is <code>${esc(run.rulingPath)}</code>` : ''}. Each tool call above is the tool's own printout, read back, and each entry is the file as the agent wrote it; nothing was recomputed. The clock is minutes and seconds since the run started.</p></footer>
</main>
</body>
</html>
`
}

// ------------------------------------------------- the command line
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const src = process.argv[2]
  if (!src) { console.error('usage: node ./render-run.mjs rulings/run-<stamp>.jsonl [out.html]'); process.exit(64) }
  const out = process.argv[3] || src.replace(/\.jsonl$/, '') + '.html'
  const run = runFromStream(readFileSync(src, 'utf8'), Number(process.env.ANALYST_WORD_LIMIT) || 500, startFromName(src))
  run.claim = process.env.CLAIM || ''
  run.streamPath = src
  run.rulingPath = src.replace(/run-(.*)\.jsonl$/, 'ruling-$1.md')
  writeFileSync(out, renderRun(run))
  console.log(`render-run: wrote ${out} (${run.calls} tool calls, ${run.denied} refused${run.ruling ? `, ${run.words} words above the commands` : ', no ruling'}${run.sentBack ? ', sent back once' : ''})`)
}
