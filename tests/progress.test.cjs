// Chunk 2 of the redesign: one proposal from the row to the copy, the basis
// kept per company, the stores migrated, and the three meanings of done
// (docs/ui-progress-postconditions.md). The board runs on the synthetic R8
// fixture (tests/fixtures/r8_supply.json); a later board is the same payload
// taken in again, changed the way the game would hold it.
const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');
const root = path.join(__dirname, '..');
const FIXTURE = path.join(root, 'tests', 'fixtures', 'r8_supply.json');
const fixture = () => JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
let browser, html;
before(async () => {
  if(process.env.BOARD_TARGET === 'web') html = fs.readFileSync(path.join(root, 'web/index.html'), 'utf8');
  else {
    const r = spawnSync(process.env.PYTHON || 'python', ['-c',
      'from ba_dashboard import render; import sys; sys.stdout.buffer.write(render(None).encode("utf-8"))'],
      {cwd: root, maxBuffer: 16 * 1024 * 1024});
    assert.equal(r.status, 0, r.stderr?.toString());
    html = r.stdout.toString();
  }
  browser = await chromium.launch({headless: true, channel: process.env.PLAYWRIGHT_CHANNEL});
});
after(async () => { await browser?.close(); });

/* A page with storage on a real origin: `seed` is written before the board
   takes its data (a store from an older board), `refuse` makes every write to
   storage throw, as a full quota does. */
async function board(t, {data = fixture(), seed = {}, refuse = false, mode = null} = {}){
  const page = await browser.newPage({viewport: {width: 1440, height: 1000}});
  t.after(() => page.close());
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  t.after(() => assert.deepEqual(errors, [], 'no script error on the page'));
  await page.route('https://**', r => r.abort());
  /* The page, and under BOARD_TARGET=web the files the built page loads
     beside it, from web/. */
  await page.route('http://progress.test/**', r => {
    const rel = decodeURIComponent(new URL(r.request().url()).pathname.slice(1));
    if(!rel) return r.fulfill({contentType: 'text/html', body: html});
    const f = path.join(root, 'web', rel);
    return fs.existsSync(f) && fs.statSync(f).isFile() ? r.fulfill({path: f}) : r.fulfill({status: 404, body: ''});
  });
  await page.goto('http://progress.test/');
  await page.evaluate(([data, seed, refuse, mode]) => {
    localStorage.clear();
    Object.entries(seed).forEach(([k, v]) => localStorage.setItem(k, v));
    if(refuse){ const real = Storage.prototype.setItem; Storage.prototype.setItem = function(){ throw new Error('quota'); }; window.realSet = real; }
    document.body.classList.add('has-board');
    takeData(data);
    if(mode) sizing = mode;
    sbSelOff = true; sbSel = null;
    document.querySelectorAll('.page').forEach(el => { el.hidden = el.id !== 'pageSupply'; });
    document.querySelectorAll('#pageSupply section').forEach(el => { el.hidden = false; el.classList.add('measured'); });
    drawSupplyStrip(); drawChangesView(); drawImportsView(); drawDeliveriesView(); drawProductionView(); wireAll();
  }, [data, seed, refuse, mode]);
  return page;
}
const redraw = page => page.evaluate(() => { drawSupplyStrip(); drawChangesView(); drawImportsView(); drawDeliveriesView(); drawProductionView(); wireAll(); });
const HUB_FLOUR = JSON.stringify(['hub#1', 'flour']);

