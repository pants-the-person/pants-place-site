import { useEffect, useState } from 'preact/hooks';
import { showDialog } from '../../kernel/dialogs';
import { playSound } from '../../kernel/audio';
import { openApp } from '../../kernel/windows';
import { storageEstimate } from '../../kernel/content';
import { volume, setVolume } from '../../kernel/player';
import { settings, updateSettings, resetSettings } from '../../kernel/settings';
import { apps } from '../../kernel/app-registry';
import { wineApps } from '../../generated/wine-apps';
import type { AppProps } from '../../kernel/types';

type AppletId =
  | 'display'
  | 'sounds'
  | 'mouse'
  | 'keyboard'
  | 'datetime'
  | 'addremove'
  | 'system'
  | 'network'
  | 'accessibility';

interface Applet {
  id: AppletId;
  title: string;
  description: string;
  icon: string;
}

const APPLETS: Applet[] = [
  { id: 'display', title: 'Display', description: 'Wallpaper, colors and screen effects.', icon: '/icons/settings.svg' },
  { id: 'sounds', title: 'Sounds', description: 'System volume and event sounds.', icon: '/icons/volume.svg' },
  { id: 'mouse', title: 'Mouse', description: 'Pointer behavior and double-click speed.', icon: '/icons/computer.svg' },
  { id: 'keyboard', title: 'Keyboard', description: 'Repeat delay and repeat rate.', icon: '/icons/notepad.svg' },
  { id: 'datetime', title: 'Date/Time', description: 'Clock format and current date.', icon: '/icons/time.svg' },
  { id: 'addremove', title: 'Add/Remove Programs', description: 'Installed programs and components.', icon: '/icons/folder-open.svg' },
  { id: 'system', title: 'System', description: 'Storage, browser and Wine runtime.', icon: '/icons/computer.svg' },
  { id: 'network', title: 'Network', description: 'Dial-up Networking status.', icon: '/icons/network.svg' },
  { id: 'accessibility', title: 'Accessibility', description: 'Contrast, CRT and sound options.', icon: '/icons/face-smile.svg' },
];

