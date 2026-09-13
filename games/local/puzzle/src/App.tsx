import { useEffect, useReducer, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { caseInfo, deductions, evidence, finalQuestions, suspects, timeline } from './case';
import { availableQuestions, gameReducer, getHint, initialState, loadState } from './game';
import { briefing, sceneItems } from './scene';
import type { SceneItem } from './scene';
import { setSound, sound } from './audio';
import Puzzles from './Puzzles';

const SAVE_KEY = 'rain-case-v1';
const nav = [ ['scene', '现场', 'scan'], ['suspects', '嫌疑人', 'person'], ['evidence', '证据', 'files'], ['timeline', '时间线', 'clock'], ['reasoning', '推理', 'connect'] ] as const;
type Page = typeof nav[number][0];
type ModalState = { type: 'inspect'; id: string } | { type: 'puzzle'; kind: 'photo' | 'phone' | 'camera' } | { type: 'challenge'; questionId: string } | { type: 'ordinary'; title: string; text: string } | { type: 'help' | 'settings' | 'result' | 'brief' };

function Icon({ name, size = 22 }: { name: string; size?: number }) {
  const paths: Record<string, ReactNode> = {
    scan: <><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/><circle cx="11" cy="11" r="4"/><path d="m14 14 4 4"/></>,
    person: <><circle cx="12" cy="7" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/></>,
    files: <><path d="M7 3h12v16H7zM4 7H2v15h13v-1M10 7h6m-6 4h6m-6 4h3"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/></>,
    connect: <><circle cx="5" cy="5" r="3"/><circle cx="19" cy="8" r="3"/><circle cx="9" cy="20" r="3"/><path d="m8 6 8 1M6 8l2 9m8-6-5 6"/></>,
    sound: <><path d="m11 4-6 5H2v6h3l6 5zM15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/></>,
    mute: <><path d="m11 4-6 5H2v6h3l6 5zM16 9l6 6m0-6-6 6"/></>,
    arrow: <path d="M3 12h17m-6-6 6 6-6 6"/>,
    close: <path d="m6 6 12 12M18 6 6 18"/>,
    check: <path d="m4 12 5 5L20 6"/>,
    help: <><circle cx="12" cy="12" r="9"/><path d="M9 8a3 3 0 0 1 6 1c0 2-3 2-3 5m0 3v1"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="m9 3-1 3-3 1-2 3 2 3v4l4 1 3 3 3-3 4-1v-4l2-3-2-3-3-1-1-3z"/></>,
    eye: <><path d="M2 12S6 5 12 5s10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></>,
    lock: <><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4m-4 5v3"/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] || paths.files}</svg>;
}

function Modal({ title, children, onClose, wide = false, notice }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean; notice: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => dialog?.close(); }, []);
  return <dialog ref={ref} aria-labelledby="modal-title" className={`modal ${wide ? 'modal-wide' : ''}`} onCancel={onClose} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="modal-shell"><header className="modal-header"><span id="modal-title">{title}</span><button className="icon-button" onClick={onClose} aria-label="关闭弹窗"><Icon name="close" /></button></header><div className="modal-content">{children}</div>{notice && <div className="modal-notice" role="status" aria-live="polite"><Icon name="files" size={17}/><span>{notice}</span></div>}</div>
  </dialog>;
}

function Portrait({ id, large = false }: { id: string; large?: boolean }) {
  const index = ['lin', 'zhou', 'xu', 'shen'].indexOf(id);
  return <div className={`portrait portrait-${id} ${large ? 'portrait-large' : ''}`} style={{ backgroundPosition: `${index * 100 / 3}% 24%` }} aria-hidden="true"><span className="portrait-fallback">{['林', '周', '许', '沈'][index]}</span><span className="portrait-grain"/></div>;
}

