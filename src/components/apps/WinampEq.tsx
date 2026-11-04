import { useState } from 'preact/hooks';
import { eqBands, resetEq, setEqBand } from '../../kernel/player';
import type { AppProps } from '../../kernel/types';

const LABELS = ['60', '170', '310', '600', '1K', '3K', '6K', '12K', '14K', '16K'];

const PRESETS: Record<string, number[]> = {
  Flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  Rock: [4, 3, 1, -1, -2, 0, 2, 3, 4, 4],
  Pop: [-1, 2, 3, 4, 3, 0, -1, -1, 1, 2],
  Dance: [5, 4, 1, 0, 0, -2, -3, -3, 0, 0],
  'Full Bass': [7, 6, 5, 3, 1, -1, -2, -3, -4, -5],
  'Full Treble': [-5, -4, -3, -1, 1, 3, 5, 6, 7, 8],
};

export default function WinampEq({ api }: AppProps) {
  const [enabled, setEnabled] = useState(true);
  const [saved, setSaved] = useState<number[]>([...eqBands.value]);

  function toggle() {
    if (enabled) {
      setSaved([...eqBands.value]);
      eqBands.value.forEach((_, index) => setEqBand(index, 0));
      setEnabled(false);
    } else {
      saved.forEach((value, index) => setEqBand(index, value));
      setEnabled(true);
    }
  }

  function applyPreset(name: string) {
    const values = PRESETS[name];
    values.forEach((value, index) => setEqBand(index, value));
  }

  return (
    <div class="winamp-eq">
      <div class="playlist-head">
        <span>WINAMP EQUALIZER</span>
        <button class={`eq-power ${enabled ? 'on' : ''}`} onClick={toggle}>
          {enabled ? 'ON' : 'OFF'}
        </button>
      </div>
      <div class="eq-sliders">
        {LABELS.map((label, index) => (
          <label class="eq-band" key={label}>
            <span class="eq-value">{eqBands.value[index] > 0 ? '+' : ''}{eqBands.value[index]}</span>
            <input
              type="range"
              min="-12"
              max="12"
              step="1"
              value={eqBands.value[index]}
              disabled={!enabled}
              onInput={(event) => setEqBand(index, Number((event.target as HTMLInputElement).value))}
              aria-label={`${label} Hz`}
            />
            <span class="eq-label">{label}</span>
          </label>
        ))}
      </div>
      <div class="playlist-actions">
        {Object.keys(PRESETS).map((name) => (
          <button onClick={() => applyPreset(name)}>{name}</button>
        ))}
        <button onClick={resetEq}>RESET</button>
        <button onClick={() => api.close()}>CLOSE</button>
      </div>
    </div>
  );
}
