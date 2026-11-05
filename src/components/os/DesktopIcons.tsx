import { useEffect, useState } from 'preact/hooks';
import { desktopShortcuts } from '../../kernel/app-registry';
import { openApp } from '../../kernel/windows';
import { playSound } from '../../kernel/audio';
import { openContextMenu } from '../../kernel/menu';
import { showDialog } from '../../kernel/dialogs';

export default function DesktopIcons() {
  const [selected, setSelected] = useState<string | null>(null);
  const [ordered, setOrdered] = useState(desktopShortcuts);

  function launch(id: string) {
    const shortcut = desktopShortcuts.find((s) => s.id === id);
    if (!shortcut) return;
    playSound('click');
    openApp(shortcut.appId, shortcut.props);
  }

  useEffect(() => {
    function sort(event: Event) {
      const mode = (event as CustomEvent<string>).detail;
      const next = [...desktopShortcuts];
      if (mode === 'name') next.sort((a, b) => a.title.localeCompare(b.title));
      if (mode === 'type') next.sort((a, b) => a.appId.localeCompare(b.appId) || a.title.localeCompare(b.title));
      if (mode === 'size') next.sort((a, b) => a.title.localeCompare(b.title));
      setOrdered(next);
    }
    window.addEventListener('pants:desktop-sort', sort);
    return () => window.removeEventListener('pants:desktop-sort', sort);
  }, []);

  const coarse = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

  return (
    <div class="desktop-icons" onClick={() => setSelected(null)}>
      {ordered.map((shortcut) => (
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
          onContextMenu={(event) => {
            event.stopPropagation();
            setSelected(shortcut.id);
            openContextMenu(event, [
              { label: 'Open', action: () => launch(shortcut.id) },
              ...(shortcut.appId === 'computer'
                ? [{ label: 'Explore', action: () => launch(shortcut.id) }]
                : []),
              { separator: true },
              {
                label: 'Create Shortcut',
                action: () => void showDialog({
                  title: 'Create Shortcut',
                  message: 'Shortcuts are managed by the desktop.',
                  icon: '/icons/folder.svg',
                }),
              },
              {
                label: 'Properties',
                action: () => void showDialog({
                  title: `${shortcut.title} Properties`,
                  message: shortcut.title,
                  detail: `Target: ${shortcut.appId}`,
                  icon: shortcut.icon,
                }),
              },
            ]);
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
