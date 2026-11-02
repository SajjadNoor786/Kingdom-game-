export enum GameMode {
  King = 'king',
  Soldier = 'soldier',
  Commander = 'commander',
}

export enum UnitType {
  Hero = 'hero',
  SwordInfantry = 'sword',
  Spearman = 'spear',
  Archer = 'archer',
  Horseman = 'horseman',
  Knight = 'knight',
  ShieldSoldier = 'shield',
}

export enum Team {
  Friendly = 'friendly',
  Enemy = 'enemy',
}

export enum OrderType {
  Stand = 'stand',
  Advance = 'advance',
  Retreat = 'retreat',
  Defend = 'defend',
  Charge = 'charge',
  HoldPosition = 'hold',
}

export enum FormationType {
  Line = 'line',
  ShieldWall = 'shield_wall',
  Wedge = 'wedge',
  Box = 'box',
}

export enum BuildingType {
  Wall = 'wall',
  Tower = 'tower',
  Gate = 'gate',
  Keep = 'keep',
  House = 'house',
  Farm = 'farm',
  Barracks = 'barracks',
}

export enum BattleArenaId {
  GreenvaleFord = 'greenvale_ford',
  HighcragPass = 'highcrag_pass',
  HarvestCrossroads = 'harvest_crossroads',
}

export enum QualityTier {
  Low = 'low',
  Balanced = 'balanced',
  High = 'high',
}

export interface BuildingSpec {
  type: BuildingType;
  label: string;
  goldCost: number;
  woodCost: number;
  stoneCost: number;
  footprintX: number; // in 2m grid cells
  footprintZ: number; // in 2m grid cells
  stackable: boolean;
  blockHeight: number;
  description: string;
}

export interface UnitSpec {
  type: UnitType;
  label: string;
  goldCost: number;
  foodCost: number;
  maxHp: number;
  damage: number;
  attackRange: number;
  attackCooldown: number;
  speed: number;
  armor: number; // 0..0.7 damage reduction
  isRanged?: boolean;
  isMounted?: boolean;
  antiCavalryBonus?: number;
}

export interface BattleArenaSpec {
  id: BattleArenaId;
  name: string;
  subtitle: string;
  centerX: number;
  centerZ: number;
  friendlySpawnOffsetZ: number;
  enemySpawnOffsetZ: number;
}

export interface CharacterModelInfo {
  slot: 'hero' | 'enemy';
  status: 'placeholder_from_image_link' | 'loaded_glb' | 'error';
  providedUrl: string;
  resolvedSummary: string;
  fileName: string | null;
  hasSkeletalAnimations: boolean;
  detectedClips: string[];
  mappedStates: Record<string, string | null>;
  vertexCount: number;
  errorMessage?: string;
}

export interface GameSnapshot {
  mode: GameMode;
  gold: number;
  wood: number;
  stone: number;
  food: number;
  armyCount: number;
  armyCap: number;
  enemyCount: number;
  selectedUnitCount: number;
  selectedUnitFilter: UnitType | 'all';
  activeOrder: OrderType;
  activeFormation: FormationType;
  selectedBuilding: BuildingType | null;
  demolishMode: boolean;
  buildingRotationSteps: number; // 0, 1, 2, 3 -> 0, 90, 180, 270 deg
  activeArena: BattleArenaId;
  waveNumber: number;
  battleActive: boolean;
  aiPosture: string;
  heroHp: number;
  heroMaxHp: number;
  heroStamina: number;
  heroBlocking: boolean;
  heroKills: number;
  quality: QualityTier;
  soundEnabled: boolean;
  isSoftwareGl: boolean;
  heroModelInfo: CharacterModelInfo;
  enemyModelInfo: CharacterModelInfo;
  applyHeroModelToFriendlySquad: boolean;
  statusMessage: string;
}

export interface SelectionBoxRect {
  active: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
}
