#!/usr/bin/env node
// render-run.mjs: turn one agent run into a page a person can read.
//
//   node ./render-run.mjs rulings/run-2026-10-05-153626.jsonl            writes the .html beside it
//   node ./render-run.mjs rulings/run-2026-10-05-153626.jsonl out.html
//
// The terminal view (show-run.mjs) is a lot of text scrolling past. This writes the same
// run as one page, styled as the replay monitor in the booth: the claim and the ruling at
// the top, then a clock down the left edge with each thing the agent did beside it, in
// order. Each tool call shows its command, the filters as a funnel with the plays left
// after each, and the four groups as a table and a win-rate bar. The full ruling is at the
// end. show-run.mjs calls this at the end of a live run; the command above rebuilds the
// page for an older run from its event stream. Nothing here runs the agent or the tool.
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const num = (s) => Number(String(s).replace(/,/g, ''))
const fmt = (n) => n.toLocaleString('en-US')

// ------------------------------------------------- the run, from the event stream
// Items in order: { kind: 'note', at, text } and { kind: 'call', n, at, command, text, error }.
// `at` is m:ss since the run started when the live view supplies it, else ''.
export function runFromStream(text) {
  const run = { items: [], ruling: null, seconds: null, calls: 0, denied: 0, status: 1 }
  const pending = new Map()
  let heldText = null
  for (const line of String(text).split('\n')) {
    let ev
    try { ev = JSON.parse(line) } catch { continue }
    if (ev.type === 'assistant') {
      for (const part of ev.message?.content || []) {
        if (part.type === 'text' && part.text.trim()) { if (heldText) run.items.push(heldText); heldText = { kind: 'note', at: '', text: part.text.trim() } }
        if (part.type === 'tool_use') {
          if (heldText) { run.items.push(heldText); heldText = null }
          run.calls++
          pending.set(part.id, { kind: 'call', n: run.calls, at: '', command: part.input?.command || JSON.stringify(part.input) })
        }
      }
    } else if (ev.type === 'user') {
      for (const part of ev.message?.content || []) {
        if (part.type !== 'tool_result') continue
        const call = pending.get(part.tool_use_id) || { kind: 'call', n: '?', at: '', command: '(unknown call)' }
        pending.delete(part.tool_use_id)
        const body = Array.isArray(part.content) ? part.content.map(c => c.text || '').join('\n') : part.content
        if (part.is_error) run.denied++
        run.items.push({ ...call, text: String(body ?? ''), error: !!part.is_error })
      }
    } else if (ev.type === 'result') {
      run.ruling = ev.result || ''
      run.status = ev.is_error ? 1 : 0
      run.seconds = ev.duration_ms ? Math.round(ev.duration_ms / 1000) : null
      if (heldText && heldText.text !== run.ruling.trim()) run.items.push(heldText)
      heldText = null
    }
  }
  if (heldText) run.items.push(heldText)
  return run
}

// ------------------------------------------------- one tool output, read back
// query-plays.mjs prints fixed-format text. Read the parts the page draws; anything it
// does not recognize is shown as the text it was.
export function parseTool(text) {
  const lines = String(text).split('\n')
  const t = { question: [], filters: [], then: [], rows: [], gap: null, warnings: [], ok: false }
  let section = ''
  for (const raw of lines) {
    const l = raw.trimEnd()
    if (/^QUESTION/.test(l)) { section = 'q'; continue }
    if (/^FILTERS/.test(l)) { section = 'f'; continue }
    if (/^THEN, PER TEAM/.test(l)) { section = 't'; continue }
    if (/^RESULT/.test(l)) { section = 'r'; continue }
    if (/^NOT IN THIS OUTPUT/.test(l)) { section = 'n'; continue }
    const w = l.match(/^\s*((SMALL SAMPLE|NO RESULT):.*)$/)
    if (w) { t.warnings.push(w[1]); continue }
    if (!l.trim()) continue
    if (section === 'q') t.question.push(l.trim())
    else if (section === 'f') {
      const m = l.match(/^\s*(\d+)\.\s+(.*?)\s{2,}([\d,]+)\s*$/)
      if (m) t.filters.push({ n: +m[1], label: m[2], left: num(m[3]) })
    } else if (section === 't') t.then.push(l.trim())
    else if (section === 'r') {
      const m = l.match(/^\s*(ran most|ran least|group \d+)\s+([\d.]+% to [\d.]+%)\s+(\d+)\s+(\d+)\s+([\d.]+)%\s*$/)
      if (m) t.rows.push({ group: m[1], share: m[2], teamGames: +m[3], wins: +m[4], winRate: +m[5] })
      const g = l.match(/gap, ran most minus ran least: (-?[\d.]+) points/)
      if (g) t.gap = +g[1]
    }
  }
  t.ok = t.filters.length > 0 || t.rows.length > 0
  return t
}

