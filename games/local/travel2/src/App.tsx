import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Scene } from './Scene';
import { chapters, chapterAt } from './journey';
import { useJourney } from './store';
import { createSoundscape } from './audio';

gsap.registerPlugin(ScrollTrigger);

function Icon({ name }: { name: 'sound' | 'mute' | 'book' | 'arrow' | 'close' | 'download' }) {
  const paths = {
    sound: (
      <>
        <path d="M11 5 6 9H3v6h3l5 4V5Z" />
        <path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" />
      </>
    ),
    mute: (
      <>
        <path d="M11 5 6 9H3v6h3l5 4V5Z" />
        <path d="m16 9 5 6m0-6-5 6" />
      </>
    ),
    book: (
      <>
        <path d="M12 6C9 3 5 4 2 5v14c3-1 7-2 10 1 3-3 7-2 10-1V5c-3-1-7-2-10 1Z" />
        <path d="M12 6v14" />
      </>
    ),
    arrow: <path d="M12 3v18m-6-6 6 6 6-6" />,
    close: <path d="m5 5 14 14M19 5 5 19" />,
    download: (
      <>
        <path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5" />
      </>
    ),
  };
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

export function App() {
  const [progress, setProgress] = useState(0);
  const [sound, setSound] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(
    () => matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const [modal, setModal] = useState<'journal' | number | null>(null);
  const [notice, setNotice] = useState('');
  const [exporting, setExporting] = useState(false);
  const journeyRef = useRef<HTMLElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const soundscape = useRef<ReturnType<typeof createSoundscape> | null>(null);
  const { stamps, collect, storageAvailable } = useJourney();
  const index = chapterAt(progress);
  const chapter = chapters[index];
  const opening = progress < 0.025;
  const finished = progress >= 0.965;
  const selected = typeof modal === 'number' ? chapters[modal] : null;

  useEffect(() => {
    const query = matchMedia('(prefers-reduced-motion: reduce)');
    const changed = () => setReducedMotion(query.matches);
    query.addEventListener('change', changed);
    soundscape.current = createSoundscape(() => {
      soundscape.current?.enable(false);
      setSound(false);
      setNotice('声音暂时无法播放，可以继续游览。');
    });
    return () => {
      query.removeEventListener('change', changed);
      soundscape.current?.dispose();
    };
  }, []);

  useEffect(() => {
    const trigger = ScrollTrigger.create({
      trigger: journeyRef.current,
      start: 'top top',
      end: 'bottom bottom',
      onUpdate: (self) => setProgress(self.progress),
      // Browser scroll restoration can refresh without a tween update or another scroll event.
      onRefresh: (self) => setProgress(self.progress),
    });
    trigger.refresh();
    setProgress(trigger.progress);
    return () => trigger.kill();
  }, []);

  useEffect(() => {
    if (modal === null) return;
    const dialog = dialogRef.current!;
    const previousOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    dialog.showModal();
    return () => {
      dialog.close();
      document.documentElement.style.overflow = previousOverflow;
    };
  }, [modal]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(''), 3500);
    return () => clearTimeout(timeout);
  }, [notice]);

  function travelTo(next: number) {
    setModal(null);
    window.scrollTo({
      top: Math.max(0, Math.min(1, next)) * (document.documentElement.scrollHeight - innerHeight),
      behavior: reducedMotion ? 'instant' : 'smooth',
    });
  }

  function toggleSound() {
    soundscape.current?.enable(!sound);
    setSound(!sound);
  }

  async function savePostcard() {
    setExporting(true);
    try {
      const picture = new Image();
      picture.src = `${import.meta.env.BASE_URL}art/bund-night.webp`;
      await picture.decode();
      const canvas = document.createElement('canvas');
      canvas.width = 1200;
      canvas.height = 1500;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas unavailable');
      ctx.fillStyle = '#eee8d8';
      ctx.fillRect(0, 0, 1200, 1500);
      const cropWidth = picture.height * 1.2;
      ctx.drawImage(
        picture,
        (picture.width - cropWidth) / 2,
        0,
        cropWidth,
        picture.height,
        50,
        50,
        1100,
        916,
      );
      ctx.fillStyle = '#263f37';
      ctx.font = '64px serif';
      ctx.fillText('外滩 · 一江入梦', 70, 1080);
      ctx.font = '24px serif';
      ctx.fillText('THE BUND  /  SHANGHAI     一路江风，四枚回忆。', 74, 1130);
      chapters.forEach((item, i) => {
        const x = 95 + i * 277;
        ctx.strokeStyle = '#a44a35';
        ctx.lineWidth = 2;
        ctx.strokeRect(x, 1205, 165, 165);
        ctx.fillStyle = '#a44a35';
        ctx.font = '58px serif';
        ctx.fillText(item.glyph, x + 51, 1288);
        ctx.font = '24px serif';
        ctx.fillText(item.stamp, x + 33, 1335);
      });
      ctx.fillStyle = '#6f796a';
      ctx.font = '20px serif';
      ctx.fillText('小行记  ·  把风景走成回忆', 74, 1440);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('Export unavailable');
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = '外滩-一江入梦.png';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      setNotice('明信片已生成，愿江风伴你下一程。');
    } catch {
      setNotice('明信片暂时未能生成，请再试一次。');
    } finally {
      setExporting(false);
    }
  }

  return (
    <main
      ref={journeyRef}
      className={`journey ${progress > 0.7 ? 'is-night' : ''}`}
      style={{ '--journey-progress': progress } as CSSProperties}
      data-chapter={index}
    >
      <div className="stage">
        <Scene progress={progress} reducedMotion={reducedMotion} />
        <div className="paper-light" aria-hidden="true" />
        <header className="topbar">
          <a
            className="brand"
            href="#"
            onClick={(e) => {
              e.preventDefault();
              travelTo(0);
            }}
            aria-label="小行记，回到开场"
          >
            <span className="brand-seal">行</span>
            <span>
              小行记<small>A LITTLE WANDER</small>
            </span>
          </a>
          <span className="location">
            中国 · 上海 <span> / </span> 31°14′ N · 121°29′ E
          </span>
          <div className="header-actions">
            <button
              className="icon-button sound-button"
              aria-label={sound ? '关闭环境音' : '开启环境音'}
              aria-pressed={sound}
              onClick={toggleSound}
            >
              <Icon name={sound ? 'sound' : 'mute'} />
              <span>{sound ? '江风已开启' : '听一听江风'}</span>
            </button>
            <button
              className="icon-button"
              aria-label="打开旅行手账"
              onClick={() => setModal('journal')}
            >
              <Icon name="book" />
              <span className="journal-label">旅行手账</span>
              <span className="count" data-testid="stamp-count">
                {stamps.length} / 4
              </span>
            </button>
          </div>
        </header>

        <div
          className={`story-copy ${opening ? 'is-opening' : ''}`}
          key={opening ? 'opening' : index}
        >
          <p className="eyebrow">
            {opening
              ? '一 城 一 卷  /  SHANGHAI'
              : `${chapter.number} / ${chapter.label} · ${chapter.time}`}
          </p>
          <h1>{opening ? '外滩' : chapter.title}</h1>
          {opening && <p className="english-title">THE BUND</p>}
          <p className="story-line">{opening ? '一江入梦，一步一光阴。' : chapter.line}</p>
          {opening && (
            <p className="intro-description">
              沿着黄浦江，走进一幅会呼吸的画卷。
              <br />
              从晨雾到华灯，拾起四枚属于你的回忆。
            </p>
          )}
        </div>

        <aside className="side-note" aria-hidden="true">
          <span>把 风 景 走 成 回 忆</span>
          <i />
          <span>上海 · 外滩</span>
        </aside>
        <nav className="chapter-rail" aria-label="选择游览章节">
          {chapters.map((item, i) => (
            <button
              key={item.id}
              className={index === i ? 'active' : ''}
              aria-current={index === i ? 'step' : undefined}
              aria-label={`前往第${i + 1}幕：${item.title}`}
              onClick={() => travelTo(i * 0.25 + 0.09)}
            >
              <span>{item.number}</span>
              <i /> <span className="rail-label">{item.label}</span>
            </button>
          ))}
        </nav>

        {!opening && !finished && (
          <button
            data-testid="collect-stamp"
            className={`landmark landmark-${index} ${stamps.includes(chapter.id) ? 'is-collected' : ''}`}
            onClick={() => setModal(index)}
            aria-label={`探索${chapter.place}`}
          >
            <span className="landmark-dot">{stamps.includes(chapter.id) ? '✓' : '+'}</span>
            <span className="landmark-label">
              <small>{chapter.place}</small>
              {stamps.includes(chapter.id) ? '再看一眼这段回忆' : chapter.action}
              <span className="landmark-hint">
                {stamps.includes(chapter.id) ? '已收入手账' : '轻点探索 · 收集印章'}
              </span>
            </span>
          </button>
        )}

        {finished && (
          <section className="ending">
            <span className="eyebrow">此行，值得珍藏</span>
            <h2>江风有信，后会有期。</h2>
            <p>
              {stamps.length === 4
                ? '四枚印章，一份完整的外滩回忆。'
                : `已拾起 ${stamps.length} 枚回忆，还有风景等你回望。`}
            </p>
            <button className="primary-button" onClick={() => setModal('journal')}>
              {stamps.length === 4 ? '打开我的旅行手账' : '看看遗漏的风景'} <Icon name="book" />
            </button>
            <button className="text-button" onClick={() => travelTo(0)}>
              再沿江走一遍 ↺
            </button>
          </section>
        )}

        <footer className="journey-footer">
          <div className="footer-place">
            <span className="tiny-seal">沪</span>
            <span>
              {opening ? '外滩 · 黄浦江畔' : chapter.place}
              <small>
                {opening ? 'A DAY ALONG THE HUANGPU RIVER' : `${chapter.time} / ${chapter.title}`}
              </small>
            </span>
          </div>
          {opening ? (
            <button
              data-testid="begin-journey"
              className="begin-button"
              onClick={() => travelTo(0.09)}
            >
              <span>
                开启这段漫步<small>向上滑动 / 向下滚动</small>
              </span>
              <Icon name="arrow" />
            </button>
          ) : (
            <button
              className="next-button"
              onClick={() => travelTo(finished ? 0 : index < 3 ? (index + 1) * 0.25 + 0.09 : 1)}
            >
              {finished
                ? '回到晨光'
                : index < 3
                  ? `继续漫步 · ${chapters[index + 1].label}`
                  : '走到旅程尽头'}
              <Icon name="arrow" />
            </button>
          )}
          <span className="page-number">
            {chapter.number}
            <span> / 04</span>
          </span>
        </footer>
        <div className="progress-track" aria-hidden="true">
          <div />
        </div>
      </div>

      {modal !== null && (
        <dialog
          ref={dialogRef}
          className={`travel-dialog ${modal === 'journal' ? 'journal-dialog' : ''}`}
          aria-labelledby="dialog-title"
          onCancel={() => setModal(null)}
          onClick={(e) => {
            if (e.target === e.currentTarget) setModal(null);
          }}
        >
          <div className="dialog-content">
            <button
              className="dialog-close icon-button"
              aria-label="关闭弹窗"
              onClick={() => setModal(null)}
            >
              <Icon name="close" />
            </button>
            {selected ? (
              <>
                <p className="eyebrow">拾光 · {selected.number} / 04</p>
                <span
                  className={`large-stamp ${stamps.includes(selected.id) ? 'stamped' : ''}`}
                  aria-hidden="true"
                >
                  <b>{selected.glyph}</b>
                  <span>{selected.stamp}</span>
                </span>
                <p className="place-caption">{selected.place}</p>
                <h2 id="dialog-title">{selected.stamp}</h2>
                <p className="detail-copy">{selected.detail}</p>
                {stamps.includes(selected.id) ? (
                  <>
                    <p className="collected-note" role="status">
                      ✓ 这一刻，已收入你的旅行手账
                    </p>
                    <button className="primary-button" onClick={() => setModal(null)}>
                      收好回忆 <span aria-hidden="true">→</span>
                    </button>
                  </>
                ) : (
                  <button
                    className="primary-button"
                    onClick={() => {
                      collect(selected.id);
                      soundscape.current?.stamp();
                    }}
                  >
                    盖上这一枚 <span aria-hidden="true">＋</span>
                  </button>
                )}
              </>
            ) : (
              <>
                <p className="eyebrow">MY LITTLE TRAVEL JOURNAL</p>
                <h2 id="dialog-title">一江风景，四枚回忆。</h2>
                <p className="journal-intro">
                  {stamps.length === 4
                    ? '你把外滩的一天，装进了这本手账。'
                    : '轻点未收集的印章，回到那一幕继续探索。'}
                </p>
                <div className="stamp-grid">
                  {chapters.map((item, i) => (
                    <button
                      key={item.id}
                      className={`journal-stamp ${stamps.includes(item.id) ? 'stamped' : ''}`}
                      aria-label={`${item.stamp}，${stamps.includes(item.id) ? '已收集，前往重温' : '未收集，前往探索'}`}
                      onClick={() => travelTo(i * 0.25 + 0.09)}
                    >
                      <span>{item.glyph}</span>
                      <b>{item.stamp}</b>
                      <small>{stamps.includes(item.id) ? '已珍藏' : '待发现'}</small>
                    </button>
                  ))}
                </div>
                <p className="journal-total">
                  今日回忆 <strong>{stamps.length} / 4</strong>
                </p>
                {stamps.length === 4 ? (
                  <button
                    className="primary-button"
                    disabled={exporting}
                    onClick={() => void savePostcard()}
                  >
                    {exporting ? '正在装裱…' : '保存我的外滩明信片'}
                    <Icon name="download" />
                  </button>
                ) : (
                  <button
                    className="primary-button"
                    onClick={() =>
                      travelTo(
                        chapters.findIndex((item) => !stamps.includes(item.id)) * 0.25 + 0.09,
                      )
                    }
                  >
                    继续收集回忆 <span>→</span>
                  </button>
                )}
              </>
            )}
            {!storageAvailable && (
              <p className="storage-note">浏览器暂不允许保存，印章将保留到本次游览结束。</p>
            )}
            <div className="dialog-notice" role="status">
              {notice}
            </div>
          </div>
        </dialog>
      )}
      {modal === null && (
        <div className="toast" role="status">
          {notice}
        </div>
      )}
      <p className="screen-reader-only">
        滚动探索外滩四幕风景，也可用章节导航或继续漫步按钮前进。探索每幕地标，收集四枚印章后保存明信片。
      </p>
    </main>
  );
}