test('the basis is kept per company: the device key is the fallback, and one company never sets another\'s', async t => {
  const page = await board(t, {seed: {ba_dash_sizing: 'dem'}});
  // No choice of its own yet: the device-wide choice every board used before.
  assert.equal(await page.evaluate(() => sizing), 'dem');
  await page.evaluate(() => { szPick('cap'); });
  assert.deepEqual(await page.evaluate(() => [localStorage.getItem('ba_dash_sizing:r8-fixture'), localStorage.getItem('ba_dash_sizing')]), ['cap', 'dem'],
    'the pick is the company\'s; the device key is never written again');
  // Another company, with no choice of its own, still reads the fallback.
  const other = await page.evaluate(() => { const d = JSON.parse(JSON.stringify(D)); d.meta.character = 'other-co'; takeData(d); return sizing; });
  assert.equal(other, 'dem');
  await page.evaluate(() => szPick('dem'));
  // And back to the first: its own pick stands.
  const first = await page.evaluate(() => { const d = JSON.parse(JSON.stringify(D)); d.meta.character = 'r8-fixture'; takeData(d); return sizing; });
  assert.equal(first, 'cap');
  // Without storage the pick lasts as long as the page.
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new Error('quota'); }; szPick('dem'); });
  assert.equal(await page.evaluate(() => szRead()), 'dem');
});

test('a figure kept by the previous board has no basis: Needs review, out of every write, until kept or reset', async t => {
  const page = await board(t, {seed: {'ba_import_set_v2:r8-fixture': JSON.stringify({[HUB_FLOUR]: {value: 15000, inGame: 14000}})}});
  // Moved to version 3 with no basis; version 2 removed once version 3 reads back.
  assert.deepEqual(await page.evaluate(() => [JSON.parse(localStorage.getItem('ba_import_set_v3:r8-fixture')), localStorage.getItem('ba_import_set_v2:r8-fixture')]),
    [{[HUB_FLOUR]: {value: 15000, inGame: 14000, basis: null}}, null]);
  const row = () => page.evaluate(() => { const r = sbData().rows.find(x => x.kind === 'Weekly imports' && x.slug === 'flour');
    return [r.proposed, r.review, r.basis]; });
  assert.deepEqual(await row(), [15000, true, null], 'the figure is kept, and asks for a review');
  assert.equal(await page.evaluate(() => gwImportPlan(null).some(l => l.r.slug === 'flour')), false, 'never written as it stands');
  // The Changes row and the card say so.
  assert.match(await page.locator('#secChanges .sbc-row', {hasText: 'Flour'}).first().textContent(), /Needs review/);
  await page.evaluate(() => { sbSelOff = false; sbSel = {s: 0, slug: 'flour'}; drawImportsView(); wireAll(); });
  assert.match(await page.locator('#sbCard .sbi-basis').textContent(), /kept from before the board recorded a basis/);
  // The copied line says it too.
  assert.match(await page.evaluate(() => orderChecklistText(sbData().rows, 'T')), /Flour: 14000 -> 15000 units\/week\..*review it first/);
  // Kept for the basis on screen: an ordinary figure of the player's, written like any other.
  await page.locator('#sbCard [data-imp-keep]').click();
  assert.deepEqual(await row(), [15000, false, 'cap']);
  assert.equal(await page.evaluate(() => gwImportPlan(null).some(l => l.r.slug === 'flour')), true);
});

test('with storage refused the old figure stays where it was, and the page still reviews it', async t => {
  const page = await board(t, {refuse: true, seed: {'ba_import_set_v2:r8-fixture': JSON.stringify({[HUB_FLOUR]: {value: 15000, inGame: 14000}})}});
  assert.equal(await page.evaluate(() => localStorage.getItem('ba_import_set_v2:r8-fixture')) !== null, true, 'version 2 is kept');
  assert.equal(await page.evaluate(() => localStorage.getItem('ba_import_set_v3:r8-fixture')), null);
  assert.equal(await page.evaluate(() => sbData().rows.find(x => x.slug === 'flour' && x.kind === 'Weekly imports').review), true);
});

