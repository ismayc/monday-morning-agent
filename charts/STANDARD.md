# The chart standard

The written rules every chart this show's agent draws has to follow. It started in
episode 3, "Kickers are too good now," because a claim about a trend needs a picture, and
a picture made on the spot is a matter of taste: which seasons to start from, where the
axis begins, which line gets the bright color. Each of those choices can make the same
numbers say two different things. So the choices are written down once, here, and the
renderer (`render-chart.mjs`) draws only under them. The agent does not draw. It writes a
chart spec, one small file that names the question and the tool command, and the renderer
reads the rows from the tool and draws them the same way every week.

Version 1, October 26, 2026. A change to this file is a new version, dated, and every
chart carries the version it was drawn under.

## The eight rules

1. **Every season on file.** A trend runs from 2021, the first season on file, through the
   current season, with no season skipped and no `--weeks` narrowing. The window is not a
   choice. (Checked by the renderer: the command's `--seasons` must be `2021-<current>`.)
2. **Axes start at zero.** A rate axis runs from 0 to 100 percent. A count axis starts at
   0. No axis is cut to make a flat line look steep. (Fixed by the template.)
3. **The count under every point.** Each rate is drawn with the number of plays behind it,
   so a rate from 9 kicks does not look like a rate from 900. (Fixed by the template.)
4. **Two colors, and gray.** The broadcast's two lines: yellow for the thing the claim is
   about (the defined play), blue for what it is compared with (every other play of that
   kind, where it started). Gray marks the current season while it is still being played,
   labeled with its last week on file. No third series, no third color. (Fixed by the
   template.)
5. **The title is the question.** The chart's title is the question the agent tested, in
   words a fan would say, ending in a question mark, with no number in it other than a
   season's year. A title that states the answer is a caption, not a title. The subtitle
   names the entry, its file and date, and the filters. (Checked by the renderer.)
6. **The source line is the command.** Under the chart, the exact tool command that
   produced the rows, with the plays and seasons it read, so a reader can rerun it.
   (Fixed by the template; the command is the spec's.)
7. **Nothing the tool did not print.** No trend line, no annotation, no second axis, no
   number typed in by hand. The renderer runs the command and draws what comes back, and
   that is all it can draw. (By construction.)
8. **The same template every week.** One shape per question. A trend is a line chart of
   rates by season over a bar chart of attempts per game, laid out the same way every
   episode, so a reader of episode 5 recognizes episode 3's chart. (By construction; the
   SVG carries the standard's version.)

## What a spec is

One file, `charts/NAME.json`, in the shape the renderer prints when run with no argument:
a name, the date, who wrote it, the question, the tool, and the command. Nothing about
colors, axes, or labels, because those are not the agent's to choose. The renderer writes
`charts/NAME.svg` beside it.

## What a chart cannot do

It cannot say why a line moved, and it cannot show what the tool cannot measure. The
entry's "cannot see" line applies to the chart drawn from it.
