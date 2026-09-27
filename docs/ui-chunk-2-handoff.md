# UI redesign, chunk 2 (Supply and Staffing): handoff

27 September 2026 · Opus 5.5 (`claude-opus-5-5`) · worktree `codex/ui-redesign-chunk2` on
`dd16dfd`, not committed. Chunk 2 of the [implementation plan](ui-implementation-plan.md); the
redesign as a whole is not complete (chunk 3 remains).

## What changed

**Supply** is five task views behind the fixed routes (`docs/ui-route-migration.md`):

| Route | Section | What it shows |
| --- | --- | --- |
| `supply/changes` | `secChanges` | The one checklist, grouped Imports, Deliveries, Production; the truck's road ("N of M recorded or applied"), Copy remaining with its fallback and a preview of the copied text, Apply N import amounts (game link only), Clear my marks, the basis, and the records a later read confirmed or not |
| `supply/imports` | `secImports` | A card reviewing one import line: the recurring order (now → box, "Planned for …", Reset to N under the other basis, the scale, the factory-hours dependency, state, Preview in the game, Mark done by you) beside the one-time catch-up (its own mark, "by hand; no game-link write"); Why and Manual instructions from the same row; Copy; Follow its supply route. Then every import line: depots' and factories' own, and No depot |
| `supply/deliveries` | `secDeliveries` | By destination: shops' shelves and top-ups, second-tier warehouses (route-fed top-ups, wholesale, idle, not routed), factory inputs |
| `supply/production` | `secProduction` | Machine-hour tiles (staffed now as an observation, both bases), factories' lines, hours and inputs, factory staffing, unnamed-recipe pickers; an empty state with no factory |
| `supply/flow` | `secFlow` | The diagram (or the chain when narrow) as its own view, a followed site with its panel and the changes on its route; Table goes back to the view the reader came from |

Shops, warehouses and factories are each view's *Scope* select. Needs a change / Everything,
the scope, the reviewed line and the followed site ride on the history entry (`nxSb`), so Back,
Forward and a reload give a view back as it was. Old section ids, remembered tabs
(`SUPPLY_WAS`) and `#sbStrip` land on the view that took their place.

**One proposed-plan record.** `supplyChecklistRows()` → `buildOrderChecklist()` stays the
single source; each row now carries its view, basis, review flag and dependencies. The card,
Why, manual steps, Copy, Changes, the Overview's Details (`ovPlanHtml()`) and the game-link
write all read the same row, so the figure, basis and unit agree everywhere (tested under both
bases).

**Planning basis per company**: `ba_dash_sizing:<character>`; the old device key is a
read-only fallback. Switching keeps an edited figure, shows the basis it was set under, the
other basis's suggestion and Reset to N.

**Import figures v3** (`ba_import_set_v3:<character>`, `{value, inGame, basis}`): v2 entries
migrate with `basis: null`, shown as Needs review and kept out of every write until kept or
reset; v2 is removed only after v3 is written and reads back; refused storage keeps v2 and the
page copy.

**Three meanings of done**: Marked by you, Applied · awaiting refresh, Confirmed, with
postconditions for imports, schedules and hires in
[`docs/ui-progress-postconditions.md`](ui-progress-postconditions.md). Store:
`ba_progress_v1:<character>`. Applied is only set from a successful write's answer; Confirmed
only by a later board (board counter and game clock both later) that holds the postcondition.
v1/v2 marks and schedule ticks are kept and read as Marked by you; marks survive a basis switch.

**Factory-hours dependency** under both bases: named on the card with machines, now → needed
hours and the consequence; its own step in the manual instructions and the copied text; a
non-writable "Factory run hours" row on Changes that opens Production. The game link never
writes factory hours.

**Staffing**: Schedules is a list of shops and offices (plan state and progress) beside the
chosen one's planner, the same `spRosterBlock()`/`spOfficeRoster()` and write a business's
page carries (id `schRoster`), with the pick on the history entry (`nxSch`). Staff needs is one
page: Unmet demands, the last hire or move from here with its state (no undo), then the hiring
page under "Whom to hire"; "Write their week" opens Schedules on the site. Payroll: rate and
booked tiles with their difference, roles, and the sites whose books part from their rates.
`staff` (shop/office) and `idlestaff` findings open Schedules on the business; `topup` and
`wholesale` open Deliveries on the row.

