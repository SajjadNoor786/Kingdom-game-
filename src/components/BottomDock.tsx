import React, { useState } from 'react';
import { ChevronDown, ChevronUp, RotateCw, Trash2, Volume2, VolumeX } from 'lucide-react';
import { BATTLE_ARENAS, BUILDING_SPECS, UNIT_SPECS } from '../game/constants';
import {
  BattleArenaId,
  BuildingType,
  FormationType,
  GameMode,
  GameSnapshot,
  OrderType,
  QualityTier,
  UnitType,
} from '../game/types';

interface BottomDockProps {
  snap: GameSnapshot;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onSelectBuilding: (b: BuildingType | null) => void;
  onToggleDemolish: () => void;
  onRotateBuilding: () => void;
  onRecruitUnit: (u: UnitType) => void;
  onIssueOrder: (o: OrderType) => void;
  onSetFormation: (f: FormationType) => void;
  onSelectUnitClass: (u: UnitType | 'all') => void;
  onSelectArena: (a: BattleArenaId) => void;
  onSetQuality: (q: QualityTier) => void;
  onToggleSound: () => void;
  onOpenCharacterModal: () => void;
}

const RECRUITABLE_UNITS: UnitType[] = [
  UnitType.SwordInfantry,
  UnitType.Spearman,
  UnitType.Archer,
  UnitType.ShieldSoldier,
  UnitType.Horseman,
  UnitType.Knight,
];

const ORDERS: { type: OrderType; label: string }[] = [
  { type: OrderType.Stand, label: 'Stand' },
  { type: OrderType.Advance, label: 'Advance' },
  { type: OrderType.Retreat, label: 'Retreat' },
  { type: OrderType.Defend, label: 'Defend' },
  { type: OrderType.Charge, label: 'Charge' },
  { type: OrderType.HoldPosition, label: 'Hold Position' },
];

const FORMATIONS: { type: FormationType; label: string }[] = [
  { type: FormationType.Line, label: 'Line' },
  { type: FormationType.ShieldWall, label: 'Shield Wall' },
  { type: FormationType.Wedge, label: 'Wedge' },
  { type: FormationType.Box, label: 'Square' },
];

