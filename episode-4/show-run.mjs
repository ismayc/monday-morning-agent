#!/usr/bin/env node
// show-run.mjs: read the agent's event stream on stdin and print what a person needs to
// see while it works: each tool call as it is made, the definition, filters, and result
// the tool returned, each dictionary entry it wrote, and the ruling at the end.
//
//   claude -p "..." --output-format stream-json --verbose | node ./show-run.mjs ruling.md [run.html [claim]]
//   node ./show-run.mjs --replay rulings/run-<stamp>.jsonl        an old run, as it looked on screen
//
// `claude -p` prints nothing until it finishes unless it is asked for the event stream.
// This is the piece that makes the run watchable: every filter, on screen, as it happens.
// The first argument is where to save the ruling; the second, when given, is where to
// write the same run as one page (render-run.mjs), with the claim as its title. The
// script writes those files; the agent can write only a dictionary entry. A replay writes
// nothing and takes its clock from the events' timestamps against the start in the file's
// name, so the printout matches what the live view showed.
import { createInterface } from 'node:readline'
import { readFileSync, writeFileSync } from 'node:fs'
import { renderRun, startFromName, describeCall } from './render-run.mjs'

const replayFile = process.argv[2] === '--replay' ? process.argv[3] : null
const rulingFile = replayFile ? null : process.argv[2]
const htmlFile = replayFile ? null : process.argv[3]
const claim = replayFile ? '' : (process.argv[4] || '')
let now = () => Date.now()
let t0 = Date.now()
if (replayFile) {
  t0 = startFromName(replayFile)
  if (t0 === null) {
    let lastTs = null, firstTs = null, duration = null
    for (const line of readFileSync(replayFile, 'utf8').split('\n')) {
      let ev; try { ev = JSON.parse(line) } catch { continue }
      if (ev.timestamp) { lastTs = Date.parse(ev.timestamp); if (firstTs === null) firstTs = lastTs }
      if (ev.type === 'result' && duration === null && ev.duration_ms) { duration = ev.duration_ms; t0 = lastTs - duration }
    }
    if (duration === null) t0 = firstTs ?? Date.now()
  }
}
const started = new Date(t0)
const at = () => { const s = Math.max(0, Math.round((now() - t0) / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` }
const rule = (c) => c.repeat(78)
let calls = 0, denied = 0, ruling = null, status = 1, seconds = null
const items = []

// Of a tool result, show the blocks the room should read: the definition, the filters,
// the result, and any breakdown, plus the one line that says which games the plays cover.
const excerpt = (text) => {
  const lines = String(text).split('\n')
  const keep = []
  let on = false
  for (const l of lines) {
    if (/^(DEFINITION|FILTERS|RESULT|BY )/.test(l)) on = true
    else if (/^(THEN|NOT IN THIS OUTPUT|QUESTION)/.test(l)) on = false
    if (on || /SMALL SAMPLE|NO RESULT|NO MATCH|^query-plays:|games in the plays kept|plays match the definition/.test(l)) keep.push(l)
  }
  return (keep.length ? keep : lines.slice(0, 12)).join('\n').trimEnd()
}

const pending = new Map()
let heldText = null
const flushText = () => {
  if (heldText) { console.log(`\n[${heldText.at}] AGENT\n${heldText.text}`); items.push({ kind: 'note', at: heldText.at, text: heldText.text }) }
  heldText = null
}

const handle = (line) => {
  let ev
  try { ev = JSON.parse(line) } catch { return }
  if (replayFile && ev.timestamp) { const ts = Date.parse(ev.timestamp); now = () => ts }
  if (ev.type === 'assistant') {
    for (const part of ev.message?.content || []) {
      if (part.type === 'text' && part.text.trim()) { flushText(); heldText = { at: at(), text: part.text.trim() } }
      if (part.type === 'tool_use') {
        flushText()
        calls++
        pending.set(part.id, { n: calls, at: at(), ...describeCall(part) })
      }
    }
  } else if (ev.type === 'user') {
    for (const part of ev.message?.content || []) {
      if (part.type !== 'tool_result') continue
      const call = pending.get(part.tool_use_id) || { n: '?', at: at(), tool: 'Bash', command: '(unknown call)' }
      pending.delete(part.tool_use_id)
      const text = Array.isArray(part.content) ? part.content.map(c => c.text || '').join('\n') : part.content
      if (part.is_error) denied++
      items.push({ kind: 'call', ...call, text: String(text ?? ''), error: !!part.is_error })
      if (call.tool === 'Bash') {
        console.log(`\n${rule('=')}\n[${call.at}] TOOL CALL ${call.n}\n  ${call.command}\n${rule('-')}`)
        console.log(part.is_error ? `  REFUSED OR FAILED: ${String(text).split('\n')[0]}` : excerpt(text))
      } else {
        // A dictionary entry written (or an attempt to write somewhere else, refused).
        console.log(`\n${rule('=')}\n[${call.at}] ${call.tool.toUpperCase()} ${call.n}: ${call.command}\n${rule('-')}`)
        console.log(part.is_error ? `  REFUSED OR FAILED: ${String(text).split('\n')[0]}` : (call.content || '').trimEnd())
      }
    }
  } else if (ev.type === 'result') {
    ruling = ev.result || ''
    status = ev.is_error ? 1 : 0
    seconds = Math.round((ev.duration_ms || now() - t0) / 1000)
    if (heldText && heldText.text !== ruling.trim()) flushText()
    heldText = null
    console.log(`\n${rule('=')}\nRULING\n${rule('=')}\n${ruling}\n${rule('=')}`)
    console.log(`${calls} tool calls, ${denied} refused or failed, ${seconds} seconds`)
  }
}
const finish = () => {
  if (htmlFile) {
    writeFileSync(htmlFile, renderRun({
      claim, started: started.toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' }),
      items, ruling, seconds, calls, denied, status,
      streamPath: htmlFile.replace(/\.html$/, '.jsonl'), rulingPath: rulingFile,
    }))
  }
  if (ruling === null) { console.error('show-run: the stream ended with no result'); process.exit(70) }
  if (rulingFile && ruling) writeFileSync(rulingFile, ruling + '\n')
  process.exit(status)
}
if (replayFile) {
  readFileSync(replayFile, 'utf8').split('\n').forEach(handle)
  finish()
} else {
  const rl = createInterface({ input: process.stdin })
  rl.on('line', handle)
  rl.on('close', finish)
}
