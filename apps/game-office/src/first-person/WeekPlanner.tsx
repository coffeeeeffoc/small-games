import { useState } from 'react';
import { SCENES, WEEKDAYS, createWeek, formatTime, type SceneId } from '../week.js';

export function WeekPlanner({
  seed,
  open,
  onClose,
  onPlay,
  onNewWeek,
}: {
  seed: number;
  open: boolean;
  onClose: () => void;
  onPlay: (seed: number) => void;
  onNewWeek: (seed: number) => void;
}) {
  const [day, setDay] = useState(0),
    [plan, setPlan] = useState(() => createWeek(seed));
  const [selected, setSelected] = useState<SceneId>('late-arrival');
  const weekSeed = plan.seed;
  const scene = SCENES.find((item) => item.id === selected) ?? SCENES[0];
  const newWeek = () => {
    const next = (weekSeed + Math.floor(Math.random() * 1000000) + 1) >>> 0;
    setPlan(createWeek(next));
    setDay(0);
    setSelected('late-arrival');
    onNewWeek(next);
  };
  if (!open) return null;
  return (
    <section className="office-week" aria-label="一周场景表">
      <div className="office-week-heading">
        <div>
          <small>THE ART OF DOING LESS</small>
          <h1>给这一周，留点空隙。</h1>
          <p>按时间前进，每天换一种组合。首个场景已开放，其余正在制作。</p>
        </div>
        <button className="office-close" onClick={onClose} aria-label="关闭场景表">
          ×
        </button>
      </div>
      <div className="office-week-body">
        <div className="office-agenda">
          <div className="office-days">
            {WEEKDAYS.map((label, index) => (
              <button
                key={label}
                aria-pressed={day === index}
                onClick={() => {
                  setDay(index);
                  setSelected(plan.days[index].scenes[0].sceneId);
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="office-agenda-list">
            {plan.days[day].scenes.map((entry) => {
              const item = SCENES.find((value) => value.id === entry.sceneId)!;
              return (
                <button
                  key={entry.sceneId}
                  className={selected === entry.sceneId ? 'selected' : ''}
                  onClick={() => setSelected(entry.sceneId)}
                >
                  <time>
                    {formatTime(entry.startMinute)}
                    <small>{formatTime(entry.endMinute)}</small>
                  </time>
                  <div>
                    <strong>{item.title}</strong>
                    <span>{item.location}</span>
                  </div>
                  <small className={item.status === 'playable' ? 'is-playable' : ''}>
                    {item.status === 'playable' ? '可玩' : '待制作'}
                  </small>
                </button>
              );
            })}
          </div>
          <div className="office-day-end">
            <span>
              {day === 4
                ? '周五下班 · 一周结束后，可重新开始新的一周'
                : '一天结束 · 下一天重新组合场景'}
            </span>
            <button
              onClick={() => {
                if (day === 4) newWeek();
                else {
                  setDay(day + 1);
                  setSelected(plan.days[day + 1].scenes[0].sceneId);
                }
              }}
            >
              {day === 4 ? '预览新的一周 ↻' : '预览下一天 →'}
            </button>
          </div>
        </div>
        <article className="office-scene-detail">
          <span className="office-detail-number">
            {String(SCENES.findIndex((item) => item.id === scene.id) + 1).padStart(2, '0')} /{' '}
            {SCENES.length}
          </span>
          <small>{scene.location}</small>
          <h2>{scene.title}</h2>
          <div className="office-detail-rule" />
          <h3>亲手做点什么</h3>
          <p>{scene.interaction}</p>
          <h3>好玩在这里</h3>
          <p>{scene.fun}</p>
          {scene.status === 'playable' ? (
            <button
              className="office-primary"
              onClick={() => {
                onPlay(weekSeed);
              }}
            >
              进入这个场景 ↗
            </button>
          ) : (
            <p className="office-planned">场景制作中 · 当前可先体验周一迟到潜入</p>
          )}
          <button
            className="office-text-button"
            onClick={() => {
              setDay(0);
              setSelected('late-arrival');
            }}
          >
            查看已开放的首个场景 →
          </button>
        </article>
      </div>
      <footer>
        <span>共 {SCENES.length} 个场景构想 / 1 个可玩场景</span>
        <button onClick={newWeek}>重新组合一周 ↻</button>
        <span>日程预览不计入通关成绩</span>
      </footer>
    </section>
  );
}
