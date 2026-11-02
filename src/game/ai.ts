import { BattleArenaSpec, FormationType, OrderType, Team, UnitType } from './types';

export interface TacticalUnitView {
  id: string;
  type: UnitType;
  team: Team;
  x: number;
  z: number;
  hp: number;
  maxHp: number;
  dead: boolean;
}

/**
 * Computes formation slot offsets (dx, dz) relative to a rally anchor & facing yaw.
 * Automatically places Shield Soldiers & Spearmen in the front rank, Sword/Knights mid-flank,
 * Horsemen on outer wings, and Archers safely in the rear rank.
 */
export function computeFormationSlots(
  units: TacticalUnitView[],
  formation: FormationType,
  anchorX: number,
  anchorZ: number,
  facingYaw: number
): Map<string, { x: number; z: number }> {
  const result = new Map<string, { x: number; z: number }>();
  if (units.length === 0) return result;

  const priority = (t: UnitType): number => {
    switch (t) {
      case UnitType.ShieldSoldier:
        return 0;
      case UnitType.Spearman:
        return 1;
      case UnitType.Knight:
        return 2;
      case UnitType.SwordInfantry:
        return 3;
      case UnitType.Horseman:
        return 4;
      case UnitType.Archer:
        return 5;
      default:
        return 2;
    }
  };

  const sorted = [...units].sort((a, b) => priority(a.type) - priority(b.type));
  const cos = Math.cos(facingYaw);
  const sin = Math.sin(facingYaw);

  const toWorld = (localRight: number, localBack: number) => ({
    // Forward is (+sin(yaw), +cos(yaw)), so Back is (-sin, -cos), Right is (+cos, -sin)
    x: anchorX + localRight * cos - localBack * sin,
    z: anchorZ - localRight * sin - localBack * cos,
  });

  const n = sorted.length;

  sorted.forEach((u, idx) => {
    let localRight = 0;
    let localBack = 0;

    if (formation === FormationType.Line) {
      const cols = Math.max(4, Math.min(8, Math.ceil(Math.sqrt(n * 2.2))));
      const row = Math.floor(idx / cols);
      const col = idx % cols;
      const rowWidth = Math.min(cols, n - row * cols);
      localRight = (col - (rowWidth - 1) * 0.5) * 2.15;
      localBack = row * 2.3;
    } else if (formation === FormationType.ShieldWall) {
      const cols = Math.max(5, Math.min(9, Math.ceil(n * 0.6)));
      const row = Math.floor(idx / cols);
      const col = idx % cols;
      const rowWidth = Math.min(cols, n - row * cols);
      localRight = (col - (rowWidth - 1) * 0.5) * 1.45; // tight interlocking shields
      localBack = row * 1.75;
    } else if (formation === FormationType.Wedge) {
      // Spearhead V-formation
      if (idx === 0) {
        localRight = 0;
        localBack = 0;
      } else {
        const rank = Math.ceil(idx / 2);
        const side = idx % 2 === 1 ? -1 : 1;
        localRight = side * rank * 1.55;
        localBack = rank * 1.65;
      }
    } else {
      // Box / Square defensive perimeter
      const sideCount = Math.max(2, Math.ceil(Math.sqrt(n)));
      const row = Math.floor(idx / sideCount);
      const col = idx % sideCount;
      localRight = (col - (sideCount - 1) * 0.5) * 2.05;
      localBack = (row - (sideCount - 1) * 0.5) * 2.05 + 1.5;
    }

    result.set(u.id, toWorld(localRight, localBack));
  });

  return result;
}

export interface EnemyAIDecision {
  postureLabel: string;
  order: OrderType;
  formation: FormationType;
  anchorX: number;
  anchorZ: number;
  facingYaw: number;
}

/**
 * Intelligent Battlefield AI Commander.
 * Analyzes troop ratios, vanguard health, player proximity, and archer positioning
 * to defend, advance, reposition, or launch shock charges.
 */
export class EnemyCommanderAI {
  private lastEvalTime = -10;
  public currentDecision: EnemyAIDecision = {
    postureLabel: 'Holding Arena Vanguard',
    order: OrderType.Defend,
    formation: FormationType.ShieldWall,
    anchorX: 16,
    anchorZ: -11,
    facingYaw: 0,
  };

