# UI redesign: routes, aliases and interim targets

26 September 2026 · Established by chunk 1 of the [implementation plan](ui-implementation-plan.md),
revised the same day for the merge of PR #121 (Staff hiring) and the chunk-1 correction pass.
The route ids below are fixed. Chunks 2 and 3 replace what a route shows, never its id or its
aliases. Code: `ROUTES`, `AREAS`, `REFS` and `HOST_ROUTES` in the board script
(`ba_dashboard.py`, section "the shell's routes"), and `FINDING_ROUTES` beside `ALERT_LINKS`.

## How the shell works

- **A route is the address.** `#overview`, `#supply/imports`, `#staffing/needs` and so on. The
  masthead lights the route's area and the row under it lights its view. Browser Back, Forward and
  a reload replay the route.
- **A host is what draws it today.** The old pages (`PAGES`: `today`, `company`, `supply`,
  `staffing`, `growth`, `map`, `wiki`) and their views (`SUBS`) are now hosts. Their DOM ids and
  `PAGE_DRAWS` tags are unchanged, so lazy and stale drawing and calm refresh work as before. The
  new `staffing` host (`#pageStaffing`) holds Schedules, Staff needs and Payroll. Staff needs is
  the one home of hiring: the staff demands (`secNeeds`), then main's Staff page (`secStaff`,
  issue #89) as it shipped. Payroll stays its own view.
- **A site's page keeps its address**, `#site/<slug>`. It stands under whichever route opened it:
  Businesses by default, or for example Staffing › Schedules when a schedule was opened from there.
  That route is stored in the history entry as `nxRoute`, so Back, Forward and a reload keep it.
- **Arrival.** A finding's action or a task in All tools stores why the reader came in the new
  entry's state (`nxArr`: what, position, way back). The strip under the area's row shows it with
  a way back. The Overview's own state when it was left (filters, "Show N more", open Details,
  the row and its screen position) is stored on the Overview's entry (`nxOv`). Returning through
  the strip is the browser's Back when the Overview is the entry right behind. Otherwise it is a
  new visit given that state. Either way the row is scrolled to where it stood and outlined for a
  moment. A row gone with the latest numbers is reported, not faked.
- **Area entry.** A click on an area opens the view last shown in it during this visit, or its
  first view. The first view of Supply is Changes. An explicit task or finding always opens its
  own view.
- **Supply scope.** The Shops / Warehouses / Factories tabs remain, labelled *Scope*. A Supply
  route names the scopes it is read on (`scopes`). Changes and Goods flow keep their route on any
  scope. Imports is read on Warehouses and Factories, Deliveries on Shops and Warehouses,
  Production on Factories. Picking another scope switches the route in place. Chunk 2 turns this
  into the final scope control.

## Canonical routes and their interim targets

