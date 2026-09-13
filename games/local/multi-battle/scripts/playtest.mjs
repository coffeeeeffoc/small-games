import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { newGame } from '../src/game.js';
import { createCard, decode } from '../src/shared.js';
import { exportGame } from '../src/storage.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'artifacts');
await mkdir(out, { recursive: true });
const url = process.env.TEST_URL || 'http://127.0.0.1:4177';
const executablePath = process.env.BROWSER_PATH || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
const errors = [];
const results = [];
const click = async (page, action) => page.locator(`[data-action="${action}"]`).filter({visible:true}).first().click();
const state = async page => decode(await page.evaluate(() => window.__gameSnapshot()));
const owned = (page, uid) => page.locator(`[data-action="owned"][data-uid="${uid}"]`).first();
async function open(page) {
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {if(message.type()==='error'&&!message.text().includes('favicon')) errors.push(message.text());});
  await page.goto(url);
  await page.locator('[data-action="new"]').first().waitFor();
  assert.match(await page.title(),/万象旅团/);
}
async function fresh(page, seed) {
  await click(page,'new');
  await page.locator('[name="seed"]').fill(seed);
  if(await page.locator('[name="replace"]').count()) await page.locator('[name="replace"]').check();
  await click(page,'start-game');
  await page.locator('[data-action="begin"]').waitFor();
}
async function importFixture(page, file) {
  await click(page,'menu');await click(page,'import');
  await page.locator('[name="save"]').setInputFiles(file);
  await page.locator('[name="replace"]').check();
  await page.locator('#import-form button[type="submit"]').click();
  await page.locator('[data-action="begin"]').waitFor();
}
async function cast(page, spell, targets=[]) {
  await owned(page,spell.uid).click();await click(page,'cast');
  for(const target of targets) await owned(page,target.uid).click();
  await click(page,'confirm-intent');
}

