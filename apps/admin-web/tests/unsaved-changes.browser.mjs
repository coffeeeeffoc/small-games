import assert from 'node:assert/strict';
import { expect } from '@playwright/test';
import { installControlFixture, collectBrowserErrors } from './control.fixture.mjs';

export async function unsavedChangesBrowserChecks(browser, url, evidence) {
  for (const width of [1360, 390, 320]) {
    const context = await browser.newContext({
      viewport: { width, height: 900 },
      hasTouch: width < 500,
      isMobile: width < 500,
    });
    try {
      const page = await context.newPage();
      const clean = await collectBrowserErrors(page);
      const fixture = await installControlFixture(page);
      const button = (name) => page.getByRole('button', { name, exact: true });
      const textbox = (name) => page.getByRole('textbox', { name, exact: true });
      const nav = (name) =>
        page.getByRole('navigation', { name: '管理导航' }).getByRole('link', { name, exact: true });
      const guard = page.getByRole('dialog', { name: '确认离开当前页面？', exact: true });
      const activate = (locator) => (width < 500 ? locator.tap() : locator.click());
      const unload = async (expected) => {
        await expect
          .poll(() =>
            page.evaluate(() => {
              const event = new Event('beforeunload', { cancelable: true });
              window.dispatchEvent(event);
              return event.defaultPrevented;
            }),
          )
          .toBe(expected);
      };
      const stay = async () => {
        await expect(guard).toBeVisible();
        await activate(guard.getByRole('button', { name: '继续编辑' }));
        await expect(guard).toBeHidden();
      };
      await page.goto(url + '/');
      await activate(nav('公共配置'));
      const origins = textbox('公共 API Origins');
      await expect(origins).toHaveValue('https://game.example');
      await unload(false);
      await origins.fill('https://unsaved.example');
      await unload(true);
      await activate(nav('游戏状态'));
      await expect(guard).toBeVisible();
      await guard.screenshot({ path: `${evidence}/unsaved-changes-${width}.png` });
      await stay();
      await expect(page).toHaveURL(url + '/config');
      await expect(origins).toHaveValue('https://unsaved.example');
      assert.equal(fixture.writes.length, 0);

      if (width === 1360) {
        // Cancelled browser closes must not mark Playwright's page routing as closed.
        const cdp = await context.newCDPSession(page);
        const pendingReload = page.waitForEvent('dialog');
        await cdp.send('Page.reload');
        const refreshDialog = await pendingReload;
        assert.equal(refreshDialog.type(), 'beforeunload');
        await refreshDialog.dismiss();
        await expect(origins).toHaveValue('https://unsaved.example');
        const pendingClose = page.waitForEvent('dialog');
        await cdp.send('Page.close');
        const closeDialog = await pendingClose;
        assert.equal(closeDialog.type(), 'beforeunload');
        await closeDialog.dismiss();
        assert.equal(page.isClosed(), false);
        await cdp.detach();
      }

      await page.goBack();
      await stay();
      await expect(page).toHaveURL(url + '/config');
      await activate(nav('游戏状态'));
      await activate(guard.getByRole('button', { name: '确认离开' }));
      await expect(page.getByRole('heading', { name: '游戏状态', exact: true })).toBeVisible();
      await unload(false);
      await page.goBack();
      await expect(origins).toHaveValue('https://game.example');
      await origins.fill('https://forward.example');
      await page.goForward();
      await stay();
      await expect(page).toHaveURL(url + '/config');
      await expect(origins).toHaveValue('https://forward.example');
      await origins.fill('https://game.example');
      await unload(false);

      await origins.fill('https://saved.example');
      await activate(button('查看改动并发布'));
      await textbox('变更理由').fill('离开保护验证');
      await activate(button('保存草稿'));
      await page.getByText('草稿已保存，尚未发布', { exact: true }).waitFor();
      await activate(page.getByRole('dialog').getByRole('button', { name: '关闭', exact: true }));
      await activate(nav('发布记录'));
      await stay();
      await unload(true);
      await activate(button('放弃编辑'));
      await expect(origins).toHaveValue('https://game.example');
      await unload(false);

      await activate(nav('游戏状态'));
      await activate(page.getByRole('tab', { name: '夜航运营', exact: true }));
      await activate(button('新增公告'));
      await unload(false);
      await textbox('消息标题').fill('尚未确认的公告');
      await unload(true);
      await activate(button('取消'));
      await unload(false);
      await activate(page.getByRole('tab', { name: '版本与部署', exact: true }));
      await textbox('构建标识').fill('unregistered-build');
      await unload(true);
      await activate(page.getByRole('tab', { name: '游戏开关', exact: true }));
      await unload(true);
      await activate(page.getByRole('tab', { name: '夜航运营', exact: true }));
      await expect(textbox('构建标识')).toHaveValue('unregistered-build');
      await activate(nav('角色'));
      await stay();
      await textbox('构建标识').fill('');
      await unload(false);

      await activate(nav('成员'));
      await activate(button('邀请成员'));
      await unload(false);
      await textbox('成员邮箱').fill('pending@example.com');
      await activate(nav('角色'));
      await stay();
      await expect(textbox('成员邮箱')).toHaveValue('pending@example.com');
      await activate(button('取消编辑'));
      await unload(false);
      await activate(nav('角色'));
      await activate(button('创建角色'));
      await unload(false);
      await textbox('角色名称').fill('未保存角色');
      await activate(nav('公共配置'));
      await stay();
      await textbox('角色名称').fill('');
      await unload(false);
      await activate(nav('公共配置'));
      await expect(origins).toHaveValue('https://game.example');
      await origins.fill('https://published.example');
      await activate(button('查看改动并发布'));
      await textbox('变更理由').fill('发布后解除离开保护');
      await activate(button('保存草稿'));
      await page.getByText('草稿已保存，尚未发布', { exact: true }).waitFor();
      await activate(button('发布此草稿'));
      await activate(button('确认发布'));
      await page.getByText('与线上一致', { exact: true }).waitFor();
      await unload(false);
      await activate(nav('成员'));
      await expect(page.getByRole('heading', { name: '成员', exact: true })).toBeVisible();
      await clean();
      console.log(
        `UNSAVED_CHANGES: refresh/close, navigation/history, nested forms, discard/publish at ${width}px`,
      );
    } finally {
      await context.close();
    }
  }
  return 3;
}
