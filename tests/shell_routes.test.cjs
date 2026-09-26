// The redesign's shell (docs/ui-route-migration.md): canonical routes, where a
// finding or a task lands and stays, the Overview's order and state on the way
// back, the keyboard, and the counts the shell shows on every page. The board
// is the CLI page rendered from the synthetic day-47 payload snapshot
// (tests/fixtures/payload_snapshot/, never a real save); with BOARD_TARGET=web
// it is the built web/index.html, its own files served beside it, given the
// same payload on every load (a reload included, as a resumed source is).
// Install Playwright and its Chromium browser to run; NODE_PATH may point at an
// existing installation.
const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');

const ROOT = path.join(__dirname, '..');
const WEB = process.env.BOARD_TARGET === 'web';
const SNAPSHOT = path.join(ROOT, 'tests', 'fixtures', 'payload_snapshot', 'data_day47_history.json');
let browser, html;
before(async () => {
  const made = spawnSync(process.env.PYTHON || 'python', ['-c', `
import json, sys
from ba_dashboard import render
d = json.load(open("tests/fixtures/payload_snapshot/data_day47_history.json", encoding="utf-8"))
sys.stdout.buffer.write(render(d).encode("utf-8"))`], {cwd: ROOT, maxBuffer: 64 * 1024 * 1024});
  assert.equal(made.status, 0, made.stderr.toString());
  html = WEB ? fs.readFileSync(path.join(ROOT, 'web', 'index.html'), 'utf8') : made.stdout.toString('utf8');
  browser = await chromium.launch({headless: true, channel: process.env.PLAYWRIGHT_CHANNEL});
});
after(async () => { await browser?.close(); });