function ConsoleArt() {
  return <svg className="console-art" viewBox="0 0 1000 660" aria-hidden="true"><defs><linearGradient id="console-light" x2="0" y2="1"><stop stopColor="#374846"/><stop offset="1" stopColor="#11191c"/></linearGradient><pattern id="scanlines" width="4" height="5" patternUnits="userSpaceOnUse"><path d="M0 0h4" stroke="#9db3a6" strokeOpacity=".11"/></pattern></defs><rect width="1000" height="660" fill="#141b1e"/><path d="M0 0h1000v110H0z" fill="#1c2627"/><path d="M60 65h880M60 80h880" stroke="#343d3c"/><rect x="110" y="135" width="465" height="300" rx="12" fill="#0a0f10" stroke="#566561" strokeWidth="4"/><rect x="129" y="154" width="427" height="257" fill="url(#console-light)"/><path d="m130 410 118-160h167l141 160M250 250v-94m165 94v-94M270 410v-94h80v94" fill="none" stroke="#82928a" strokeWidth="3"/><rect x="129" y="154" width="427" height="257" fill="url(#scanlines)"/><text x="148" y="183" fill="#96ae9e" fontSize="16" fontFamily="monospace">CAM 01 / NORTH CORRIDOR</text><text x="148" y="391" fill="#b9c8bb" fontSize="20" fontFamily="monospace">2026-09-17 20:10:00</text><rect x="635" y="157" width="270" height="232" rx="10" fill="#080e10" stroke="#4b5c56" strokeWidth="3"/><rect x="650" y="172" width="240" height="199" fill="#303d39"/><path d="M650 300h240v71H650" fill="#26312e"/>{[705, 770, 835].map((x, i) => <g key={x}><circle cx={x} cy={240 + i % 2 * 10} r="20" fill="#78847a"/><path d={`M${x-25} 322v-47q25-25 50 0v47`} fill={i === 1 ? '#89877b' : '#485a52'}/></g>)}<text x="664" y="198" fill="#d2c8a2" fontSize="13" fontFamily="monospace">PREVIEW / ORIGINAL STREAM</text><path d="M20 440h960l20 145H0z" fill="#363e3b"/><path d="M30 450h920M0 587h1000" stroke="#818477" strokeOpacity=".35"/><path d="m250 490 300 0 35 60H220z" fill="#192220" stroke="#535f53"/>{[0,1,2,3].map(row => <path key={row} d={`M${249-row*5} ${501+row*11}h290`} stroke="#70796c" strokeDasharray="13 6"/>)}<path d="m651 458 95-12 35 89-106 15z" fill="#b0ab94"/><path d="m670 476 60-7m-56 22 62-7m-56 22 61-7" stroke="#575b50" strokeWidth="3"/><rect x="110" y="480" width="52" height="43" rx="3" fill="#81745b"/><path d="M162 487h12v26h-12" fill="none" stroke="#81745b" strokeWidth="8"/><rect y="590" width="1000" height="70" fill="#101719"/></svg>;
}

