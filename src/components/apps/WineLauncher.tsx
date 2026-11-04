import { useMemo, useState } from 'preact/hooks';
import type { AppProps } from '../../kernel/types';
import { wineApps, wineAppsByCategory, type WineAppCategory } from '../../generated/wine-apps';
import { openWineApp } from '../../kernel/wine';

const categories: Array<{ id: 'all' | WineAppCategory; label: string }> = [
  { id: 'all', label: 'All Programs' },
  { id: 'accessories', label: 'Accessories' },
  { id: 'games', label: 'Games' },
  { id: 'system', label: 'System' },
];

function sizeLabel(bytes: number) {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function WineLauncher({ api }: AppProps) {
  const [category, setCategory] = useState<'all' | WineAppCategory>('all');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(wineApps[0]?.id || null);
  const coarse = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

  const entries = useMemo(() => {
    const base = category === 'all' ? wineApps : wineAppsByCategory[category];
    const needle = query.trim().toLowerCase();
    if (!needle) return base;
    return base.filter(
      (app) =>
        app.title.toLowerCase().includes(needle) ||
        app.id.toLowerCase().includes(needle),
    );
  }, [category, query]);

  const current = entries.find((app) => app.id === selected) || entries[0] || null;

  function launch(id: string) {
    if (!openWineApp(id)) {
      api.notify(`Wine-Assembly has no program called "${id}".`);
    }
  }

  function activation(id: string) {
    setSelected(id);
    if (coarse) launch(id);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div class="menu-bar">
        <button onClick={() => current && launch(current.id)}>File</button>
        <button onClick={() => setQuery('')}>Edit</button>
        <button onClick={() => setCategory(category === 'all' ? 'games' : 'all')}>View</button>
        <button
          onClick={() =>
            void api.dialog({
              title: 'About Wine-Assembly',
              message:
                'Wine-Assembly runs original, unmodified Windows 98 .exe files on an x86 interpreter and Win32 implementation written in WebAssembly.',
              detail:
                `${wineApps.length} programs are mirrored locally. Engine © 2026 Vladimir Grichina, MIT licensed. Application binaries retain their own licenses and provenance.`,
              icon: '/icons/wine.svg',
            })
          }
        >
          Help
        </button>
      </div>

      <div class="toolbar">
        <button onClick={() => current && launch(current.id)} disabled={!current}>
          <img src="/icons/wine.svg" alt="" width="16" height="16" /> Run
        </button>
        <button onClick={() => setCategory('all')}>All Programs</button>
        <span style={{ marginLeft: 'auto', paddingRight: '4px', color: '#404040' }}>
          Wine-Assembly · {wineApps.length} programs
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '2px 4px', flex: '0 0 auto' }}>
        <span>Search</span>
        <input
          class="field"
          value={query}
          placeholder="Type part of a program name"
          style={{ flex: 1, height: '21px', color: '#000' }}
          onInput={(event) => setQuery((event.target as HTMLInputElement).value)}
        />
      </div>

      <div style={{ display: 'flex', flex: 1, minHeight: 0, gap: '4px', padding: '2px 4px' }}>
        <div style={{ width: '150px', flex: '0 0 150px', display: 'flex', flexDirection: 'column' }}>
          <div class="field" style={{ padding: '4px', background: '#fff', flex: 1, overflow: 'auto' }}>
            <div style={{ fontWeight: 700, marginBottom: '4px' }}>Wine-Assembly</div>
            {categories.map((item) => (
              <div
                key={item.id}
                onClick={() => {
                  setCategory(item.id);
                  setSelected(null);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '2px 4px',
                  cursor: 'default',
                  background: category === item.id ? 'var(--navy)' : 'transparent',
                  color: category === item.id ? '#fff' : '#000',
                }}
              >
                <img src="/icons/folder-16.svg" alt="" width="16" height="16" />
                {item.label}
              </div>
            ))}
            <div class="start-separator" style={{ margin: '6px 0' }} />
            <div style={{ padding: '2px 4px', color: '#404040', lineHeight: 1.5 }}>
              Real Windows programs running on a WebAssembly x86 emulator. Drop a
              .exe, .zip or .iso on an Explorer window to run your own.
            </div>
          </div>
        </div>

        <div class="field" style={{ flex: 1, minWidth: 0, overflow: 'auto', padding: '6px', background: '#fff' }}>
          <div class="explorer-grid">
            {entries.map((app) => (
              <button
                key={app.id}
                data-wine-app={app.id}
                class={`explorer-item ${selected === app.id ? 'selected' : ''}`}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  padding: '8px',
                  background: selected === app.id ? 'var(--navy)' : 'transparent',
                  color: selected === app.id ? '#fff' : '#000',
                  border: 0,
                  boxShadow: 'none',
                }}
                onClick={() => activation(app.id)}
                onDblClick={() => launch(app.id)}
                title={app.experimental ? `${app.title} (experimental)` : app.title}
              >
                <img src={app.icon} alt="" width="32" height="32" style={{ imageRendering: 'pixelated' }} />
                <span style={{ textAlign: 'center' }}>{app.title}</span>
                <small style={{ color: selected === app.id ? '#d0d0ff' : '#606060' }}>
                  {sizeLabel(app.sizeBytes)}
                  {app.experimental ? ' · experimental' : ''}
                </small>
              </button>
            ))}
            {!entries.length ? (
              <div style={{ padding: '24px', color: '#404040' }}>No programs match “{query}”.</div>
            ) : null}
          </div>
        </div>
      </div>

      <div class="status-bar">
        <div class="status-bar-field">
          {current ? current.title : `${entries.length} program${entries.length === 1 ? '' : 's'}`}
        </div>
        <div class="status-bar-field">{entries.length} shown</div>
        <div class="status-bar-field">Wine-Assembly</div>
      </div>
    </div>
  );
}
