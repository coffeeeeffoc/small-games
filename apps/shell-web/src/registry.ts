import type { DynamicContentEnvelope } from '@coffeeeeffoc/content-schema';
import type { GameDefinition } from '@coffeeeeffoc/game-contract';
import {
  cultivationGameDefinition,
  defaultCultivationEnvelope,
} from '@coffeeeeffoc/game-cultivation';
import { defaultOfficeEnvelope, officeGameDefinition } from '@coffeeeeffoc/game-office';

/** Catalog metadata paired with a trusted build-time Game import. */
export type BuiltInGame = Readonly<{
  id: string;
  title: string;
  description: string;
  definition: GameDefinition;
  content: DynamicContentEnvelope;
}>;

/** Trusted Games compiled into this Web Shell through public package exports only. */
export const builtInGameRegistry: readonly BuiltInGame[] = [
  {
    id: 'cultivation',
    title: '三分钟修仙',
    description: '三章十八劫，一炷香走完一世。',
    definition: cultivationGameDefinition,
    content: defaultCultivationEnvelope,
  },
  {
    id: 'office',
    title: '打工人摸鱼记',
    description: '老板转身就摸鱼，熬过五天才算胜利。',
    definition: officeGameDefinition,
    content: defaultOfficeEnvelope,
  },
];
