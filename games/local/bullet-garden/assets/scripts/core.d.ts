declare module '*generated/core.js' {
  export const LEVELS: Record<string, any>;
  export const LEVEL_ORDER: string[];
  export const BOONS: Record<string, any>;
  export const SKILLS: Record<string, any>;
  export const ENEMIES: Record<string, any>;
  export const UPGRADES: any[];
  export const PERMANENT_UPGRADES: any[];
  export const WEAPONS: any[];
  export const SAVE_KEY: string;
  export function createProfile(value?: unknown): any;
  export function levelFromXp(xp: number): { level: number; earned: number; required: number };
  export function isLevelUnlocked(profile: any, id: string): boolean;
  export function upgradeCost(profile: any, id: string): number | null;
  export function purchaseUpgrade(profile: any, id: string): { ok: boolean };
  export function dash(state: any, direction: any): boolean;
  export function castSkill(state: any, target: any, index: number): boolean;
  export function skillTarget(state: any, target: any, index: number): any;
  export function getRunLevel(state: any): any;
  export function createPlatformAdProvider(options: any): any;
  export class GardenSession {
    constructor(options?: any);
    profile: any;
    state: any;
    screen: string;
    result: any;
    pending: any;
    used: any;
    adStatus: string;
    hidden: boolean;
    begin(id: string, options?: any): boolean;
    tick(dt: number, input: any): void;
    upgrade(id: string): boolean;
    cancelAd(): void;
    pause(): void;
    resume(): void;
    suspend(options?: { nativeAdTransition: boolean }): void;
    show(): void;
    home(): void;
    finish(): boolean;
    eligible(kind: string): boolean;
    reward(kind: string): Promise<any>;
    dispose(): void;
  }
}
