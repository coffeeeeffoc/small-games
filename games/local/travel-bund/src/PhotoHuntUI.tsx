import { CameraIcon } from './HudActions';
import { photoHunts, isPhotoHuntUnlocked, type PhotoHunt, type PhotoHuntSave } from './photo-hunts';

const images = import.meta.glob<string>('./assets/photo-hunts/*.webp', {
  eager: true,
  query: '?url',
  import: 'default',
});
export const huntImage = (hunt: PhotoHunt) => images[`./${hunt.referenceImage}`];

export function HuntMenu({
  save,
  onChoose,
}: {
  save: PhotoHuntSave;
  onChoose: (hunt: PhotoHunt) => void;
}) {
  return (
    <>
      <h2>凭一张照片，找回风景。</h2>
      <p className="muted hunt-subtitle">
        看照片 · 找地点 · 拍照确认　{save.completed.length} / {photoHunts.length}
      </p>
      <div className="hunt-levels">
        {photoHunts.map((hunt, index) => {
          const unlocked = isPhotoHuntUnlocked(save, hunt.id),
            complete = save.completed.includes(hunt.id);
          return (
            <button
              key={hunt.id}
              disabled={!unlocked}
              onClick={() => onChoose(hunt)}
              aria-label={`第${index + 1}关 ${hunt.title}`}
              className={complete ? 'hunt-complete' : ''}
            >
              <img src={huntImage(hunt)} alt={unlocked ? `${hunt.title}的参考照片` : ''} />
              <span className="hunt-number">0{index + 1}</span>
              <strong>{hunt.title}</strong>
              <small>
                {complete
                  ? '已通过 · 可以重拍 ✓'
                  : unlocked
                    ? '查看照片，出发寻找 ↗'
                    : '完成上一关后解锁'}
              </small>
            </button>
          );
        })}
      </div>
    </>
  );
}

export function HuntBrief({
  hunt,
  playing,
  onStart,
  onMenu,
}: {
  hunt: PhotoHunt;
  playing: boolean;
  onStart: () => void;
  onMenu: () => void;
}) {
  return (
    <>
      <h2>{hunt.title}</h2>
      <div className="hunt-brief">
        <figure className="hunt-reference">
          <img src={huntImage(hunt)} alt={`${hunt.title}的参考照片`} />
          <figcaption>参考照片</figcaption>
        </figure>
        <div className="hunt-instructions">
          <p>{hunt.clue}</p>
          <p className="muted">找到相同的江边视角，把地标收入镜头，再按拍照。</p>
          <details className="hunt-hint">
            <summary>找景提示</summary>
            <p>{hunt.hint}</p>
          </details>
          <button className="primary panel-primary" onClick={onStart}>
            {playing ? '继续寻找' : '开始寻找'}
          </button>
          <button className="hunt-menu-link" onClick={onMenu}>
            查看关卡
          </button>
        </div>
      </div>
    </>
  );
}

export function HuntTask({
  hunt,
  practice,
  onOpen,
}: {
  hunt: PhotoHunt;
  practice: boolean;
  onOpen: () => void;
}) {
  return (
    <button className="hunt-task" aria-label="查看寻景照片" onClick={onOpen}>
      <img src={huntImage(hunt)} alt="" />
      <span>
        <strong>
          {practice ? '开发试玩 · ' : ''}
          {hunt.title}
        </strong>
        <small>找回照片的视角 · 点击看大图</small>
      </span>
      <CameraIcon />
    </button>
  );
}

export function HuntResult({
  hunt,
  photo,
  practice,
  next,
  onNext,
  onRetry,
  onMenu,
}: {
  hunt: PhotoHunt;
  photo: string;
  practice: boolean;
  next: PhotoHunt | undefined;
  onNext: () => void;
  onRetry: () => void;
  onMenu: () => void;
}) {
  return (
    <>
      <h2>{practice ? '试玩取景成功。' : '找到了，这一刻。'}</h2>
      <p className="muted hunt-subtitle">
        {hunt.title} ·{' '}
        {practice
          ? '试玩不计入关卡进度'
          : next
            ? '照片已确认，下一关已解锁'
            : '照片已确认，四处风景全部找齐'}
      </p>
      <div className="hunt-comparison">
        <figure>
          <img src={huntImage(hunt)} alt="关卡参考照片" />
          <figcaption>参考照片</figcaption>
        </figure>
        <figure>
          <img src={photo} alt="本次拍摄的通关照片" />
          <figcaption>我的照片</figcaption>
        </figure>
      </div>
      <div className="hunt-result-actions">
        <button onClick={onRetry}>重拍这一关</button>
        <button className="primary" onClick={onNext}>
          {next && !practice ? '下一关' : '完成寻景'}
        </button>
        <button onClick={onMenu}>查看关卡</button>
        <a href={photo} download={`江风入境-${hunt.title}.png`}>
          保存照片 ↓
        </a>
      </div>
    </>
  );
}
