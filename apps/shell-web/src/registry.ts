import type { DynamicContentEnvelope } from '@coffeeeeffoc/content-schema';
import type { GameDefinition } from '@coffeeeeffoc/game-contract';
import type { RemoteGameArtifact } from '@coffeeeeffoc/game-loader';
import { arenaGameDefinition, defaultArenaEnvelope } from '@coffeeeeffoc/game-arena';
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
  remote?: Readonly<{ target: RemoteGameArtifact }>;
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
    description: '三章十八劫，一炷香走完一世。',
    definition: cultivationGameDefinition,
    content: defaultCultivationEnvelope,
    remote: remoteCultivation,
  },
  {
    id: 'office',
    title: '打工人摸鱼记',
    description: '老板转身就摸鱼，熬过五天才算胜利。',
    definition: officeGameDefinition,
    content: defaultOfficeEnvelope,
  },
  {
    id: 'arena',
    title: '电子斗蛐蛐',
    description: '养一只怪物，连续打穿五个离谱段位。',
    definition: arenaGameDefinition,
    content: defaultArenaEnvelope,
  },
];