export default function App() {
  const [state, dispatch] = useReducer(gameReducer, undefined, () => { try { return loadState(localStorage.getItem(SAVE_KEY)); } catch { return initialState(); } });
  const [page, setPage] = useState<Page>('scene');
  const [scene, setScene] = useState('room');
  const [list, setList] = useState(false);
  const [modal, setModal] = useState<ModalState | null>(null);
  const [toast, setToast] = useState('');
  const [storageError, setStorageError] = useState(false);
  const [person, setPerson] = useState('zhou');
  const [question, setQuestion] = useState<string | null>(null);
  const [filter, setFilter] = useState('全部');
  const [linkMode, setLinkMode] = useState(false);
  const [links, setLinks] = useState<string[]>([]);
  const [hintStep, setHintStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [resetConfirm, setResetConfirm] = useState(false);
  const hint = getHint(state);
  const activeSuspect = suspects.find(item => item.id === person)!;
  const activeQuestion = activeSuspect.questions.find(item => item.id === question);
  const allQuestions = suspects.flatMap(item => item.questions);
  const knownEvidence = evidence.filter(item => state.evidence.includes(item.id));
  const discoveredTimeline = timeline.filter(item => item.requires.every(id => state.evidence.includes(id) || state.deductions.includes(id) || state.challenged.includes(id)));

  useEffect(() => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); setStorageError(false); } catch { setStorageError(true); } }, [state]);
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(''), 3300); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => { setHintStep(0); }, [hint.id]);
  useEffect(() => {
    const stop = () => { if (document.hidden) setSound(false); };
    document.addEventListener('visibilitychange', stop);
    return () => { document.removeEventListener('visibilitychange', stop); setSound(false); };
  }, []);

  function notify(message: string, tone: 'tap' | 'evidence' | 'wrong' = 'tap') { setToast(message); sound(tone); }
  function collect(id: string) {
    const next = gameReducer(state, { type: 'collect', id });
    dispatch({ type: 'collect', id });
    if (!state.evidence.includes(id) && next.evidence.includes(id)) notify(`证据已归档 · ${evidence.find(item => item.id === id)?.title}`, 'evidence');
  }
  function solve(id: string) {
    const next = gameReducer(state, { type: 'solve', id });
    dispatch({ type: 'solve', id });
    if (!state.puzzles.includes(id) && next.puzzles.includes(id)) notify(id === 'unlock' ? '手机已解锁 · 可以提取数字记录' : '取证完成 · 新线索已归档', 'evidence');
  }
  function changePage(next: Page) { setPage(next); setModal(null); window.scrollTo({ top: 0, behavior: 'instant' }); sound(); }
  function inspect(item: SceneItem) {
    if (item.kind === 'ordinary') setModal({ type: 'ordinary', title: item.label, text: item.text! });
    else if (item.kind) setModal({ type: 'puzzle', kind: item.kind });
    else setModal({ type: 'inspect', id: item.id });
    sound();
  }
  function selectEvidence(id: string) {
    if (!linkMode) { setModal({ type: 'inspect', id }); return; }
    setLinks(old => old.includes(id) ? old.filter(value => value !== id) : old.length < 2 ? [...old, id] : [old[1], id]);
    sound();
  }
  function combine() {
    if (links.length !== 2) return;
    const deduction = deductions.find(item => item.inputs.every(id => links.includes(id)));
    dispatch({ type: 'combine', ids: [links[0], links[1]] });
    if (deduction) { notify(`推理成立 · ${deduction.title}`, 'evidence'); setLinks([]); }
    else if (links.some(id => id.startsWith('statement:'))) notify('证词与记录存在联系时，请回到嫌疑人页面当面质疑。');
    else notify('这两项还不能形成可验证的结论。换一种联系试试。', 'wrong');
  }
  function challenge(questionId: string, evidenceId: string) {
    const q = allQuestions.find(item => item.id === questionId)!;
    const correct = q.challengeEvidence?.includes(evidenceId);
    dispatch({ type: 'challenge', questionId, evidenceId });
    if (correct) { setModal(null); notify('证词已突破 · 改口记录已归档', 'evidence'); }
    else notify(q.wrongResponse || '这份记录不能推翻我说的时间和地点。请先核对它实际证明了什么。', 'wrong');
  }
  function renderInspect(id: string) {
    const item = evidence.find(entry => entry.id === id);
    if (!item) return <p>尚未取得这份记录。</p>;
    const known = state.evidence.includes(id);
    return <div className="inspection"><div className="evidence-document"><div className="document-eyebrow"><span>望潮档案馆 / 现场取证</span><span>FILE {String(evidence.indexOf(item) + 1).padStart(2, '0')}</span></div><div className="document-symbol"><Icon name={item.category === '数字记录' ? 'files' : 'scan'} size={38}/></div><span className="type-label">{item.category} · {item.source}</span><h2>{item.title}</h2><p className="document-summary">{item.summary}</p><div className="document-rule"/><p className="document-detail">{item.detail}</p>{item.time && <div className="document-time"><Icon name="clock" size={16}/>{item.time} · {item.id === 'clock' ? '停钟读数，不可用于定时' : '已校准'}</div>}<span className={`document-stamp ${known ? 'archived' : ''}`}>{known ? '已归档' : '待取证'}</span></div>
      <button className="primary full" disabled={known} onClick={() => collect(id)}><Icon name={known ? 'check' : 'files'} size={18}/>{known ? '已收入证据板' : '收集证据'}</button>
      {id === 'body' && state.evidence.includes('body') && <button className="secondary full" onClick={() => setModal({ type: 'inspect', id: 'watch' })}>进一步检查 · 遗体腕表<Icon name="arrow" size={18}/></button>}
      {id === 'photo' && <button className="secondary full" onClick={() => setModal({ type: 'puzzle', kind: 'photo' })}>重新查看馆庆照片</button>}
      {id === 'phone' && <button className="secondary full" onClick={() => setModal({ type: 'puzzle', kind: 'phone' })}>打开死者手机</button>}
    </div>;
  }

  const modalTitle = modal?.type === 'puzzle' ? ({ photo: '图像检视 / 馆庆合照', phone: '数字取证 / 顾言的手机', camera: '视频取证 / 主楼梯监控' }[modal.kind]) : modal?.type === 'inspect' ? '证物详情' : modal?.type === 'challenge' ? '出示证据 · 谨慎判断' : modal?.type === 'help' ? '调查提示' : modal?.type === 'settings' ? '案件设置' : modal?.type === 'result' ? '结案报告' : modal?.type === 'ordinary' ? modal.title : '第 07 号档案 / 案情简报';

  return <div className={`app ${state.started ? 'in-case' : 'at-start'}`} onPointerDown={() => setSound(!state.muted)} onKeyDown={() => setSound(!state.muted)}>
    {!state.started ? <main className="cover">
      <div className="cover-photo"/><div className="cover-rain" aria-hidden="true"/><div className="cover-vignette"/>
      <header className="cover-header"><div className="brand"><Icon name="files" size={23}/><span>未结案<span className="brand-en">UNSOLVED ARCHIVES</span></span></div><button className="icon-button" aria-label={state.muted ? '开启声音' : '静音'} onClick={() => { dispatch({ type: 'mute' }); setSound(state.muted); }}><Icon name={state.muted ? 'mute' : 'sound'}/></button></header>
      <div className="cover-content"><span className="eyebrow cover-case">CASE FILE <b>007</b><i/>独立完整案件</span><h1>雨停<span>之前</span><em>BEFORE THE RAIN STOPS</em></h1><p className="cover-hook">每个人都藏着秘密。<br/>只有一个人，藏着真相。</p><div className="cover-meta"><span><Icon name="clock" size={15}/>10—20 分钟</span><span>4 名嫌疑人</span><span>沉浸式调查</span></div><button className="primary start-button" onClick={() => { dispatch({ type: 'start' }); dispatch({ type: 'visit', id: 'room' }); setModal({ type: 'brief' }); sound('evidence'); }}>开启档案<Icon name="arrow"/></button><span className="cover-save">自动保存进度 · 建议佩戴耳机</span></div>
      <footer className="cover-footer"><span>望潮档案馆</span><span>2026 / 09 / 17</span><span className="cover-weather">小雨 · 18°C</span></footer>
    </main> : <>
      <header className="topbar"><button className="case-brand" onClick={() => setModal({ type: 'brief' })}><span className="case-number">07</span><span>雨停之前<small>调查进行中 · 望潮档案馆</small></span></button><div className="top-actions"><span className="saved-indicator"><i/>{storageError ? '未能存档' : '已自动存档'}</span><button className="icon-button" aria-label={state.muted ? '开启声音' : '静音'} onClick={() => { dispatch({ type: 'mute' }); setSound(state.muted); }}><Icon name={state.muted ? 'mute' : 'sound'} size={20}/></button><button className="icon-button" aria-label="案件设置" onClick={() => { setModal({ type: 'settings' }); setResetConfirm(false); }}><Icon name="settings" size={20}/></button></div></header>
      {storageError && <div className="storage-warning" role="alert">浏览器未允许保存。当前页面仍可继续调查；关闭页面后进度可能丢失。</div>}
      <main className={`game-main page-${page}`}>
        {page === 'scene' && <>
          <div className="page-heading"><div><span className="eyebrow">CRIME SCENE / 现场勘查</span><h1>雨声掩盖了什么？</h1></div><button className="help-button" aria-label="调查提示" onClick={() => setModal({ type: 'help' })}><Icon name="help" size={18}/><span>调查提示</span></button></div>
          <div className="scene-layout"><section className="scene-primary"><div className="scene-tabs" role="group" aria-label="调查场景"><button className={scene === 'room' ? 'active' : ''} onClick={() => { setScene('room'); dispatch({ type: 'visit', id: 'room' }); }}>01 <span>二楼 · 阅档室</span></button><button className={scene === 'console' ? 'active' : ''} onClick={() => { setScene('console'); dispatch({ type: 'visit', id: 'console' }); }}>02 <span>一楼 · 控制台</span></button></div>
            <div className={`scene-image scene-${scene}`}>
              {scene === 'room' ? <><img src="./assets/scene.png" alt="雨夜中的阅档室：窗边桌面、遗体、门与边柜，编号标记可调查物品"/><svg className="scene-clock-face" viewBox="0 0 1536 1024" aria-hidden="true"><g transform="translate(864 83)"><circle r="40" fill="#9c9888"/>{Array.from({ length: 12 }, (_, i) => <path key={i} d="M0 -33v4" stroke="#363a34" strokeWidth="1.8" transform={`rotate(${i * 30})`}/>)}<path d="M0 0-25.7 4.1M0 0-33.3 10.8" fill="none" stroke="#30352f" strokeWidth="2.5"/><circle r="2.5" fill="#30352f"/></g></svg></> : <ConsoleArt/>}
              <div className="scene-shade"/><div className="scene-coordinate"><span>现场已封锁</span><span>{scene === 'room' ? '02F — ARCHIVE ROOM' : '01F — CONTROL DESK'}</span></div>
              {sceneItems[scene].map((item, index) => <button key={item.id} className={`hotspot ${state.evidence.includes(item.id) || state.puzzles.includes(item.id) ? 'found' : ''}`} style={{ left: `${item.x}%`, top: `${item.y}%` }} aria-label={`调查${item.label}`} onClick={() => inspect(item)}><span className="hotspot-number">{String(index + 1).padStart(2, '0')}</span><span className="hotspot-label">{item.label}</span></button>)}
              <span className="scene-corner scene-corner-tl"/><span className="scene-corner scene-corner-br"/>
            </div>
            <div className="scene-caption"><span><i/>点击编号，检视现场物品</span><button onClick={() => setList(!list)} aria-expanded={list}><Icon name="files" size={16}/>{list ? '收起清单' : '调查清单'}</button></div>
            {list && <div className="scene-list">{sceneItems[scene].map((item, i) => <button key={item.id} onClick={() => inspect(item)}><span className="mono">{String(i + 1).padStart(2, '0')}</span>{item.label}<span className="list-check">{state.evidence.includes(item.id) ? '✓' : '↗'}</span></button>)}</div>}
          </section><aside className="scene-notes"><div className="case-strip"><span className="eyebrow">INVESTIGATION NOTES</span><span className="note-pin"/><h2>一条迟来的消息</h2><p>20:40，顾言发来消息。<br/>21:05，房门被打开时，<br/>他已经没有了呼吸。</p><blockquote>“我还在核对账目，<br/>谁都别上来。”</blockquote><small>消息上的时间，<br/>能证明什么？</small></div><div className="objective"><span className="type-label">当前方向 <span className="mono">{state.deductions.length}/05</span></span><p>{hint.steps[0]}</p><button className="text-button" onClick={() => setModal({ type: 'help' })}>需要一点提示<Icon name="arrow" size={16}/></button></div></aside></div>
          <div className="recent-strip"><span className="eyebrow">最新归档</span>{knownEvidence.length ? <button onClick={() => setModal({ type: 'inspect', id: state.evidence.at(-1)! })}>{evidence.find(item => item.id === state.evidence.at(-1))?.title}<Icon name="arrow" size={17}/></button> : <span>先从遗体、门锁和桌面开始调查。</span>}<span className="mono">{knownEvidence.length} 件证据</span></div>
        </>}

        {page === 'suspects' && <>
          <div className="page-heading"><div><span className="eyebrow">INTERROGATION / 人物问询</span><h1>听见的，不一定是真相。</h1></div><span className="score-pill">判断评分 <b>{state.score}</b></span></div>
          <div className="suspect-strip" role="group" aria-label="选择嫌疑人">{suspects.map((suspect, i) => <button key={suspect.id} className={`suspect-choice ${person === suspect.id ? 'active' : ''}`} onClick={() => { setPerson(suspect.id); setQuestion(null); }}><Portrait id={suspect.id}/><span className="suspect-choice-name">{suspect.name}<small>{suspect.role}</small></span><span className="suspect-index">0{i + 1}</span>{suspect.questions.some(q => state.challenged.includes(q.id)) && <span className="questioned-dot" title="已有改口证词"/>}</button>)}</div>
          <div className="interrogation-layout"><aside className="suspect-dossier"><div className="eyebrow">SUBJECT / 人物档案</div><h2>{activeSuspect.name}<small>{activeSuspect.age} 岁</small></h2><p>{activeSuspect.description}</p><dl><dt>身份</dt><dd>{activeSuspect.role}</dd><dt>关系</dt><dd>{activeSuspect.relation}</dd><dt>印象</dt><dd>{activeSuspect.personality}</dd></dl><span className="dossier-note">先询问，再用已找到的证据质疑。<br/>有秘密，不等于有罪。</span></aside>
          <section className="interrogation"><div className="interrogation-status"><span className="recording-dot"/>问询记录<span>REC / {activeSuspect.name}</span></div><div className={`testimony ${activeQuestion && state.challenged.includes(activeQuestion.id) ? 'shaken' : ''}`} aria-live="polite">
            {activeQuestion ? <><span className="type-label">{state.challenged.includes(activeQuestion.id) ? '证据质疑后 · 改口' : '当前证词'}</span><blockquote>“{state.challenged.includes(activeQuestion.id) ? activeQuestion.rebuttal : activeQuestion.answer}”</blockquote>{state.challenged.includes(activeQuestion.id) ? <div className="breakthrough"><Icon name="check" size={17}/>这段证词已被突破，改口记录可在证据板查看。</div> : <button className="challenge-button" onClick={() => setModal({ type: 'challenge', questionId: activeQuestion.id })}><Icon name="scan" size={18}/>质疑这句话<span>出示证据 →</span></button>}</> : <div className="testimony-empty"><span className="quotation-mark">“</span><p>{activeSuspect.name}在等你开口。</p><small>选择一个话题，听听对方的说法。</small></div>}
          </div><div className="topic-list"><span className="eyebrow">询问话题</span>{activeSuspect.questions.map((q, i) => { const locked = !availableQuestions(state, activeSuspect).some(item => item.id === q.id); return <button key={q.id} className={`topic ${question === q.id ? 'selected' : ''}`} disabled={locked} onClick={() => { setQuestion(q.id); dispatch({ type: 'ask', id: q.id }); sound(); }}><span className="mono">{locked ? <Icon name="lock" size={16}/> : `0${i + 1}`}</span><span>{locked ? '尚未解锁的话题' : q.title}{locked && <small>先寻找：{q.requires?.map(id => evidence.find(item => item.id === id)?.title).join('、')}</small>}</span><span className="topic-state">{locked ? '' : state.challenged.includes(q.id) ? '已突破' : state.asked.includes(q.id) ? '已询问' : '↗'}</span></button>; })}</div></section></div>
        </>}

        {page === 'evidence' && <>
          <div className="page-heading"><div><span className="eyebrow">EVIDENCE BOARD / 证据板</span><h1>孤立的线索，还不是答案。</h1></div><button className={`secondary ${linkMode ? 'selected' : ''}`} onClick={() => { setLinkMode(!linkMode); setLinks([]); }}><Icon name="connect" size={18}/>{linkMode ? '结束关联' : '建立关联'}</button></div>
          <div className="board-tools"><div className="filters" role="group" aria-label="证据类型">{['全部', '物证', '数字记录', '证词', '人物', '时间'].map(type => <button key={type} className={filter === type ? 'active' : ''} onClick={() => setFilter(type)}>{type}</button>)}</div><span className="mono">{knownEvidence.length} EVIDENCE</span></div>
          {linkMode && <div className="link-tray"><span>{links.length ? links.map(id => evidence.find(item => item.id === id)?.title || allQuestions.find(q => `statement:${q.id}` === id)?.title).join(' ＋ ') : '选择两条证据，检验它们之间的联系。'}</span><button className="primary" disabled={links.length !== 2} onClick={combine}>验证关联<Icon name="connect" size={17}/></button></div>}
          <div className="evidence-board">{knownEvidence.filter(item => filter === '全部' || item.category === filter).map(item => <button key={item.id} data-evidence={item.id} className={`evidence-card ${links.includes(item.id) ? 'link-selected' : ''}`} onClick={() => selectEvidence(item.id)}><span className="evidence-pin"/><div className="evidence-card-top"><span>{item.category}</span><span className="mono">#{String(evidence.indexOf(item) + 1).padStart(2, '0')}</span></div><div className="evidence-card-art"><Icon name={item.category === '数字记录' ? 'files' : item.category === '时间' ? 'clock' : 'scan'} size={30}/>{item.time && <span>{item.time}</span>}</div><h3>{item.title}</h3><p>{item.summary}</p><div className="evidence-card-foot"><span>{item.source}</span><span>{links.includes(item.id) ? '已选择 ✓' : linkMode ? '选择 +' : '检视 ↗'}</span></div></button>)}
            {(filter === '全部' || filter === '证词') && allQuestions.filter(q => state.asked.includes(q.id)).map(q => <button key={q.id} data-evidence={`statement:${q.id}`} className={`evidence-card testimony-card ${links.includes(`statement:${q.id}`) ? 'link-selected' : ''}`} onClick={() => linkMode ? selectEvidence(`statement:${q.id}`) : setModal({ type: 'ordinary', title: `${suspects.find(s => s.questions.some(questionItem => questionItem.id === q.id))?.name} · 证词`, text: state.challenged.includes(q.id) ? `${q.answer}\n\n质疑后改口：${q.rebuttal}` : q.answer })}><span className="evidence-pin"/><span className="type-label">证词 · {suspects.find(s => s.questions.some(questionItem => questionItem.id === q.id))?.name}</span><h3>{q.title}</h3><p>“{q.answer}”</p><div className="evidence-card-foot">{state.challenged.includes(q.id) ? '已发现矛盾 / 改口' : '未经验证的陈述'}</div></button>)}
            {filter === '人物' && suspects.map(suspect => <button className="board-person" key={suspect.id} onClick={() => { setPerson(suspect.id); changePage('suspects'); }}><Portrait id={suspect.id}/><div><h3>{suspect.name}</h3><p>{suspect.age} 岁 · {suspect.role}</p><small>{suspect.relation}</small></div><Icon name="arrow"/></button>)}
            {filter === '时间' && discoveredTimeline.map(item => <button className="evidence-card timeline-card" key={item.id} onClick={() => changePage('timeline')}><span className="mono">{item.time}</span><h3>{item.title}</h3><p>{item.detail}</p></button>)}
          </div>
          {knownEvidence.length === 0 && <div className="empty-state"><Icon name="files" size={42}/><h2>证据板还空着</h2><p>在现场检视物品后，点击“收集证据”。</p><button className="secondary" onClick={() => changePage('scene')}>返回现场</button></div>}
          <section className="deduction-section"><div className="section-title"><h2>已经成立的推理</h2><span className="mono">{state.deductions.length} / 05</span></div>{state.deductions.length ? deductions.filter(item => state.deductions.includes(item.id)).map(item => <div className="deduction" key={item.id}><Icon name="connect"/><div><h3>{item.title}</h3><p>{item.detail}</p><small>{item.inputs.map(id => evidence.find(e => e.id === id)?.title).join(' ＋ ')}</small></div><Icon name="check" size={18}/></div>) : <p className="muted">点击“建立关联”，将两份记录放到一起。只有可验证的联系才会成为结论。</p>}</section>
        </>}

        {page === 'timeline' && <>
          <div className="page-heading"><div><span className="eyebrow">RECONSTRUCTION / 时间重建</span><h1>重新排列，那一夜。</h1></div><span className="mono heading-count">{discoveredTimeline.length}/{timeline.length} 已还原</span></div><div className="timeline-intro"><Icon name="clock"/><p>记录会随取证补全。<strong>发送时间、目击时间、死亡时间，是三件不同的事。</strong></p></div>
          <div className="timeline">{timeline.map(item => { const known = discoveredTimeline.includes(item); return <article className={`timeline-event ${known ? 'known' : 'unknown'} ${item.time === '20:40' ? 'suspicious' : ''}`} key={item.id}><div className="timeline-time">{known ? item.time : '??:??'}</div><div className="timeline-node"/><div className="timeline-content"><span className="type-label">{known ? '已取得原始记录' : '待调查'}</span><h2>{known ? item.title : '这一段时间，还缺少一份记录。'}</h2>{known && <p>{item.detail}</p>}{known && item.requires.map(id => { const ev = evidence.find(entry => entry.id === id); return ev && <button className="timeline-source" key={id} onClick={() => setModal({ type: 'inspect', id })}>{ev.title} ↗</button>; })}</div></article>; })}</div>
        </>}

        {page === 'reasoning' && <>
          <div className="page-heading"><div><span className="eyebrow">FINAL DEDUCTION / 最终推理</span><h1>让每一条线索，指向同一个人。</h1></div></div><div className="final-layout"><aside className="final-note"><span className="eyebrow">CLOSING THE CASE</span><div className="large-case-number">07<span>/ 结案</span></div><h2>指认，需要理由。</h2><p>选出凶手只是开始。提交完整的作案时间、方式、动机，以及能够推翻谎言和证明进入条件的证据。</p><div className="chain-progress"><span>已建立推理</span><strong>{state.deductions.length}<small> / 5</small></strong><div className="progress-track"><i style={{ width: `${state.deductions.length * 20}%` }}/></div></div><span className="muted">提交后可回到调查、补充证据。<br/>猜对名字不等于完整破案。</span>{state.report && <button className="secondary full" onClick={() => setModal({ type: 'result' })}>查看上次结案报告 · {state.report.grade}</button>}</aside>
          <form className="deduction-form" onSubmit={event => { event.preventDefault(); dispatch({ type: 'submit', answers }); setModal({ type: 'result' }); sound('evidence'); }}>
            {finalQuestions.map((item, index) => <label className="final-field" key={item.id}><span className="final-field-number">0{index + 1}</span><span className="final-field-content"><span>{item.label}</span><select required aria-label={item.label} name={item.id} value={answers[item.id] || ''} onChange={event => setAnswers(old => ({ ...old, [item.id]: event.target.value }))}><option value="" disabled>选择你的推断</option>{item.options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></span></label>)}
            <button className="primary full submit-case" type="submit">提交完整推理<Icon name="arrow" size={19}/></button><p className="form-footnote">S 完整破案 · A 找到真凶 · B 证据不足 · C 指认错误</p>
          </form></div>
        </>}
      </main>
      <nav className="bottom-nav" aria-label="主要导航">{nav.map(([id, label, icon]) => <button key={id} className={page === id ? 'active' : ''} aria-current={page === id ? 'page' : undefined} onClick={() => changePage(id)}><Icon name={icon}/><span>{label}</span>{id === 'evidence' && knownEvidence.length > 0 && <small>{knownEvidence.length}</small>}</button>)}</nav>
    </>}
    {modal && <Modal title={modalTitle} notice={toast} onClose={() => setModal(null)} wide={modal.type === 'puzzle' && modal.kind !== 'phone'}>
      {modal.type === 'inspect' && renderInspect(modal.id)}
      {modal.type === 'puzzle' && <Puzzles kind={modal.kind} solved={state.puzzles} onSolve={solve} onCollect={collect}/>}
      {modal.type === 'ordinary' && <div className="ordinary-inspection"><Icon name="eye" size={38}/><h2>{modal.title}</h2><p>{modal.text}</p><button className="secondary full" onClick={() => setModal(null)}>继续调查</button></div>}
      {modal.type === 'brief' && <div className="briefing"><span className="eyebrow">CASE FILE / 007</span><h2>{caseInfo.title}</h2><span className="briefing-location">{briefing.location} · {briefing.date}</span><p>{briefing.text}</p><div className="briefing-steps"><span><Icon name="scan"/>搜索现场，主动收集证据</span><span><Icon name="person"/>当面质疑，交叉核验证词</span><span><Icon name="connect"/>连接证据，提交完整推理</span></div><button className="primary full" onClick={() => setModal(null)}>进入现场<Icon name="arrow"/></button></div>}
      {modal.type === 'help' && <div className="hints"><span className="eyebrow">一点方向，不急着揭晓答案</span><h2>下一步，可以试试……</h2>{hint.steps.slice(0, hintStep + 1).map((step, i) => <p className="hint-step" key={step}><span>0{i + 1}</span>{step}</p>)}<button className="secondary full" disabled={hintStep >= hint.steps.length - 1} onClick={() => setHintStep(step => step + 1)}>{hintStep >= hint.steps.length - 1 ? '当前阶段的提示已展开' : '再给我一点提示'}</button><small>提示不扣分。所有现场热点也能从“调查清单”进入。</small></div>}
      {modal.type === 'challenge' && <div className="challenge-picker"><blockquote>“{allQuestions.find(q => q.id === modal.questionId)?.answer}”</blockquote><p>哪份证据能够直接推翻这句话？<br/><span className="muted">不同的错误质疑首次扣 5 分；评分不会阻止继续调查。</span></p><div className="challenge-options">{knownEvidence.map(item => <button key={item.id} data-challenge-evidence={item.id} onClick={() => challenge(modal.questionId, item.id)}><Icon name={item.category === '数字记录' ? 'files' : 'scan'} size={19}/><span>{item.title}<small>{item.summary}</small></span><span>出示 ↗</span></button>)}</div>{!knownEvidence.length && <p className="empty-state">还没有可出示的证据，先回到现场调查。</p>}</div>}
      {modal.type === 'settings' && <div className="settings"><h2>案件设置</h2><button className="setting-row" onClick={() => { dispatch({ type: 'mute' }); setSound(state.muted); }}><span>雨声与取证音效</span><strong>{state.muted ? '已关闭' : '已开启'}</strong></button><p>已收集 {state.evidence.length} 件证据 · 已建立 {state.deductions.length} 项推理</p><p className="muted">进度保存在当前浏览器。清除浏览器数据会清除存档。声音在首次交互后播放，切到后台自动暂停。</p>{resetConfirm ? <div className="reset-confirm"><p>重新开始会清空本浏览器的案件进度。</p><button className="danger full" onClick={() => { dispatch({ type: 'reset' }); setAnswers({}); setQuestion(null); setLinks([]); setPage('scene'); setScene('room'); setModal(null); setList(false); setResetConfirm(false); }}>确认清空并重开</button><button className="secondary full" onClick={() => setResetConfirm(false)}>保留当前进度</button></div> : <button className="danger full" onClick={() => setResetConfirm(true)}>重新开始案件</button>}</div>}
      {modal.type === 'result' && state.report && <div className={`report grade-${state.report.grade}`}><span className="eyebrow">CASE 007 / INVESTIGATION REPORT</span><div className="report-grade">{state.report.grade}<span>{({ S: '完整破案', A: '找到真凶', B: '证据不足', C: '指认错误' })[state.report.grade]}</span></div><p className="report-lead">{state.report.grade === 'S' ? '雨会抹去脚印，抹不去每条记录之间的联系。你还原了这一夜。' : state.report.grade === 'A' ? '你找到了真凶。还有推理细节，或调查判断的严谨性，可以做得更好。' : state.report.grade === 'B' ? '指认还缺少可以复核的证据链。把猜测变成有依据的结论。' : '这个人无法解释全部原始记录。回到现场，重新核对作案时间与进入条件。'}</p><div className="report-stats"><span>推理正确<strong>{state.report.correct}/{state.report.total}</strong></span><span>判断评分<strong>{state.report.score}</strong></span><span>证据归档<strong>{state.evidence.length}</strong></span></div>
        {state.report.missing.length > 0 && <div className="report-missing"><h3>尚待补全</h3><ul>{state.report.missing.map(item => <li key={item}>{item}</li>)}</ul></div>}
        {(state.report.grade === 'S' || state.report.grade === 'A') && <div className="truth-reconstruction"><h3>案情复原</h3><p>顾言在19:48预约了20:40的工作消息。林岑在20:24用本人指纹进入阅档室，20:26用铜镇纸袭击顾言，20:28关门离开。那扇门会自动落锁。</p><p>主监控与独立门锁互相印证；腕表的冲击记录重新定位了时间。周屿、许曼和沈砚的连续直播，解释了为什么那些秘密并不等于杀人。</p><p>林岑想藏住的，是21:00将被公开的藏品调包与伪造账目。迟发的消息只是让她误以为，时间会站在自己这一边。</p></div>}
        <button className="primary full" onClick={() => setModal(null)}>{state.report.grade === 'S' ? '返回案卷 · 继续查看' : '返回调查 · 补全推理'}<Icon name="arrow" size={18}/></button></div>}
    </Modal>}
    {toast && !modal && <div className="toast" role="status" aria-live="polite"><Icon name="files" size={18}/><span>{toast}</span></div>}
  </div>;
}
