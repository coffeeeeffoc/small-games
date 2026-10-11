import { CAMPAIGN, createCampaignDuel } from './campaign.js';
import { DuelBot } from './duel-bot.js';
import { settle } from './progress.js';
import type { DuelView } from './duel-view.js';

export function beginCampaign(v: DuelView, index: number, practice: () => void, preview = false) {
  if (
    !Number.isInteger(index) ||
    index < 0 ||
    index >= CAMPAIGN.length ||
    (!preview && index > v.p.unlocked)
  )
    return null;
  practice();
  const level = CAMPAIGN[index]!;
  v.campaignLevel = index;
  v.duel = createCampaignDuel(level);
  v.chapterPage = Math.floor(index / 10);
  v.message = level.hint;
  return new DuelBot(1, level.bot);
}

export function settleCampaign(v: DuelView, save: () => void) {
  if (v.campaignLevel === null) return false;
  if (v.duel.result?.winner === v.side) {
    const reward = settle(v.p, v.campaignLevel);
    v.message = reward ? `首次通关 · 获得 ${reward} 材料` : '本关已通过 · 材料已领取';
    save();
  } else v.message = '观察上一炮落点，重试调整角度与蓄力';
  return true;
}

export function campaignAction(
  v: DuelView,
  id: string,
  start: (index: number) => void,
  cancel: () => void,
) {
  if (id === 'campaign') {
    cancel();
    v.chapterPage = Math.floor(v.p.unlocked / 10);
    v.screen = 'campaign';
  } else if (id === 'chapter-prev' || id === 'chapter-next') {
    if (v.screen === 'campaign')
      v.chapterPage = Math.max(
        0,
        Math.min(
          Math.ceil(CAMPAIGN.length / 10) - 1,
          v.chapterPage + (id === 'chapter-prev' ? -1 : 1),
        ),
      );
  } else if (id === 'campaign-continue') {
    if (v.screen === 'campaign') start(v.p.unlocked);
  } else if (id.startsWith('campaign-level:')) {
    if (v.screen === 'campaign') start(Number(id.slice(15)));
  } else if (id === 'campaign-retry' || id === 'campaign-next') {
    if (
      v.screen === 'result' &&
      v.campaignLevel !== null &&
      (id === 'campaign-retry' || v.duel.result?.winner === v.side)
    )
      start(v.campaignLevel + (id === 'campaign-next' ? 1 : 0));
  } else return false;
  return true;
}