// ------------------------------------------------- the ruling, from markdown
// The policy allows bold labels, plain lines, and one fenced block of commands.
function rulingHtml(md) {
  const out = []
  let inCode = false, code = []
  const para = []
  const flush = () => {
    if (!para.length) return
    const p = para.join(' ')
    const cls = /^\*\*Ruling:?\*\*/.test(p) ? ' class="call"' : ''
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
  const m = String(md || '').match(new RegExp(`\\*\\*${label}:?\\*\\*\\s*(.+)`))
  return m ? m[1].replace(/\*\*/g, '').trim() : ''
}

// ------------------------------------------------- the page
const clock = (at) => `<span class="clock">${at ? esc(at) : ''}</span>`

function callHtml(item) {
  const head = `<div class="callhead"><b>Tool call ${esc(item.n)}</b><code>${esc(item.command)}</code></div>`
  if (item.error) return `<section class="call">${clock(item.at)}<div class="frame">${head}<p class="refused">Refused or failed: ${esc(item.text.split('\n')[0])}</p></div></section>`
  const t = parseTool(item.text)
  if (!t.ok) return `<section class="call">${clock(item.at)}<div class="frame">${head}<pre class="raw">${esc(item.text)}</pre></div></section>`
  const top = t.filters.length ? t.filters[0].left : 0
  const funnel = t.filters.map((f, i) => {
    const before = i ? t.filters[i - 1].left : f.left
    const took = before - f.left
    const w = top ? (100 * f.left / top) : 0, u = top ? (100 * took / top) : 0
    return `<li${took ? ' class="cut"' : ''}><div class="row"><span>${took ? `<span class="took">took out ${fmt(took)}</span>` : ''}${esc(f.label)}</span><span class="n">${fmt(f.left)}</span></div><div class="bar"><i style="width:${w.toFixed(2)}%"></i>${took ? `<u style="left:${w.toFixed(2)}%;width:${u.toFixed(2)}%"></u>` : ''}</div></li>`
  }).join('\n')
  const rows = t.rows.map(r => {
    const cls = r.group === 'ran most' ? ' class="rmost"' : r.group === 'ran least' ? ' class="rleast"' : ''
    return `<tr${cls}><td><span>${esc(r.group)}</span></td><td>${esc(r.share)}</td><td class="num">${fmt(r.teamGames)}</td><td class="num">${fmt(r.wins)}</td><td class="num">${r.winRate.toFixed(1)}%</td></tr>`
  }).join('\n')
  const most = t.rows.find(r => r.group === 'ran most'), least = t.rows.find(r => r.group === 'ran least')
  const mids = t.rows.filter(r => r !== most && r !== least)
  const field = most && least ? `<div class="field" role="img" aria-label="Teams that ran most won ${most.winRate.toFixed(1)} percent, teams that ran least won ${least.winRate.toFixed(1)} percent">
<div class="gap" style="left:${Math.min(most.winRate, least.winRate)}%;width:${Math.abs(most.winRate - least.winRate)}%"></div>
${mids.map(r => `<div class="mk mid" style="left:${r.winRate}%"></div>`).join('')}
<div class="mk least" style="left:${least.winRate}%"><b>${least.winRate.toFixed(1)}%</b></div><div class="mk most" style="left:${most.winRate}%"><b>${most.winRate.toFixed(1)}%</b></div></div>` : ''
  const warn = t.warnings.map(w => `<p class="warn">${esc(w)}</p>`).join('')
  const noRows = t.rows.length ? '' : '<p class="empty">No groups: the filters left fewer team-games than groups.</p>'
  return `<section class="call">${clock(item.at)}
<div class="frame">${head}
<div class="work">
<div><h3>Filters, in order</h3><ol class="filters">${funnel}</ol><p class="then">${t.then.map(esc).join('<br>')}</p></div>
<div><h3>Result</h3>${field}${warn}${noRows}${t.rows.length ? `<div class="scroll"><table><thead><tr><th>Group</th><th>Rush share</th><th class="num">Team-games</th><th class="num">Wins</th><th class="num">Win rate</th></tr></thead><tbody>${rows}</tbody></table></div>` : ''}${t.gap !== null ? `<p class="gapline">Gap, ran most minus ran least: <b>${t.gap.toFixed(1)} points</b></p>` : ''}</div>
</div></div></section>`
}

export function renderRun(run) {
  const items = run.items.map(it => it.kind === 'call' ? callHtml(it)
    : `<section class="note">${clock(it.at)}<p>${esc(it.text).replace(/\n+/g, '<br>')}</p></section>`).join('\n')
  const verdict = labeledLine(run.ruling, 'Ruling')
  const claim = run.claim || labeledLine(run.ruling, 'The claim')
  const claimNote = run.claim ? '' : ' <span class="restated">(as the agent restated it; the stream does not carry the claim)</span>'
  const meta = [
    run.started ? `Started ${esc(run.started)}` : '',
    `${run.calls} tool call${run.calls === 1 ? '' : 's'}`,
    `${run.denied} refused or failed`,
    run.seconds !== null && run.seconds !== undefined ? `${run.seconds} seconds` : '',
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
     the teams that ran least, yellow for the teams that ran most. Pink is what a filter
     took out. Inlined so the file opens anywhere, with or without the repo. */
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

  /* The verdict, read first: the referee's announcement after the review. */
  .verdict { margin-top: 24px; border: 2px solid var(--ink); display: grid; grid-template-columns: auto 1fr; background: var(--frame); }
  .verdict > b { font-family: var(--display); font-weight: 700; font-size: 26px; background: var(--yellow); color: var(--black); padding: 12px 18px; border-right: 2px solid var(--ink); }
  .verdict > p { padding: 12px 18px; font-size: clamp(18px, 2vw, 22px); line-height: 1.4; max-width: none; }
  .verdict > p a { font-size: 16px; white-space: nowrap; margin-left: 6px; }
  @media (max-width: 600px) { .verdict { grid-template-columns: 1fr; } .verdict > b { border-right: 0; border-bottom: 2px solid var(--ink); } }

  h2 { font-family: var(--display); font-weight: 700; font-size: clamp(28px, 3.6vw, 38px); line-height: 1.02; margin-bottom: 12px; }
  h3 { font-family: var(--display); font-weight: 600; font-size: 22px; line-height: 1.05; padding-bottom: 6px; border-bottom: 1px solid var(--edge); margin-bottom: 8px; color: var(--soft); }

  /* The log: a clock down the left edge, one entry per thing the agent did. */
  .log { margin-top: 44px; border-top: 3px solid var(--ink); padding-top: 8px; }
  .log > h2 { padding-left: 84px; margin-top: 18px; }
  .log > section { display: grid; grid-template-columns: 84px 1fr; margin-top: 22px; }
  .clock { font-family: var(--code); font-size: 15px; color: var(--yellow); padding-top: 4px; font-variant-numeric: tabular-nums; position: relative; }
  .clock::after { content: ""; position: absolute; top: 12px; left: 56px; width: 14px; height: 2px; background: var(--edge); }
  .log > section > :last-child { border-left: 2px solid var(--edge); padding-left: 18px; }
  .note p { color: var(--soft); max-width: 74ch; padding-top: 2px; }
  .frame { background: var(--frame); border: 1px solid var(--edge); padding: 14px 18px 18px; }
  .callhead { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 16px; }
  .callhead b { font-family: var(--display); font-weight: 700; font-size: 26px; }
  .callhead code { font-size: 15px; color: var(--ink); background: var(--faint); padding: 3px 10px; word-break: break-all; }
  pre.raw { margin-top: 12px; font-family: var(--code); font-size: 13.5px; line-height: 1.5; overflow-x: auto; color: var(--soft); }
  .refused { margin-top: 12px; border: 2px solid var(--pink); color: var(--pink); padding: 8px 12px; font-weight: 500; max-width: none; }
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

  /* The field: the monitor's one bright overlay, white like the broadcast graphic. */
  .field { position: relative; height: 44px; margin: 46px 0 50px; border: 2px solid var(--ink); background:
    linear-gradient(90deg, transparent calc(50% - 1.5px), var(--black) calc(50% - 1.5px), var(--black) calc(50% + 1.5px), transparent calc(50% + 1.5px)),
    repeating-linear-gradient(90deg, transparent 0, transparent calc(10% - 1px), #c9ccd1 calc(10% - 1px), #c9ccd1 10%), #fff; }
  .field .gap { position: absolute; top: 0; bottom: 0; background: var(--yellow); mix-blend-mode: multiply; }
  .field .mk { position: absolute; top: -9px; bottom: -9px; width: 5px; margin-left: -2.5px; background: var(--black); }
  .field .mk b { position: absolute; left: 50%; transform: translateX(-50%); white-space: nowrap; font-family: var(--display); font-weight: 700; font-size: 26px; line-height: 1; font-variant-numeric: tabular-nums; padding: 1px 6px; color: var(--black); }
  .field .mk.most b { bottom: calc(100% + 3px); background: var(--yellow); }
  .field .mk.least b { top: calc(100% + 3px); background: var(--blue); }
  .field .mk.mid { top: 8px; bottom: 8px; width: 3px; margin-left: -1.5px; background: #4a5058; }

  table { border-collapse: collapse; width: 100%; font-size: 15.5px; }
  th { text-align: left; font-family: var(--display); font-weight: 600; font-size: 18px; padding: 6px 10px 6px 0; border-bottom: 2px solid var(--ink); vertical-align: bottom; color: var(--soft); }
  td { padding: 7px 10px 7px 0; border-bottom: 1px solid var(--edge); vertical-align: top; font-variant-numeric: tabular-nums; }
  .num { text-align: right; }
  .scroll { overflow-x: auto; }
  tr.rmost td:first-child span { background: var(--yellow); color: var(--black); padding: 0 5px; }
  tr.rleast td:first-child span { background: var(--blue); color: var(--black); padding: 0 5px; }
  .gapline { margin-top: 10px; font-size: 16px; }
  .warn { border: 2px solid var(--pink); color: var(--pink); padding: 8px 12px; font-weight: 500; margin-bottom: 12px; max-width: none; }
  .empty { border: 1px solid var(--edge); padding: 10px 12px; margin-bottom: 12px; color: var(--soft); }

  .ruling { margin-top: 56px; padding-top: 20px; border-top: 3px solid var(--ink); }
  .ruling p { max-width: 72ch; margin-top: 10px; }
  .ruling p.call { background: var(--yellow); color: var(--black); padding: 8px 12px; }
  .ruling code { background: var(--faint); padding: 1px 5px; }
  .ruling pre { margin-top: 12px; font-family: var(--code); font-size: 14px; background: var(--faint); padding: 10px 14px; overflow-x: auto; }
  footer { margin-top: 60px; padding-top: 14px; border-top: 1px solid var(--edge); font-size: 14.5px; color: var(--soft); }
  footer p { max-width: 90ch; }
  @media (max-width: 640px) { .log > h2 { padding-left: 0; } .log > section { grid-template-columns: 1fr; } .clock::after { display: none; } .log > section > :last-child { border-left: 0; padding-left: 0; } }
  @media print { body { background: #fff; color: #000; } .frame { border-color: #999; } }
</style>
</head>
<body>
<main>
<div class="top"><span><i aria-hidden="true"></i>Under review</span><span>The Monday Morning Agent, episode 1: one run of the analyst</span></div>
<h1>${claim ? `"${esc(claim)}"` : 'A run of the analyst'}${claimNote}</h1>
<p class="meta">${meta}</p>
${verdict ? `<div class="verdict"><b>After review</b><p>${esc(verdict)}<a href="#ruling">Read the full ruling.</a></p></div>` : run.ruling === null ? '<div class="verdict"><b>No ruling</b><p>The run ended before the agent gave one.</p></div>' : ''}
<div class="log">
<h2>What the agent did, in order</h2>
${items || '<section class="note"><span class="clock"></span><p>The stream holds no tool calls and no notes.</p></section>'}
</div>
<section class="ruling" id="ruling">
<h2>The ruling, as written</h2>
${run.ruling ? rulingHtml(run.ruling) : '<p>None.</p>'}
</section>
<footer><p>Written by render-run.mjs from the run's event stream${run.streamPath ? ` (<code>${esc(run.streamPath)}</code>)` : ''}${run.rulingPath ? `; the ruling alone is <code>${esc(run.rulingPath)}</code>` : ''}. Each tool call above is the tool's own printout, read back; nothing was recomputed. The clock is minutes and seconds since the run started.</p></footer>
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
  const run = runFromStream(readFileSync(src, 'utf8'))
  // `claude -p` does not echo the prompt into the stream, so an older run's page takes its
  // claim from the ruling's own restatement (and says so). A live run passes the claim in.
  run.claim = process.env.CLAIM || ''
  run.streamPath = src
  run.rulingPath = src.replace(/run-(.*)\.jsonl$/, 'ruling-$1.md')
  writeFileSync(out, renderRun(run))
  console.log(`render-run: wrote ${out} (${run.calls} tool calls, ${run.denied} refused${run.ruling ? '' : ', no ruling'})`)
}
