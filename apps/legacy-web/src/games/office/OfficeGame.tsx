import { useCallback, useEffect, useRef, useState } from 'react';
import { GameChrome } from '../../components/GameChrome';
import { RewardedAdButton } from '../../components/RewardedAdModal';
import { AdMode } from '../../services/adService';
import { SaveData } from '../../services/storage';
import { tick, upgradeCost } from './model';
const days = [
  { name: '周一：假装振作', task: '攒够 16 快乐', chance: 0.2, color: '#b9dfa9' },
  { name: '周二：突击巡查', task: '攒够 24 快乐', chance: 0.27, color: '#ffd95b' },
  { name: '周三：会议地狱', task: '攒够 32 快乐', chance: 0.34, color: '#ffae73' },
  { name: '周四：监控升级', task: '攒够 40 快乐', chance: 0.41, color: '#ff8585' },
  { name: '周五：终极摸鱼', task: '攒够 50 快乐', chance: 0.48, color: '#fb7299' },
];
export function OfficeGame({
  onBack,
  save,
  update,
  adMode,
}: {
  onBack: () => void;
  save: SaveData;
  update: (f: (s: SaveData) => SaveData) => void;
  adMode: AdMode;
}) {
  const [day, setDay] = useState(0);
  const [time, setTime] = useState(22);
  const [joy, setJoy] = useState(0);
  const [total, setTotal] = useState(0);
  const [suspicion, setSuspicion] = useState(0);
  const [slack, setSlackState] = useState(false);
  const [boss, setBoss] = useState(false);
  const [caught, setCaught] = useState(false);
  const [done, setDone] = useState(false);
  const [intro, setIntro] = useState(true);
  const [level, setLevel] = useState(0);
  const [pop, setPop] = useState(0);
  const ended = useRef(false),
    slackRef = useRef(false),
    joyRef = useRef(0);
  const setSlack = useCallback((v: boolean) => {
    slackRef.current = v;
    setSlackState(v);
  }, []);
  const finishCampaign = useCallback(
    (value = total + joyRef.current) => {
      if (ended.current) return;
      ended.current = true;
      setDone(true);
      update((s) => ({
        ...s,
        coins: s.coins + Math.floor(value / 3),
        bestOffice: Math.max(s.bestOffice, value),
        officeDay: 5,
      }));
    },
    [total, update],
  );
  const finishDay = useCallback(() => {
    const sum = total + joyRef.current;
    if (day >= 4) {
      finishCampaign(sum);
      return;
    }
    setTotal(sum);
    setDay((d) => d + 1);
    setTime(22);
    setJoy(0);
    joyRef.current = 0;
    setSuspicion(0);
    setBoss(false);
    setSlack(false);
    setIntro(true);
    update((s) => ({ ...s, coins: s.coins + 5, officeDay: Math.max(s.officeDay, day + 2) }));
  }, [day, finishCampaign, setSlack, total, update]);
  useEffect(() => {
    if (caught || done || intro) return;
    const id = setInterval(() => {
      const watching = Math.random() < days[day].chance;
      setBoss(watching);
      setTime((t) => {
        if (t <= 1) {
          setTimeout(finishDay, 0);
          return 0;
        }
        return t - 1;
      });
      setJoy((j) => {
        const n = tick({ joy: j, suspicion: 0, coins: 0 }, slackRef.current, watching, level).joy;
        if (n > j) {
          setPop((p) => p + 1);
          setTimeout(() => setPop(0), 600);
        }
        joyRef.current = n;
        return n;
      });
      setSuspicion((v) => {
        const n = tick(
          { joy: 0, coins: 0, suspicion: v },
          slackRef.current,
          watching,
          level,
        ).suspicion;
        if (n >= 100) setCaught(true);
        return n;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [caught, day, done, finishDay, intro, level]);
  useEffect(() => {
    const d = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        setSlack(true);
      }
    };
    const u = (e: KeyboardEvent) => {
      if (e.code === 'Space') setSlack(false);
    };
    addEventListener('keydown', d);
    addEventListener('keyup', u);
    return () => {
      removeEventListener('keydown', d);
      removeEventListener('keyup', u);
    };
  }, [setSlack]);
  function restart() {
    ended.current = false;
    joyRef.current = 0;
    setDay(0);
    setTime(22);
    setJoy(0);
    setTotal(0);
    setSuspicion(0);
    setCaught(false);
    setDone(false);
    setIntro(true);
    setSlack(false);
  }
  const cost = upgradeCost(level),
    target = 16 + day * 8;
  return (
    <GameChrome title="打工人摸鱼记" subtitle="五日生存赛 · 一轮约 2 分钟" onBack={onBack}>
      <section
        className={`office game-stage day-${day + 1} ${caught ? 'office-shake' : ''}`}
        style={{ '--day-color': days[day].color } as React.CSSProperties}
      >
        <div className="weekday-track">
          {days.map((d, i) => (
            <i className={i < day ? 'passed' : i === day ? 'current' : ''} key={d.name}>
              {i < day ? '✓' : i + 1}
            </i>
          ))}
        </div>
        {intro && !done ? (
          <div className="day-curtain">
            <small>DAY {day + 1} / 5</small>
            <h1>{days[day].name}</h1>
            <p>
              {days[day].task} · 老板出现率 {Math.round(days[day].chance * 100)}%
            </p>
            <button onClick={() => setIntro(false)}>打卡上班 →</button>
          </div>
        ) : (
          <>
            <div className="office-hud">
              <div>
                <small>下班倒计时</small>
                <b>00:{String(time).padStart(2, '0')}</b>
              </div>
              <div>
                <small>本日 / 总快乐</small>
                <b>
                  {joy} / {total + joy}
                </b>
              </div>
            </div>
            <div className={`boss-signal ${boss ? 'danger' : ''}`}>
              <span>{boss ? '老板正在看你' : '老板背过身了'}</span>
              <i>{boss ? '● 监控中' : '● 安全窗口'}</i>
            </div>
            <div className="desk-scene">
              <div className="scanline" />
              <div className={`boss ${boss ? 'watching' : ''}`}>
                <div className="boss-head">◉</div>
                <div className="boss-body">老板</div>
              </div>
              <div className="cubicle">
                <div className={`monitor ${slack ? 'video-mode' : ''}`}>
                  {slack ? (
                    <>
                      <b>热门视频</b>
                      <span>《如何在周五保持清醒》</span>
                      <i>▶ 12.6万</i>
                    </>
                  ) : (
                    <>
                      <b>Q3_最终版_18.xlsx</b>
                      <span className="sheets">||||||||||||</span>
                      <i>就快算完了…</i>
                    </>
                  )}
                </div>
                <div className={`worker ${slack ? 'vibing' : ''}`}>{slack ? '😎' : '😐'}</div>
                {pop > 0 && (
                  <span className="joy-pop" key={pop}>
                    快乐 +2
                  </span>
                )}
              </div>
            </div>
            <div className="daily-goal">
              <label>
                今日摸鱼目标{' '}
                <b>
                  {Math.min(joy, target)} / {target}
                </b>
              </label>
              <div>
                <i style={{ width: `${Math.min(100, (joy / target) * 100)}%` }} />
              </div>
            </div>
            <div className="meter">
              <label>
                老板疑心值 <b>{suspicion}%</b>
              </label>
              <div>
                <i style={{ width: `${suspicion}%` }} />
              </div>
            </div>
            <button
              className={`slack-button ${slack ? 'pressed' : ''}`}
              onPointerDown={() => setSlack(true)}
              onPointerUp={() => setSlack(false)}
              onPointerCancel={() => setSlack(false)}
              onPointerLeave={() => setSlack(false)}
              disabled={caught || done}
            >
              {slack ? '松手！切回表格' : '按住摸鱼'}
            </button>
            <div className="upgrade-row">
              <span>
                防窥屏 Lv.{level}
                <small>每级减少 2 点被发现时的疑心增长</small>
              </span>
              <button
                disabled={save.coins < cost || level >= 3}
                onClick={() => {
                  update((s) => ({ ...s, coins: s.coins - cost }));
                  setLevel((x) => x + 1);
                }}
              >
                {level >= 3 ? '已满级' : `◈ ${cost} 升级`}
              </button>
            </div>
          </>
        )}
        {(caught || done) && (
          <div className="modal-backdrop">
            <div className={`modal-card ${done ? 'victory-card' : ''}`}>
              <span className="modal-kicker">{caught ? '当场抓获' : '五天通关'}</span>
              <h3>{caught ? '你在工作时间笑出了声' : '周末终于属于你了！'}</h3>
              <p>
                {done
                  ? `本周共攒下 ${total + joy} 快乐，结算 ${Math.floor((total + joy) / 3)} 游戏币。`
                  : `周${'一二三四五'[day]}险些翻车，本日快乐 ${joy}。`}
              </p>
              <div className="modal-actions">
                <button className="button ghost" onClick={restart}>
                  {done ? '再过一周' : '从周一重来'}
                </button>
                {caught && (
                  <RewardedAdButton
                    mode={adMode}
                    label="销毁浏览记录"
                    reward="清除疑心并继续本日"
                    onReward={() => {
                      setSuspicion(15);
                      setCaught(false);
                    }}
                  />
                )}
              </div>
            </div>
          </div>
        )}
      </section>
    </GameChrome>
  );
}
