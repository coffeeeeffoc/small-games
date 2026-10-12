import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { ShellApp } from '../src/ShellApp.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

it('filters, explains evaluations, restores shared URLs, and retains selections across launch and back', async () => {
  window.history.replaceState(null, '', '/?dev=0&catalogTab=hold');
  const container = document.createElement('div');
  let root = createRoot(container);
  const ids = () =>
    [...container.querySelectorAll<HTMLElement>('article')].map((el) => el.dataset.gameId);
  async function click(prefix: string) {
    const button = [...container.querySelectorAll<HTMLButtonElement>('button')].find(
      (el) => el.firstChild?.textContent === prefix,
    );
    expect(button, prefix).toBeDefined();
    await act(async () => button!.click());
  }
  try {
    await act(async () => root.render(<ShellApp runtimeClient={false} />));
    expect(ids()).toHaveLength(28);
    expect(ids()).toContain('rule-thief');
    expect(ids()).not.toContain('travel-bund');
    await click('全部游戏');
    await click('有潜力');
    expect(ids()).toHaveLength(40);
    await click('潜力低');
    expect(ids()).toHaveLength(66);
    await click('上轮已改造');
    expect(ids()).toHaveLength(7);
    await click('毫无潜力');
    // OR within a facet retains the seven previous games.
    expect(ids()).toHaveLength(7);
    await click('清空筛选');
    await click('毫无潜力');
    expect(ids().sort()).toEqual(['chase-thief', 'retreat-rally']);
    await click('重置全部');
    await click('上轮已改造');
    await click('详情卡片');
    const before = ids();
    const url = window.location.href;
    const article = container.querySelector<HTMLElement>('[data-game-id="cage-rescue"]')!;
    const detail = article.querySelector<HTMLDetailsElement>('.game-assessment')!;
    await act(async () => detail.querySelector('summary')!.click());
    expect(detail.open).toBe(true);
    expect(detail.textContent).toContain('接球与接人');
    expect(detail.textContent).toContain('未进行全量真机');
    await act(async () => article.querySelector<HTMLAnchorElement>('a.game-launch')!.click());
    expect(container.querySelector('iframe')?.title).toBe('打破笼子接住人');
    await click('返回目录');
    expect(ids()).toEqual(before);
    expect(container.querySelector('.catalog-list')).toBeNull();
    expect(new URL(window.location.href).searchParams.get('dev')).toBe('0');
    await act(async () => root.unmount());
    window.history.replaceState(null, '', url);
    root = createRoot(container);
    await act(async () => root.render(<ShellApp runtimeClient={false} />));
    expect(ids()).toEqual(before);
    expect(container.querySelector('.catalog-list')).toBeNull();
    // Browser history navigation also updates the controlled filters.
    await act(async () => {
      window.history.replaceState(null, '', '/?catalogTab=hold');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(ids()).toHaveLength(28);
  } finally {
    await act(async () => root.unmount());
    window.history.replaceState(null, '', '/');
    localStorage.clear();
  }
});

it('shows every exclusive rollout, visible implementation states, and filtered counts against group totals', async () => {
  window.history.replaceState(null, '', '/?catalogTab=focus');
  const container = document.createElement('div');
  const root = createRoot(container);
  const articles = () => [...container.querySelectorAll<HTMLElement>('article')];
  const tabs = () => [...container.querySelectorAll<HTMLButtonElement>('.catalog-tabs button')];
  async function click(prefix: string) {
    const button = [...container.querySelectorAll<HTMLButtonElement>('button')].find(
      (el) => el.firstChild?.textContent === prefix,
    );
    expect(button, prefix).toBeDefined();
    await act(async () => button!.click());
  }
  try {
    await act(async () => root.render(<ShellApp runtimeClient={false} />));
    expect(articles()).toHaveLength(7);
    expect(
      tabs().find((button) => button.getAttribute('aria-pressed') === 'true')?.textContent,
    ).toBe('上轮已改造7');
    await click('全部游戏');
    expect(
      tabs()
        .slice(0, 5)
        .map((button) => button.textContent),
    ).toEqual(['全部游戏68', '上轮已改造7', '本轮改造13', '有潜力 · 后续改造20', '暂缓投入28']);
    for (const article of articles()) {
      expect(article.querySelector('.game-rollout strong')?.textContent).toBeTruthy();
      expect(article.querySelector('.game-rollout span')?.textContent).toBeTruthy();
      expect(article.querySelector('.game-rollout')?.closest('details')).toBeNull();
    }
    await click('本轮改造');
    expect(articles()).toHaveLength(13);
    await click('移动端小游戏');
    expect(articles()).toHaveLength(11);
    expect(tabs().find((button) => button.textContent?.startsWith('本轮改造'))?.textContent).toBe(
      '本轮改造11 / 13',
    );
    expect(window.location.search).toContain('catalogTab=current');
    expect(window.location.search).toContain('catalog_platforms=mobile');
    await click('清空筛选');
    await click('有潜力 · 后续改造');
    expect(articles()).toHaveLength(20);
    await click('有潜力');
    expect(articles()).toHaveLength(20);
    await click('全部游戏');
    expect(articles()).toHaveLength(40);
    expect(tabs().find((button) => button.textContent?.startsWith('暂缓投入'))?.textContent).toBe(
      '暂缓投入0 / 28',
    );
  } finally {
    await act(async () => root.unmount());
    window.history.replaceState(null, '', '/');
    localStorage.clear();
  }
});
