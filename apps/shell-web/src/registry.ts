import type { DynamicContentEnvelope } from '@coffeeeeffoc/content-schema';
import type { GameDefinition, GameSessionContext, StoragePort } from '@coffeeeeffoc/game-contract';
import type { RemoteGameArtifact } from '@coffeeeeffoc/game-loader';
import type { ManagedAdConfig } from '@coffeeeeffoc/ad-config';
import { arenaGameDefinition, defaultArenaEnvelope } from '@coffeeeeffoc/game-arena';
import {
  cultivationGameDefinition,
  defaultCultivationEnvelope,
} from '@coffeeeeffoc/game-cultivation';
import { defaultOfficeEnvelope, officeGameDefinition } from '@coffeeeeffoc/game-office';

import { cricketGameDefinition, defaultCricketEnvelope } from '@coffeeeeffoc/game-cricket';

/** Catalog metadata paired with a trusted build-time Game import. */
export type BuiltInGame = Readonly<{
  id: string;
  title: string;
  description: string;
  definition: GameDefinition;
  content: DynamicContentEnvelope;
  remote?: Readonly<{ target: RemoteGameArtifact }>;
  runtimeSession?: GameSessionContext;
  runtimeStorage?: StoragePort;
  managedAdPlan?: ManagedAdConfig;
  playerId?: string;
}>;

const cultivationArtifactUrl = import.meta.env.VITE_CULTIVATION_ARTIFACT_URL as string | undefined;
const cultivationArtifactIntegrity = import.meta.env.VITE_CULTIVATION_ARTIFACT_INTEGRITY as
  | string
  | undefined;
const cultivationArtifactVersion = import.meta.env.VITE_CULTIVATION_ARTIFACT_VERSION as
  | string
  | undefined;

const remoteCultivation =
  cultivationArtifactUrl && cultivationArtifactIntegrity && cultivationArtifactVersion
    ? {
        target: {
          entryUrl: cultivationArtifactUrl,
          manifest: {
            ...cultivationGameDefinition.manifest,
            version: cultivationArtifactVersion,
            integrity: cultivationArtifactIntegrity,
          },
        },
      }
    : undefined;

/** Trusted Games compiled into this Web Shell through public package exports only. */
export const builtInGameRegistry: readonly BuiltInGame[] = [
  {
    id: 'cultivation',
    title: '三分钟修仙',
    description: '十八次机缘，一世问道。历练渡劫，携福缘再入轮回。',
    definition: cultivationGameDefinition,
    content: defaultCultivationEnvelope,
    remote: remoteCultivation,
  },
  {
    id: 'cricket',
    title: '秋声斗蟋',
    description: '撩拨蓄势，收梗闪避。老槐茶馆连闯三擂。',
    definition: cricketGameDefinition,
    content: defaultCricketEnvelope,
  },
  {
    id: 'office',
    title: '打工人摸鱼记',
    description: '第一人称潜入工位，周一迟到首关已开放，一周摸鱼场景逐步登场。',
    definition: officeGameDefinition,
    content: defaultOfficeEnvelope,
  },
  {
    id: 'arena',
    title: '电子斗蛐蛐',
    description: '秋夜瓦盆斗蟋蟀，拨草扑咬、闪身反击，亲手赢下五擂。',
    definition: arenaGameDefinition,
    content: defaultArenaEnvelope,
  },
];
