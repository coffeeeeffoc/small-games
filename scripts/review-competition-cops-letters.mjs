import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import { levels } from '../games/local/cops-robbers/src/levels.js';
import { solve } from '../games/local/cops-robbers/src/engine.js';

const base = process.env.REVIEW_BASE || 'http://127.0.0.1:43010';
const evidenceName = process.env.REVIEW_EVIDENCE_NAME || 'independent-cops-letters';
assert(/^[a-z0-9_-]+$/.test(evidenceName));
const directory = new URL(`../outputs/${evidenceName}/`, import.meta.url);
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
const report = { base, at: new Date().toISOString(), checks: [], errors: [] };
const record = (name, evidence) => { report.checks.push({ name, evidence }); console.log(name, JSON.stringify(evidence)); };
async function makePlayer(game, suffix, width = 390, height = 844) {
  const context = await browser.newContext({ viewport: { width, height } });
  const page = await context.newPage();
  const player = { page, context, room: null, game, suffix, actions: [] };
  page.on('pageerror', error => report.errors.push(`${game}/${suffix}: ${error.message}`));
  page.on('requestfailed', request => report.errors.push({game,player:suffix,path:new URL(request.url()).pathname,failure:request.failure()?.errorText}));
  page.on('response', async response => {
    if(response.url().includes('/api/competition/v1')&&!response.ok())report.errors.push({game,player:suffix,path:new URL(response.url()).pathname,status:response.status(),error:await response.json().catch(()=>null)});
    if (!response.url().includes('/api/competition/v1/rooms') || !response.ok()) return;
    const body = await response.json().catch(() => null);
    if (body?.players && body?.code) player.room = body;
  });
  await page.goto(`${base}/games/${game}/`);
  if(game==='cops-robbers' && await page.locator('body').evaluate(element=>element.classList.contains('focus-play'))) await page.locator('#focus-toggle').click();
  await page.getByRole('button', { name: '好友 PK · 全站榜', exact: true }).click();
  return player;
}
async function snap(player, name) {
  await player.page.screenshot({ path: new URL(`${player.game}-${name}-${player.suffix}.png`, directory).pathname.replace(/^\/([A-Za-z]:)/, '$1') });
  await writeFile(new URL(`${player.game}-${name}-${player.suffix}.json`, directory), JSON.stringify({ room: player.room, text: await player.page.locator('dialog[open]').innerText() }, null, 2));
}
async function start(game) {
  const a = await makePlayer(game, 'a'), b = await makePlayer(game, 'b');
  await a.page.locator('[data-create]').click();
  try { await expect.poll(() => a.room?.code,{timeout:15000}).toBeTruthy(); }
  catch(error) { await snap(a,'create-failed');throw error; }
  await a.context.grantPermissions(['clipboard-read','clipboard-write']);
  await a.page.locator('[data-share]').click();
  await expect(a.page.locator('[data-status]')).toContainText('邀请链接已复制');
  const invite=await a.page.evaluate(()=>navigator.clipboard.readText());
  assert.equal(new URL(invite).searchParams.get('pk'),a.room.code);
  await b.page.goto(invite);
  await expect(b.page.locator('[data-code]')).toHaveValue(a.room.code);
  await b.page.locator('[data-join]').click();
  await expect.poll(() => b.room?.players.length).toBe(2);
  assert.notEqual(a.room.players[a.room.you].id, b.room.players[b.room.you].id);
  await a.page.locator('[data-ready]').click();
  await b.page.locator('[data-ready]').click();
  await expect.poll(() => a.room?.status).toBe('playing');
  await expect.poll(() => b.room?.status).toBe('playing');
  record(`${game}: two browser identities created, joined and ready`, { code: a.room.code, ids: [a.room.players[a.room.you].id, b.room.players[b.room.you].id] });
  await snap(a, 'playing'); await snap(b, 'playing');
  return [a,b];
}
async function clickCanvas(player, x, y, action = null) {
  const rect = await player.page.locator('[data-play]').boundingBox();
  assert(x >= 0 && y >= 0 && x < rect.width && y < rect.height, `outside visible canvas: ${x},${y} in ${rect.width}x${rect.height}`);
  const seq = player.room.seq;
  await player.page.mouse.click(rect.x + x, rect.y + y);
  await player.page.evaluate(() => new Promise(requestAnimationFrame));
  if (action) {
    try { await expect.poll(() => player.room.seq > seq || player.room.state.finished || player.room.status === 'finished', { timeout: 15000 }).toBeTruthy(); }
    catch(error) { await snap(player,'action-failed'); console.error({action,x,y,rect,seq,completed:player.actions.length}); throw error; }
    player.actions.push(action);
  }
}
async function playCops(player) {
  const level = levels.find(level => level.id === player.room.state.levelId);
  const solution = solve(level, player.room.state.board);
  assert(solution?.length, 'ranked level must be solvable');
  for (const plan of solution) {
    const board = player.room.state.board;
    const cop = Math.max(0, plan.findIndex((target,index) => target !== board.cops[index]));
    const rect = await player.page.locator('[data-play]').boundingBox();
    const size = Math.max(100, Math.min(rect.width - 16, rect.height - 122, 620));
    const point = index => ({x:(rect.width-size)/2 + level.nodes[index].x/600*size, y:45+level.nodes[index].y/600*size});
    const from = point(board.cops[cop]), target = point(plan[cop]);
    await clickCanvas(player,from.x,from.y-12);
    await clickCanvas(player,target.x,target.y+22,{ cop, target: plan[cop] });
  }
  assert(player.room.state.board.robbers.every(node => node === -1));
  record(`cops-robbers/${player.suffix}: canvas capture completed`, { steps: player.actions.length, result: player.room.players[player.room.you].result });
}
const translations = { '森林':'forest','花朵':'flower','叶子':'leaf','河流':'river','鸟儿':'bird','阳光':'sunshine','海洋':'ocean','海浪':'wave','岛屿':'island','贝壳':'shell','沙子':'sand','微风':'breeze','行星':'planet','月亮':'moon','星星':'star','太空':'space','火箭':'rocket','梦想':'dream' };
async function playLetters(player) {
  wordLoop: while(!player.room.state.finished) {
    const answer = translations[player.room.state.meaning];
    assert(answer, `known independent test translation: ${player.room.state.meaning}`);
    for(const char of answer) {
      if(player.room.state.finished)break wordLoop;
      const state = player.room.state;
      const tile = state.tiles.find(tile => tile.char === char && !tile.blocked && !state.selected.includes(tile.id));
      assert(tile, `uncovered ${char} for ${answer}`);
      const rect = await player.page.locator('[data-play]').boundingBox();
      const scale = Math.min((rect.width-20)/state.board.width,(rect.height-226)/state.board.height);
      await clickCanvas(player,(rect.width-state.board.width*scale)/2+(tile.x+tile.size/2)*scale,95+(tile.y+tile.size/2)*scale,{type:'select',tileId:tile.id});
    }
    if(player.room.state.finished)break;
    const state = player.room.state, rect = await player.page.locator('[data-play]').boundingBox();
    const scale = Math.min((rect.width-20)/state.board.width,(rect.height-226)/state.board.height);
    await clickCanvas(player,12+(rect.width-36)/8,95+state.board.height*scale+20+28+22,{type:'submit'});
  }
  assert(player.room.state.finished);
  record(`letters-words2/${player.suffix}: canvas ${player.room.state.cleanCorrect}/18 ${player.room.state.cleanCorrect===18?'completion':'real timeout result'}`, { actions: player.actions.length, result: player.room.players[player.room.you].result });
}
async function fullscreenCheck(player) {
  const before = JSON.stringify(player.room.state);
  await player.page.locator('dialog[open] [data-game-fullscreen]').click();
  await expect.poll(() => player.page.evaluate(() => !!document.fullscreenElement)).toBe(true);
  await player.page.locator('dialog[open] [data-game-fullscreen]').click();
  await expect.poll(() => player.page.evaluate(() => !!document.fullscreenElement)).toBe(false);
  assert.equal(JSON.stringify(player.room.state),before);
  record(`${player.game}: actual browser fullscreen entry/exit preserves board`,true);
}
async function failures() {
  const a=await makePlayer('cops-robbers','crossgame-a'),b=await makePlayer('letters-words2','crossgame-b');
  await a.page.locator('[data-create]').click();await expect.poll(()=>a.room?.code).toBeTruthy();
  await b.page.locator('[data-code]').fill(a.room.code);await b.page.locator('[data-join]').click();
  await expect(b.page.locator('[data-status]')).toContainText('另一款游戏');
  await a.page.waitForResponse(response=>response.url().endsWith(`/rooms/${a.room.code}`)&&response.request().method()==='GET');
  assert.equal(a.room.players.length,1);
  await snap(a,'crossgame-fixed');await snap(b,'crossgame-fixed');
  record('FIXED: wrong-game join rejected without occupying second seat',{code:a.room.code,players:a.room.players.length});
  await a.context.setOffline(true);
  await a.page.locator('[data-close]').click();
  await expect(a.page.locator('dialog[open]')).toHaveCount(0);
  await expect(a.page.locator('[data-competition-launch]')).toContainText('房间待确认');
  await a.page.screenshot({path:new URL('cops-robbers-offline-exit-fixed.png',directory).pathname.replace(/^\/([A-Za-z]:)/,'$1')});
  record('FIXED: offline exit closes modal and leaves accurate feedback',await a.page.locator('[data-competition-launch]').innerText());
  await a.context.setOffline(false);await a.page.locator('[data-competition-launch]').click();
  await expect(a.page.locator('[data-status]')).toContainText('等待双方准备');
  assert.equal(a.room.players.length,1);
  await a.page.locator('[data-close]').click();
  await expect(a.page.locator('dialog[open]')).toHaveCount(0);
  record('cops-robbers: reconnect resumes original room and confirmed exit is available',a.room.code);
  await expect(a.page.locator('[data-competition-launch]')).toBeEnabled();
  await a.page.locator('[data-competition-launch]').click();
  await expect(a.page.locator('[data-create]')).toBeVisible();
  await expect(a.page.locator('[data-profile]')).toBeVisible();
  await expect(a.page.locator('[data-code]')).toBeVisible();
  record('confirmed exit returns to lobby with name editing and another room code',true);
  await a.context.close();await b.context.close();
}
async function layouts() {
  const [a,b]=await start('letters-words2');
  await a.page.setViewportSize({width:844,height:390});
  await snap(a,'landscape');
  const rect=await a.page.locator('[data-play]').boundingBox();
  const hudX=rect.width*.52+10,hudWidth=rect.width-rect.width*.52-22;
  await clickCanvas(a,hudX+hudWidth/2,90);
  await snap(a,'landscape-meanings-fixed');
  const third=(rect.width-32)/3;
  await clickCanvas(a,20+third*2.5,rect.height-28);
  await snap(a,'landscape-meanings-page2-fixed');
  const lastWord=a.room.state.words[5].id;
  await clickCanvas(a,12+(rect.width-32)/2+8+(rect.width-32)/4,72,{type:'choose',wordId:lastWord});
  assert.equal(a.room.state.activeWordId,lastWord);
  await clickCanvas(a,hudX+hudWidth/2,90);
  await clickCanvas(a,16+third*1.5,rect.height-28);
  const state=a.room.state,tile=state.tiles.find(tile=>!tile.blocked),boardWidth=rect.width*.52;
  const scale=Math.min((boardWidth-20)/state.board.width,(rect.height-24)/state.board.height);
  await clickCanvas(a,(boardWidth-state.board.width*scale)/2+(tile.x+tile.size/2)*scale,12+(tile.y+tile.size/2)*scale,{type:'select',tileId:tile.id});
  assert.equal(a.room.state.selected.length,1);
  record('FIXED: landscape paging reaches sixth meaning, returns and accepts a tile',{canvas:rect,selectedMeaning:a.room.state.meaning});
  await a.page.setViewportSize({width:320,height:568});
  await snap(a,'small-meanings');
  await a.context.close();await b.context.close();
}
async function focusChecks() {
  for (const game of ['cops-robbers','letters-words2']) {
    const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();
    await page.goto(`${base}/games/${game}/`);
    if(game==='letters-words2') await page.locator('#focus-button').click();
    const board=await page.locator('#board').boundingBox();
    assert(board && board.y>=0 && board.y+board.height<=844);
    if(game==='letters-words2') {
      await page.locator('#board button[aria-disabled="false"]').first().click();
      const selected=await page.locator('#answer-slots').innerText();
      await page.locator('#pause-button').click();await page.locator('#focus-button').click();
      assert.equal(await page.locator('#answer-slots').innerText(),selected);
    }
    await page.locator('[data-game-fullscreen]').first().click();
    await expect.poll(()=>page.evaluate(()=>!!document.fullscreenElement)).toBe(true);
    await page.locator('[data-game-fullscreen]').first().click();
    await expect.poll(()=>page.evaluate(()=>!!document.fullscreenElement)).toBe(false);
    record(`${game}: single-player 390x844 board visibility and fullscreen`,board);
    if(game==='letters-words2') {
      await page.locator('#pause-button').click();await page.locator('#import-button').click();
      await page.locator('#word-input').fill(`apple 苹果，表示一种可以食用的水果，也用于说明这是一条需要折叠展示而不应把操作棋盘推出屏幕的完整长释义。${'补充释义，帮助理解词语在句子中的含义。'.repeat(8)}\nforest 森林，${'指大面积的树木和自然环境，供学习者阅读完整含义。'.repeat(8)}`);
      await page.locator('#import-form button[type="submit"]').click();
      for(const [width,height] of [[390,844],[360,640],[320,568]]) {
        await page.setViewportSize({width,height});
        await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
        const areas=await page.locator('#board,.spelling-area,.board-tools').evaluateAll(elements=>elements.map(element=>({class:element.className,rect:element.getBoundingClientRect().toJSON()})));
        await page.screenshot({path:new URL(`letters-long-meaning-${width}.png`,directory).pathname.replace(/^\/([A-Za-z]:)/,'$1')});
        for(const area of areas) assert(area.rect.y>=0 && area.rect.bottom<=height,`${area.class} below ${height}: ${area.rect.bottom}`);
        const covered=await page.locator('.board-tools button:not([disabled])').evaluateAll(elements=>elements.filter(element=>{const rect=element.getBoundingClientRect();return document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2)?.closest('button')!==element;}).map(element=>element.textContent));
        assert.deepEqual(covered,[],'core controls must not be covered by the PK launcher');
        const tiles=await page.locator('#board button[aria-disabled="false"]').evaluateAll(elements=>elements.map(element=>element.getBoundingClientRect().toJSON()));
        assert(tiles.length && tiles.every(tile=>tile.width>=44 && tile.height>=44),'available letter targets must remain at least 44px');
        const selected=await page.locator('#answer-slots .filled').count();
        await page.locator('#board button[aria-disabled="false"]').first().click();
        await expect(page.locator('#answer-slots .filled')).toHaveCount(selected+1);
        await page.locator('#meaning-details').click();
        await expect(page.locator('#meaning-dialog')).toBeVisible();
        assert((await page.locator('#full-meaning').innerText()).length>120);
        await page.locator('#meaning-dialog [data-close]').first().click();
        await expect(page.locator('#answer-slots .filled')).toHaveCount(selected+1);
        await page.locator('#undo-button').click();
        await expect(page.locator('#answer-slots .filled')).toHaveCount(selected);
        record(`letters-words2: long definition keeps core controls visible at ${width}x${height}`,{areas,minTilePx:Math.min(...tiles.map(tile=>Math.min(tile.width,tile.height)))});
      }
      await page.setViewportSize({width:390,height:844});
      await page.locator('#pause-button').click();
      await expect(page.locator('[data-competition-launch]')).toBeVisible();
      await page.locator('[data-competition-launch]').click();
      await expect(page.locator('[data-create]')).toBeVisible();
      await page.locator('dialog[open] [data-close]').click();
      record('letters-words2: PK remains reachable from preparation after pausing',true);
    }
    await page.route(`${base}/review-fullscreen-host`,route=>route.fulfill({contentType:'text/html',headers:{'Permissions-Policy':'fullscreen=()'},body:`<iframe src="${base}/games/${game}/" allow="fullscreen 'none'" style="width:390px;height:844px"></iframe>`}));
    await page.goto(`${base}/review-fullscreen-host`);
    const frame=page.frameLocator('iframe');
    if(game==='letters-words2')await frame.locator('#focus-button').click();
    await frame.locator('[data-game-fullscreen]').first().click();
    await expect(frame.locator('#game-display-notice')).toContainText('浏览器未允许全屏');
    assert.equal(await page.frames()[1].evaluate(()=>!!document.fullscreenElement),false);
    record(`${game}: actual iframe Permissions Policy denial has Chinese feedback`,await frame.locator('#game-display-notice').innerText());
    await context.close();
  }
}
try {
  if(process.argv.includes('--failures')) { await failures(); }
  else if(process.argv.includes('--layouts')) { await layouts(); }
  else if(process.argv.includes('--focus')) { await focusChecks(); }
  else {
  const games = process.argv.slice(2).filter(value => !value.startsWith('--'));
  for(const game of games.length ? games : ['cops-robbers','letters-words2']) {
    const [a,b] = await start(game);
    if (!process.argv.includes('--probe')) {
      await fullscreenCheck(a);
      const play = game === 'cops-robbers' ? playCops : playLetters;
      if(process.argv.includes('--parallel-players')) await Promise.all([play(a),play(b)]);
      else { await play(a); await snap(a,'waiting'); await play(b); }
      await expect.poll(() => a.room.status).toBe('finished');
      await expect.poll(() => b.room.status).toBe('finished');
      assert.deepEqual(a.room.results,b.room.results);
      await snap(a,'results'); await snap(b,'results');
      record(`${game}: both clients agree on final persisted results`, a.room.results.map(entry=>({playerId:entry.playerId,result:entry.result,rank:entry.after.me?.rank})));
      const previousCode=a.room.code;
      await a.page.getByRole('button',{name:'再次挑战',exact:true}).click();
      await expect.poll(()=>a.room.code).not.toBe(previousCode);
      await b.page.getByRole('button',{name:'再次挑战',exact:true}).click();
      await expect.poll(()=>b.room.code).toBe(a.room.code);
      await expect.poll(()=>a.room.players.length).toBe(2);
      assert.equal(a.room.status,'waiting');assert.equal(b.room.status,'waiting');
      record(`${game}: both players enter the same rematch`,{previousCode,nextCode:a.room.code});
    }
    await a.context.close(); await b.context.close();
  }
  }
} catch(error) { report.errors.push(error.stack); console.error(error); process.exitCode = 1; }
finally { await writeFile(new URL(`report-${process.argv.slice(2).join('-').replace(/[^a-z0-9-]/g,'')||'all'}.json`,directory),JSON.stringify(report,null,2)); await browser.close(); }