  public evaluate(
    elapsed: number,
    arena: BattleArenaSpec,
    enemies: TacticalUnitView[],
    friendlies: TacticalUnitView[]
  ): EnemyAIDecision {
    if (elapsed - this.lastEvalTime < 0.65) {
      return this.currentDecision;
    }
    this.lastEvalTime = elapsed;

    const homeX = arena.centerX;
    const homeZ = arena.centerZ + arena.enemySpawnOffsetZ;

    if (enemies.length === 0) {
      this.currentDecision = {
        postureLabel: 'Routed — Wave Cleared',
        order: OrderType.Stand,
        formation: FormationType.Line,
        anchorX: homeX,
        anchorZ: homeZ,
        facingYaw: 0,
      };
      return this.currentDecision;
    }

    if (friendlies.length === 0) {
      this.currentDecision = {
        postureLabel: 'Holding Conquered Field',
        order: OrderType.HoldPosition,
        formation: FormationType.Line,
        anchorX: arena.centerX,
        anchorZ: arena.centerZ,
        facingYaw: 0,
      };
      return this.currentDecision;
    }

    // Compute centroids & health ratios
    let fx = 0;
    let fz = 0;
    for (const f of friendlies) {
      fx += f.x;
      fz += f.z;
    }
    fx /= friendlies.length;
    fz /= friendlies.length;

    let ex = 0;
    let ez = 0;
    let enemyHpSum = 0;
    let enemyMaxSum = 0;
    for (const e of enemies) {
      ex += e.x;
      ez += e.z;
      enemyHpSum += e.hp;
      enemyMaxSum += e.maxHp;
    }
    ex /= enemies.length;
    ez /= enemies.length;

    const distToPlayerArmy = Math.hypot(fx - ex, fz - ez);
    const yawToPlayer = Math.atan2(fx - ex, fz - ez);
    const hpRatio = enemyMaxSum > 0 ? enemyHpSum / enemyMaxSum : 1;
    const forceRatio = enemies.length / Math.max(1, friendlies.length);

    // 1. Tactical Regroup if battered and distant from banner
    if (hpRatio < 0.34 && enemies.length >= 2 && Math.hypot(ex - homeX, ez - homeZ) > 9) {
      this.currentDecision = {
        postureLabel: 'Regrouping at War Standard',
        order: OrderType.Defend,
        formation: FormationType.Box,
        anchorX: homeX,
        anchorZ: homeZ,
        facingYaw: yawToPlayer,
      };
      return this.currentDecision;
    }

    // 2. Player is far away (e.g. in Village/Castle) -> AI fortifies high ground in Shield Wall
    if (distToPlayerArmy > 36) {
      // Subtle lateral patrol reposition so AI feels alive
      const lateralShift = Math.sin(elapsed * 0.25) * 3.5;
      this.currentDecision = {
        postureLabel: 'Defending Arena Line',
        order: OrderType.Defend,
        formation: FormationType.ShieldWall,
        anchorX: homeX + lateralShift,
        anchorZ: homeZ + 2,
        facingYaw: yawToPlayer,
      };
      return this.currentDecision;
    }

    // 3. Mid-range engagement (15m..36m) -> AI repositions / advances in disciplined formation
    if (distToPlayerArmy > 14.5) {
      if (forceRatio >= 0.95) {
        const midX = ex + (fx - ex) * 0.45;
        const midZ = ez + (fz - ez) * 0.45;
        this.currentDecision = {
          postureLabel: 'Advancing in Wedge Formation',
          order: OrderType.Advance,
          formation: FormationType.Wedge,
          anchorX: midX,
          anchorZ: midZ,
          facingYaw: yawToPlayer,
        };
      } else {
        // Outnumbered -> Hold defensive shield wall and let enemy archers/spearmen punish approach
        this.currentDecision = {
          postureLabel: 'Bracing Shield Wall vs Superior Force',
          order: OrderType.HoldPosition,
          formation: FormationType.ShieldWall,
          anchorX: ex,
          anchorZ: ez,
          facingYaw: yawToPlayer,
        };
      }
      return this.currentDecision;
    }

    // 4. Close quarters (< 14.5m) -> Decisive shock Charge or Phalanx Clash!
    this.currentDecision = {
      postureLabel: forceRatio >= 0.8 ? 'Vanguard Shock Charge' : 'Counter-Attacking in Close Ranks',
      order: OrderType.Charge,
      formation: FormationType.Line,
      anchorX: fx,
      anchorZ: fz,
      facingYaw: yawToPlayer,
    };
    return this.currentDecision;
  }
}
