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
      const runtime = {
        checkedAt: Date.now(),
        error: null,
        otherInstances: [],
        report: {
          instanceId: 'qa-runtime',
          ranked: { current: 'solo-b', supported: ['solo-a', 'solo-b'] },
          multiplayer: { current: 'duel-b', supported: ['duel-a', 'duel-b'] },
        },
      };
      f.nightRuntime = structuredClone(runtime);
      const activate = (locator) => (width < 500 ? locator.tap() : locator.click());
      const button = (name) => page.getByRole('button', { name, exact: true });
      const publish = async () => {
        const version = f.state.version;
        await activate(button('查看改动并发布'));
        await page.getByRole('textbox', { name: '变更理由', exact: true }).fill('运营专项验证');
        await activate(button('保存草稿'));
        await page.getByText('草稿已保存，尚未发布', { exact: true }).waitFor();
        await activate(button('发布此草稿'));
        await activate(button('确认发布'));
        await page
          .getByRole('region', { name: '保存与发布' })
          .getByText('与线上一致', { exact: true })
          .waitFor();
        assert.equal(f.state.version, version + 1);
      };
      await page.goto(url + '/games');
      const tab = (name) => activate(page.getByRole('tab', { name, exact: true }));
      await tab('夜航运营');
      const backend = page.getByRole('table', { name: '后端兼容服务', exact: true });
      const builds = page.getByRole('table', { name: '前端版本登记', exact: true });
      const dialog = page.getByRole('dialog');
      const settle = () =>
        page.waitForFunction(
          () =>
            !document.querySelector(
              '[class*="-zoom-appear"],[class*="-zoom-enter"],[class*="-zoom-leave"]',
            ),
        );
      const confirm = async (name) => {
        await activate(dialog.getByRole('button', { name, exact: true }));
        await dialog.waitFor({ state: 'hidden' });
      };
      await tab('补偿管理');
      const compensations = page.getByRole('table', { name: '补偿列表' });
      // A published compensation opens read-only and offers no void action anywhere.
      assert.equal(await compensations.getByRole('button', { name: /^作废/ }).count(), 0);
      await activate(compensations.getByRole('button', { name: '查看 维护补偿' }));
      await dialog.waitFor();
      await settle();
      assert(await page.getByRole('textbox', { name: '消息标题' }).isDisabled());
      assert(await page.getByRole('spinbutton', { name: '补偿金币' }).isDisabled());
      await page.waitForFunction(() => !document.querySelector('.ant-message-notice'));
      await page.screenshot({
        path: `${evidence}/night-locked-compensation-${width}.png`,
        fullPage: true,
      });
      await confirm('关闭');
      await tab('公告管理');
      const announcements = page.getByRole('table', { name: '公告列表' });
      // New announcements start offline; cancelling the dialog adds nothing.
      await activate(button('新增公告'));
      await page.getByRole('textbox', { name: '消息标题' }).fill('作废的输入');
      await confirm('取消');
      assert.equal(await announcements.locator('tbody tr').count(), 1);
      await activate(button('新增公告'));
      await page
        .getByRole('textbox', { name: '消息标题' })
        .fill('新的公告 <script>保持纯文本</script>');
      assert(await dialog.getByRole('button', { name: '确定新增' }).isDisabled());
      await page
        .getByRole('textbox', { name: '消息正文' })
        .fill('版本维护完成。\n公告支持换行，按原文展示。');
      await confirm('确定新增');
      await activate(page.getByRole('tab', { name: '已下线 1', exact: true }));
      assert.equal(await announcements.locator('tbody tr').count(), 1);
      // Going live ends the earlier overlapping announcement when the new one starts.
      await activate(announcements.getByRole('button', { name: /^上线/ }));
      await activate(page.getByRole('tab', { name: '全部 2', exact: true }));
      assert.equal(await page.getByRole('tab', { name: /^已下线 0/ }).count(), 1);
      await publish();
      const [kept, added] = f.state.snapshot.nightOperations.announcements;
      assert.equal(kept.enabled && added.enabled, true);
      assert.equal(kept.endsAt, added.startsAt);
      await tab('补偿管理');
      // An unpublished draft can be voided and restored, never deleted.
      await activate(button('新增补偿'));
      await page.getByRole('textbox', { name: '消息标题' }).fill('补偿测试');
      await page.getByRole('textbox', { name: '消息正文' }).fill('金币、经验与补给箱各发放一次。');
      assert(await dialog.getByRole('button', { name: '确定新增' }).isDisabled());
      await page.getByRole('spinbutton', { name: '补偿金币' }).fill('10');
      await page
        .getByRole('textbox', { name: '指定玩家 ID' })
        .fill('11111111-1111-4111-8111-111111111111\n22222222-2222-4222-8222-222222222222');
      await confirm('确定新增');
      await activate(compensations.getByRole('button', { name: '作废 补偿测试' }));
      await activate(page.getByRole('tab', { name: '已作废 1', exact: true }));
      assert.equal(await compensations.locator('tbody tr').count(), 1);
      await activate(compensations.getByRole('button', { name: '恢复 补偿测试' }));
      await activate(page.getByRole('tab', { name: '草稿 1', exact: true }));
      assert.equal(await compensations.locator('tbody tr').count(), 1);
      await publish();
      assert.equal(f.state.snapshot.nightOperations.compensations.length, 2);
      assert.equal(
        f.state.snapshot.nightOperations.compensations.find((c) => c.title === '补偿测试').playerIds
          .length,
        2,
      );
      await tab('版本与部署');
      const buildA = builds.getByRole('row').filter({ hasText: 'night-build-a' });
      const buildB = builds.getByRole('row').filter({ hasText: 'night-build-b' });
      await buildA.getByText('兼容', { exact: true }).waitFor();
      const versionInput = page.getByRole('textbox', { name: '前端版本号', exact: true });
      await versionInput.fill('9.9.9');
      const writes = f.requests.filter((r) => r.method !== 'GET').length;
      f.nightRuntime.report.ranked = { current: 'solo-a', supported: ['solo-a'] };
      await activate(button('刷新服务端版本'));
      await buildB.getByText('不兼容', { exact: true }).waitFor();
      assert.equal(
        await versionInput.inputValue(),
        '9.9.9',
        'runtime refresh preserves registration draft',
      );
      assert.equal(
        f.requests.filter((r) => r.method !== 'GET').length,
        writes,
        'runtime refresh does not publish',
      );
      await page.getByText('1 个启用的客户端版本与运行服务端不兼容', { exact: true }).waitFor();
      await page.screenshot({
        path: `${evidence}/night-rule-mismatch-${width}.png`,
        fullPage: true,
      });
      f.nightRuntime = { ...runtime, report: null, error: 'UNAVAILABLE' };
      await activate(button('刷新服务端版本'));
      await buildB.getByText('待核实', { exact: true }).waitFor();
      f.nightRuntime = { ...runtime, checkedAt: Date.now() - 61_000 };
      await activate(button('刷新服务端版本'));
      await page.getByText('服务端规则待核实', { exact: true }).waitFor();
      f.nightRuntime = { ...runtime, checkedAt: Date.now(), otherInstances: ['mixed-runtime'] };
      await activate(button('刷新服务端版本'));
      await buildA.getByText('部分实例待核实', { exact: true }).waitFor();
      f.nightRuntime = { ...runtime, checkedAt: Date.now() };
      await activate(button('刷新服务端版本'));
      await buildB.getByText('兼容', { exact: true }).waitFor();
      await versionInput.fill('');
      assert.equal(
        await page.getByRole('table', { name: '后端上线历史' }).locator('tbody tr').count(),
        5,
      );
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
    await page.getByRole('tab', { name: '夜航运营', exact: true }).click();
    assert(await page.getByRole('button', { name: '新增公告', exact: true }).isDisabled());
    await page.getByRole('tab', { name: '版本与部署', exact: true }).click();
    assert(await page.getByRole('button', { name: '登记到草稿', exact: true }).isDisabled());
    // Release history has its own page, linked from the games page, with grouped changes.
    await page
      .getByRole('region', { name: '保存与发布' })
      .getByRole('link', { name: '发布记录' })
      .click();
    await page.getByRole('heading', { name: '发布记录', exact: true }).waitFor();
    await page
      .getByRole('table', { name: '草稿与发布历史' })
      .getByRole('button', { name: /^查看改动/ })
      .first()
      .click();
    await page.getByRole('dialog').getByLabel('配置差异').waitFor();
    assert.equal(f.writes.length, 0);
    checks++;
  } finally {
    await context.close();
  }
  return checks;
}
