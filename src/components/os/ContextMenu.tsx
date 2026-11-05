import { useEffect, useState } from 'preact/hooks';
import { closeContextMenu, contextMenu, type MenuItem } from '../../kernel/menu';

function ContextItem({ item, onChoose }: { item: MenuItem; onChoose: (item: MenuItem) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div class="context-item-wrap">
      <button
        class={`context-item ${item.disabled ? 'disabled' : ''}`}
        disabled={item.disabled}
        onClick={() => {
          if (item.children?.length) {
            setOpen((value) => !value);
            return;
          }
          onChoose(item);
        }}
        onMouseEnter={() => setOpen(Boolean(item.children?.length))}
      >
        <span class="context-check">{item.checked ? '✓' : ''}</span>
        {item.icon ? <img src={item.icon} alt="" width="16" height="16" /> : null}
        <span class="context-label">{item.label}</span>
        {item.shortcut ? <span class="context-shortcut">{item.shortcut}</span> : null}
        {item.children?.length ? <span class="context-arrow">▸</span> : null}
      </button>
      {open && item.children?.length ? (
        <div class="context-submenu">
          {item.children.map((child, index) =>
            child.separator ? (
              <div class="start-separator" key={`sep-${index}`} />
            ) : (
              <ContextItem item={child} onChoose={onChoose} key={`${child.label}-${index}`} />
            ),
          )}
        </div>
      ) : null}
    </div>
  );
}

export default function ContextMenuHost() {
  const menu = contextMenu.value;

  useEffect(() => {
    function close(event: PointerEvent) {
      if ((event.target as HTMLElement)?.closest?.('.context-menu')) return;
      closeContextMenu();
    }
    function escape(event: KeyboardEvent) {
      if (event.key === 'Escape') closeContextMenu();
    }
    document.addEventListener('pointerdown', close, true);
    document.addEventListener('keydown', escape);
    window.addEventListener('blur', closeContextMenu);
    return () => {
      document.removeEventListener('pointerdown', close, true);
      document.removeEventListener('keydown', escape);
      window.removeEventListener('blur', closeContextMenu);
    };
  }, []);

  if (!menu) return null;

  function choose(item: MenuItem) {
    if (item.disabled || item.separator || item.children?.length) return;
    closeContextMenu();
    void item.action?.();
  }

  return (
    <div
      class="context-menu"
      style={{ left: `${menu.x}px`, top: `${menu.y}px` }}
      onPointerDown={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
      role="menu"
    >
      {menu.items.map((item, index) =>
        item.separator ? (
          <div class="start-separator" key={`sep-${index}`} />
        ) : (
          <ContextItem item={item} onChoose={choose} key={`${item.label}-${index}`} />
        ),
      )}
    </div>
  );
}
