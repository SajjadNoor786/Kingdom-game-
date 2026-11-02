import { useEffect, useRef, useState } from 'react';
import { BottomDock } from './components/BottomDock';
import { CharacterModal } from './components/CharacterModal';
import { ControlsModal } from './components/ControlsModal';
import { createInitialCharacterInfo } from './game/characterLoader';
import { KingdomsGameEngine } from './game/engine';
import {
  BattleArenaId,
  FormationType,
  GameMode,
  GameSnapshot,
  OrderType,
  QualityTier,
  SelectionBoxRect,
} from './game/types';
import backdropImg from './assets/images/kingdoms_banners_backdrop_1793617138702.jpg';

const INITIAL_SNAPSHOT: GameSnapshot = {
  mode: GameMode.King,
  gold: 420,
  wood: 260,
  stone: 240,
  food: 180,
  armyCount: 10,
  armyCap: 32,
  enemyCount: 8,
  selectedUnitCount: 10,
  selectedUnitFilter: 'all',
  activeOrder: OrderType.Defend,
  activeFormation: FormationType.Line,
  selectedBuilding: null,
  demolishMode: false,
  buildingRotationSteps: 0,
  activeArena: BattleArenaId.GreenvaleFord,
  waveNumber: 1,
  battleActive: true,
  aiPosture: 'Defending Arena Line',
  heroHp: 320,
  heroMaxHp: 320,
  heroStamina: 100,
  heroBlocking: false,
  heroKills: 0,
  quality: QualityTier.Balanced,
  soundEnabled: true,
  isSoftwareGl: false,
  heroModelInfo: createInitialCharacterInfo('hero'),
  enemyModelInfo: createInitialCharacterInfo('enemy'),
  applyHeroModelToFriendlySquad: false,
  statusMessage: 'Initializing medieval realm...',
};

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<KingdomsGameEngine | null>(null);

  const [snap, setSnap] = useState<GameSnapshot>(INITIAL_SNAPSHOT);
  const [selectionBox, setSelectionBox] = useState<SelectionBoxRect>({
    active: false,
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  });
  const [webglError, setWebglError] = useState<string | null>(null);
  const [hudCollapsed, setHudCollapsed] = useState(false);
  const [charModalOpen, setCharModalOpen] = useState(false);
  const [controlsModalOpen, setControlsModalOpen] = useState(false);

  useEffect(() => {
    if (!canvasMountRef.current) return;
    const engine = new KingdomsGameEngine(
      canvasMountRef.current,
      (nextSnap) => setSnap(nextSnap),
      (rect) => setSelectionBox(rect),
      (err) => setWebglError(err)
    );
    engineRef.current = engine;

    const onKey = (e: KeyboardEvent) => {
      if (
        document.activeElement &&
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)
      ) {
        return;
      }
      if (e.code === 'KeyH') {
        setHudCollapsed((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKey);

    return () => {
      window.removeEventListener('keydown', onKey);
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  return (
    <div className="relative w-full h-full overflow-hidden bg-stone-950 text-stone-100">
      {/* Strict 3-Zone Top Bar Contract (No backdrop-blur over WebGL) */}
      <header className="fixed top-0 left-0 right-0 z-30 flex items-center justify-between gap-8 px-6 py-3 bg-stone-950/95 border-b border-stone-800 pointer-events-auto">
        {/* Zone 1: Single wordmark */}
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            engineRef.current?.setMode(GameMode.King);
          }}
          className="font-display text-base md:text-lg font-bold tracking-wide text-stone-100 whitespace-nowrap shrink-0"
        >
          Kingdoms &amp; Banners
        </a>

        {/* Zone 2: 5 concise single-line navigation links */}
        <nav className="flex items-center gap-4 md:gap-6 text-xs md:text-sm font-medium text-stone-400 overflow-x-auto">
          <button
            type="button"
            onClick={() => engineRef.current?.setMode(GameMode.King)}
            className={`py-0.5 border-b-2 transition-colors whitespace-nowrap shrink-0 ${
              snap.mode === GameMode.King
                ? 'text-amber-400 border-amber-400'
                : 'border-transparent hover:text-stone-100'
            }`}
          >
            King Mode
          </button>
          <button
            type="button"
            onClick={() => engineRef.current?.setMode(GameMode.Soldier)}
            className={`py-0.5 border-b-2 transition-colors whitespace-nowrap shrink-0 ${
              snap.mode === GameMode.Soldier
                ? 'text-amber-400 border-amber-400'
                : 'border-transparent hover:text-stone-100'
            }`}
          >
            Soldier Mode
          </button>
          <button
            type="button"
            onClick={() => engineRef.current?.setMode(GameMode.Commander)}
            className={`py-0.5 border-b-2 transition-colors whitespace-nowrap shrink-0 ${
              snap.mode === GameMode.Commander
                ? 'text-amber-400 border-amber-400'
                : 'border-transparent hover:text-stone-100'
            }`}
          >
            Commander Mode
          </button>
          <button
            type="button"
            onClick={() => setCharModalOpen(true)}
            className="py-0.5 border-b-2 border-transparent hover:text-stone-100 transition-colors whitespace-nowrap shrink-0"
          >
            Character Model
          </button>
          <button
            type="button"
            onClick={() => setControlsModalOpen(true)}
            className="py-0.5 border-b-2 border-transparent hover:text-stone-100 transition-colors whitespace-nowrap shrink-0"
          >
            Controls
          </button>
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={() => engineRef.current?.launchNextBattleWave()}
            className="px-4 py-2 text-xs font-semibold text-stone-950 bg-amber-500 rounded-lg hover:bg-amber-400 transition-colors whitespace-nowrap shrink-0"
          >
            {snap.enemyCount === 0 ? `Start Wave ${snap.waveNumber + 1}` : 'Spawn Enemy Wave'}
          </button>
        </div>
      </header>

      {/* Isolated Full-Viewport 3D WebGL Mount */}
      <div ref={canvasMountRef} className="w-full h-full cursor-crosshair" />

      {/* Graceful WebGL Fallback Container */}
      {webglError && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-stone-950 p-6">
          <img
            src={backdropImg}
            alt="Medieval kingdom landscape fallback"
            referrerPolicy="no-referrer"
            className="absolute inset-0 w-full h-full object-cover opacity-35"
          />
          <div className="relative z-10 max-w-md rounded-xl border border-stone-800 bg-stone-950/95 p-6 text-center space-y-2">
            <h1 className="font-display text-lg font-bold text-stone-100">3D Viewport Unavailable</h1>
            <p className="text-xs text-stone-300 leading-relaxed">{webglError}</p>
          </div>
        </div>
      )}

      {/* Subtle Center Aim Reticle in Soldier Third-Person Mode */}
      {snap.mode === GameMode.Soldier && !webglError && (
        <div
          aria-hidden="true"
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 pointer-events-none flex items-center justify-center"
        >
          <div className="w-5 h-5 border border-amber-400/70 rounded-full flex items-center justify-center">
            <div className="w-1 h-1 bg-amber-300 rounded-full" />
          </div>
        </div>
      )}

      {/* Commander / King Tactical Drag Selection Rectangle */}
      {selectionBox.active && (
        <svg
          aria-hidden="true"
          className="fixed inset-0 w-full h-full z-20 pointer-events-none"
        >
          <rect
            x={selectionBox.x}
            y={selectionBox.y}
            width={selectionBox.width}
            height={selectionBox.height}
            className="fill-sky-400/15 stroke-sky-400 stroke-1"
          />
        </svg>
      )}

      {/* Unified Collapsible Bottom Control Dock */}
      {!webglError && (
        <BottomDock
          snap={snap}
          collapsed={hudCollapsed}
          onToggleCollapse={() => setHudCollapsed((c) => !c)}
          onSelectBuilding={(b) => engineRef.current?.selectBuildingTool(b)}
          onToggleDemolish={() => engineRef.current?.toggleDemolishMode()}
          onRotateBuilding={() => engineRef.current?.rotateBuilding()}
          onRecruitUnit={(u) => engineRef.current?.recruitUnit(u)}
          onIssueOrder={(o) => engineRef.current?.issueOrder(o)}
          onSetFormation={(f) => engineRef.current?.setFormation(f)}
          onSelectUnitClass={(u) => engineRef.current?.selectUnitsByClass(u)}
          onSelectArena={(a) => engineRef.current?.selectBattleArena(a)}
          onSetQuality={(q) => engineRef.current?.setQuality(q)}
          onToggleSound={() => engineRef.current?.toggleSound()}
          onOpenCharacterModal={() => setCharModalOpen(true)}
        />
      )}

      {/* Character Importer & Honest Diagnostics Modal */}
      <CharacterModal
        open={charModalOpen}
        onClose={() => setCharModalOpen(false)}
        heroInfo={snap.heroModelInfo}
        enemyInfo={snap.enemyModelInfo}
        applyToFriendlySquad={snap.applyHeroModelToFriendlySquad}
        onToggleApplyToSquad={(val) => engineRef.current?.setApplyHeroModelToSquad(val)}
        onUploadFile={async (slot, file) => {
          await engineRef.current?.importCharacterFile(slot, file);
        }}
        onLoadUrl={async (slot, url) => {
          await engineRef.current?.importCharacterUrl(slot, url);
        }}
        onLoadSampleGlb={async (slot) => {
          await engineRef.current?.loadSampleTestGlb(slot);
        }}
      />

      {/* Keyboard & Mouse Controls Modal */}
      <ControlsModal open={controlsModalOpen} onClose={() => setControlsModalOpen(false)} />
    </div>
  );
}
