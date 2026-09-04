import type { GameHost } from '@coffeeeeffoc/game-contract';

import type { OfficeContent } from '../content/schema.js';
import { upgradeCost } from '../domain/index.js';
import { useOfficeGame } from './useOfficeGame.js';

/** Runtime inputs supplied by the Game Definition. */
export type OfficeGameProps = {
  host: GameHost;
  content: OfficeContent;
  active: boolean;
  random?: () => number;
};

/** Five-day office campaign rendered exclusively through Game Host capabilities. */
export function OfficeGame({ host, content, active, random = Math.random }: OfficeGameProps) {
  const { state, save, rescuePending, start, setSlacking, restart, upgrade, rescue } =
    useOfficeGame(host, content, active, random);
  const day = content.days[state.day];

  if (!active) return <main className="office paused">摸鱼暂停中</main>;

  return (
    <main className="office" style={{ '--day-color': day.color } as React.CSSProperties}>
      <header>
        <small>五日生存赛 · DAY {state.day + 1} / 5</small>
        <h1>打工人摸鱼记</h1>
      </header>

      <nav className="weekday-track" aria-label="工作日进度">
        {content.days.map((item, index) => (
          <i
            className={index < state.day ? 'passed' : index === state.day ? 'current' : ''}
            key={item.name}
          >
            {index < state.day ? '✓' : index + 1}
          </i>
        ))}
      </nav>

      {state.intro && !state.done ? (
        <section className="day-curtain">
          <h2>{day.name}</h2>
          <p>
            {day.task} · 老板出现率 {Math.round(day.inspectionChance * 100)}%
          </p>
          <button onClick={start}>打卡上班 →</button>
        </section>
      ) : (
        <section className="workday">
          <div className="office-hud">
            <span>
              下班倒计时 <b>00:{String(state.time).padStart(2, '0')}</b>
            </span>
            <span>
              本日 / 总快乐{' '}
              <b>
                {state.joy} / {state.total + state.joy}
              </b>
            </span>
          </div>
          <div className={state.bossWatching ? 'boss-signal danger' : 'boss-signal'}>
            <b>{state.bossWatching ? '老板正在看你' : '老板背过身了'}</b>
            <span>{state.bossWatching ? '● 监控中' : '● 安全窗口'}</span>
          </div>
          <div className="desk-scene">
            <div className={state.bossWatching ? 'boss watching' : 'boss'}>老板</div>
            <article className={state.slacking ? 'monitor video-mode' : 'monitor'}>
              <b>{state.slacking ? '热门视频' : 'Q3_最终版_18.xlsx'}</b>
              <span>{state.slacking ? '《如何在周五保持清醒》' : '||||||||||||'}</span>
            </article>
            <strong>{state.slacking ? '😎' : '😐'}</strong>
          </div>
          <label>
            今日摸鱼目标{' '}
            <b>
              {Math.min(state.joy, day.target)} / {day.target}
            </b>
          </label>
          <progress max={day.target} value={Math.min(state.joy, day.target)} />
          <label>
            老板疑心值 <b>{state.suspicion}%</b>
          </label>
          <progress max="100" value={state.suspicion} />
          <button
            className={state.slacking ? 'slack-button pressed' : 'slack-button'}
            onPointerDown={() => setSlacking(true)}
            onPointerUp={() => setSlacking(false)}
            onPointerCancel={() => setSlacking(false)}
            onPointerLeave={() => setSlacking(false)}
          >
            {state.slacking ? '松手！切回表格' : '按住摸鱼'}
          </button>
          <div className="upgrade-row">
            <span>
              防窥屏 Lv.{state.shieldLevel}
              <small>每级减少 2 点疑心增长</small>
            </span>
            <button
              disabled={save.coins < upgradeCost(state.shieldLevel) || state.shieldLevel >= 3}
              onClick={upgrade}
            >
              {state.shieldLevel >= 3 ? '已满级' : `◈ ${upgradeCost(state.shieldLevel)} 升级`}
            </button>
          </div>
        </section>
      )}

      {state.caught && (
        <section className="result" role="dialog">
          <h2>你在工作时间笑出了声</h2>
          <p>本日快乐 {state.joy}。</p>
          <button disabled={rescuePending} onClick={restart}>
            从周一重来
          </button>
          <button
            disabled={rescuePending || !host.session.capabilities.includes('advertising')}
            onClick={() => void rescue()}
          >
            {rescuePending ? '处理中…' : '销毁浏览记录'}
          </button>
        </section>
      )}
      {state.done && (
        <section className="result victory" role="dialog">
          <h2>周末终于属于你了！</h2>
          <p>
            本周共攒下 {state.total} 快乐，结算 {Math.floor(state.total / 3)} 游戏币。
          </p>
          <button onClick={restart}>再过一周</button>
        </section>
      )}
      <footer>
        游戏币 {save.coins} · 最佳快乐 {save.bestOffice}
      </footer>
    </main>
  );
}