test('figures, marks and progress belong to one company', async t => {
  const page = await board(t, {seed: {
    'ba_import_set_v3:r8-fixture': JSON.stringify({[HUB_FLOUR]: {value: 15000, inGame: 14000, basis: 'cap'}}),
    'ba_import_set_v3:other-co': JSON.stringify({[HUB_FLOUR]: {value: 99000, inGame: 14000, basis: 'dem'}}),
  }});
  assert.equal(await page.evaluate(() => sbData().rows.find(x => x.slug === 'flour' && x.kind === 'Weekly imports').proposed), 15000);
  await page.locator('#secImports tr[data-slug="flour"] .sb-tick').click();
  await page.evaluate(() => pgRecord({id: 'imports|hub#1|flour|weekly|15000', family: 'imports', target: {depot: 'hub#1', slug: 'flour'},
    expect: {contracts: [], inGame: 15000}, rowKeys: [], label: 'Flour'}));
  // The same map, another character: none of it.
  const other = await page.evaluate(() => {
    const d = JSON.parse(JSON.stringify(D)); d.meta.character = 'other-co'; d.supply.factories.character = 'other-co';
    takeData(d); orderMarkCache.clear(); sbStamp++;
    const r = sbData().rows.find(x => x.slug === 'flour' && x.kind === 'Weekly imports');
    return {proposed: r.proposed, marked: sbData().marks.size, progress: Object.keys(pgStore().recs).length};
  });
  assert.deepEqual(other, {proposed: 99000, marked: 0, progress: 0});
});

test('a mark stands through a basis switch and back; a changed figure is a new row that needs its own', async t => {
  const page = await board(t);
  await page.locator('#secImports tr[data-slug="flour"] .sb-tick').click();
  const marked = () => page.evaluate(() => sbData().rows.filter(r => sbData().marks.has(r.key)).map(r => r.slug));
  assert.deepEqual(await marked(), ['flour']);
  await page.evaluate(() => { sizing = 'dem'; sbStamp++; drawSupplyStrip(); });
  await page.evaluate(() => { sizing = 'cap'; sbStamp++; drawSupplyStrip(); });
  assert.deepEqual(await marked(), ['flour'], 'switching the basis and back loses no mark');
  // A figure typed now is another change: the old mark does not mark it.
  await page.evaluate(() => { impSetKeep(impSetId('hub#1', 'flour'), {value: 16000, inGame: 14000, basis: 'cap'}); drawSupplyStrip(); });
  assert.deepEqual(await marked(), []);
});

test('the recurring order and the one-time catch-up are two changes, each with its own mark', async t => {
  const data = fixture();
  // Flour at the hub also runs dry before Monday: a catch-up to buy by hand.
  const ir = data.supply.imports.find(r => r.slug === 'flour' && r.s === 0) || data.supply.imports[0];
  Object.assign(ir, {slug: 'flour', s: 0, item: 'Flour', catchUp: 600, runsOut: 'Saturday', shortBy: 1, stockCover: 3.2});
  data.supply.facts[0].flour = {...data.supply.facts[0].flour, st: 'short', why: 'shortfall', lvl: 'critical'};
  const page = await board(t, {data});
  await page.evaluate(() => { sbSelOff = false; sbSel = {s: 0, slug: 'flour'}; drawImportsView(); wireAll(); });
  const card = page.locator('#sbCard');
  assert.equal(await card.locator('.sbi-sec').count(), 2, 'the order and the gap, side by side');
  assert.match(await card.locator('.sbi-gap').textContent(), /~600\s*units, bought now/);
  assert.match(await card.locator('.sbi-gap').textContent(), /by hand; no game-link write/);
  const marks = card.locator('[data-sb-mark]');
  await marks.nth(1).click();
  const st = () => page.evaluate(() => sbData().rows.filter(r => r.slug === 'flour' && r.site === 0 && r.view === 'imports')
    .map(r => [r.kind, pgState(sbData(), r)]));
  assert.deepEqual(await st(), [['Weekly imports', 'suggested'], ['Before the next delivery', 'marked']]);
  await marks.nth(0).click();
  assert.deepEqual(await st(), [['Weekly imports', 'marked'], ['Before the next delivery', 'marked']]);
  // Copy the changes: both, each in its own words.
  const copied = await page.evaluate(() => orderChecklistText(sbData().rows.filter(r => r.slug === 'flour' && r.site === 0 && r.view === 'imports'), 'T'));
  assert.match(copied, /Flour: 14000 -> 14420 units\/week/);
  assert.match(copied, /Flour: add 600 units once/);
});

