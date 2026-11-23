# The boundaries

`BOUNDARIES.md` is the written list of what this show's agents may not say: six numbered
limits, how a decline is written, and what does not move one. It started in episode 5,
"Coaches are cowards on fourth down." The runner (`episode-5/run-analyst.sh`) appends the
file to both agents' instructions, checks that every ruling has a `Declined` line that
names a boundary by number or says "none", and writes one line to `declined.jsonl` for
every decline. The fact-checker (`episode-5/checker.md`) rejects a ruling that crosses a
boundary.

`declined.jsonl` is the log, one JSON object per line. Read it with
`./show.sh declined` in `episode-5/`. A rehearsal writes to a scratch copy
(`ANALYST_BOUNDARY_LOG`), so nothing in the file here is a rehearsal.
