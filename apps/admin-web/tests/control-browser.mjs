import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { installControlFixture, collectBrowserErrors } from './control.fixture.mjs';

export async function controlBrowserChecks(browser, baseURL, evidence, diagnostic = false) {
  let checks = 0;
  for (const width of diagnostic === 'roles' ? [] : diagnostic ? [1360] : [1360, 390, 320]) {
    console.log(`CONTROL: full workflow at ${width}px`);
    const context = await browser.newContext({
      viewport: { width, height: 900 },
      hasTouch: width < 500,
      isMobile: width < 500,
    });
    let trace;
    try {
      const page = await context.newPage(),
        clean = await collectBrowserErrors(page);
      const fixture = await installControlFixture(page);
      trace = fixture.requests;
      const activate = (locator) => (width < 500 ? locator.tap() : locator.click());
      await page.goto(`${baseURL}/config`);
      await page.getByRole('heading', { name: '公共配置', exact: true }).waitFor();
      await page.getByText('应用覆盖尚不完整', { exact: true }).waitFor();
      assert(await page.getByText('已知应用版本匹配', { exact: true }).isVisible());
      assert(await page.getByText(/状态未知：runtime/).isVisible());
      await page.screenshot({
        path: `${evidence}/config-${width}.png`,
        fullPage: true,
        animations: 'disabled',
      });
      const origins = page.getByRole('textbox', { name: '公共 API Origins', exact: true });
      await origins.fill('https://game.example/path');
      await page.getByRole('textbox', { name: '变更理由', exact: true }).fill('reject bad origin');
      assert(await page.getByRole('button', { name: '保存草稿', exact: true }).isDisabled());
      for (const invalid of [
        'https://*.example.com',
        'https://u:p@api.example',
        'null',
        'https://admin.nenggongzhiren.cn',
      ]) {
        await origins.fill(invalid);
        assert(await page.getByRole('button', { name: '保存草稿', exact: true }).isDisabled());
      }
      await origins.fill('https://new.example:8443');
      await activate(page.getByRole('button', { name: '保存草稿', exact: true }));
      await page.getByText('草稿已保存，尚未发布', { exact: true }).waitFor();
      assert.equal(fixture.writes.length, 1);
      await page.getByRole('button', { name: '发布此草稿', exact: true }).click();
      await page.getByRole('button', { name: '确认发布', exact: true }).click();
      await page.getByText('当前版本 3', { exact: true }).waitFor();
      assert.equal(fixture.writes.length, 2);
      await page.getByRole('link', { name: '游戏状态', exact: true }).click();
      await page.getByRole('heading', { name: '游戏状态', exact: true }).waitFor();
      await activate(page.getByRole('combobox', { name: 'cops-robbers 状态', exact: true }));
      await page.locator('.ant-select-item-option').filter({ hasText: '停止新局' }).click();
      await page.getByRole('textbox', { name: '变更理由', exact: true }).fill('drain game');
      if (diagnostic)
        console.log(
          'FIXTURE_BUTTON ' +
            JSON.stringify({
              aria: await page.locator('button').filter({ hasText: '保存草稿' }).ariaSnapshot(),
              details: await page
                .locator('button')
                .filter({ hasText: '保存草稿' })
                .evaluate((button) => ({
                  html: button.outerHTML,
                  ancestors: [
                    ...(function* () {
                      for (let element = button; element; element = element.parentElement)
                        yield {
                          tag: element.tagName,
                          role: element.getAttribute('role'),
                          ariaHidden: element.getAttribute('aria-hidden'),
                          inert: element.inert,
                          visibility: getComputedStyle(element).visibility,
                        };
                    })(),
                  ],
                })),
            }),
        );
      if (diagnostic)
        assert.equal(
          await page.getByRole('button', { name: '保存草稿', exact: true }).count(),
          1,
          'Save draft must remain accessible after navigation',
        );
      await page.getByRole('button', { name: '保存草稿', exact: true }).click();
      await page.getByText('草稿已保存，尚未发布', { exact: true }).waitFor();
      assert.equal(fixture.writes.at(-1).body.snapshot.games['cops-robbers'], 'draining');
      assert.equal(Object.keys(fixture.writes.at(-1).body.snapshot.games).length, 11);
      assert(
        await page.getByText('tianxia-chalu · 独立服务，尚未纳管', { exact: true }).isVisible(),
      );
      await page.locator('.ant-message-notice').last().waitFor({ state: 'detached' });
      await page.screenshot({
        path: `${evidence}/games-${width}.png`,
        fullPage: true,
        animations: 'disabled',
      });
      if (diagnostic) {
        await clean();
        return 1;
      }
      await page.getByRole('link', { name: '公共配置', exact: true }).click();
      await clean();
      await page
        .getByRole('row')
        .filter({ hasText: '已发布版本 1' })
        .getByRole('button', { name: '准备回退', exact: true })
        .click();
      await page.getByRole('textbox', { name: '回退理由', exact: true }).fill('fixture rollback');
      await page.getByRole('button', { name: '确认回退', exact: true }).click();
      await page.getByText('当前版本 4', { exact: true }).waitFor();
      assert.equal(fixture.writes.at(-1).body.reason, 'fixture rollback');
      for (const [path, title] of [
        ['/members', '成员'],
        ['/roles', '角色'],
        ['/audit', '审计'],
      ]) {
        await page.getByRole('link', { name: title, exact: true }).click();
        await page.getByRole('heading', { name: title, exact: true }).waitFor();
        await page.getByRole('button', { name: `刷新${title}`, exact: true }).waitFor();
        await page
          .getByText(
            path === '/members'
              ? 'owner@example.com'
              : path === '/roles'
                ? 'Administrator'
                : 'revisions.publish',
            { exact: true },
          )
          .waitFor();
        assert(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          `Overflow ${path}/${width}`,
        );
        await page.screenshot({
          path: `${evidence}/${title === '成员' ? 'members' : title === '角色' ? 'roles' : 'audit'}-${width}.png`,
          fullPage: true,
          animations: 'disabled',
        });
      }
      await clean();
      checks += 1;
    } catch (error) {
      const page = context.pages()[0];
      const failureName = `navigation-${width}-${Date.now()}`;
      if (page) {
        await mkdir(`${evidence}/diagnostics`, { recursive: true });
        await page
          .screenshot({ path: `${evidence}/diagnostics/${failureName}.png`, fullPage: true })
          .catch(() => {});
        const details = {
          url: page.url(),
          pageErrors: page.__fixtureErrors ?? [],
          requests: trace,
          document: await page
            .locator('body')
            .innerText()
            .catch(() => 'unavailable'),
          csp: await page.evaluate(() => window.__cspViolations).catch(() => []),
          styles: await page
            .evaluate(() => window.__styleInsertions.filter((style) => !style.hasNonce))
            .catch(() => []),
        };
        await writeFile(
          `${evidence}/diagnostics/${failureName}.json`,
          JSON.stringify(details, null, 2) + '\n',
        );
        console.error(
          'FIXTURE_DIAGNOSTIC ' +
            JSON.stringify({ ...details, document: details.document.slice(0, 2000) }),
        );
      }
      throw error;
    } finally {
      await context.close();
    }
  }
  if (diagnostic !== 'roles') {
    console.log('CONTROL: CAS conflict, last administrator and immediate revocation');
    const context = await browser.newContext({ viewport: { width: 1360, height: 1000 } });
    try {
      const page = await context.newPage(),
        clean = await collectBrowserErrors(page);
      const fixture = await installControlFixture(page);
      await page.goto(`${baseURL}/config`);
      await page
        .getByRole('textbox', { name: '公共 API Origins', exact: true })
        .fill('https://mine.example');
      await page.getByRole('textbox', { name: '变更理由', exact: true }).fill('preserve my draft');
      fixture.state.version = 3;
      fixture.state.snapshot.apiOrigins = ['https://concurrent.example'];
      fixture.nextError = { code: 'VERSION_CONFLICT' };
      await page.getByRole('button', { name: '保存草稿', exact: true }).click();
      await page.getByText('版本冲突 · 输入已保留', { exact: true }).waitFor();
      assert.equal(
        await page.getByRole('textbox', { name: '公共 API Origins', exact: true }).inputValue(),
        'https://mine.example',
      );
      assert.equal(fixture.writes.length, 1);
      await page.getByRole('button', { name: /已核对差异/ }).click();
      await page.getByRole('button', { name: '保存草稿', exact: true }).click();
      await page.getByText('草稿已保存，尚未发布', { exact: true }).waitFor();
      assert.equal(fixture.writes.at(-1).body.expectedVersion, 3);
      await page.getByRole('link', { name: '成员', exact: true }).click();
      const owner = page.getByRole('row').filter({ hasText: 'owner@example.com' });
      await owner.getByRole('button', { name: '编辑成员' }).click();
      assert(await page.getByRole('textbox', { name: '成员邮箱', exact: true }).isDisabled());
      await page.getByRole('checkbox', { name: '成员有效', exact: true }).uncheck();
      await page
        .getByRole('textbox', { name: '成员变更理由', exact: true })
        .fill('last administrator negative');
      fixture.nextError = { code: 'LAST_ADMINISTRATOR' };
      const before = fixture.writes.length;
      await page.getByRole('button', { name: '保存成员', exact: true }).click();
      await page
        .getByText('必须保留至少一位已绑定 GitHub 的有效管理员。', { exact: true })
        .waitFor();
      assert.equal(fixture.writes.length, before + 1);
      fixture.nextError = { code: 'FORBIDDEN', status: 403 };
      fixture.permissions = ['control.read'];
      await page.getByRole('button', { name: '保存成员', exact: true }).click();
      await page.getByText('你没有此页面的访问权限。', { exact: true }).waitFor();
      assert.equal(
        await page.getByRole('textbox', { name: '成员变更理由', exact: true }).count(),
        0,
      );
      assert.equal(await page.getByRole('link', { name: '成员', exact: true }).count(), 0);
      assert.equal(fixture.writes.length, before + 2);
      assert(fixture.requests.filter((request) => request.path === '/api/session').length >= 2);
      await clean();
      checks++;
    } finally {
      await context.close();
    }
  }
  {
    console.log('CONTROL: member and role CRUD, builtin and referenced role protection');
    const context = await browser.newContext();
    let requestTrace;
    try {
      const page = await context.newPage(),
        clean = await collectBrowserErrors(page);
      const fixture = await installControlFixture(page);
      requestTrace = fixture.requests;
      await page.goto(`${baseURL}/members`);
      await page.getByRole('button', { name: '邀请成员', exact: true }).click();
      await page.getByRole('textbox', { name: '成员邮箱', exact: true }).fill('new@example.com');
      await page.getByRole('combobox', { name: '成员角色', exact: true }).click();
      await page.locator('.ant-select-item-option').filter({ hasText: 'Viewer' }).click();
      await page.keyboard.press('Escape');
      await page.getByRole('textbox', { name: '成员变更理由', exact: true }).fill('invite fixture');
      await page.getByRole('button', { name: '保存成员', exact: true }).click();
      const memberRow = page.getByRole('row').filter({ hasText: 'new@example.com' });
      await memberRow.waitFor();
      await memberRow.getByRole('button', { name: '删除成员', exact: true }).click();
      await page
        .getByRole('textbox', { name: '删除成员理由', exact: true })
        .fill('remove invitation');
      await page.getByRole('button', { name: '确认删除成员', exact: true }).click();
      await memberRow.waitFor({ state: 'detached' });
      await page.getByRole('link', { name: '角色', exact: true }).click();
      if (diagnostic === 'roles')
        console.log(
          'ROLE_NAVIGATION ' +
            JSON.stringify(
              await page.evaluate(() => ({
                path: location.pathname,
                heading: document.querySelector('#page-title')?.textContent,
                tables: [...document.querySelectorAll('table')].map((table) =>
                  table.getAttribute('aria-label'),
                ),
                administratorRows: [...document.querySelectorAll('tr')]
                  .filter((row) => row.textContent.includes('Administrator'))
                  .map((row) => ({
                    text: row.innerText,
                    buttons: row.querySelectorAll('button').length,
                  })),
              })),
            ),
        );
      await page.getByRole('heading', { name: '角色', exact: true }).waitFor();
      const rolesTable = page.getByRole('table', { name: '角色列表', exact: true });
      await rolesTable.waitFor();
      const builtin = rolesTable.getByRole('row').filter({ hasText: 'Administrator' });
      await builtin.waitFor();
      assert.equal(await builtin.getByRole('button').count(), 0);
      await page.getByRole('button', { name: '创建角色', exact: true }).click();
      await page.getByRole('textbox', { name: '角色标识', exact: true }).fill('ui-reader');
      await page.getByRole('textbox', { name: '角色名称', exact: true }).fill('UI Reader');
      await page.getByRole('checkbox', { name: 'control.read', exact: true }).check();
      await page.getByRole('textbox', { name: '角色变更理由', exact: true }).fill('create role');
      await page.getByRole('button', { name: '保存角色', exact: true }).click();
      const roleRow = page.getByRole('row').filter({ hasText: 'UI Reader' });
      await roleRow.waitFor();
      await roleRow.getByRole('button', { name: '编辑角色', exact: true }).click();
      assert(await page.getByRole('textbox', { name: '角色标识', exact: true }).isDisabled());
      await page.getByRole('textbox', { name: '角色名称', exact: true }).fill('UI Reader Updated');
      await page.getByRole('textbox', { name: '角色变更理由', exact: true }).fill('rename role');
      await page.getByRole('button', { name: '保存角色', exact: true }).click();
      await page
        .getByRole('row')
        .filter({ hasText: 'UI Reader Updated' })
        .getByRole('button', { name: '删除角色', exact: true })
        .click();
      await page
        .getByRole('textbox', { name: '删除角色理由', exact: true })
        .fill('referenced negative');
      fixture.nextError = { code: 'ROLE_IN_USE' };
      const writes = fixture.writes.length;
      await page.getByRole('button', { name: '确认删除角色', exact: true }).click();
      await page.getByText('该角色仍有成员引用，请先调整成员。', { exact: true }).waitFor();
      assert.equal(fixture.writes.length, writes + 1);
      await page.getByRole('button', { name: '确认删除角色', exact: true }).click();
      await page
        .getByRole('row')
        .filter({ hasText: 'UI Reader Updated' })
        .waitFor({ state: 'detached' });
      await clean();
      checks++;
      if (diagnostic === 'roles') return checks;
    } catch (error) {
      const page = context.pages()[0];
      if (page) {
        const name = `roles-${Date.now()}`;
        await mkdir(`${evidence}/diagnostics`, { recursive: true });
        await page
          .screenshot({ path: `${evidence}/diagnostics/${name}.png`, fullPage: true })
          .catch(() => {});
        const details = {
          url: page.url(),
          document: await page.locator('body').innerText(),
          requests: requestTrace,
          pageErrors: page.__fixtureErrors,
          csp: await page.evaluate(() => window.__cspViolations),
        };
        await writeFile(
          `${evidence}/diagnostics/${name}.json`,
          JSON.stringify(details, null, 2) + '\n',
        );
        console.error('ROLE_DIAGNOSTIC ' + JSON.stringify(details));
      }
      throw error;
    } finally {
      await context.close();
    }
  }
  for (const [granted, path, title] of [
    [['control.read'], '/config', '公共配置'],
    [['members.read', 'members.write'], '/members', '成员'],
    [['roles.read'], '/roles', '角色'],
    [['audit.read'], '/audit', '审计'],
    [['control.read', 'control.publish'], '/config', '公共配置'],
  ]) {
    console.log(`CONTROL: least privilege ${granted.join(',')}`);
    const context = await browser.newContext();
    try {
      const page = await context.newPage(),
        clean = await collectBrowserErrors(page);
      const fixture = await installControlFixture(page, granted);
      await page.goto(baseURL + path);
      await page.getByRole('heading', { name: title, exact: true }).waitFor();
      if (granted.includes('control.read')) {
        assert(await page.getByRole('button', { name: '保存草稿', exact: true }).isDisabled());
        const draftRow = page.getByRole('row').filter({ hasText: '未发布草稿' });
        await draftRow.waitFor();
        assert.equal(
          await draftRow.getByRole('button', { name: '准备回退', exact: true }).count(),
          0,
        );
        if (granted.includes('control.publish')) {
          await draftRow.getByRole('button', { name: '载入草稿', exact: true }).click();
          await page.getByRole('button', { name: '发布此草稿', exact: true }).click();
          await page.getByRole('button', { name: '确认发布', exact: true }).click();
          await page.getByText('当前版本 3', { exact: true }).waitFor();
          assert.equal(fixture.writes.length, 1);
        }
      }
      if (path === '/members') {
        await page.getByText('没有角色目录读取权限', { exact: true }).waitFor();
        assert(await page.getByRole('button', { name: '邀请成员', exact: true }).isDisabled());
        await page
          .getByRole('row')
          .filter({ hasText: 'viewer@example.com' })
          .getByRole('button', { name: '编辑成员', exact: true })
          .click();
        assert(await page.getByRole('combobox', { name: '成员角色', exact: true }).isDisabled());
        await page.getByRole('checkbox', { name: '成员有效', exact: true }).uncheck();
        await page
          .getByRole('textbox', { name: '成员变更理由', exact: true })
          .fill('disable without role directory');
        await page.getByRole('button', { name: '保存成员', exact: true }).click();
        await page.getByText('成员设置已保存。', { exact: true }).waitFor();
        assert(!('roleIds' in fixture.writes.at(-1).body));
        assert.equal(
          fixture.requests.filter((request) => request.path === '/api/control/roles').length,
          0,
        );
      }
      if (!granted.includes('members.read'))
        assert.equal(await page.getByRole('link', { name: '成员', exact: true }).count(), 0);
      if (!granted.includes('roles.read'))
        assert.equal(
          fixture.requests.filter((request) => request.path === '/api/control/roles').length,
          0,
        );
      await page.goto(`${baseURL}/${path === '/audit' ? 'members' : 'audit'}`);
      await page.getByText('你没有此页面的访问权限。', { exact: true }).waitFor();
      const deniedPath = path === '/audit' ? '/api/control/members' : '/api/control/audit';
      assert.equal(fixture.requests.filter((request) => request.path === deniedPath).length, 0);
      await clean();
      checks++;
    } finally {
      await context.close();
    }
  }
  for (const kind of ['missing', 'invalid', 'noncanonical', 'duplicate']) {
    console.log(`CONTROL: reject ${kind} nonce`);
    const context = await browser.newContext();
    try {
      const page = await context.newPage(),
        clean = await collectBrowserErrors(page);
      const fixture = await installControlFixture(page);
      await page.route(`${baseURL}/config`, async (route) => {
        const response = await route.fetch();
        let body = await response.text();
        const meta = /<meta\b[^>]*name=["']sg-csp-nonce["'][^>]*>/g;
        assert(meta.test(body));
        meta.lastIndex = 0;
        body = body.replace(meta, (original) =>
          kind === 'missing'
            ? ''
            : kind === 'duplicate'
              ? original + original
              : `<meta name="sg-csp-nonce" content="${kind === 'invalid' ? 'invalid' : 'A'.repeat(42) + 'B='}">`,
        );
        await route.fulfill({ response, body });
      });
      await page.goto(`${baseURL}/config`);
      await page.getByRole('heading', { name: '页面暂时无法加载', exact: true }).waitFor();
      assert.equal(
        fixture.requests.filter((request) => request.path.startsWith('/api/control/')).length,
        0,
      );
      await clean();
      checks++;
    } finally {
      await context.close();
    }
  }
  {
    console.log('CONTROL: per-response nonce and intentional unnonced-style negative');
    const context = await browser.newContext();
    try {
      const page = await context.newPage(),
        clean = await collectBrowserErrors(page);
      await installControlFixture(page);
      await page.goto(`${baseURL}/config`);
      await page.getByRole('textbox', { name: '公共 API Origins', exact: true }).waitFor();
      const nonce = await page.locator('meta[name="sg-csp-nonce"]').getAttribute('content');
      assert.equal(Buffer.from(nonce, 'base64').length, 32);
      assert.equal(Buffer.from(nonce, 'base64').toString('base64'), nonce);
      await page.reload();
      await page.getByRole('textbox', { name: '公共 API Origins', exact: true }).waitFor();
      assert.notEqual(
        await page.locator('meta[name="sg-csp-nonce"]').getAttribute('content'),
        nonce,
      );
      await clean();
      await page.evaluate(() => {
        const style = document.createElement('style');
        style.textContent = 'body { outline:17px solid rgb(1,2,3) }';
        document.head.append(style);
      });
      await page.waitForFunction(() =>
        window.__cspViolations.some((item) => item.directive === 'style-src-elem'),
      );
      assert.notEqual(
        await page.evaluate(() => getComputedStyle(document.body).outlineWidth),
        '17px',
      );
      checks++;
    } finally {
      await context.close();
    }
  }
  return checks;
}
