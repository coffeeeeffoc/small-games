import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { ShellApp } from '../src/ShellApp.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

it('filters both catalog views and keeps the search when returning from a game', async () => {
  const container = document.createElement('div');
  const root = createRoot(container);
  const titles = () => [...container.querySelectorAll('article h2')].map((el) => el.textContent);
  async function click(label: string) {
    const button = [...container.querySelectorAll('button')].find((el) => el.textContent === label);
    expect(button).toBeDefined();
    await act(async () => button!.click());
  }
  async function search(value: string) {
    const input = container.querySelector<HTMLInputElement>('input[type="search"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }
  try {
    await act(async () => root.render(<ShellApp runtimeClient={false} />));
    const all = titles();
    expect(container.querySelector('.catalog-list')).not.toBeNull();
    for (const query of ['湾卡丁', '漂移蓄力', 'LOCAL/CARDING', '  ＣＡＲＤＩＮＧ_car  海湾 ']) {
      await search(query);
      expect(titles()).toEqual(['浪湾卡丁车']);
    }
    await click('详情卡片');
    expect(container.querySelector('.catalog-list')).toBeNull();
    expect(container.querySelector('[aria-pressed="true"]')?.textContent).toBe('详情卡片');
    expect(titles()).toEqual(['浪湾卡丁车']);
    await click('进入游戏');
    expect(container.querySelector('iframe')?.title).toBe('浪湾卡丁车');
    await click('返回目录');
    expect(titles()).toEqual(['浪湾卡丁车']);
    expect(container.querySelector('.catalog-list')).toBeNull();
    await click('简洁一览');
    await click('进入游戏');
    expect(container.querySelector('iframe')?.title).toBe('浪湾卡丁车');
    await click('返回目录');
    expect(titles()).toEqual(['浪湾卡丁车']);
    expect(container.querySelector('.catalog-list')).not.toBeNull();
    await search('games/local/game-building');
    expect(titles()).toEqual(['忙碌的电工']);
    await search('并不存在的游戏123');
    expect(titles()).toEqual([]);
    expect(container.textContent).toContain('没有找到匹配的游戏');
    await click('清空搜索');
    expect(titles()).toEqual(all);
    await search('   ');
    expect(titles()).toEqual(all);
  } finally {
    await act(async () => root.unmount());
    window.history.replaceState(null, '', '/');
    localStorage.clear();
  }
});
