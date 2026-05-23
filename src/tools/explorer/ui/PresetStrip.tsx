import type { PresetSpec } from '../types';
import { useSpecStoreHook } from '../store/context';

// Horizontal strip of preset cards above the layout. Click a card to load
// its full Spec into the store. Empty / hidden when no presets are
// configured (Milestone 4 ships with a small placeholder set).

type Props = {
  presets: PresetSpec[];
};

export default function PresetStrip({ presets }: Props) {
  const useStore = useSpecStoreHook();
  const loadPreset = useStore((s: { loadPreset: (spec: PresetSpec['spec']) => void }) => s.loadPreset);
  const activePresetId = useStore((s: { spec: { preset?: string } }) => s.spec.preset);

  if (presets.length === 0) return null;

  return (
    <div className="explorer-preset-strip" role="list">
      {presets.map((p) => (
        <button
          key={p.id}
          type="button"
          role="listitem"
          className={`explorer-preset-card ${activePresetId === p.id ? 'is-active' : ''}`}
          onClick={() => loadPreset({ ...p.spec, preset: p.id })}
        >
          <span className="explorer-preset-title">{p.title}</span>
          <span className="explorer-preset-blurb">{p.blurb}</span>
        </button>
      ))}
    </div>
  );
}
