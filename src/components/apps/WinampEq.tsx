import { useState } from 'preact/hooks';
import { eqBands, resetEq, setEqBand } from '../../kernel/player';
import { minimizeWindow } from '../../kernel/windows';
import { openContextMenu } from '../../kernel/menu';
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

export default function WinampEq({ api, windowId }: AppProps) {
  const [enabled, setEnabled] = useState(true);
  const [auto, setAuto] = useState(false);
  const [preamp, setPreamp] = useState(0);
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
    PRESETS[name].forEach((value, index) => setEqBand(index, value));
    setEnabled(true);
  }

  function presetsMenu(event: MouseEvent) {
    event.stopPropagation();
    openContextMenu(
      event,
      Object.keys(PRESETS).map((name) => ({ label: name, action: () => applyPreset(name) })),
    );
  }

  return (
    <div class="wa wa-eq">
      <div class="wa-eq-titlebar" data-drag-handle>
        <span class="wa-eq-title">WINAMP EQUALIZER</span>
        <button
          class="wa-title-button wa-eq-min"
          title="Minimize"
          onClick={() => minimizeWindow(windowId)}
        />
        <button class="wa-title-button wa-eq-close" title="Close" onClick={() => api.close()} />
      </div>

      <div class="wa-eq-controls">
        <button class={`wa-eq-switch ${enabled ? 'on' : ''}`} onClick={toggle}>
          <i /> ON
        </button>
        <button class={`wa-eq-switch ${auto ? 'on' : ''}`} onClick={() => setAuto((value) => !value)}>
          <i /> AUTO
        </button>
        <button class="wa-eq-presets" onClick={presetsMenu}>PRESETS</button>
      </div>

      <div class="wa-eq-graph">
        <div class="wa-eq-preamp">
          <div class="wa-eq-cell">
            <input
              class="wa-eq-slider"
              type="range"
              min="-12"
              max="12"
              step="1"
              value={preamp}
              disabled={!enabled}
              onInput={(event) => setPreamp(Number((event.target as HTMLInputElement).value))}
              aria-label="Preamp"
            />
          </div>
        </div>
        <div class="wa-eq-bands">
          {LABELS.map((label, index) => (
            <div class="wa-eq-cell" key={label}>
              <input
                class="wa-eq-slider"
                type="range"
                min="-12"
                max="12"
                step="1"
                value={eqBands.value[index]}
                disabled={!enabled}
                onInput={(event) => setEqBand(index, Number((event.target as HTMLInputElement).value))}
                aria-label={`${label} Hz`}
              />
            </div>
          ))}
        </div>
      </div>

      <button class="wa-eq-reset" onClick={resetEq} title="Reset equalizer">
        RESET
      </button>
    </div>
  );
}
