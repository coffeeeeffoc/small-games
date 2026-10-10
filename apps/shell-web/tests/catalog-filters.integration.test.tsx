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
    const button = [...container.querySelectorAll<HTMLButtonElement>('button')].find((el) =>
      el.textContent?.startsWith(prefix),
    );
    expect(button, prefix).toBeDefined();
    await act(async () => button!.click());
  }
  try {
    await act(async () => root.render(<ShellApp runtimeClient={false} />));
    expect(ids()).toHaveLength(26);
    expect(ids()).toContain('rule-thief');
    expect(ids()).not.toContain('travel-bund');
    await click('全部游戏');
    await click('有潜力');
    expect(ids()).toHaveLength(41);
    await click('潜力低');
    expect(ids()).toHaveLength(67);
    await click('本轮优先');
    expect(ids()).toHaveLength(7);
    await click('毫无潜力');
    // OR semantics keep the seven potential games even with an empty-evidence label selected.
    expect(ids()).toHaveLength(7);
    await click('清空筛选');
    await click('毫无潜力');
    expect(ids()).toHaveLength(0);
    expect(container.textContent).toContain('没有找到匹配的游戏');
    await click('重置全部');
    await click('本轮优先');
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
    expect(ids()).toHaveLength(26);
  } finally {
    await act(async () => root.unmount());
    window.history.replaceState(null, '', '/');
    localStorage.clear();
  }
});
