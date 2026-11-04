import { useState } from 'preact/hooks';
import { settings, updateSettings, resetSettings, type Settings } from '../../kernel/settings';
import { playSound } from '../../kernel/audio';
import type { AppProps } from '../../kernel/types';

const SCHEMES: { id: Settings['scheme']; label: string }[] = [
  { id: 'standard', label: 'Windows Standard' },
  { id: 'brick', label: 'Brick' },
  { id: 'desert', label: 'Desert' },
  { id: 'plum', label: 'Plum' },
  { id: 'rose', label: 'Rose' },
  { id: 'hotdog', label: 'Hot Dog Stand' },
];

const WALLPAPERS: { id: Settings['wallpaper']; label: string }[] = [
  { id: 'teal', label: '(None) — classic teal' },
  { id: 'clouds', label: 'Clouds' },
  { id: 'pipes', label: 'Pipes' },
  { id: 'stars', label: 'Starry Night' },
  { id: 'none', label: 'Solid Black' },
];

export default function DisplayProperties({ api }: AppProps) {
  const [tab, setTab] = useState<'background' | 'appearance' | 'effects'>('background');
  const [draft, setDraft] = useState({ ...settings.value });

  function apply() {
    updateSettings(draft);
    playSound('ding');
    api.notify('Display settings applied.');
  }

  return (
    <div class="display-props">
      <div class="tabs">
        <button class={tab === 'background' ? 'active' : ''} onClick={() => setTab('background')}>Background</button>
        <button class={tab === 'appearance' ? 'active' : ''} onClick={() => setTab('appearance')}>Appearance</button>
        <button class={tab === 'effects' ? 'active' : ''} onClick={() => setTab('effects')}>Effects</button>
      </div>

      <div class="display-preview raised">
        <div
          style={{
            height: '100%',
            background:
              draft.wallpaper === 'teal'
                ? '#008080'
                : draft.wallpaper === 'clouds'
                  ? 'radial-gradient(circle at 30% 30%, #fff, #1c8ab0)'
                  : draft.wallpaper === 'pipes'
                    ? 'repeating-linear-gradient(45deg, #1b3b5a 0 12px, #2c5d86 12px 18px)'
                    : draft.wallpaper === 'stars'
                      ? '#000018'
                      : '#000',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div style={{ width: '62%', height: '64%', background: 'var(--surface)', padding: '2px' }}>
            <div style={{ height: '12px', background: 'linear-gradient(90deg, var(--navy), var(--cerulean))' }} />
            <div style={{ height: 'calc(100% - 12px)', background: '#fff' }} />
          </div>
        </div>
      </div>

      {tab === 'background' ? (
        <div class="display-section">
          <label>Wallpaper</label>
          <select value={draft.wallpaper} onChange={(event) => setDraft({ ...draft, wallpaper: (event.target as HTMLSelectElement).value as Settings['wallpaper'] })}>
            {WALLPAPERS.map((w) => (
              <option value={w.id}>{w.label}</option>
            ))}
          </select>
          <p style={{ marginTop: '10px' }}>The desktop background is applied instantly when you press Apply.</p>
        </div>
      ) : null}

      {tab === 'appearance' ? (
        <div class="display-section">
          <label>Color scheme</label>
          <select value={draft.scheme} onChange={(event) => setDraft({ ...draft, scheme: (event.target as HTMLSelectElement).value as Settings['scheme'] })}>
            {SCHEMES.map((s) => (
              <option value={s.id}>{s.label}</option>
            ))}
          </select>
          <div style={{ marginTop: '10px', padding: '6px', background: 'var(--surface)' }}>
            <div style={{ height: '16px', background: 'linear-gradient(90deg, var(--navy), var(--cerulean))', color: '#fff', padding: '2px 4px' }}>
              Active Window
            </div>
            <div style={{ padding: '6px' }}>Sample text in the selected scheme.</div>
          </div>
        </div>
      ) : null}

      {tab === 'effects' ? (
        <div class="display-section">
          <label style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <input type="checkbox" checked={draft.crt} onChange={(event) => setDraft({ ...draft, crt: (event.target as HTMLInputElement).checked })} />
            CRT scanline filter
          </label>
          <label style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '8px' }}>
            <input type="checkbox" checked={draft.sound} onChange={(event) => setDraft({ ...draft, sound: (event.target as HTMLInputElement).checked })} />
            Play system sounds
          </label>
          <label style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '8px' }}>
            <input type="checkbox" checked={draft.clock24} onChange={(event) => setDraft({ ...draft, clock24: (event.target as HTMLInputElement).checked })} />
            24-hour clock
          </label>
          <button style={{ marginTop: '12px' }} onClick={() => { resetSettings(); setDraft({ ...settings.value }); }}>
            Reset all settings
          </button>
        </div>
      ) : null}

      <div class="display-buttons">
        <button onClick={apply}>Apply</button>
        <button
          class="default"
          onClick={() => {
            apply();
            api.close();
          }}
        >
          OK
        </button>
        <button onClick={() => api.close()}>Cancel</button>
      </div>
    </div>
  );
}
