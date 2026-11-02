import React, { useState } from 'react';
import { Upload, X, FileCheck2, AlertTriangle } from 'lucide-react';
import { CharacterModelInfo } from '../game/types';
import backdropImg from '../assets/images/kingdoms_banners_backdrop_1793617138702.jpg';

interface CharacterModalProps {
  open: boolean;
  onClose: () => void;
  heroInfo: CharacterModelInfo;
  enemyInfo: CharacterModelInfo;
  applyToFriendlySquad: boolean;
  onToggleApplyToSquad: (val: boolean) => void;
  onUploadFile: (slot: 'hero' | 'enemy', file: File) => Promise<void>;
  onLoadUrl: (slot: 'hero' | 'enemy', url: string) => Promise<void>;
  onLoadSampleGlb: (slot: 'hero' | 'enemy') => Promise<void>;
}

export const CharacterModal: React.FC<CharacterModalProps> = ({
  open,
  onClose,
  heroInfo,
  enemyInfo,
  applyToFriendlySquad,
  onToggleApplyToSquad,
  onUploadFile,
  onLoadUrl,
  onLoadSampleGlb,
}) => {
  const [heroUrlInput, setHeroUrlInput] = useState('');
  const [enemyUrlInput, setEnemyUrlInput] = useState('');
  const [busySlot, setBusySlot] = useState<'hero' | 'enemy' | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!open) return null;

  const handleFileChange = async (
    slot: 'hero' | 'enemy',
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMsg(null);
    setBusySlot(slot);
    try {
      await onUploadFile(slot, file);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to parse 3D model.');
    } finally {
      setBusySlot(null);
      e.target.value = '';
    }
  };

  const handleUrlSubmit = async (slot: 'hero' | 'enemy') => {
    const url = slot === 'hero' ? heroUrlInput : enemyUrlInput;
    setErrorMsg(null);
    setBusySlot(slot);
    try {
      await onLoadUrl(slot, url);
      if (slot === 'hero') setHeroUrlInput('');
      else setEnemyUrlInput('');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to load URL.');
    } finally {
      setBusySlot(null);
    }
  };

  const handleSample = async (slot: 'hero' | 'enemy') => {
    setErrorMsg(null);
    setBusySlot(slot);
    try {
      await onLoadSampleGlb(slot);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to build sample GLB.');
    } finally {
      setBusySlot(null);
    }
  };

  const renderSlotPanel = (
    title: string,
    slot: 'hero' | 'enemy',
    info: CharacterModelInfo,
    urlValue: string,
    setUrlValue: (v: string) => void
  ) => {
    const isLoaded = info.status === 'loaded_glb';
    return (
      <div className="border border-stone-800 bg-stone-900/90 rounded-lg p-4 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-stone-100">{title}</h3>
            <p className="text-xs text-stone-400 mt-0.5 break-all">
              Source: {info.fileName || info.providedUrl}
            </p>
          </div>
          <div className="flex items-center gap-1.5 text-xs font-medium shrink-0">
            {isLoaded ? (
              <span className="text-emerald-400 flex items-center gap-1">
                <FileCheck2 className="w-3.5 h-3.5" /> 3D GLB Active
              </span>
            ) : (
              <span className="text-amber-400 flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" /> 3D Placeholder Active
              </span>
            )}
          </div>
        </div>

        <p className="text-xs text-stone-300 leading-relaxed">{info.resolvedSummary}</p>

        {isLoaded && (
          <div className="text-xs text-stone-400 font-mono-num pt-1 border-t border-stone-800">
            <span>Vertices: {info.vertexCount.toLocaleString()}</span>
            <span className="mx-2">·</span>
            <span>Clips: {info.detectedClips.length > 0 ? info.detectedClips.join(', ') : 'None (Procedural Motion)'}</span>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-semibold transition-colors whitespace-nowrap shrink-0">
            <Upload className="w-3.5 h-3.5" />
            <span>{busySlot === slot ? 'Importing...' : 'Upload .GLB / .GLTF'}</span>
            <input
              type="file"
              accept=".glb,.gltf"
              className="hidden"
              disabled={busySlot !== null}
              onChange={(e) => handleFileChange(slot, e)}
            />
          </label>

          <button
            type="button"
            disabled={busySlot !== null}
            onClick={() => handleSample(slot)}
            className="px-3 py-1.5 rounded-md border border-stone-700 hover:border-stone-500 text-stone-200 text-xs font-medium transition-colors whitespace-nowrap shrink-0"
          >
            Load Sample Animated .GLB
          </button>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="url"
            value={urlValue}
            onChange={(e) => setUrlValue(e.target.value)}
            placeholder="Or paste direct https://.../character.glb URL"
            className="flex-1 min-w-0 bg-stone-950 border border-stone-800 rounded-md px-2.5 py-1.5 text-xs text-stone-100 placeholder:text-stone-500 focus:outline-none focus:border-amber-500"
          />
          <button
            type="button"
            disabled={busySlot !== null || !urlValue.trim()}
            onClick={() => handleUrlSubmit(slot)}
            className="px-3 py-1.5 rounded-md bg-stone-800 hover:bg-stone-700 disabled:opacity-40 text-stone-100 text-xs font-medium transition-colors whitespace-nowrap shrink-0"
          >
            Import URL
          </button>
        </div>

        {slot === 'hero' && (
          <label className="flex items-center gap-2 text-xs text-stone-300 cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={applyToFriendlySquad}
              onChange={(e) => onToggleApplyToSquad(e.target.checked)}
              className="rounded border-stone-700 bg-stone-950 text-amber-500 focus:ring-amber-500"
            />
            <span>Also apply imported Hero .GLB model to friendly infantry squad</span>
          </label>
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 pointer-events-auto">
      <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-xl border border-stone-800 bg-stone-950 text-stone-100 shadow-2xl">
        {/* Header with subtle generated medieval panorama scrim */}
        <div className="relative h-28 overflow-hidden border-b border-stone-800 bg-stone-900">
          <img
            src={backdropImg}
            alt="Medieval castle keep overlooking valley and village"
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover opacity-45"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-stone-950 via-stone-950/65 to-transparent" />
          <div className="absolute inset-0 p-5 flex items-end justify-between gap-4">
            <div>
              <h2 className="font-display text-lg font-bold text-stone-100">
                3D Character &amp; Faction Model Importer
              </h2>
              <p className="text-xs text-stone-300 mt-0.5">
                Import compatible .GLB or .GLTF rigged characters with skeletal animations.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close character importer"
              className="p-2 rounded-lg bg-stone-900/90 border border-stone-700 text-stone-300 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-5 flex flex-col gap-5">
          {errorMsg && (
            <div className="rounded-lg border border-red-800 bg-red-950/60 px-3.5 py-2.5 text-xs text-red-200">
              {errorMsg}
            </div>
          )}

          {/* Honest Requirement Notice */}
          <div className="rounded-lg border border-stone-800 bg-stone-900/50 p-3.5 text-xs text-stone-300 space-y-1.5">
            <p className="font-semibold text-amber-400">
              Why a 3D Calibration Placeholder Rig is Currently Shown on Your Hero
            </p>
            <p className="leading-relaxed">
              Your two shared links resolved to Google Image Search previews (a non-downloadable
              Sketchfab JPEG thumbnail with 0 animations for the Soldier, and an Instagram 2D photo
              for the Opposite Team). Per your instructions, we do not pretend a 2D image is a
              working 3D character or swap your hero for a generic knight.
            </p>
            <p className="text-stone-400 leading-relaxed">
              <strong className="text-stone-200">Required 3D File Format:</strong> Upload a{' '}
              <code className="text-amber-300">.glb</code> (recommended single binary with textures
              &amp; skeleton) or <code className="text-amber-300">.gltf</code> humanoid character.
              Embedded animation clips matching <em>Idle, Walk, Run, Attack, Block, Death</em> are
              automatically mapped to Three.js <code className="text-stone-200">AnimationMixer</code>.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {renderSlotPanel(
              '1. Playable Hero Character',
              'hero',
              heroInfo,
              heroUrlInput,
              setHeroUrlInput
            )}
            {renderSlotPanel(
              '2. Opposite Team Troops',
              'enemy',
              enemyInfo,
              enemyUrlInput,
              setEnemyUrlInput
            )}
          </div>

          <div className="flex justify-end pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-stone-800 hover:bg-stone-700 text-xs font-semibold text-stone-100 transition-colors whitespace-nowrap shrink-0"
            >
              Return to Battlefield
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