**Chunk-1 carry-overs**: the Ask strip's re-pick on the guide already open (`ssRepick`), with a
test asking "Are my prices right?" on that guide, re-picking, and Back returning to it; a
Schedules test for the office plural (one and three computers).

Supported writes kept, with their guards: imports (preview, caps, refusals, uncovered amounts,
undo), shop and office schedules (undo), hire and move (no undo), uniform (unchanged).

## Files

Source: `ba_dashboard.py`. Docs: `docs/architecture.md`, `docs/dashboard-reference.md`,
`docs/ui-route-migration.md`, new `docs/ui-progress-postconditions.md`, this note.
Tests: new `tests/progress.test.cjs`; migrated `alert_kinds`, `calm_refresh`, `findability`,
`flow_chain`, `game_link_write`, `game_names`, `hostile_names`, `import_routes`,
`import_setto`, `layout`, `navigation`, `order_checklist`, `restore`, `roster`, `search`,
`shell_routes`, `site_panel`, `staff_hire`, `supply_sort`, `today_layout` (`.test.cjs`).
Generated by `python build_web.py`: `web/index.html`, `web/py/ba_dashboard.py`,
`web/version.json`, `web/i18n/de.json`. `web/names/*.json`, `web/wiki/**`, `web/wiki-data.json`,
`web/sitemap.xml` and `web/robots.txt` show as modified only through CRLF line endings from the
build (`git diff --ignore-cr-at-eol` is empty); no content change.

## Validation

Run in the foreground, Edge (`PLAYWRIGHT_CHANNEL=msedge`), `--test-concurrency=2`:

| Command | Result |
| --- | --- |
| `python -m unittest discover -s tests` (final source) | 1366 run, OK, 1 skipped |
| `node --test --test-concurrency=2 tests/*.test.cjs` (CLI target) | 1212 tests, 1211 pass, 0 fail, 1 skipped |
| The same, rerun on the final source for the files the last two changes touch (`import_routes`, `import_setto`, `game_link_write`, `hostile_names`, `supply_sort`, `layout`, `findability`, `i18n_layout`, `shell_routes`) | 233 tests, 233 pass |
| `tests/progress.test.cjs`, CLI and `BOARD_TARGET=web` (after its harness fix) | 10/10 each |
| `BOARD_TARGET=web` on `shell_routes`, `search`, `import_routes`, `import_setto`, `supply_sort`, `flow_chain`, `roster`, `progress` | 284 tests: 274 pass, and the 10 of `progress` that failed only on the harness serving HTML for the page's script files; after the fix, `progress` 10/10 on web |
| `python build_web.py`, then `python build_web.py --check` | exit 0, "web/ is up to date" |

One late change, the Imports scale's labels (marks close together no longer print over each
other), came in partway through the full Node run, hence the rerun above. Just before that
run: Supply's other views now learn of an import write or its undo when next shown
(`pgSupplyStale()`).

Screenshots (synthetic day-47 save, `python tests/save_fixtures.py demo.hsg 47`), light 1440
full page, dark 1440 and light/dark 1024 first screen, of every Supply and Staffing view: this
session's scratchpad `final/`. No sideways scroll and no page error at 1440 or 1024 in either
theme. Phone widths were not reviewed (optional).

## Tradeoffs and limits

- A business's own page still carries the same planner block as Schedules; chunk 3 decides
  what the business page keeps.
- A hire or move to a warehouse or a headquarters cannot be confirmed from the save (no people
  list is read there); it stays Applied and says "not in the save yet".
- The uniform write keeps its own dialog and undo; its progress entry is chunk 3's.
- Goods flow has no product filter.
- The Staff needs hiring page (main's Staff page) is still English-only text, as it shipped.
- The Imports scale merges labels of marks within a tenth of the scale into one label.
- No changelog entry (the coordinator decides at release).
- Deferred to chunk 3, untouched: City map vs Finder history; phone Tab order in finding rows.
