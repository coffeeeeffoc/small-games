import { IDENTITY_ORIENTATION } from '../core/rotation.ts';
import type { Level } from '../core/types.ts';

/** Original teaching model: two perpendicular, complementary half-lap joints.
 * No extraction order, concealed key, group move, or rotation is required.
 * Source-backed interlocking puzzles begin after this deliberately simple joint.
 */
export const firstLift: Level = {
  id: 'first-lift-v1',
  title: '初识 · 一提一合',
  subtitle: '两件木条，一提就开',
  chapter: '从这里开始',
  mechanic: '向上提起，再放回',
  clue: '向上拖动青色横榫 A，把两件木条分开；再向下放回原位。',
  description:
    '原创入门练习。两件半搭接木条，先体验直接拖动与互相阻挡，再试着对照轮廓复原。无需旋转或组合操作。',
  difficulty: '新手',
  estimatedMinutes: '约 30 秒',
  tutorial: true,
  pieces: [
    {
      id: 'key',
      name: '青竹 · 上提横榫',
      color: '#76a796',
      axis: 'y',
      boxes: [
        { min: [-2, -0.5, -0.5], max: [-0.5, 0.5, 0.5] },
        { min: [-0.5, 0, -0.5], max: [0.5, 0.5, 0.5] },
        { min: [0.5, -0.5, -0.5], max: [2, 0.5, 0.5] },
      ],
      range: [-8, 8],
      removedAt: 2,
    },
    {
      id: 'cross',
      name: '赤陶 · 承接底榫',
      color: '#ce8768',
      axis: 'y',
      boxes: [
        { min: [-0.5, -0.5, -2], max: [0.5, 0.5, -0.5] },
        { min: [-0.5, -0.5, -0.5], max: [0.5, 0, 0.5] },
        { min: [-0.5, -0.5, 0.5], max: [0.5, 0.5, 2] },
      ],
      range: [-8, 8],
      removedAt: 2,
    },
  ],
  hintRules: [
    {
      id: 'lift-the-top-bar',
      phase: 'disassemble',
      relativeToPieceId: 'cross',
      when: [
        { pieceId: 'cross', orientation: IDENTITY_ORIENTATION },
        {
          pieceId: 'key',
          orientation: IDENTITY_ORIENTATION,
          offsetRange: { min: [0, 0, 0], max: [0, 2, 0] },
        },
      ],
      action: {
        kind: 'move',
        pieceId: 'key',
        pieceIds: ['key'],
        axis: 'y',
        targetOffset: 2,
        direction: 1,
        message: '把青色横榫 A 向上提起，两件木条就分开了。',
      },
    },
    {
      id: 'lower-the-top-bar',
      phase: 'reassemble',
      when: [
        { pieceId: 'cross', offset: [0, 0, 0], orientation: IDENTITY_ORIENTATION },
        {
          pieceId: 'key',
          orientation: IDENTITY_ORIENTATION,
          offsetRange: { min: [0, 0, 0], max: [0, 8, 0] },
        },
      ],
      action: {
        kind: 'move',
        pieceId: 'key',
        pieceIds: ['key'],
        axis: 'y',
        targetOffset: 0,
        direction: -1,
        message: '将青色横榫 A 向下放回凹槽，两个缺口就合上了。',
      },
    },
  ],
};
