#!/usr/bin/env node
// show-run.mjs: read the agent's event stream on stdin and print what a person needs to
// see while it works: each tool call as it is made, the filters and result the tool
// returned, and the ruling at the end.
//
//   claude -p "..." --output-format stream-json --verbose | node ./show-run.mjs ruling.md
//
// `claude -p` prints nothing until it finishes unless it is asked for the event stream.
// This is the piece that makes the run watchable: every filter, on screen, as it happens.
// The one argument is where to save the ruling. The script writes that file; the agent
// cannot write anything.
import { createInterface } from 'node:readline'
import { writeFileSync } from 'node:fs'

const rulingFile = process.argv[2]
const t0 = Date.now()
const at = () => { const s = Math.round((Date.now() - t0) / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` }
const rule = (c) => c.repeat(78)
let calls = 0, denied = 0, ruling = null, status = 1

// Of a tool result, show the two blocks the room should read: the filters and the result.
const excerpt = (text) => {
  const lines = String(text).split('\n')
  const keep = []
  let on = false
  for (const l of lines) {
    if (/^(FILTERS|RESULT)/.test(l)) on = true
    else if (/^(THEN|NOT IN THIS OUTPUT|QUESTION)/.test(l)) on = false
    if (on || /SMALL SAMPLE|NO RESULT|^query-plays:/.test(l)) keep.push(l)
  }
  return (keep.length ? keep : lines.slice(0, 12)).join('\n').trimEnd()
}

// The agent may send several tool calls before the first result comes back, so a call is
// held until its own result arrives and the two are printed together, in call order.
const pending = new Map()
// Text is held one event, so the final message is not printed twice (it is the ruling).
let heldText = null
const flushText = () => { if (heldText) console.log(`\n[${heldText.at}] AGENT\n${heldText.text}`); heldText = null }

const rl = createInterface({ input: process.stdin })
rl.on('line', (line) => {
  let ev
  try { ev = JSON.parse(line) } catch { return }
  if (ev.type === 'assistant') {
    for (const part of ev.message?.content || []) {
      if (part.type === 'text' && part.text.trim()) { flushText(); heldText = { at: at(), text: part.text.trim() } }
      if (part.type === 'tool_use') {
        flushText()
        calls++
        pending.set(part.id, { n: calls, at: at(), command: part.input?.command || JSON.stringify(part.input) })
      }
    }
  } else if (ev.type === 'user') {
    for (const part of ev.message?.content || []) {
      if (part.type !== 'tool_result') continue
      const call = pending.get(part.tool_use_id) || { n: '?', at: at(), command: '(unknown call)' }
      pending.delete(part.tool_use_id)
      const text = Array.isArray(part.content) ? part.content.map(c => c.text || '').join('\n') : part.content
      if (part.is_error) denied++
      console.log(`\n${rule('=')}\n[${call.at}] TOOL CALL ${call.n}\n  ${call.command}\n${rule('-')}`)
      console.log(part.is_error ? `  REFUSED OR FAILED: ${String(text).split('\n')[0]}` : excerpt(text))
    }
  } else if (ev.type === 'result') {
    ruling = ev.result || ''
    status = ev.is_error ? 1 : 0
    if (heldText && heldText.text !== ruling.trim()) flushText()
    console.log(`\n${rule('=')}\nRULING\n${rule('=')}\n${ruling}\n${rule('=')}`)
    console.log(`${calls} tool calls, ${denied} refused or failed, ${Math.round((ev.duration_ms || Date.now() - t0) / 1000)} seconds`)
  }
})
rl.on('close', () => {
  if (ruling === null) { console.error('show-run: the stream ended with no result'); process.exit(70) }
  if (rulingFile && ruling) writeFileSync(rulingFile, ruling + '\n')
  process.exit(status)
})