test('one figure and one basis from the row to the copy, under both bases', async t => {
  for(const mode of ['cap', 'dem']){
    const page = await board(t, {mode});
    // The player's own figure, typed on the card.
    await page.evaluate(() => { sbSelOff = false; sbSel = {s: 0, slug: 'flour'}; drawImportsView(); wireAll(); });
    const box = page.locator('#sbCard input.imp-in');
    await box.fill('15500'); await box.press('Enter');
    // Kept once the card is drawn again with the figure as the player's own.
    await page.waitForFunction(() => /set while planning/.test(document.querySelector('#sbCard .sbi-basis')?.textContent || ''));
    const basis = mode === 'cap' ? 'full production' : 'shop demand';
    // The card: the box, what it is planned for, Why and the manual instructions.
    assert.match(await page.locator('#sbCard .sbi-basis').textContent(), new RegExp(`set while planning for ${basis}`));
    await page.click('#sbCard [data-sbi-panel=why]');
    assert.match(await page.locator('#sbCard .sbi-panel[data-panel=why]').textContent(), new RegExp(`Why 15,500 a week · planned for ${basis}`, 'i'));
    await page.click('#sbCard [data-sbi-panel=manual]');
    assert.match(await page.locator('#sbCard .sbi-panel[data-panel=manual]').textContent(), /set the amount to 15,500 a week/);
    // Changes, its copy, and the write the game link would send.
    const got = await page.evaluate(() => {
      const r = sbData().rows.find(x => x.kind === 'Weekly imports' && x.slug === 'flour');
      const plan = gwImportPlan(null, gwImportRows.find(x => x.slug === 'flour' && x.s === 0).impId)[0];
      return {proposed: r.proposed, basis: r.basis, text: orderChecklistText([r], 'T'), write: plan ? plan.r.value : null};
    });
    assert.deepEqual([got.proposed, got.basis, got.write], [15500, mode, 15500]);
    assert.match(got.text, new RegExp(`14000 -> 15500 units/week.*Planned for ${basis}\\.`));
    await redraw(page);
    assert.match(await page.locator('#secChanges .sbc-row', {hasText: 'Flour'}).first().textContent(), /15,500/);
    // The other basis keeps the figure, beside its own suggestion, with a way back to it.
    await page.evaluate(m => { sizing = m === 'cap' ? 'dem' : 'cap'; sbStamp++; drawSupplyStrip(); drawImportsView(); wireAll(); }, mode);
    assert.equal(await page.locator('#sbCard input.imp-in').inputValue(), '15500');
    assert.match(await page.locator('#sbCard .sbi-basis').textContent(), new RegExp(`set while planning for ${basis}.*on screen now`));
    assert.equal(await page.locator('#sbCard .sbi-basis [data-imp-reset]').count(), 1);
  }
});

