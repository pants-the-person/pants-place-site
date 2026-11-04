import { useState } from 'preact/hooks';
import { desktopShortcuts } from '../../kernel/app-registry';
import { openApp } from '../../kernel/windows';
import { playSound } from '../../kernel/audio';

export default function DesktopIcons() {
  const [selected, setSelected] = useState<string | null>(null);

  function launch(id: string) {
    const shortcut = desktopShortcuts.find((s) => s.id === id);
    if (!shortcut) return;
    playSound('click');
    openApp(shortcut.appId, shortcut.props);
  }

  const coarse = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

  return (
    <div class="desktop-icons" onClick={() => setSelected(null)}>
      {desktopShortcuts.map((shortcut) => (
        <button
          key={shortcut.id}
          class={`desktop-icon ${selected === shortcut.id ? 'selected' : ''}`}
          onClick={(event) => {
            event.stopPropagation();
            setSelected(shortcut.id);
            if (coarse) launch(shortcut.id);
          }}
          onDblClick={() => launch(shortcut.id)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') launch(shortcut.id);
          }}
          title={shortcut.title}
        >
          <img src={shortcut.icon} alt="" width="32" height="32" draggable={false} />
          <span>{shortcut.title}</span>
        </button>
      ))}
    </div>
  );
}
