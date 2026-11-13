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
  for (const [width, height] of [[568, 320], [844, 390], [1280, 720]]) {
    const assets = assetFixture();
    const title = '运营维护补偿 · Operations compensation';
    // {补偿明细} becomes its own highlighted line built from the mail attachment.
    const lead = '本次补偿已经到账。';
    const body = ('金币、经验和补给箱仅发放一次。Maintenance compensation is ready.\n').repeat(4).slice(0,270).trim();
    const noticeTitle = '服务器版本维护公告 · Version notice';
    const noticeBody = ('旧版本服务可以暂停或恢复，新对局以当前版本策略为准；已开始的对局继续结算。Existing matches keep their original rules.\n').repeat(4).slice(0,300);
    const compensation = { id: 'ops-compensation:qa', title, body: lead + '\n{补偿明细}\n' + body, read: false, claimed: false, createdAt: Date.now(), reward: { coins: 20, xp: 30, packs: 1 } };
    assets.mail = [
      { ...compensation, id: 'older', title: '旧补偿', createdAt: compensation.createdAt - 2000, read: true, claimed: true },
      compensation,
      { ...compensation, id: 'middle', title: '上次补偿', createdAt: compensation.createdAt - 1000, read: true, claimed: true },
    ];
    assets.announcements = [{ id: 'ops-news', title: noticeTitle, body: noticeBody, createdAt: Date.now() }];
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: width < 1000, isMobile: width < 1000 });
    try {
      const page = await context.newPage(); page.setDefaultTimeout(45000);
      page.on('pageerror', error => evidence.errors.push(error.message));
      const source = `const assets=${JSON.stringify(assets)};
        const metadata={identity:{playerId:assets.playerId,nickname:'运营验证'},capabilities:{multiplayer:false,leaderboards:false}};
        globalThis.SmallGamesServices={ready:Promise.resolve(metadata),refresh:async()=>metadata,services:{
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
      for (const lang of ['zh', 'en']) {
        if (lang === 'en') { await click('settings'); await click('language'); await click('close'); }
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
        await click('inbox:news'); await click('mail:ops-news');
        assert((await texts(page)).includes(noticeTitle)); assert((await texts(page)).includes(noticeBody));
        await page.screenshot({ path: fileURLToPath(new URL(`announcement-${width}-${lang}.png`, out)) });
        await click('qm:back');
      }
      assert.equal((await snapshot(page)).progression.assets.coins, assets.coins + 20);
      evidence.checks.push({ width, height, languages: ['zh', 'en'], newestMailFirst: true, originalMessageText: true, claimAttachment: true });
      console.log(`OPERATIONS_MESSAGES ${width}x${height} passed`);
    } finally { await context.close(); }
  }
  assert.deepEqual(evidence.errors, []);
  await acceptanceBuild(base);
} finally {
  await browser.close();
  await writeFile(new URL('evidence.json', out), JSON.stringify(evidence, null, 2) + '\n');
}
