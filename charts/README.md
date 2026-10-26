# The charts

The charts this show's agent draws, and the one standard they are drawn under. One spec
file per chart, `NAME.json`, in a fixed shape, and beside it the SVG the renderer drew,
`NAME.svg`. It started in episode 3, "Kickers are too good now," because a claim about a
trend needs a picture, and a picture made on the spot is a matter of taste. The rules are
in `STANDARD.md`; the renderer is `render-chart.mjs`.

## How a chart is made

The agent does not draw. It writes a spec, with a file-writing permission scoped to this
folder and to `.json` files in it (`Edit(//<repo>/charts/*.json)` on the runner's
allowlist), then runs the renderer on it (`Bash(node ../charts/render-chart.mjs:*)`). The
renderer runs the tool command the spec names, with `--json`, and draws the rows the tool
returns, so a chart can never carry a number the tool did not print. The template fixes
the axes, the colors, the counts under every point, and the source line. The renderer
checks the two things the template cannot fix: that the trend covers every season on
file, and that the title is the question tested, with no number in it. A spec that breaks
a rule is refused with the rule named, and nothing is drawn.

Specs written on air are committed after the episode, with their SVGs. A rehearsal writes
into a scratch copy of this folder (`ANALYST_CHART_DIR`), so nothing here is a rehearsal.

## The shape

```json
{
  "name": "long-field-goal-trend",
  "written": "2026-11-09",
  "by": "the analyst, episode 3",
  "question": "Are kickers making more of their long field goals than they did in 2021?",
  "tool": "episode-3/query-plays.mjs",
  "command": "--trend long-field-goal --seasons 2021-2026 --type REG"
}
```

| Key | What it is |
|---|---|
| `name` | The file is `charts/<name>.json`, and the drawing is `charts/<name>.svg`. Lowercase letters, digits, and hyphens. |
| `written` | The day it was written, `YYYY-MM-DD`. |
| `by` | Who wrote it. Optional. |
| `question` | The title: the question the agent tested, ending in a question mark, with no number in it (rule 5). |
| `tool` | The episode's tool that prints the rows, relative to the repo root. |
| `command` | The tool command, as typed after `node ./query-plays.mjs`. A trend covers every season on file (rule 1). |

Nothing about colors, axes, or labels: those are the standard's, not the agent's.

## The charts on file

| Chart | Written | Question |
|---|---|---|
| (none yet; episode 3's is written on air, Monday, November 9, 2026) | | |
