# Operations demo

## Set up

Bring the dev stack up first, using the compose commands in [development.md](development.md).

Seed the sample operation:

```bash
node scripts/seed-dev-operation.mjs --reset
```

It prints the operation URL.
`--full` seeds all thirteen units instead of leaving TF WHITE and CAS out.
The script only ever deletes the operation named Exercise Silent Harbor.

Replay the whole walk in the installed Chrome:

```bash
node scripts/demo-operation-walkthrough.mjs
```

Recording needs Playwright's own ffmpeg build, a one-off download of about 1.4 MB that is separate from the browser.
Without it the walk still runs and says so, unrecorded.

```bash
cd frontend && npx playwright install ffmpeg
```

The recording is 1440x810, a common laptop size, rather than the 1280x720 design floor, because at the floor the banner truncates a long operation name on the Matrix and Web views.

`--pace <ms>` sets the hold after each caption.
`--step` waits for Enter between chapters, for presenting live.
`--headless` runs without a visible window, for recording only.
`--keep` skips the reset and the seed.
Ctrl+C stops a run and keeps what was recorded as `silent-harbor-<stamp>-partial.webm`.
The recording lands in `_project/demo/` as a `.webm`, and the script prints the ffmpeg command for anyone who wants an mp4.

## The walk

| Step | Where to click | What to point at |
|---|---|---|
| 1 | Dashboard at `/` | The Operations tile beside the Equipment Catalog and PACE Planning |
| 2 | `/operations` | One tile per operation, SILENT HARBOR named by its acronym |
| 3 | Header `+`, then Add Operation, then Cancel; open SILENT HARBOR, then Edit, then Cancel | Name, acronym and notes on Add; the Phases and Locations editors on Edit, where a new operation's four default phases are renamed |
| 4 | Open SILENT HARBOR, then Participants | Eleven rows, each with what it brought |
| 5 | Join Operation, CAS as Other | Name, short label, branch and swatch; F-15E switched off in Staging, Infil and Exfil; must talk TANKER at Overhead |
| 6 | Join Operation, TF WHITE from the library | Dismounted, two radios, must talk GUNSHIP, TF GREEN and CAS, each chip showing live status |
| 7 | Loadout, TF WHITE tab | Gear with waveform chips, the By phase table, the POC |
| 8 | Matrix, phase Actions on Objective, open TF WHITE | One column per asset |
| 9 | Web, Show Gaps, Focus on TF WHITE, View plan, then Staging | Tier select, locations and pairs, the one red line in Staging |
| 10 | Share menu, then Print / Save PDF | `.png`, Copy image and `.pptx`, then the print page |
| 11 | Settings, Organizations, then Audit log | The two joins at the top of the log |
| 12 | End card | The operation URL |

## Two windows

The recording cannot show this step.
Open the Web view in a second window and keep both visible.
Join a unit in the first window.
The second window updates within ten seconds, with no refresh.
Then Remove that unit from the Participants popup and watch it go from the second window.

This is a ten-second refetch while the tab is visible, not a push.
A participant save that conflicts with a newer one is refused with a stale error rather than merged.

## Reset

Re-run `node scripts/seed-dev-operation.mjs --reset`.