test('the factory hours an import is planned on: named on the card, a step of their own, a row of their own, under both bases', async t => {
  // Full production: the Flour order assumes the cake line runs 24 h; it runs 12.
  const cap = await board(t);
  await cap.evaluate(() => { sbSelOff = false; sbSel = {s: 0, slug: 'flour'}; drawImportsView(); wireAll(); });
  assert.match(await cap.locator('#sbCard .sbi-dep').textContent(), /Needs a factory-hours change\..*Cake.*12 → 24 h a day/s);
  assert.match(await cap.locator('#sbCard .sbi-dep').textContent(), /less than planned/);
  await cap.click('#sbCard [data-sbi-panel=manual]');
  assert.match(await cap.locator('#sbCard .sbi-steps').textContent(), /Schedule: staff Cake 24 h a day on each of its 2 machines \(now 12 h\)\. Not written by the game link\./);
  const hours = () => cap.evaluate(() => sbData().rows.filter(r => r.kind === 'Factory run hours').map(r => [r.current, r.proposed, (r.forImports || []).map(x => x.item).join()]));
  assert.deepEqual(await hours(), [[12, 24, 'Flour']]);
  assert.match(await cap.locator('#secChanges .sbc-row[data-key*="Factory run hours"]').textContent(), /factory staffing, for Flour.*no game-link write/s);
  // The link offers no write for it.
  assert.equal(await cap.evaluate(() => gwImportPlan(null).some(l => l.r.item === 'Cake')), false);
  // Shop demand: Flour needs no change, so nothing depends on the hours; a
  // figure typed there is planned on 10 h, which the line does not run.
  const dem = await board(t, {mode: 'dem'});
  assert.deepEqual(await dem.evaluate(() => sbData().rows.filter(r => r.kind === 'Factory run hours').length), 0);
  await dem.evaluate(() => { impSetKeep(impSetId('hub#1', 'flour'), {value: 12000, inGame: 14000, basis: 'dem'}); drawSupplyStrip(); drawChangesView(); });
  const row = await dem.evaluate(() => sbData().rows.filter(r => r.kind === 'Factory run hours').map(r => [r.current, r.proposed, !!r.dep]));
  assert.deepEqual(row, [[12, 10, true]]);
  await dem.evaluate(() => { sbSelOff = false; sbSel = {s: 0, slug: 'flour'}; drawImportsView(); wireAll(); });
  assert.match(await dem.locator('#sbCard .sbi-dep').textContent(), /12 → 10 h a day.*more than planned/s);
});

test('Applied is set only by a write that went through; Confirmed only by a later board that holds it', async t => {
  const page = await board(t);
  const state = () => page.evaluate(() => { const r = pgOfFamily('imports')[0]; return r ? r.state : null; });
  // A mark, a filter or a redraw is no write.
  await page.locator('#secImports tr[data-slug="flour"] .sb-tick').click();
  await redraw(page);
  assert.equal(await state(), null);
  // The write's answer: contract c1 now holds 14,420 of flour at the hub.
  await page.evaluate(() => {
    const r = gwImportRows.find(x => x.slug === 'flour' && x.s === 0);
    const line = gwImportPlan(null, r.impId)[0];
    pgImportsDone([line], {rows: [{id: line.contracts[0].c.id, reactivated: false,
      products: [{itemName: 'flour', warehouse: gwAddress('hub#1'), before: 14000, amount: 14420}]}]});
  });
  assert.equal(await state(), 'applied');
  // Changes, when next shown, says so rather than the mark.
  await page.evaluate(() => { sub.supply = 'changes'; drawStale('supply'); });
  assert.match(await page.locator('#secChanges .sbc-row', {hasText: 'Flour'}).first().textContent(), /Applied · awaiting refresh/);
  // The same board again is no evidence.
  await page.evaluate(() => { pgJudged = 0; pgEvaluate(); });
  assert.equal(await state(), 'applied');
  // A later read whose contract holds the figure: Confirmed, and Changes lists it.
  await page.evaluate(() => {
    const d = JSON.parse(JSON.stringify(D));
    const c = d.supply.factories.depots[0].flour.contracts[0]; c.amount = 14420; d.supply.factories.depots[0].flour.weekly = 14420;
    d.meta.hour = 13; takeData(d); sbStamp++; drawSupplyStrip(); drawChangesView();
  });
  assert.equal(await state(), 'confirmed');
  assert.match(await page.locator('#secChanges .sbc-settled').textContent(), /Confirmed · day 30/);
  // A later read that holds another figure is not a confirmation.
  await page.evaluate(() => {
    pgRecord({id: 'imports|hub#1|sugar|weekly|3000', family: 'imports', target: {depot: 'hub#1', slug: 'sugar'},
      expect: {contracts: [{id: D.supply.factories.depots[0].sugar.contracts[0].id, amount: 3000, activate: true}], inGame: 3000}, rowKeys: [], label: 'Sugar'});
    const d = JSON.parse(JSON.stringify(D)); d.meta.hour = 14; takeData(d); pgEvaluate(); drawSupplyStrip();
  });
  assert.equal(await page.evaluate(() => pgOfFamily('imports').find(r => r.target.slug === 'sugar').state), 'changed');
  // An undo takes a write's records back.
  await page.evaluate(() => pgDrop(['imports|hub#1|sugar|weekly|3000']));
  assert.equal(await page.evaluate(() => pgOfFamily('imports').some(r => r.target.slug === 'sugar')), false);
  // An older board (a save from before the write) judges nothing.
  await page.evaluate(() => {
    pgRecord({id: 'x', family: 'imports', target: {depot: 'hub#1', slug: 'milk'}, expect: {contracts: [], inGame: 0}, rowKeys: [], label: 'Milk'});
    const d = JSON.parse(JSON.stringify(D)); d.meta.day = 20; takeData(d); pgEvaluate();
  });
  assert.equal(await page.evaluate(() => pgStore().recs.x.state), 'applied');
});

