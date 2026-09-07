import type { DynamicContentEnvelope } from '@coffeeeeffoc/content-schema';

import type { OfficeContent } from './schema.js';

/** Built-in five-day campaign used by standalone and offline sessions. */
export const defaultOfficeContent: OfficeContent = {
  experience: 'desk-sample',
  days: [
    {
      name: '周一：假装振作',
      task: '攒够 16 快乐',
      inspectionChance: 0.2,
      color: '#b9dfa9',
      target: 16,
      duration: 22,
    },
    {
      name: '周二：突击巡查',
      task: '攒够 24 快乐',
      inspectionChance: 0.27,
      color: '#ffd95b',
      target: 24,
      duration: 22,
    },
    {
      name: '周三：会议地狱',
      task: '攒够 32 快乐',
      inspectionChance: 0.34,
      color: '#ffae73',
      target: 32,
      duration: 22,
    },
    {
      name: '周四：监控升级',
      task: '攒够 40 快乐',
      inspectionChance: 0.41,
      color: '#ff8585',
      target: 40,
      duration: 22,
    },
    {
      name: '周五：终极摸鱼',
      task: '攒够 50 快乐',
      inspectionChance: 0.48,
      color: '#fb7299',
      target: 50,
      duration: 22,
    },
  ],
};

/** Versioned envelope for the built-in office campaign. */
export const defaultOfficeEnvelope: DynamicContentEnvelope<OfficeContent> = {
  gameId: 'office',
  schemaVersion: 1,
  revision: 1,
  payload: defaultOfficeContent,
};