try {
  const desktop = await browser.newContext({viewport:{width:1440,height:1000}});
  const page=await desktop.newPage();await open(page);
  await page.screenshot({path:path.join(out,'landing-desktop.png'),fullPage:true});
  await fresh(page,'playtest-first-journey');
  let s=await state(page);assert.equal(s.players[0].gold,4);
  const first=s.players[0].shop[0];
  await page.locator('[data-action="shop"][data-slot="0"]').click();await click(page,'buy');
  s=await state(page);assert.equal(s.players[0].gold,1);assert.equal(s.players[0].hand[0].uid,first.uid);
  await owned(page,first.uid).click();await click(page,'deploy');
  await page.locator('[data-action="slot"][data-slot="0"]').click();
  s=await state(page);assert.equal(s.players[0].board[0].uid,first.uid);
  await click(page,'freeze');assert.equal((await state(page)).players[0].frozen,true);
  await page.screenshot({path:path.join(out,'market-desktop.png'),fullPage:true});
  await click(page,'begin');
  assert.equal((await state(page)).phase,'battle');
  await click(page,'pause');
  const frozenProgress=await page.locator('.battle-progress').innerHTML();
  await page.waitForTimeout(950);
  assert.equal(await page.locator('.battle-progress').innerHTML(),frozenProgress);
  await page.reload();await click(page,'continue');
  s=await state(page);assert.equal(s.phase,'battle');assert.equal(s.players[0].hp,30);
  await click(page,'skip');s=await state(page);assert.equal(s.phase,'result');
  const hp=s.players[0].hp;
  await page.reload();await click(page,'continue');assert.equal((await state(page)).players[0].hp,hp);
  await click(page,'next');s=await state(page);assert.equal(s.round,2);assert.equal(s.players[0].gold,6);assert.equal(s.players[0].frozen,false);
  results.push('fresh purchase → deploy → freeze → animated battle → pause → interrupted reload → settle once → income');

  // Use the public, validated import flow for repeatable interaction states; no production mutation hooks.
  const fixture=newGame('interaction-workbench');
  const p=fixture.players[0];p.level=5;p.gold=60;
  const source=createCard(p,'character.resonance.tuner');source.level=7n;
  const target=createCard(p,'character.legacy.successor');target.level=3n;
  p.board[0]=source;p.board[3]=target;
  const duplicate=createCard(p,source.defId);duplicate.level=2n;
  const transfer=createCard(p,'spell.neutral.succession');
  const sword=createCard(p,'equipment.neutral.shortsword');
  const fire=createCard(p,'spell.arcana.firemark');
  p.hand=[duplicate,transfer,sword,fire];
  const file=path.join(out,'interaction-fixture.json');await writeFile(file,exportGame(fixture));
  await importFixture(page,file);
  await owned(page,duplicate.uid).click();await click(page,'merge');await owned(page,source.uid).click();
  assert.match(await page.locator('.level-preview').textContent(),/L7 → L9/);
  await click(page,'confirm-intent');assert.equal((await state(page)).players[0].board[0].level,9n);
  await owned(page,transfer.uid).click();await click(page,'cast');await owned(page,source.uid).click();await owned(page,target.uid).click();
  assert.match(await page.locator('.level-preview').textContent(),/L9 → L1/);
  await click(page,'clear');assert.ok((await state(page)).players[0].hand.some(c=>c.uid===transfer.uid));
  await cast(page,transfer,[source,target]);s=await state(page);
  // The merge first links +1 to successor (L3→L4); transferring 8 growth then produces L12.
  assert.equal(s.players[0].board[0].level,1n);assert.equal(s.players[0].board[3].level,12n);
  await owned(page,sword.uid).click();await click(page,'equip');await owned(page,target.uid).click();await click(page,'confirm-intent');
  assert.equal((await state(page)).players[0].board[3].equipment[0].uid,sword.uid);
  await owned(page,target.uid).click();await click(page,'unequip');assert.equal((await state(page)).players[0].board[3].equipment.length,0);
  await cast(page,fire,[target]);assert.ok((await state(page)).players[0].board[3].prep.opening.includes('firemark'));
  await owned(page,source.uid).click();await click(page,'sell');assert.equal((await state(page)).players[0].board[0],null);
  await click(page,'catalog');assert.equal(await page.locator('.catalog-card').count(),48);
  await page.locator('#catalog-family').selectOption('legacy');assert.equal(await page.locator('.catalog-card').count(),6);
  await click(page,'close-modal');
  await click(page,'begin');await click(page,'pause');await page.screenshot({path:path.join(out,'battle-desktop.png'),fullPage:true});
  await click(page,'skip');
  results.push('validated import → merge preview → cancel transfer → transfer → equip/unequip → targeted spell → sell → 48-card catalog');
  while((await state(page)).phase!=='ended') {
    if((await state(page)).phase==='result') await click(page,'next');
    await click(page,'begin');await click(page,'skip');
  }
  s=await state(page);assert.ok(s.rank>=1&&s.rank<=8);assert.ok(s.round<=18);
  await page.reload();await click(page,'continue');
  assert.equal((await state(page)).phase,'ended');
  const finalFrame=Number(await page.locator('.map-stage').getAttribute('data-frame-index'));
  assert.equal(finalFrame,(await state(page)).battle.frames.length-1,'resolved save must show final frame');
  await page.screenshot({path:path.join(out,'final-ranking.png'),fullPage:true});
  results.push('complete UI round loop → elimination/final ranking → reload displays actual final frame');
  await desktop.close();

  for(const viewport of [{width:390,height:844},{width:844,height:390},{width:320,height:740}]) {
    const context=await browser.newContext({viewport,hasTouch:true,isMobile:true,deviceScaleFactor:1});
    const mobile=await context.newPage();await open(mobile);await fresh(mobile,`mobile-${viewport.width}`);
    const original=(await state(mobile)).players[0].shop[0];
    await mobile.locator('[data-action="shop"][data-slot="0"]').tap();await click(mobile,'buy');
    await owned(mobile,original.uid).tap();await click(mobile,'deploy');await mobile.locator('[data-action="slot"][data-slot="3"]').tap();
    assert.equal((await state(mobile)).players[0].board[3].uid,original.uid);
    const size=await mobile.evaluate(()=>({view:innerWidth,document:document.documentElement.scrollWidth}));
    assert.ok(size.document<=size.view+1,`horizontal overflow at ${viewport.width}: ${JSON.stringify(size)}`);
    await mobile.screenshot({path:path.join(out,`market-${viewport.width}x${viewport.height}.png`),fullPage:true});
    await click(mobile,'begin');await click(mobile,'pause');
    await mobile.screenshot({path:path.join(out,`battle-${viewport.width}x${viewport.height}.png`),fullPage:true});
    await click(mobile,'skip');assert.ok(['result','ended'].includes((await state(mobile)).phase));
    if(viewport.width===390 || viewport.width===844) {
      await importFixture(mobile,file);
      await owned(mobile,sword.uid).tap();await click(mobile,'equip');await owned(mobile,duplicate.uid).tap();await click(mobile,'confirm-intent');
      assert.equal((await state(mobile)).players[0].hand.find(c=>c.uid===duplicate.uid).equipment[0].uid,sword.uid);
      await cast(mobile,transfer,[source,target]);
      assert.equal((await state(mobile)).players[0].board[3].level,9n);
    }
    results.push(`touch ${viewport.width}×${viewport.height}: purchase, deploy, no document overflow, battle and settle`);
    await context.close();
  }
  assert.deepEqual(errors,[]);
  await writeFile(path.join(out,'browser-results.json'),JSON.stringify({url,passed:results,errors},null,2));
  console.log(JSON.stringify({passed:results,errors},null,2));
} finally { await browser.close(); }