test('a schedule is confirmed by its shift print on a later read; a hire by each person at the site sent to', async t => {
  const data = fixture();
  data.businesses[2].shiftPrint = 'aaaaaaaa';
  data.staffing = [{key: data.businesses[2].key, people: [{id: 'E1', name: 'Ana'}]}];
  const page = await board(t, {data});
  const key = data.businesses[2].key;
  await page.evaluate(k => pgScheduleDone(k, {row: {full: false}}, {after: {print: 'bbbbbbbb'}, added: 3, removed: 2}), key);
  const sched = () => page.evaluate(() => pgOfFamily('schedule')[0].state);
  assert.equal(await sched(), 'applied');
  await page.evaluate(k => { const d = JSON.parse(JSON.stringify(D)); d.businesses.find(b => b.key === k).shiftPrint = 'bbbbbbbb'; takeData(d); pgEvaluate(); }, key);
  assert.equal(await sched(), 'confirmed');
  // A hire and a move: one seen at its site, one not yet (a warehouse keeps no list).
  await page.evaluate(k => pgHireDone({hires: [{candidateId: 'C1', address: gwAddress(k)}], moves: [{employeeId: 'E9', to: gwAddress('hub#1')}]},
    {hired: [{candidateId: 'C1'}], moved: [{employeeId: 'E9'}], skipped: [{candidateId: 'C2', reason: 'gone'}]}), key);
  const hire = () => page.evaluate(() => { const r = pgOfFamily('hire')[0]; return [r.state, r.expect.hired, r.expect.moved, r.expect.skipped]; });
  assert.deepEqual(await hire(), ['applied', 1, 1, 1]);
  await page.evaluate(k => { const d = JSON.parse(JSON.stringify(D)); d.staffing[0].people.push({id: 'C1', name: 'New'}); d.meta.minute = 5; takeData(d); pgEvaluate(); }, key);
  assert.deepEqual((await hire())[0], 'partly', 'the hire is seen, the move to a warehouse is not');
  // Someone found at another site than the one they were sent to: not confirmed.
  await page.evaluate(k => { const d = JSON.parse(JSON.stringify(D)); d.staffing.push({key: 'dist#6', people: [{id: 'E9', name: 'Moved'}]}); d.meta.minute = 9; takeData(d); pgEvaluate(); }, key);
  assert.equal((await hire())[0], 'changed');
});