export const BottomDock: React.FC<BottomDockProps> = ({
  snap,
  collapsed,
  onToggleCollapse,
  onSelectBuilding,
  onToggleDemolish,
  onRotateBuilding,
  onRecruitUnit,
  onIssueOrder,
  onSetFormation,
  onSelectUnitClass,
  onSelectArena,
  onSetQuality,
  onToggleSound,
  onOpenCharacterModal,
}) => {
  const [kingTab, setKingTab] = useState<'build' | 'recruit' | 'battle'>('build');

  return (
    <div
      className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-30 w-[min(980px,95vw)] pointer-events-auto transition-transform duration-200 ${
        collapsed ? 'translate-y-[calc(100%-34px)]' : 'translate-y-0'
      }`}
    >
      {/* Top Collapse / Zen Mode Tab */}
      <div className="flex items-center justify-between px-1 mb-1">
        <div className="text-xs text-stone-200 bg-stone-950/90 border border-stone-800 rounded-md px-3 py-1 truncate max-w-[72%]">
          {snap.statusMessage}
        </div>
        <button
          type="button"
          onClick={onToggleCollapse}
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-stone-950/95 border border-stone-800 hover:border-stone-600 text-xs font-medium text-stone-200 transition-colors whitespace-nowrap shrink-0"
        >
          {collapsed ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          <span>{collapsed ? 'Show Controls (H)' : 'Hide Controls (H)'}</span>
        </button>
      </div>

      {/* Main Unified Control Dock (No backdrop-blur over WebGL per performance standard) */}
      <div className="rounded-xl border border-stone-800 bg-stone-950/95 shadow-2xl p-3.5 space-y-3">
        {/* Clean Unboxed Telemetry & Settings Strip */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-2.5 border-b border-stone-800/90 text-xs">
          <div className="flex flex-wrap items-center gap-2 text-stone-300 font-mono-num">
            <span>Gold <strong className="text-amber-400">{snap.gold}</strong></span>
            <span aria-hidden="true" className="text-stone-600">·</span>
            <span>Wood <strong className="text-stone-100">{snap.wood}</strong></span>
            <span aria-hidden="true" className="text-stone-600">·</span>
            <span>Stone <strong className="text-stone-100">{snap.stone}</strong></span>
            <span aria-hidden="true" className="text-stone-600">·</span>
            <span>Food <strong className="text-stone-100">{snap.food}</strong></span>
            <span aria-hidden="true" className="text-stone-600">·</span>
            <span>Army <strong className="text-sky-400">{snap.armyCount}/{snap.armyCap}</strong></span>
            <span aria-hidden="true" className="text-stone-600">·</span>
            <span>Enemies <strong className="text-red-400">{snap.enemyCount}</strong> (Wave {snap.waveNumber})</span>
            <span aria-hidden="true" className="text-stone-600">·</span>
            <span className="font-sans text-stone-400">AI: {snap.aiPosture}</span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {snap.heroModelInfo.status !== 'loaded_glb' && (
              <button
                type="button"
                onClick={onOpenCharacterModal}
                className="px-2.5 py-1 rounded border border-amber-500/50 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 text-xs font-medium transition-colors whitespace-nowrap shrink-0"
              >
                Import Hero .GLB
              </button>
            )}
            <div className="flex items-center bg-stone-900 rounded-md p-0.5 border border-stone-800">
              {([QualityTier.Low, QualityTier.Balanced, QualityTier.High] as QualityTier[]).map(
                (q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => onSetQuality(q)}
                    className={`px-2 py-0.5 text-[11px] font-medium rounded transition-colors capitalize whitespace-nowrap shrink-0 ${
                      snap.quality === q
                        ? 'bg-stone-700 text-stone-100'
                        : 'text-stone-400 hover:text-stone-200'
                    }`}
                  >
                    {q}
                  </button>
                )
              )}
            </div>
            <button
              type="button"
              onClick={onToggleSound}
              aria-label={snap.soundEnabled ? 'Mute sound' : 'Unmute sound'}
              className="p-1.5 rounded-md bg-stone-900 border border-stone-800 text-stone-300 hover:text-white transition-colors"
            >
              {snap.soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {/* ==================== 1. KING MODE DOCK ==================== */}
        {snap.mode === GameMode.King && (
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1 p-1 bg-stone-900 rounded-lg border border-stone-800">
                <button
                  type="button"
                  onClick={() => setKingTab('build')}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    kingTab === 'build'
                      ? 'bg-amber-500 text-stone-950 font-semibold'
                      : 'text-stone-300 hover:text-white'
                  }`}
                >
                  Build Castle &amp; Village
                </button>
                <button
                  type="button"
                  onClick={() => setKingTab('recruit')}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    kingTab === 'recruit'
                      ? 'bg-amber-500 text-stone-950 font-semibold'
                      : 'text-stone-300 hover:text-white'
                  }`}
                >
                  Recruit Soldiers
                </button>
                <button
                  type="button"
                  onClick={() => setKingTab('battle')}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    kingTab === 'battle'
                      ? 'bg-amber-500 text-stone-950 font-semibold'
                      : 'text-stone-300 hover:text-white'
                  }`}
                >
                  Battle Location &amp; Army Orders
                </button>
              </div>

              {kingTab === 'build' && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onRotateBuilding}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-stone-900 hover:bg-stone-800 border border-stone-700 text-xs font-medium text-stone-200 transition-colors whitespace-nowrap shrink-0"
                  >
                    <RotateCw className="w-3.5 h-3.5" />
                    <span className="tabular-nums">Rotate ({snap.buildingRotationSteps * 90}°)</span>
                  </button>
                  <button
                    type="button"
                    onClick={onToggleDemolish}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                      snap.demolishMode
                        ? 'bg-red-600 border-red-500 text-white'
                        : 'bg-stone-900 hover:bg-stone-800 border-stone-700 text-stone-300'
                    }`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Demolish</span>
                  </button>
                </div>
              )}
            </div>

            {kingTab === 'build' && (
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2">
                {Object.values(BUILDING_SPECS).map((b) => {
                  const active = snap.selectedBuilding === b.type;
                  const affordable =
                    snap.gold >= b.goldCost &&
                    snap.wood >= b.woodCost &&
                    snap.stone >= b.stoneCost;
                  return (
                    <button
                      key={b.type}
                      type="button"
                      onClick={() => onSelectBuilding(b.type)}
                      className={`text-left px-2.5 py-2 rounded-lg border transition-colors ${
                        active
                          ? 'bg-sky-950/80 border-sky-400 text-stone-100'
                          : 'bg-stone-900/90 hover:bg-stone-800 border-stone-800 text-stone-200'
                      } ${!affordable && !active ? 'opacity-60' : ''}`}
                    >
                      <div className="text-xs font-semibold whitespace-nowrap truncate">
                        {b.label}
                      </div>
                      <div className="text-[11px] text-stone-400 font-mono-num mt-0.5 whitespace-nowrap">
                        {b.goldCost}G · {b.woodCost}W · {b.stoneCost}S
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {kingTab === 'recruit' && (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
                {RECRUITABLE_UNITS.map((ut) => {
                  const spec = UNIT_SPECS[ut];
                  const canAfford =
                    snap.gold >= spec.goldCost &&
                    snap.food >= spec.foodCost &&
                    snap.armyCount < snap.armyCap;
                  return (
                    <button
                      key={ut}
                      type="button"
                      onClick={() => onRecruitUnit(ut)}
                      className={`text-left px-2.5 py-2 rounded-lg border border-stone-800 bg-stone-900 hover:bg-stone-800 transition-colors ${
                        !canAfford ? 'opacity-55' : ''
                      }`}
                    >
                      <div className="text-xs font-semibold text-stone-100 whitespace-nowrap truncate">
                        {spec.label}
                      </div>
                      <div className="text-[11px] text-amber-400 font-mono-num mt-0.5 whitespace-nowrap">
                        {spec.goldCost} Gold · {spec.foodCost} Food
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {kingTab === 'battle' && (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs text-stone-400 mr-1">Battleground:</span>
                  {Object.values(BATTLE_ARENAS).map((arena) => (
                    <button
                      key={arena.id}
                      type="button"
                      onClick={() => onSelectArena(arena.id)}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors whitespace-nowrap shrink-0 ${
                        snap.activeArena === arena.id
                          ? 'bg-amber-500 text-stone-950 border-amber-400 font-semibold'
                          : 'bg-stone-900 text-stone-300 border-stone-800 hover:border-stone-600'
                      }`}
                    >
                      {arena.name}
                    </button>
                  ))}
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {ORDERS.map((o) => (
                    <button
                      key={o.type}
                      type="button"
                      onClick={() => onIssueOrder(o.type)}
                      className={`px-2.5 py-1.5 rounded-md text-xs font-medium border transition-colors whitespace-nowrap shrink-0 ${
                        snap.activeOrder === o.type
                          ? 'bg-sky-500 text-stone-950 border-sky-400 font-semibold'
                          : 'bg-stone-900 text-stone-300 border-stone-800 hover:bg-stone-800'
                      }`}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ==================== 2. SOLDIER MODE DOCK ==================== */}
        {snap.mode === GameMode.Soldier && (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-5">
              {/* Hero Health */}
              <div className="w-44">
                <div className="flex justify-between text-xs mb-1 font-mono-num">
                  <span className="font-sans font-semibold text-stone-200">Hero Health</span>
                  <span className="text-amber-400">
                    {snap.heroHp}/{snap.heroMaxHp}
                  </span>
                </div>
                <svg className="w-full h-2 rounded-full bg-stone-800 overflow-hidden" viewBox="0 0 100 8" preserveAspectRatio="none">
                  <rect
                    x={0}
                    y={0}
                    width={Math.max(0, Math.min(100, (snap.heroHp / Math.max(1, snap.heroMaxHp)) * 100))}
                    height={8}
                    className="fill-emerald-500"
                  />
                </svg>
              </div>

              {/* Hero Stamina */}
              <div className="w-36">
                <div className="flex justify-between text-xs mb-1 font-mono-num">
                  <span className="font-sans font-semibold text-stone-200">Stamina</span>
                  <span className="text-sky-400">{snap.heroStamina}%</span>
                </div>
                <svg className="w-full h-2 rounded-full bg-stone-800 overflow-hidden" viewBox="0 0 100 8" preserveAspectRatio="none">
                  <rect
                    x={0}
                    y={0}
                    width={Math.max(0, Math.min(100, snap.heroStamina))}
                    height={8}
                    className="fill-sky-400"
                  />
                </svg>
              </div>

              <div className="text-xs text-stone-300 font-mono-num hidden sm:block">
                <span>Defeated: <strong className="text-stone-100">{snap.heroKills}</strong></span>
                <span className="mx-2 text-stone-600">·</span>
                <span>Guard: <strong className="text-stone-100">{snap.heroBlocking ? 'Shield Up' : 'Ready'}</strong></span>
              </div>
            </div>

            {/* Quick Battlefield Squad Commands while in 3rd-Person */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-stone-400 mr-1">Squad:</span>
              {[OrderType.Charge, OrderType.Advance, OrderType.Defend, OrderType.HoldPosition].map(
                (ord) => {
                  const item = ORDERS.find((x) => x.type === ord)!;
                  return (
                    <button
                      key={ord}
                      type="button"
                      onClick={() => onIssueOrder(ord)}
                      className={`px-2.5 py-1.5 rounded-md text-xs font-medium border transition-colors whitespace-nowrap shrink-0 ${
                        snap.activeOrder === ord
                          ? 'bg-amber-500 text-stone-950 border-amber-400 font-semibold'
                          : 'bg-stone-900 text-stone-200 border-stone-800 hover:bg-stone-800'
                      }`}
                    >
                      {item.label}
                    </button>
                  );
                }
              )}
            </div>
          </div>
        )}

        {/* ==================== 3. COMMANDER MODE DOCK ==================== */}
        {snap.mode === GameMode.Commander && (
          <div className="space-y-2.5">
            {/* Troop Class Selection Filter + Formation Selector */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1">
                <span className="text-xs text-stone-400 mr-1 tabular-nums">
                  Selected ({snap.selectedUnitCount}):
                </span>
                <button
                  type="button"
                  onClick={() => onSelectUnitClass('all')}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    snap.selectedUnitFilter === 'all'
                      ? 'bg-stone-700 text-white'
                      : 'bg-stone-900 text-stone-400 hover:text-stone-200'
                  }`}
                >
                  All Troops
                </button>
                {RECRUITABLE_UNITS.map((ut) => (
                  <button
                    key={ut}
                    type="button"
                    onClick={() => onSelectUnitClass(ut)}
                    className={`px-2.5 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                      snap.selectedUnitFilter === ut
                        ? 'bg-stone-700 text-white'
                        : 'bg-stone-900 text-stone-400 hover:text-stone-200'
                    }`}
                  >
                    {UNIT_SPECS[ut].label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1 bg-stone-900 p-1 rounded-lg border border-stone-800">
                {FORMATIONS.map((f) => (
                  <button
                    key={f.type}
                    type="button"
                    onClick={() => onSetFormation(f.type)}
                    className={`px-2.5 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                      snap.activeFormation === f.type
                        ? 'bg-amber-500 text-stone-950 font-semibold'
                        : 'text-stone-300 hover:text-white'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 6 Army Orders + Arena Quick Switch */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                {ORDERS.map((o) => (
                  <button
                    key={o.type}
                    type="button"
                    onClick={() => onIssueOrder(o.type)}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors whitespace-nowrap shrink-0 ${
                      snap.activeOrder === o.type
                        ? 'bg-sky-500 text-stone-950 border-sky-400 font-semibold'
                        : 'bg-stone-900 text-stone-200 border-stone-800 hover:bg-stone-800'
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1.5">
                {Object.values(BATTLE_ARENAS).map((arena) => (
                  <button
                    key={arena.id}
                    type="button"
                    onClick={() => onSelectArena(arena.id)}
                    className={`px-2.5 py-1.5 rounded-md text-xs font-medium border transition-colors whitespace-nowrap shrink-0 ${
                      snap.activeArena === arena.id
                        ? 'bg-stone-800 text-amber-400 border-amber-500/60'
                        : 'bg-stone-900 text-stone-400 border-stone-800 hover:text-stone-200'
                    }`}
                  >
                    {arena.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