/* The board at `hash`, in a context of its own (its storage survives a reload). */
async function board(t, {hash = '#overview', width = 1440, height = 900} = {}) {
  const context = await browser.newContext({viewport: {width, height}, reducedMotion: 'reduce'});
  t.after(() => context.close());
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  t.after(() => assert.deepEqual(errors, [], 'no script error on the page'));
  await context.route('https://**', route => route.abort());
  await context.route('https://shell.test/**', route => {
    const p = new URL(route.request().url()).pathname;
    if(p === '/') return route.fulfill({contentType: 'text/html; charset=utf-8', body: html});
    // The web build's own files (app.js, i18n.js, community.js, the wiki's data).
    const f = path.join(ROOT, 'web', decodeURIComponent(p));
    return WEB && fs.existsSync(f) ? route.fulfill({path: f}) : route.fulfill({status: 404, body: ''});
  });
  if(WEB) await context.addInitScript(raw => {
    window.addEventListener('load', () => { document.body.classList.add('has-board'); takeData(raw); boot(); });
  }, JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8')));
  await page.goto('https://shell.test/' + hash, {waitUntil: 'load'});
  await page.waitForFunction(() => typeof route === 'string' && typeof hasData === 'function' && hasData());
  return page;
}
const where = page => page.evaluate(() => ({route, page, hash: location.hash, site: siteOpen ? siteKey : null,
  lit: (document.querySelector('#localNav a.on') || {}).dataset?.route || null}));
const back = async page => { await page.goBack(); await page.waitForTimeout(150); };
const forward = async page => { await page.goForward(); await page.waitForTimeout(150); };

// --- the tables ------------------------------------------------------------------------

test('every finding kind names a real route, and every route is a view of its area', async t => {
  const page = await board(t);
  const got = await page.evaluate(() => ({
    kinds: ALERT_GROUPS.map(g => g.id), routed: Object.keys(FINDING_ROUTES),
    bad: Object.entries(FINDING_ROUTES).filter(([, f]) => !ROUTES[f.route]).map(([k]) => k),
    views: AREAS.flatMap(a => (a.views || []).map(v => `${a.id}/${v}`)).filter(id => !ROUTES[id]),
  }));
  assert.equal(got.kinds.length, 31, 'the finding catalogue is 31 kinds');
  assert.deepEqual([...got.routed].sort(), [...got.kinds].sort());
  assert.deepEqual(got.bad, []);
  assert.deepEqual(got.views, []);
});

test('a shortfall a route feeds is a delivery; one an import still falls short of is an import', async t => {
  const page = await board(t);
  const routeOf = key => page.evaluate(k => findingRoute({group: 'shortfall', i18n: {text: [k, {}]}}).route, key);
  assert.equal(await routeOf('f.shortfall.route'), 'supply/deliveries');
  assert.equal(await routeOf('f.shortfall.route.paused'), 'supply/deliveries');
  assert.equal(await routeOf('f.shortfall.routed'), 'supply/imports');
  assert.equal(await routeOf('f.shortfall.routed.paused'), 'supply/imports');
  assert.equal(await routeOf('f.shortfall'), 'supply/imports');
});

test('a share is read with its decimals: 64.0% satisfied is 64, and 64.5% is 64.5', async t => {
  const page = await board(t);
  const amounts = await page.evaluate(() => [
    findingAmount({group: 'satisfaction', text: 'Customer satisfaction at 64.0%', i18n: {text: ['f.satisfaction', {n: 64.0}]}}),
    findingAmount({group: 'satisfaction', text: 'Customer satisfaction at 64.5%'}),
    findingAmount({group: 'promotion', text: 'HART. Gifts promotes at 80.0% of the 100% cap', i18n: {text: ['f.promotion', {promotion: 80.0}]}}),
    findingAmount({group: 'promotion', text: 'HART. Gifts promotes at 72.5% of the 100% cap'}),
  ]);
  assert.deepEqual(amounts, ['64%<small>satisfied</small>', '64.5%<small>satisfied</small>',
    '80%<small>promotion</small>', '72.5%<small>promotion</small>']);
  // And on the Overview itself: no "0%" beside a 64.0% sentence.
  const row = await page.locator('#alerts .find[data-kind="satisfaction"] .amt').first().textContent();
  assert.match(row, /^64%/);
});

// --- landings keep their route -----------------------------------------------------------

test('a promotion finding lands on Businesses › Standards, and Results gets its own portfolio back', async t => {
  const page = await board(t);
  await page.evaluate(() => { ovShowAll = true; drawAlerts(); });
  await page.locator('#alerts .find[data-kind="promotion"] .ov-act').click();
  const w = await where(page);
  assert.deepEqual([w.route, w.page, w.lit], ['businesses/standards', 'company', 'businesses/standards']);
  assert.equal(await page.evaluate(() => [sub.company, view].join()), 'standards,ops');
  assert.equal(await page.locator('#secPortfolio').isVisible(), true);
  await page.locator('#localNav a[data-route="businesses/results"]').click();
  assert.equal(await page.evaluate(() => view), 'pnl', 'Results shows profit and loss, not Standards\' comparison');
});

test('a shop opened from Products & prices stays under it: two shops, Back, Forward and a reload', async t => {
  const page = await board(t, {hash: '#businesses/prices'});
  const shops = await page.$$eval('#secPrices [data-price-site]', b => b.map(x => x.dataset.priceSite));
  assert.ok(shops.length >= 2, 'the fixture runs two shops');
  for (const key of shops.slice(0, 2)) {
    await page.evaluate(() => openRoute('businesses/prices'));
    await page.locator(`#secPrices [data-price-site="${key}"]`).click();
    await page.waitForFunction(() => siteOpen && !!document.querySelector('#sp-shelves'));
    const w = await where(page);
    assert.deepEqual([w.route, w.site, w.lit], ['businesses/prices', key, 'businesses/prices'], key);
    assert.match(w.hash, /^#site\//);
  }
  await back(page);
  assert.deepEqual((await where(page)).route, 'businesses/prices');
  await forward(page);
  let w = await where(page);
  assert.deepEqual([w.route, w.site, w.lit], ['businesses/prices', shops[1], 'businesses/prices']);
  await page.reload();
  await page.waitForFunction(() => typeof hasData === 'function' && hasData() && siteOpen);
  w = await where(page);
  assert.deepEqual([w.route, w.site, w.lit], ['businesses/prices', shops[1], 'businesses/prices'], 'a reload keeps it');
});

test('a schedule opened from Staffing › Schedules, and a wholesale finding, keep their routes on the shop\'s page', async t => {
  const page = await board(t, {hash: '#staffing/schedules'});
  const key = await page.getAttribute('#secSchedules [data-sched-open]', 'data-sched-open');
  await page.locator(`#secSchedules [data-sched-open="${key}"]`).click();
  await page.waitForFunction(() => siteOpen);
  let w = await where(page);
  assert.deepEqual([w.route, w.site, w.lit], ['staffing/schedules', key, 'staffing/schedules']);
  await page.evaluate(() => { history.back(); });
  await page.waitForFunction(() => !siteOpen);
  await page.evaluate(() => { openRoute('overview'); ovShowAll = true; drawAlerts(); });
  await page.locator('#alerts .find[data-kind="wholesale"] .ov-act').click();
  await page.waitForFunction(() => siteOpen);
  w = await where(page);
  assert.deepEqual([w.route, w.lit], ['supply/deliveries', 'supply/deliveries']);
  await back(page); await forward(page);
  w = await where(page);
  assert.deepEqual([w.route, w.lit], ['supply/deliveries', 'supply/deliveries'], 'Forward keeps it');
});

test('a staff finding lands on the staffing of its kind: a factory\'s Production without supply facts, an office\'s crew', async t => {
  const page = await board(t);
  const got = await page.evaluate(() => {
    const factory = D.businesses.find(b => b.typeSlug === 'ba:businesstype_factory');
    const supply = D.supply;
    D.supply = null;
    const atFactory = ovAtFactory({group: 'staff', site: factory.name, siteKey: factory.key});
    D.supply = supply;
    const office = {key: 'ba:street_nowhere#1', name: 'Test Office', status: 'office'};
    const shop = D.businesses.find(b => b.status === 'retail');
    return {atFactory, route: (() => { D.supply = null; const r = findingRoute({group: 'staff', site: factory.name, siteKey: factory.key}).route; D.supply = supply; return r; })(),
      office: nxStaffInto(office), shop: nxStaffInto(shop)};
  });
  assert.deepEqual(got, {atFactory: true, route: 'supply/production', office: '#sp-crew', shop: '#sp-roster'});
});

// --- Find a location keeps its filters ---------------------------------------------------

test('Find a location opened without a preset keeps the reader\'s filters through Back, Forward and a reload', async t => {
  const page = await board(t);
  await page.evaluate(() => openRoute('expansion/finder', {preset: {cat: 'office', type: '', hoods: null}}));
  await page.waitForFunction(() => typeof cityMapPage !== 'undefined' && cityMapPage && cityMapPage.finderOn());
  await page.evaluate(() => cityMapPage.ready);
  await page.evaluate(() => { cityMapPage.fs.minM2 = 120; cityMapPage.fs.show = 'takeover'; cityMapPage.saveFinder(); });
  const kept = () => page.evaluate(() => ({cat: cityMapPage.fs.cat, minM2: cityMapPage.fs.minM2, show: cityMapPage.fs.show, on: cityMapPage.finderOn()}));
  const want = {cat: 'office', minM2: 120, show: 'takeover', on: true};
  await page.locator('#nav a[data-id="overview"]').click();
  await back(page);
  assert.deepEqual(await kept(), want, 'Back');
  await back(page); await forward(page);
  assert.deepEqual(await kept(), want, 'Forward');
  await page.evaluate(() => openRoute('expansion/demand'));
  await page.locator('#localNav a[data-route="expansion/finder"]').click();
  assert.deepEqual(await kept(), want, 'the area\'s own row');
  await page.reload();
  await page.waitForFunction(() => typeof cityMapPage !== 'undefined' && cityMapPage && cityMapPage.finderOn());
  await page.evaluate(() => cityMapPage.ready);
  assert.deepEqual(await kept(), want, 'a reload');
  assert.equal((await where(page)).route, 'expansion/finder');
});

// --- Supply: the diagram is Goods flow -----------------------------------------------------

test('the List or Diagram switch moves Supply between its view and Goods flow, and a reload keeps it', async t => {
  const page = await board(t, {hash: '#supply/imports'});
  await page.locator('#sbView a[data-id="diagram"]').click();
  let w = await where(page);
  assert.deepEqual([w.route, w.hash, w.lit], ['supply/flow', '#supply/flow', 'supply/flow']);
  await page.reload();
  await page.waitForFunction(() => typeof hasData === 'function' && hasData());
  assert.deepEqual([(await where(page)).route, await page.evaluate(() => sbViewMode())], ['supply/flow', 'diagram']);
  await page.locator('#sbView a[data-id="list"]').click();
  w = await where(page);
  assert.equal(w.route, 'supply/imports', 'the list of the Warehouses scope is Imports again');
  assert.equal(w.lit, 'supply/imports');
});

// --- the Overview's order and state --------------------------------------------------------

test('after the masthead brings the Overview back, a refresh appends a new finding and says so', async t => {
  const page = await board(t, {hash: '#supply/changes'});
  await page.locator('#nav a[data-id="overview"]').click();
  const before = await page.$$eval('#alerts .find.crit', r => r.map(x => x.dataset.id));
  await page.evaluate(() => {
    const next = JSON.parse(JSON.stringify(dataEn ? dataEn() : D));
    next.alerts = [{...next.alerts.find(a => a.level === 'critical'), id: 'zz-new', text: 'A new finding', site: next.businesses[0].name, siteKey: next.businesses[0].key}, ...next.alerts];
    takeData(next); renderCalm(true);
  });
  const now = await page.$$eval('#alerts .find.crit', r => r.map(x => x.dataset.id));
  assert.deepEqual(now, [...before, 'zz-new'], 'the rows on screen keep their places; the new one is last');
  assert.equal(await page.locator('#alerts .find[data-id="zz-new"]').evaluate(r => r.classList.contains('ov-new')), true);
  assert.equal(await page.locator('#ovNews').isVisible(), true);
});

test('leaving the Overview by the masthead keeps its filters and "Show N more" for Back', async t => {
  const page = await board(t);
  await page.locator('[data-ov-more]').click();
  await page.locator('#alertHead .sev[data-kind="opp"]').click();
  await page.locator('#nav a[data-id="supply"]').click();
  await back(page);
  const got = await page.evaluate(() => ({route, all: ovShowAll, off: [...sevOff]}));
  assert.deepEqual(got, {route: 'overview', all: true, off: ['opp']});
});

test('a filtered list is never an empty one with its rows folded away', async t => {
  const page = await board(t);
  await page.locator('#alertHead .sev[data-kind="crit"]').click();
  const shown = await page.$$eval('#alerts .find', rows => rows.filter(r => r.getClientRects().length).length);
  assert.ok(shown >= 13, `every warning the filter keeps shows (${shown})`);
  assert.equal(await page.locator('#ovMore').isHidden(), true);
  // The filters are switches in full-strength text, off drawn as an outline.
  const off = await page.locator('#alertHead .sev[data-kind="crit"]').evaluate(b =>
    [b.getAttribute('aria-pressed'), getComputedStyle(b).opacity]);
  assert.deepEqual(off, ['false', '1']);
});

test('a finding below the line comes back as itself, not as gone', async t => {
  const page = await board(t);
  await page.locator('#alertMinor [data-td-toggle="below"]').click();
  const row = page.locator('#alertMinor .find').first();
  const id = await row.getAttribute('data-id');
  await row.locator('.ov-act').click();
  await page.waitForFunction(() => location.hash !== '#overview');
  await page.locator('#arrive .nx-back').click();
  await page.waitForFunction(() => route === 'overview');
  await page.waitForTimeout(100);
  assert.equal(await page.locator('#ovNews').isHidden(), true, 'no "no longer on the list" line');
  assert.equal(await page.locator(`#alertMinor .find[data-id="${id}"]`).count(), 1);
});

test('the keyboard goes with a finding and comes back to it', async t => {
  const page = await board(t);
  const act = page.locator('#alerts .find.crit .ov-act').first();
  const id = await page.locator('#alerts .find.crit').first().getAttribute('data-id');
  await act.focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => location.hash !== '#overview');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'arrive', 'the arrival strip has the keyboard');
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.dataset.nx), 'back', 'and its way back is the next Tab');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => route === 'overview');
  await page.waitForTimeout(100);
  assert.equal(await page.evaluate(() => {
    const el = document.activeElement;
    return el.classList.contains('ov-act') && el.closest('.find').dataset.id;
  }), id, 'back on the finding\'s action');
});

