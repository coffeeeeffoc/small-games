import { useState } from 'react';
import { AdMode, playRewardedAd } from '../services/adService';
export function RewardedAdButton({
  mode,
  label,
  reward,
  onReward,
  disabled = false,
}: {
  mode: AdMode;
  label: string;
  reward: string;
  onReward: () => void;
  disabled?: boolean;
}) {
  const [state, setState] = useState<'idle' | 'confirm' | 'loading' | 'error'>('idle');
  const [msg, setMsg] = useState('');
  async function run() {
    setState('loading');
    const r = await playRewardedAd(mode, import.meta.env.VITE_BILI_AD_UNIT_ID || '');
    if (r.rewarded) {
      onReward();
      setState('idle');
    } else {
      setMsg(r.reason || '暂时无法播放');
      setState('error');
    }
  }
  return (
    <>
      {
        <button className="ad-button" disabled={disabled} onClick={() => setState('confirm')}>
          ▶ {label}
        </button>
      }
      {state !== 'idle' && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card">
            <span className="modal-kicker">激励视频</span>
            <h3>
              {state === 'loading'
                ? '正在播放预览…'
                : state === 'error'
                  ? '这次没播出来'
                  : '确认领取？'}
            </h3>
            <p>{state === 'error' ? msg : `完整观看后获得：${reward}`}</p>
            {state === 'loading' ? (
              <div className="loader" />
            ) : (
              <div className="modal-actions">
                <button className="button ghost" onClick={() => setState('idle')}>
                  返回
                </button>
                {state !== 'error' && (
                  <button className="button primary" onClick={run}>
                    {mode === 'preview' ? '模拟观看' : '播放广告'}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
