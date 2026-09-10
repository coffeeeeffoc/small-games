import { opponents } from '../domain/cricket.js';
export function CricketSidebar({
  round,
  help,
  onClose,
}: {
  round: number;
  help: boolean;
  onClose(): void;
}) {
  return (
    <aside className={`cricket-sidebar ${help ? 'show-help' : ''}`}>
      <button className="cricket-help-close" onClick={() => onClose()}>
        收起玩法 ×
      </button>
      <div className="cricket-side-title">
        <small>茶馆擂台</small>
        <h2>
          小虫，也有
          <br />
          大脾气。
        </h2>
        <p>
          胜负不在手快。
          <br />
          敢撩，也要懂得收。
        </p>
      </div>
      <ol className="cricket-rounds">
        {opponents.map((item, index) => (
          <li
            key={item.name}
            className={index === round ? 'current' : index < round ? 'cleared' : ''}
          >
            <span>{index < round ? '✓' : `0${index + 1}`}</span>
            <div>
              <strong>{item.name}</strong>
              <small>{['入门 · 试试火候', '进阶 · 收放之间', '守擂 · 步步惊心'][index]}</small>
            </div>
            <i>{index === round ? '在斗' : index < round ? '已胜' : '待战'}</i>
          </li>
        ))}
      </ol>
      <div className="cricket-rules">
        <h3>老把式的三句话</h3>
        <p>
          <b>一 · 撩得巧</b>按住约 0.7 秒，指针进金区就松手。一直撩会过火。
        </p>
        <p>
          <b>二 · 收得准</b>看对方抬头，预警条将满时闪避。躲太早也会挨咬。
        </p>
        <p>
          <b>三 · 等得住</b>扑空后反击多 60% 伤害。气力不够，就松手喘息。
        </p>
      </div>
      <p className="cricket-side-note">
        一局六十秒 · 斗志归零即退盆
        <br />
        时间到，按剩余斗志比例定胜负
      </p>
    </aside>
  );
}
