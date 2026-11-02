import React from 'react';
import { X } from 'lucide-react';

interface ControlsModalProps {
  open: boolean;
  onClose: () => void;
}

export const ControlsModal: React.FC<ControlsModalProps> = ({ open, onClose }) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 pointer-events-auto">
      <div className="w-full max-w-2xl rounded-xl border border-stone-800 bg-stone-950 text-stone-100 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-800">
          <h2 className="font-display text-base font-bold text-stone-100">
            Controls &amp; Tactical Manual
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close controls modal"
            className="p-1.5 rounded-lg bg-stone-900 border border-stone-800 text-stone-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-5 text-xs">
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-amber-400">1. King Mode</h3>
            <p className="text-stone-400 leading-relaxed">
              Manage your kingdom, construct castles and villages on the grid, and recruit armies.
            </p>
            <ul className="space-y-1.5 text-stone-300 pt-1">
              <li><strong className="text-stone-100">WASD / Arrows:</strong> Pan strategic camera</li>
              <li><strong className="text-stone-100">Right-Drag / Scroll:</strong> Orbit &amp; zoom</li>
              <li><strong className="text-stone-100">Left-Click (Build):</strong> Place selected block/building</li>
              <li><strong className="text-stone-100">R Key:</strong> Rotate building 90°</li>
              <li><strong className="text-stone-100">Esc:</strong> Cancel active build/demolish tool</li>
            </ul>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-amber-400">2. Soldier Mode</h3>
            <p className="text-stone-400 leading-relaxed">
              Fight directly on the battlefield in third-person as your playable Hero.
            </p>
            <ul className="space-y-1.5 text-stone-300 pt-1">
              <li><strong className="text-stone-100">WASD:</strong> Move Hero</li>
              <li><strong className="text-stone-100">Hold Shift:</strong> Sprint / Run</li>
              <li><strong className="text-stone-100">Left-Click / Space:</strong> Sword Attack</li>
              <li><strong className="text-stone-100">Hold Right-Click / F:</strong> Shield Block</li>
              <li><strong className="text-stone-100">Mouse Drag or Q / E:</strong> Rotate 3rd-person camera</li>
            </ul>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-amber-400">3. Commander Mode</h3>
            <p className="text-stone-400 leading-relaxed">
              Direct friendly formations in real time against the AI commander.
            </p>
            <ul className="space-y-1.5 text-stone-300 pt-1">
              <li><strong className="text-stone-100">Left-Drag Box:</strong> Select troops in rectangle</li>
              <li><strong className="text-stone-100">Right-Click Ground:</strong> Move formation rally flag</li>
              <li><strong className="text-stone-100">Orders Bar:</strong> Stand, Advance, Retreat, Defend, Charge, Hold</li>
              <li><strong className="text-stone-100">1 / 2 / 3 Keys:</strong> Switch game modes anytime</li>
              <li><strong className="text-stone-100">H Key:</strong> Collapse / Expand bottom HUD</li>
            </ul>
          </div>
        </div>

        <div className="px-5 py-3.5 border-t border-stone-800 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
          >
            Resume Game
          </button>
        </div>
      </div>
    </div>
  );
};