function formatBytes(bytes: number) {
  if (!bytes) return '0 MB';
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ControlPanel({ api }: AppProps) {
  const [selected, setSelected] = useState<AppletId>('display');
  const [usage, setUsage] = useState<{ usage?: number; quota?: number } | null>(null);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    void storageEstimate().then(setUsage).catch(() => setUsage(null));
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    api.setTitle('Control Panel');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const current = APPLETS.find((applet) => applet.id === selected) || APPLETS[0];

  function openApplet(id: AppletId) {
    if (id === 'display') {
      openApp('display');
      return;
    }
    setSelected(id);
    playSound('click');
  }

  function patch(values: Parameters<typeof updateSettings>[0]) {
    updateSettings(values);
    playSound('ding');
  }

  return (
    <div class="control-panel">
      <div class="menu-bar">
        <button onClick={() => void showDialog({ title: 'Control Panel', message: 'Control Panel\n\nChoose an applet to configure this computer.', icon: '/icons/settings.svg' })}>File</button>
        <button onClick={() => void showDialog({ title: 'Control Panel', message: 'Use the icons to open a control panel applet.', icon: '/icons/settings.svg' })}>Edit</button>
        <button onClick={() => void storageEstimate().then(setUsage)}>View</button>
        <button onClick={() => openApp('help')}>Help</button>
      </div>

      <div class="control-panel-body">
        <div class="control-panel-grid" role="listbox" aria-label="Control Panel applets">
          {APPLETS.map((applet) => (
            <button
              class={`control-applet ${selected === applet.id ? 'selected' : ''}`}
              onClick={() => setSelected(applet.id)}
              onDblClick={() => openApplet(applet.id)}
              title={applet.description}
            >
              <img src={applet.icon} alt="" width="32" height="32" />
              <span>{applet.title}</span>
            </button>
          ))}
        </div>

        <div class="control-detail">
          <div class="control-detail-heading">
            <img src={current.icon} alt="" width="32" height="32" />
            <div>
              <h3>{current.title}</h3>
              <p>{current.description}</p>
            </div>
          </div>

          {selected === 'display' ? (
            <div class="control-options">
              <p>Change the desktop wallpaper, color scheme and CRT effects.</p>
              <button class="default" onClick={() => openApp('display')}>Open Display Properties</button>
            </div>
          ) : null}

          {selected === 'sounds' ? (
            <div class="control-options">
              <label>Master volume</label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={volume.value}
                onInput={(event) => setVolume(Number((event.target as HTMLInputElement).value))}
              />
              <label class="control-check">
                <input
                  type="checkbox"
                  checked={settings.value.sound}
                  onChange={(event) => patch({ sound: (event.target as HTMLInputElement).checked })}
                />
                Play system sounds
              </label>
              <button onClick={() => playSound('ding')}>Test sound</button>
            </div>
          ) : null}

          {selected === 'mouse' ? (
            <div class="control-options">
              <label class="control-check">
                <input
                  type="checkbox"
                  checked={settings.value.pointerShadow}
                  onChange={(event) => patch({ pointerShadow: (event.target as HTMLInputElement).checked })}
                />
                Show pointer shadow
              </label>
              <label>Double-click speed: {settings.value.doubleClickSpeed} ms</label>
              <input
                type="range"
                min="250"
                max="900"
                step="50"
                value={settings.value.doubleClickSpeed}
                onInput={(event) => patch({ doubleClickSpeed: Number((event.target as HTMLInputElement).value) })}
              />
              <div class="control-test-area">
                <button onClick={() => api.notify('Double-click test passed.')}>Double-click test</button>
              </div>
            </div>
          ) : null}

          {selected === 'keyboard' ? (
            <div class="control-options">
              <label>Repeat delay: {settings.value.keyboardDelay ?? 400} ms</label>
              <input
                type="range"
                min="200"
                max="900"
                step="50"
                value={settings.value.keyboardDelay ?? 400}
                onInput={(event) => patch({ keyboardDelay: Number((event.target as HTMLInputElement).value) })}
              />
              <label>Repeat rate: {settings.value.keyboardRate ?? 30} / sec</label>
              <input
                type="range"
                min="10"
                max="60"
                step="5"
                value={settings.value.keyboardRate ?? 30}
                onInput={(event) => patch({ keyboardRate: Number((event.target as HTMLInputElement).value) })}
              />
              <p class="control-note">Keyboard repeat is applied by the host operating system.</p>
            </div>
          ) : null}

          {selected === 'datetime' ? (
            <div class="control-options">
              <div class="control-clock">{now.toLocaleString()}</div>
              <label class="control-check">
                <input
                  type="checkbox"
                  checked={settings.value.clock24}
                  onChange={(event) => patch({ clock24: (event.target as HTMLInputElement).checked })}
                />
                Use 24-hour clock
              </label>
              <label class="control-check">
                <input
                  type="checkbox"
                  checked={settings.value.showSeconds}
                  onChange={(event) => patch({ showSeconds: (event.target as HTMLInputElement).checked })}
                />
                Show seconds in the taskbar clock
              </label>
            </div>
          ) : null}

          {selected === 'addremove' ? (
            <div class="control-options">
              <p>{apps.length + wineApps.length} installed program entries.</p>
              <div class="control-program-list">
                {apps.filter((app) => !app.hidden && app.startMenu !== 'none').slice(0, 8).map((app) => (
                  <div class="control-program-row">
                    <img src={app.icon} alt="" width="16" height="16" />
                    <span>{app.title}</span>
                    <span class="control-program-size">built in</span>
                  </div>
                ))}
                {wineApps.slice(0, 8).map((app) => (
                  <div class="control-program-row">
                    <img src={app.icon} alt="" width="16" height="16" />
                    <span>{app.title}</span>
                    <span class="control-program-size">{formatBytes(app.sizeBytes)}</span>
                  </div>
                ))}
              </div>
              <button onClick={() => void showDialog({ title: 'Add/Remove Programs', message: 'No uninstallers are registered.', detail: 'Programs are provided by Pants Place and Wine-Assembly.', icon: '/icons/folder-open.svg' })}>
                Add/Remove...
              </button>
            </div>
          ) : null}

          {selected === 'system' ? (
            <div class="control-options">
              <div class="control-system-grid">
                <span>System</span><strong>Pants Place 98 Second Edition</strong>
                <span>Browser</span><strong>{navigator.userAgent.includes('Firefox') ? 'Firefox' : navigator.userAgent.includes('Chrome') ? 'Chromium' : 'Unknown'}</strong>
                <span>C: storage</span><strong>{usage?.usage ? `${formatBytes(usage.usage)} of ${formatBytes(usage.quota || 0)}` : 'Measuring...'}</strong>
                <span>Wine runtime</span><strong>Wine-Assembly · WebAssembly</strong>
                <span>FreeDOS</span><strong>v86 · 32 MB</strong>
              </div>
              <button onClick={() => openApp('computer', { path: [] })}>Open My Computer</button>
            </div>
          ) : null}

          {selected === 'network' ? (
            <div class="control-options">
              <p>{settings.value.networkConnected ? 'Dial-Up Networking is connected at 56,000 bps.' : 'Dial-Up Networking is disconnected.'}</p>
              <button
                class="default"
                onClick={() => {
                  const next = !settings.value.networkConnected;
                  patch({ networkConnected: next });
                  api.notify(next ? 'Dial-up connection established.' : 'Dial-up connection closed.');
                }}
              >
                {settings.value.networkConnected ? 'Disconnect' : 'Connect'}
              </button>
              <button onClick={() => openApp('ie', { address: 'http://www.pants.place/' })}>Open Internet Explorer</button>
            </div>
          ) : null}

          {selected === 'accessibility' ? (
            <div class="control-options">
              <label class="control-check">
                <input
                  type="checkbox"
                  checked={settings.value.crt}
                  onChange={(event) => patch({ crt: (event.target as HTMLInputElement).checked })}
                />
                CRT scanline filter
              </label>
              <label class="control-check">
                <input
                  type="checkbox"
                  checked={settings.value.scheme === 'highcontrast'}
                  onChange={(event) => patch({ scheme: (event.target as HTMLInputElement).checked ? 'highcontrast' : 'standard' })}
                />
                High contrast color scheme
              </label>
              <label class="control-check">
                <input
                  type="checkbox"
                  checked={settings.value.sound}
                  onChange={(event) => patch({ sound: (event.target as HTMLInputElement).checked })}
                />
                System sounds
              </label>
              <button onClick={() => { resetSettings(); playSound('click'); api.notify('Accessibility settings reset.'); }}>
                Reset all settings
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <div class="status-bar">
        <div class="status-bar-field">{APPLETS.length} object(s)</div>
        <div class="status-bar-field">{current.title}</div>
        <div class="status-bar-field">Control Panel</div>
      </div>
    </div>
  );
}
