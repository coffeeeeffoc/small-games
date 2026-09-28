import type { DynamicContentEnvelope } from '@coffeeeeffoc/content-schema';
import type { GameDefinition, GameSessionContext, StoragePort } from '@coffeeeeffoc/game-contract';
import type { RemoteGameArtifact } from '@coffeeeeffoc/game-loader';
import type { ManagedAdConfig } from '@coffeeeeffoc/ad-config';

/** A selected Game, after its trusted local module has loaded. */
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

export type LazyBuiltInGame = Pick<BuiltInGame, 'id' | 'title' | 'description'> & {
  load: () => Promise<Pick<BuiltInGame, 'definition' | 'content' | 'remote'>>;
};

export async function loadBuiltInGame(game: BuiltInGame | LazyBuiltInGame): Promise<BuiltInGame> {
  if (!('load' in game)) return game;
  const { load, ...metadata } = game;
  return { ...metadata, ...(await load()) };
}

const cultivationArtifactUrl = import.meta.env.VITE_CULTIVATION_ARTIFACT_URL as string | undefined;
const cultivationArtifactIntegrity = import.meta.env.VITE_CULTIVATION_ARTIFACT_INTEGRITY as
  | string
  | undefined;
const cultivationArtifactVersion = import.meta.env.VITE_CULTIVATION_ARTIFACT_VERSION as
  | string
  | undefined;

const remoteCultivation = (definition: GameDefinition) =>
  cultivationArtifactUrl && cultivationArtifactIntegrity && cultivationArtifactVersion
    ? {
        target: {
          entryUrl: cultivationArtifactUrl,
          manifest: {
            ...definition.manifest,
            version: cultivationArtifactVersion,
            integrity: cultivationArtifactIntegrity,
          },
        },
      }
    : undefined;

/** The lobby loads metadata only; each public package entry is fetched on selection. */
export const builtInGameRegistry: readonly LazyBuiltInGame[] = [
  {
    id: 'cultivation',
    title: '三分钟修仙',
    description: '亲手吐纳，御剑寻缘。两分钟修炼探索，一分钟登台渡劫。',
    load: async () => {
      const { cultivationGameDefinition, defaultCultivationEnvelope } = await import(
        '@coffeeeeffoc/game-cultivation'
      );
      return {
        definition: cultivationGameDefinition,
        content: defaultCultivationEnvelope,
        remote: remoteCultivation(cultivationGameDefinition),
      };
    },
  },
  {
    id: 'cricket',
    title: '秋声斗蟋',
    description: '撩拨蓄势，收梗闪避。老槐茶馆连闯三擂。',
    load: async () => {
      const { cricketGameDefinition, defaultCricketEnvelope } = await import(
        '@coffeeeeffoc/game-cricket'
      );
      return { definition: cricketGameDefinition, content: defaultCricketEnvelope };
    },
  },
  {
    id: 'office',
    title: '打工人摸鱼记',
    description: '第一人称潜入工位，周一迟到首关已开放，一周摸鱼场景逐步登场。',
    load: async () => {
      const { officeGameDefinition, defaultOfficeEnvelope } = await import(
        '@coffeeeeffoc/game-office'
      );
      return { definition: officeGameDefinition, content: defaultOfficeEnvelope };
    },
  },
  {
    id: 'arena',
    title: '电子斗蛐蛐',
    description: '秋夜瓦盆斗蟋蟀，拨草扑咬、闪身反击，亲手赢下五擂。',
    load: async () => {
      const { arenaGameDefinition, defaultArenaEnvelope } = await import(
        '@coffeeeeffoc/game-arena'
      );
      return { definition: arenaGameDefinition, content: defaultArenaEnvelope };
    },
  },
  {
    id: 'building-power',
    title: '忙碌的电工',
    description: '居民急着做饭、洗澡、降温；看天气、错峰接电，守住邻里灯火。',
    load: async () => {
      const { buildingPowerGameDefinition, defaultBuildingPowerEnvelope } = await import(
        '@coffeeeeffoc/game-building-power'
      );
      return { definition: buildingPowerGameDefinition, content: defaultBuildingPowerEnvelope };
    },
  },
];