// --- the shell's counts ------------------------------------------------------------------

test('the critical count follows a refresh made away from the Overview, which waits for its visit', async t => {
  const page = await board(t, {hash: '#supply/imports'});
  const count = () => page.$eval('#nav [data-nav-crit]', b => b.hidden ? 0 : +b.textContent);
  const was = await count();
  await page.evaluate(() => {
    const next = JSON.parse(JSON.stringify(dataEn ? dataEn() : D));
    next.alerts = [{...next.alerts.find(a => a.level === 'critical'), id: 'zz-away'}, ...next.alerts];
    takeData(next); renderCalm(true);
  });
  assert.equal(await count(), was + 1);
  assert.equal(await page.evaluate(() => [...pageStale].some(r => /drawAlerts/.test(String(r[1])))), true,
    'the list itself is drawn when the Overview opens');
});

// --- Staffing: Payroll and Staff needs are two views --------------------------------------

test('Staffing › Payroll draws Payroll; Staff needs carries the demands and the hiring page', async t => {
  const page = await board(t, {hash: '#staffing/payroll'});
  assert.equal(await page.locator('#secPayroll .sechead h2').textContent(), 'Payroll');
  await page.locator('#localNav a[data-route="staffing/needs"]').click();
  assert.equal(await page.locator('#secNeeds #nxDemands').isVisible(), true);
  assert.equal(await page.locator('#secStaff .hs-head h2').textContent(), 'Staff');
  assert.equal(await page.locator('#secPayroll').isHidden(), true);
});
