import { shareChallenge } from './publishing.js';
globalThis.HomeboundShare = (station) =>
  shareChallenge({ title: '归途站 · 同班接驳', text: '一起接旅客回家', params: { station } });
