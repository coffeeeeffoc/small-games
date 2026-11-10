import assert from 'node:assert/strict';
import { installControlFixture, collectBrowserErrors } from './control.fixture.mjs';

export async function nightOperationsBrowserChecks(browser, url, evidence) {
  let checks = 0;
  for (const width of [1360, 390, 320]) {
    const context = await browser.newContext({
      viewport: { width, height: 900 },
      hasTouch: width < 500,
      isMobile: width < 500,
    });
    try {
      const page = await context.newPage(),
        clean = await collectBrowserErrors(page);
      const f = await installControlFixture(page);
      const now = Date.now() - 10000;
      const ops = {
        announcements: [
          {
            id: 'ops-news',
            title: '维护公告',
            body: '本次维护已经完成。',
            enabled: true,
            startsAt: now,
          },
        ],
        compensations: [
          {
            id: 'ops-grant',
            title: '维护补偿',
            body: '每位符合条件的玩家仅领取一次。',
            loginFrom: now - 86400000,
            loginTo: now,
            reward: { coins: 200, xp: 100, packs: 1 },
          },
        ],
        release: {
          schemaVersion: 1,
          builds: [
            {
              buildId: 'night-build-a',
              channel: 'taptap-h5',
              version: '1.0.0',
              backendVersion: '1.0.0',
              ranked: 'solo-a',
              multiplayer: 'duel-a',
            },
            {
              buildId: 'night-build-b',
              channel: 'taptap-h5',
              version: '1.0.1',
              backendVersion: '2.0.0',
              ranked: 'solo-b',
              multiplayer: 'duel-b',
            },
          ],
          channels: [{ channel: 'taptap-h5', latestBuildId: 'night-build-b' }],
          allowNew: { ranked: ['solo-a', 'solo-b'], multiplayer: ['duel-a', 'duel-b'] },
          legacy: {
            channel: 'taptap-h5',
            ranked: 'solo-a',
            multiplayer: 'duel-a',
            backendVersion: '1.0.0',
          },
        },
      };
      f.state.snapshot.nightOperations = structuredClone(ops);
      f.revisions.find((r) => r.id === f.state.revisionId).snapshot = structuredClone(
        f.state.snapshot,
      );
      const history = Array.from({ length: 5 }, (_, i) => ({
        version: i === 0 ? '2.0.0' : `1.0.${4 - i}`,
        sourceSHA: 'a'.repeat(40),
        release: `release-${i}`,
        mode: 'execute',
        services: ['runtime'],
        activeImages: { runtime: 'sha256:' + 'a'.repeat(64) },
        verifiedAt: now - i * 1000,
      }));
      f.deployments = { current: history[0], history };
      const activate = (locator) => (width < 500 ? locator.tap() : locator.click());
      const button = (name) => page.getByRole('button', { name, exact: true });
      const publish = async () => {
        const version = f.state.version;
        await page.getByRole('textbox', { name: '变更理由', exact: true }).fill('运营专项验证');
        await activate(button('保存草稿'));
        await page.getByText('草稿已保存，尚未发布', { exact: true }).waitFor();
        await activate(button('发布此草稿'));
        await activate(button('确认发布'));
        await page.getByText(`当前版本 ${version + 1}`, { exact: true }).waitFor();
      };
      await page.goto(url + '/games');
      await activate(button('夜航运营'));
      const backend = page.getByRole('table', { name: '后端兼容服务', exact: true });
      const builds = page.getByRole('table', { name: '前端版本登记', exact: true });
      assert.equal(
        await page.getByRole('table', { name: '后端上线历史' }).locator('tbody tr').count(),
        5,
      );
      await activate(button('补偿管理'));
      await activate(
        page
          .getByRole('table', { name: '补偿列表' })
          .getByRole('button', { name: '查看', exact: true }),
      );
      const dialog = page.getByRole('dialog');
      await dialog.waitFor();
      await page.waitForFunction(
        () => !document.querySelector('[class*="-zoom-appear"],[class*="-zoom-enter"]'),
      );
      // A published compensation offers no delete action anywhere.
      assert.equal(await page.getByRole('button', { name: '删除草稿' }).count(), 0);
      assert(await page.getByRole('textbox', { name: '消息标题' }).isDisabled());
      assert(await page.getByRole('spinbutton', { name: '补偿金币' }).isDisabled());
      await page.waitForFunction(() => !document.querySelector('.ant-message-notice'));
      await page.screenshot({
        path: `${evidence}/night-locked-compensation-${width}.png`,
        fullPage: true,
      });
      const close = async () => {
        await activate(dialog.getByRole('button', { name: '完成', exact: true }));
        await dialog.waitFor({ state: 'hidden' });
      };
      await close();
      await activate(button('公告管理'));
      // Only one announcement may be live: revoke the current one before adding the next.
      await activate(
        page.getByRole('table', { name: '公告列表' }).getByRole('button', { name: '查看 / 编辑' }),
      );
      await activate(button('撤销公告'));
      await close();
      await activate(button('新增公告'));
      await page
        .getByRole('textbox', { name: '消息标题' })
        .fill('新的公告 <script>保持纯文本</script>');
      await page
        .getByRole('textbox', { name: '消息正文' })
        .fill('版本维护完成。\n公告支持换行，按原文展示。');
      await close();
      await publish();
      assert.deepEqual(
        f.state.snapshot.nightOperations.announcements.map((a) => a.enabled),
        [false, true],
      );
      await activate(button('补偿管理'));
      // An unpublished compensation draft can be deleted from the list.
      await activate(button('新增补偿'));
      await close();
      const rows = () => page.getByRole('table', { name: '补偿列表' }).locator('tbody tr').count();
      const before = await rows();
      await activate(page.getByRole('button', { name: '删除草稿' }));
      assert.equal(await rows(), before - 1);
      await activate(button('新增补偿'));
      await page.getByRole('textbox', { name: '消息标题' }).fill('补偿测试');
      await page.getByRole('textbox', { name: '消息正文' }).fill('金币、经验与补给箱各发放一次。');
      assert(await button('保存草稿').isDisabled());
      await page.getByRole('spinbutton', { name: '补偿金币' }).fill('10');
      await page
        .getByRole('textbox', { name: '指定玩家 ID' })
        .fill('11111111-1111-4111-8111-111111111111\n22222222-2222-4222-8222-222222222222');
      await close();
      await publish();
      assert.equal(f.state.snapshot.nightOperations.compensations[1].playerIds.length, 2);
      const service = backend.getByRole('row').filter({ hasText: '1.0.0' });
      await activate(service.getByRole('button', { name: '关闭该版本服务', exact: true }));
      assert(
        await builds
          .getByRole('row')
          .filter({ hasText: 'night-build-a' })
          .getByRole('button', { name: '快速回退到此版本' })
          .isDisabled(),
      );
      await publish();
      assert.deepEqual(f.state.snapshot.nightOperations.release.disabledBackendVersions, ['1.0.0']);
      await activate(service.getByRole('button', { name: '恢复该版本服务', exact: true }));
      await publish();
      const beforeRollback = structuredClone(f.state.snapshot.nightOperations);
      await activate(
        builds
          .getByRole('row')
          .filter({ hasText: 'night-build-a' })
          .getByRole('button', { name: '快速回退到此版本' }),
      );
      await page.getByRole('textbox', { name: '版本回退理由' }).fill('回退到保留版本');
      await activate(button('确认回退游戏版本'));
      await page.getByText('渠道推荐版本已回退，公告与补偿已保留。', { exact: true }).waitFor();
      assert.equal(
        f.state.snapshot.nightOperations.release.channels[0].latestBuildId,
        'night-build-a',
      );
      assert.deepEqual(
        f.state.snapshot.nightOperations.compensations,
        beforeRollback.compensations,
      );
      assert.deepEqual(
        f.state.snapshot.nightOperations.announcements,
        beforeRollback.announcements,
      );
      assert(
        await builds
          .getByRole('row')
          .filter({ hasText: 'night-build-a' })
          .getByRole('button', { name: '移除旧版本' })
          .isDisabled(),
      );
      await activate(
        builds
          .getByRole('row')
          .filter({ hasText: 'night-build-b' })
          .getByRole('button', { name: '移除旧版本' }),
      );
      await publish();
      assert(f.state.snapshot.nightOperations.release.builds[1].removed);
      await activate(
        builds
          .getByRole('row')
          .filter({ hasText: 'night-build-b' })
          .getByRole('button', { name: '恢复登记' }),
      );
      await publish();
      const release = { ...ops.release.builds[1], buildId: 'night-build-c', version: '1.0.2' };
      await page.getByLabel('导入 H5 构建清单', { exact: true }).setInputFiles({
        name: 'night-manifest.json',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify({ release })),
      });
      await activate(button('登记到草稿'));
      await publish();
      assert.equal(f.state.snapshot.nightOperations.release.builds.at(-1).version, '1.0.2');
      await page.waitForFunction(() => !document.querySelector('.ant-message-notice'));
      await page.screenshot({ path: `${evidence}/night-operations-${width}.png`, fullPage: true });
      assert(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
        'page must fit narrow viewport',
      );
      await clean();
      checks++;
      console.log(`NIGHT_OPERATIONS: full workflow at ${width}px`);
    } finally {
      await context.close();
    }
  }
  const context = await browser.newContext();
  try {
    const page = await context.newPage(),
      f = await installControlFixture(page, ['control.read']);
    await page.goto(url + '/games');
    await page.getByRole('button', { name: '夜航运营', exact: true }).click();
    assert(await page.getByRole('button', { name: '新增公告', exact: true }).isDisabled());
    assert(await page.getByRole('button', { name: '登记到草稿', exact: true }).isDisabled());
    assert.equal(f.writes.length, 0);
    checks++;
  } finally {
    await context.close();
  }
  return checks;
}
