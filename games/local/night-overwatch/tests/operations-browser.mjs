import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';
import { scrollPage } from './scroll-helpers.mjs';
import { assetFixture } from './progression-fixture.ts';
import { acceptanceBuild, evidenceDirectory, snapshot, press, settleVisuals, assertLayout } from './flight-browser.mjs';

const base = process.env.NIGHT_URL, build = await acceptanceBuild(base);
const out = pathToFileURL(evidenceDirectory('operations') + '/');
await mkdir(out, { recursive: true });
const evidence = { build, fixture: true, realDevice: false, checks: [], errors: [] };
const browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11'] });
const texts = page => page.evaluate(async () => {
  const { director, Label } = await System.import('cc');
  return director.getScene().getComponentsInChildren(Label).filter(l => l.node.activeInHierarchy).map(l => l.string);
});
try {
  for (const [width, height] of [[568, 320], [844, 390], [1280, 720], [1920, 880]]) {
    const assets = assetFixture();
    const title = '运营维护补偿 · Operations compensation';
    // {补偿明细} becomes its own highlighted line built from the mail attachment.
    const lead = '本次补偿已经到账。';
    const body = ('金币、经验和补给箱仅发放一次。Maintenance compensation is ready.\n').repeat(4).slice(0,270).trim();
    const noticeTitle = '版本升级公告';
    const upgradeBody = '您好，为提升玩家体验和提升游戏服务的稳定性，本游戏于 2026-11-14 02:50~04:30 进行版本升级，对期间玩家可能造成影响深表抱歉，并对期间登录的用户发放补偿。本次升级后，后续升级前都会提前公告告知。本次还引入在线玩家功能，方便私信和对战邀请，提升游戏对战体验。';
    const noticeBody = width === 1920 ? upgradeBody.padEnd(295, '后续更新将另行公告。') + '感谢支持。' : upgradeBody;
    const compensation = { id: 'ops-compensation:qa', title, body: lead + '\n{补偿明细}\n' + body, read: false, claimed: false, createdAt: Date.now(), reward: { coins: 20, xp: 30, packs: 1 } };
    assets.mail = [
      { ...compensation, id: 'older', title: '旧补偿', createdAt: compensation.createdAt - 2000, read: true, claimed: true },
      compensation,
      { ...compensation, id: 'middle', title: '上次补偿', createdAt: compensation.createdAt - 1000, read: true, claimed: true },
    ];
    assets.announcements = [{ id: 'ops-news', title: noticeTitle, body: noticeBody, createdAt: Date.now() }];
    const players = ['好友飞行员', '新飞行员', '申请中的飞行员'].map((nickname, i) => ({ playerId: `pilot-${i}`, nickname, status: 'available' }));
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: width < 1000, isMobile: width < 1000 });
    try {
      const page = await context.newPage(); page.setDefaultTimeout(45000);
      page.on('pageerror', error => evidence.errors.push(error.message));
      const source = `const assets=${JSON.stringify(assets)};
        const players=${JSON.stringify(players)};
        const metadata={identity:{playerId:assets.playerId,nickname:'运营验证'},capabilities:{multiplayer:false,leaderboards:false,social:true,presence:true}};
        globalThis.SmallGamesServices={ready:Promise.resolve(metadata),refresh:async()=>metadata,services:{
          nightPresence:async()=>({onlineCount:players.length+1,players:[metadata.identity,...players]}),
          nightSocial:async()=>({friends:[players[0]],requests:[{...players[2],direction:'incoming',createdAt:1}],conversations:[],serverNow:Date.now()}),
          nightAssets:async()=>structuredClone(assets),nightAssetCommand:async command=>{
            const mail=assets.mail.find(m=>m.id===command.mailId);
            if(command.kind==='read-mail')mail.read=true;
            if(command.kind==='claim-mail'&&!mail.claimed){mail.claimed=true;assets.coins+=mail.reward.coins;assets.xp+=mail.reward.xp;}
            assets.revision++;return structuredClone(assets);
          }},createRecorder:()=>({start:async()=>null,record(){},finish:async()=>null,invalidate(){}})};`;
      await page.route('**/game-bootstrap.js', route => route.fulfill({ contentType: 'text/javascript', body: source }));
      await page.route('**/api/competition/**', route => route.abort());
      await page.route('**/small-games/v1/**', route => route.abort());
      const click = async id => { await press(page, id, width < 1000, false); await settleVisuals(page); };
      await page.goto(base + '?dev=0');
      await page.waitForFunction(() => globalThis.__night?.snapshot().ui.interfaceArtworkReady && __night.snapshot().progression.assets && !document.getElementById('night-startup'));
      await click('social:updates');
      const update = await snapshot(page), log = update.scrollLists.find(l => l.key === 'updates');
      assert(log.x - 14 >= update.safe.left + width * .08 && log.x + log.w + 14 <= width - update.safe.right - width * .08);
      const history = await texts(page);
      assert.deepEqual(history.filter(t => /^2026-11-/.test(t)), ['2026-11-14 · 重大更新 · 1.1.0']);
      await page.screenshot({ path: fileURLToPath(new URL(`updates-${width}.png`, out)) });
      await click('updates:close');
      await click('online:players');
      await page.waitForFunction(() => __night.snapshot().online.social.friends.length && __night.snapshot().buttons.some(b => b.id === 'online:friendAction:accept:pilot-2'));
      const playerButtons = (await snapshot(page)).buttons;
      assert.deepEqual(playerButtons.filter(b => b.id.endsWith(':pilot-0')).map(b => b.id), ['online:whisper:pilot-0', 'online:invitePlayer:pilot-0']);
      assert(playerButtons.some(b => b.id === 'online:friendAction:request:pilot-1' && !b.disabled));
      await page.screenshot({ path: fileURLToPath(new URL(`players-${width}.png`, out)) });
      await click('online:back'); await click('online:friends');
      assert((await snapshot(page)).buttons.some(b => b.id === 'online:friendAction:remove:pilot-0' && !b.disabled));
      await page.screenshot({ path: fileURLToPath(new URL(`friends-${width}.png`, out)) });
      await click('online:back');
      for (const lang of ['zh', 'en']) {
        if (lang === 'en') { await click('settings'); await click('language'); await page.keyboard.press('Escape'); await settleVisuals(page); }
        await click('qm:inbox');
        await page.waitForFunction(() => __night.snapshot().progression.assets.mail.find(m => m.id === 'ops-compensation:qa')?.read);
        const rows = (await snapshot(page)).buttons.filter(b => b.id.startsWith('mail:')).sort((a, b) => a.y - b.y);
        assert.deepEqual(rows.slice(0, 2).map(b => b.id), ['mail:ops-compensation:qa', 'mail:middle']);
        const shown = await texts(page);
        assert(shown.includes(title)); assert(shown.includes(lead)); assert(shown.includes(body));
        assert(shown.includes(lang === 'zh' ? '20 金币 · 30 EXP · 1 补给箱' : '20 COINS · 30 EXP · 1 CRATES'), 'placeholder line from the attachment');
        assert(!shown.some(t => t.includes('{补偿明细}')));
        const area=(await snapshot(page)).scrollLists.find(a=>a.key.startsWith('qm:message:'));
        if(width===568){assert(area.max>0);await scrollPage(page,area.key);assert((await snapshot(page)).scrollLists.find(a=>a.key===area.key).offset>0);}
        const font=await page.evaluate(async body=>{const {director,Label}=await System.import('cc');return director.getScene().getComponentsInChildren(Label).find(l=>l.node.activeInHierarchy&&l.string===body).fontSize;},body);
        assert(font>=12,'Long messages retain a readable font');
        assertLayout(await snapshot(page), width, height);
        await page.screenshot({ path: fileURLToPath(new URL(`compensation-${width}-${lang}.png`, out)) });
        if (lang === 'zh') { await click('qm:claimMail'); await page.waitForFunction(() => __night.snapshot().progression.assets.mail.find(m => m.id === 'ops-compensation:qa')?.claimed); }
        await click('qm:back');
        const ticker = await page.evaluate(async () => {
          const { director, Label, UITransform } = await System.import('cc');
          return director.getScene().getComponentsInChildren(Label)
            .filter(l => l.node.activeInHierarchy && l.node.parent?.name === 'TickerText')
            .map(l => ({ text: l.string, width: l.node.getComponent(UITransform).width, texture: l.ttfSpriteFrame.rect.width }));
        });
        assert.equal(ticker.map(l => l.text).join(''), `【${noticeTitle}】${noticeBody}`, 'Home ticker includes the full announcement');
        assert(ticker.every(l => l.texture + 2 >= l.width), 'Each segment fits in its render texture');
        await click('qm:announcements');
        assert((await texts(page)).includes(noticeTitle)); assert((await texts(page)).includes(noticeBody));
        await page.screenshot({ path: fileURLToPath(new URL(`announcement-${width}-${lang}.png`, out)) });
        await click('qm:back');
      }
      assert.equal((await snapshot(page)).progression.assets.coins, assets.coins + 20);
      evidence.checks.push({ width, height, languages: ['zh', 'en'], fullTicker: true, friendActions: true, compactUpdateLog: true, newestMailFirst: true, originalMessageText: true, claimAttachment: true });
      console.log(`OPERATIONS_MESSAGES ${width}x${height} passed`);
    } finally { await context.close(); }
  }
  assert.deepEqual(evidence.errors, []);
  await acceptanceBuild(base);
} finally {
  await browser.close();
  await writeFile(new URL('evidence.json', out), JSON.stringify(evidence, null, 2) + '\n');
}