| Route | Area › view | Interim target (chunk 1) | Scope, filter or row exposed | Final presentation |
| --- | --- | --- | --- | --- |
| `overview` | Overview | `today` host: `#kpis`, `#alertSection` (redrawn), `#secMoves` (All tools) | Needs attention first; critical rows expanded, 5 more, then "Show N more" | Chunk 1 (final) |
| `businesses/results` | Businesses › Results | `company/results`: `secDaily`, `secPortfolio`, site pages `secDetail` | Portfolio P&L; a site's page when one is open | Chunk 3 |
| `businesses/prices` | Businesses › Products & prices | `company/products`: new `secPrices` (a shop's shelves, price guides) and `secProducts` | Each shop opens its own page on `#sp-shelves`; each owned type opens its guide's prices | Chunk 3 |
| `businesses/standards` | Businesses › Standards | `company/standards`: new `secStandards` (four subjects), then `secPortfolio` in Operations | Portfolio switched to Operations; a subject opens the first business on its block | Chunk 3 |
| `businesses/milestones` | Businesses › Milestones | `company/milestones`: `secGoals` | – | Chunk 3 |
| `supply/changes` | Supply › Changes | `supply` host, list mode, the tab with the most still to type; lands on `#sbStrip` (the checklist) | Change checklist with Copy remaining and ticks | Chunk 2 |
| `supply/imports` | Supply › Imports | `supply/warehouses` (Weekly imports, Set to boxes); factory-own contracts on the Factories scope | Scope Warehouses or Factories; a finding lights its row (`sbLand`) | Chunk 2 |
| `supply/deliveries` | Supply › Deliveries | `supply/shops` (shelves, top-ups, wholesale); depot top-ups on the Warehouses scope | Scope Shops or Warehouses; a finding lights its row | Chunk 2 |
| `supply/production` | Supply › Production | `supply/factories` (lines, hours, inputs, `#sbStaff` factory staffing) | Scope Factories | Chunk 2 |
| `supply/flow` | Supply › Goods flow | The tab on screen in diagram mode (`svg#flow`, `#flowChain` when narrow). The List or Diagram switch moves the route between the tab's view and Goods flow | The scope on screen | Chunk 2 |
| `staffing/schedules` | Staffing › Schedules | new `secSchedules`: every shop and office with its plan's state. A shop opens its page on `#sp-roster`; an office on `#sp-roster` where the office default plans it (its additive write is there), else on `#sp-crew` (`nxStaffInto()`). Factories open Supply › Production | The shop a task or search named is lit (`schedPick`) | Chunk 2 |
| `staffing/needs` | Staffing › Staff needs | new `secNeeds`: staff demands (`#nxDemands`), each opening the crew that shows it; then `secStaff`, main's Staff page unchanged: open places by role, candidates, Mass and Quick hire, hire and move review and write (no undo), office plans, staff with no hours, and its short Payroll summary | – | Chunk 2 |
| `staffing/payroll` | Staffing › Payroll | `staffing/payroll`: `secPayroll`, the full Payroll tables (`drawPayroll`), moved from Company | – | Chunk 2 |
| `expansion/demand` | Expansion › Demand | `growth/market`: `secMarket` | – | Chunk 3 |
| `expansion/finder` | Expansion › Find a location | `map` host with the finder on. A task or a Demand cell asks a question (`openFinder(preset)`); Back, Forward, a reload and the area's row switch it on as the reader left it (`showFinder()`) | Finder filters and saved searches as before | Chunk 3 |
| `expansion/factory` | Expansion › Plan a factory | `growth/plan`: `secPlan`, `secIngredients` | – | Chunk 3 |
| `map` | City map (reference) | `map` host | Finder as the reader left it | Chunk 3 |
| `wiki` | Game guide (reference) | `wiki` host; `#wiki/<page>` is still the wiki's own route | – | Chunk 3 |
| `#site/<slug>` | a business's page | `company/results` + `secDetail` | Under the route that opened it (`nxRoute`) | Chunk 3 |

## Old addresses that still land

| Old hash | Lands on |
| --- | --- |
| `#today` | `overview` (`ROUTE_ALIASES`; the Overview's state is restored as on `#overview`) |
| `#payroll`, `#secPayroll` | Staffing › Payroll |
| `#staff`, `#secStaff` | Staffing › Staff needs, at the hiring page (`#staff` and `#secStaff` were main's Company › Staff, issue #89) |
| `#company`, `#results` | `businesses/results` |
| `#growth` | `expansion/demand` (or Plan a factory if that was the Growth view last used) |
| `#supply` | the Supply area entry: `supply/changes` on the first visit |
| `#businesses`, `#staffing`, `#expansion`, `#overview` | the area's entry |
| `#guide` | `wiki` |
| `#secDaily`, `#secPortfolio`, `#secDetail`, `#secRhythm` | Businesses › Results (`SEC_PAGE`, `SEC_MOVED`) |
| `#secProducts` | Businesses › Products & prices |
| `#secGoals` | Businesses › Milestones |
| `#secShops`, `#secStock` | Supply › Deliveries (Shops scope) |
| `#secWarehouses`, `#secLogistics`, `#secFlow` | Supply › Imports (Warehouses scope) |
| `#secFactories` | Supply › Production |
| `#secMarket` / `#secPlan`, `#secIngredients` | Expansion › Demand / Plan a factory |
| `#alertSection`, `#secMoves` | Overview |
| `#site/<slug>`, `#wiki/<page>` | unchanged contracts |

A remembered `ba_dash_page` still works. A load with no hash opens the route last shown
(`ba_dash_route`). A device that remembered Company on Payroll or Staff (`ba_dash_company`)
opens Staffing on Payroll or Staff needs instead, once, without overwriting a Staffing view or
a route it already remembers.

## Every finding kind's route

The action button names the fix. The route is the final home from
[the structure proposal](ui-structure-proposal.md#7-every-finding-still-has-a-destination). The
landing is today's `ALERT_LINKS` / `ALERT_EVIDENCE`, which is the interim target.

| Kind (`group`) | Action | Route | Interim landing |
| --- | --- | --- | --- |
| `notrading` | Open readiness | `businesses/results` | its page, tiles block |
| `vacant` | Review costs | `businesses/results` | `secPortfolio` |
| `loss` | Review results | `businesses/results` | its page, tiles block |
| `trend` | Review results | `businesses/results` | its page, profit block |
| `atcap` | Review customer hours | `businesses/results` | its page, hours block |
| `staff` at a factory | Plan factory hours | `supply/production` | Factories scope, the machine's row. A factory is known by its Supply tab, or without the supply facts by the finding's machine (`ev.slot`) or the site's type (`ovAtFactory()`) |
| `staff` at a shop or office | Review schedule | `staffing/schedules` | its page: a shop's `#sp-roster`; an office's `#sp-roster` where the office default plans it, else `#sp-crew` (`nxStaffInto()`) |
| `idlestaff` | Review schedule | `staffing/schedules` | its page, hours block, idle hours lit |
| `satisfaction` | Review satisfaction | `businesses/standards` | its page, standards block |
| `promotion` | Review promotion | `businesses/standards` | the portfolio in Operations, on Standards (`reveal()` takes the route's view when the section is on it); Results gets back the portfolio view it had |
| `uniform` | Review uniforms | `businesses/standards` | its page, standards block; game-link uniform write in the row unchanged |
| `bathroom`, `toiletprivacy`, `sink`, `music`, `interior` | Review amenities | `businesses/standards` | its page, standards block, the amenity lit |
| `jobdemand` | Resolve staff demand | `staffing/needs` | its page, crew block |
| `companydemand` | Resolve staff demand | `staffing/needs` | the site that shows it most (`ALERT_SITE_PICK`), crew block; else Staff needs (`secNeeds`) |
| `hype` | Review demand wave | `expansion/demand` | `secMarket` |
| `unplanned`, `outruns` | Review delivery | `supply/deliveries` | Shops scope, the shelf's row |
| `topup` | Review delivery | `supply/deliveries` | the depot's page, stock row |
| `wholesale` | Review delivery | `supply/deliveries` | its page, shelves or stock row |
| `target` | Review target | `supply/deliveries` | the site's scope, its row |
| `dead` | Review idle stock | `supply/deliveries` | the site's scope, its row |
| `notrouted` | Review routes | `supply/deliveries` | the site's scope, its row |
| `shortfall` | Review import | `supply/imports`; route-fed (key `f.shortfall.route` or `f.shortfall.route.…`, nothing else): `supply/deliveries` | the site's scope, its row |
| `order`, `paused` | Review import | `supply/imports` | the site's scope, its row |
| `feed` | Review factory input | `supply/production` | Factories scope, the input's row |
| `unnamed`, `unset` | Identify recipe | `supply/production` | Factories scope |

When a landing ends on a page the route cannot show (a factory row for a delivery kind), the
shell shows the page's own route. It never shows a route that is not on screen.

## The thirteen tasks (All tools)

| Group | Task | Route | Count beside it |
| --- | --- | --- | --- |
| Supply | Calculate import amounts (`#planImportsCard`) | `supply/imports` | the checklist's own badge (`paintPlanImports`) |
| Supply | Set delivery targets | `supply/deliveries` | delivery findings on the list |
| Supply | Plan factory running hours | `supply/production` | production findings, or "no factory yet" |
| Supply | Trace goods through the company | `supply/flow` | – |
| Staffing | Build shop schedules (`#optimizeStaffingCard`) | `staffing/schedules`, the named shop lit | the plan's badge (`drawOptimizeStaffing`) |
| Staffing | See whom to hire | `staffing/needs`, at `#secStaff` (the hiring page) | – |
| Staffing | Resolve staff demands | `staffing/needs`, at `#nxDemands` | staff-demand findings |
| Businesses | Compare business profits | `businesses/results` | – |
| Businesses | Check prices and product sales | `businesses/prices` | – |
| Businesses | Improve customer satisfaction | `businesses/standards` | standards findings |
| Expansion | Find a suitable location (`#findLocationCard`) | `expansion/finder`, retail | vacant units (`drawFindLocation`) |
| Expansion | Plan a new factory | `expansion/factory` | – |
| Expansion | Explore market demand | `expansion/demand` | – |

Next moves and the Ask the board row are gone from the Overview (E15, E16). Their three live
cards are rows here under the same ids. The seven questions are still the search palette's
empty state.

## PR #121 staffing and hiring rows (H01–H07)

The structure proposal's ledger gained seven rows for Staff hiring. Chunk 1 gives each a route
and keeps main's presentation and writes exactly as merged; chunk 2 owns their final
presentation.

| Row | Capability | Route in chunk 1 | Reached from | Chunk-1 host, unchanged from main |
| --- | --- | --- | --- | --- |
| H01 | Open places by role, bench and spare-staff netting | `staffing/needs` | Staffing's row; All tools › See whom to hire; search "Hiring"; `#staff`, `#secStaff` | `secStaff`, `drawStaff()` |
| H02 | Candidates, filters and picks | `staffing/needs` | as H01 | `secStaff` and a role's sheet of candidates (`#hsSheet`, Change picks) |
| H03 | Mass hire and Quick hire | `staffing/needs` | as H01 | `secStaff`: Mass hire over the plans, the Quick hire form (`hqModel()`) |
| H04 | Hire and move preview, confirm, refusal, partial result, re-read; no undo | `staffing/needs` | as H01 | `dialog.hr-wide` over `secStaff`, `/write/hire` (`docs/game-link-api.md`) |
| H05 | Staff with no hours | `staffing/needs`; a business's page, crew block | as H01; a staff finding | `secStaff`; `#sp-crew` |
| H06 | Office planning and additive schedule writes | `staffing/schedules` | Schedules › an office's Open staffing; `staff` findings at an office | the office's page, `#sp-roster` (`spOfficeRoster()`), and the multi-site write |
| H07 | Factory and source-site effects of hire requests | `staffing/needs`, then `supply/production` | the hire review names the sites it changes; Schedules › Factories › Open Production | `secStaff` review; `drawFactoryStaffing()` on Supply › Production |

## Adding a route

Add it to `ROUTES` (and its view to its area in `AREAS`), a `HOST_ROUTES` entry if a host view
shows it by default, `routeViewLabel()`, and this table. A new host section still follows
[Registries](architecture.md#registries). `tests/navigation.test.cjs` and
`tests/shell_routes.test.cjs` hold the tables to each other; `tests/staff_hire.test.cjs` opens
the hiring page on its route.
