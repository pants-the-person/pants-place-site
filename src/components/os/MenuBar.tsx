import { useEffect, useRef, useState } from 'preact/hooks';

import type { MenuDefinition as AppMenu, MenuItem as AppMenuItem } from '../../kernel/menu';

export type { MenuDefinition as AppMenu, MenuItem as AppMenuItem } from '../../kernel/menu';

interface Props {
  menus: AppMenu[];
  class?: string;
}

export default function MenuBar({ menus, class: extraClass }: Props) {
  const [open, setOpen] = useState<number | null>(null);
  const [sub, setSub] = useState<number | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function close(event: PointerEvent) {
      if (barRef.current?.contains(event.target as Node)) return;
      setOpen(null);
      setSub(null);
    }
    function escape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      setOpen(null);
      setSub(null);
    }
    document.addEventListener('pointerdown', close, true);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', close, true);
      document.removeEventListener('keydown', escape);
    };
  }, []);

  function choose(item: AppMenuItem) {
    if (item.disabled || item.separator) return;
    if (item.children?.length) return;
    setOpen(null);
    setSub(null);
    void item.action?.();
  }

  return (
    <div class={`app-menu-bar ${extraClass || ''}`} ref={barRef} role="menubar">
      {menus.map((menu, menuIndex) => {
        const isOpen = open === menuIndex;
        return (
          <div class="app-menu-root" key={`${menu.label}-${menuIndex}`}>
            <button
              class={`app-menu-button ${isOpen ? 'open' : ''}`}
              role="menuitem"
              aria-haspopup="true"
              aria-expanded={isOpen}
              onClick={() => {
                setOpen(isOpen ? null : menuIndex);
                setSub(null);
              }}
              onMouseEnter={() => {
                if (open !== null && open !== menuIndex) {
                  setOpen(menuIndex);
                  setSub(null);
                }
              }}
            >
              {menu.label}
            </button>
            {isOpen ? (
              <div class="app-menu-drop" role="menu">
                {menu.items.map((item, itemIndex) =>
                  item.separator ? (
                    <div class="start-separator" />
                  ) : (
                    <div class="app-menu-item-wrap" key={`${item.label}-${itemIndex}`}>
                      <button
                        class={`app-menu-item ${item.disabled ? 'disabled' : ''} ${item.checked ? 'checked' : ''}`}
                        role="menuitem"
                        disabled={item.disabled}
                        onClick={() => choose(item)}
                        onMouseEnter={() => setSub(item.children?.length ? itemIndex : null)}
                      >
                        <span class="app-menu-check">{item.checked ? '✓' : ''}</span>
                        {item.icon ? <img src={item.icon} alt="" width="16" height="16" /> : null}
                        <span class="app-menu-label">{item.label}</span>
                        {item.shortcut ? <span class="app-menu-shortcut">{item.shortcut}</span> : null}
                        {item.children?.length ? <span class="app-menu-arrow">▸</span> : null}
                      </button>
                      {sub === itemIndex && item.children?.length ? (
                        <div class="app-menu-drop app-menu-subdrop" role="menu">
                          {item.children.map((child, childIndex) =>
                            child.separator ? (
                              <div class="start-separator" />
                            ) : (
                              <button
                                class={`app-menu-item ${child.disabled ? 'disabled' : ''}`}
                                role="menuitem"
                                disabled={child.disabled}
                                onClick={() => choose(child)}
                                key={`${child.label}-${childIndex}`}
                              >
                                <span class="app-menu-check">{child.checked ? '✓' : ''}</span>
                                {child.icon ? <img src={child.icon} alt="" width="16" height="16" /> : null}
                                <span class="app-menu-label">{child.label}</span>
                                {child.shortcut ? <span class="app-menu-shortcut">{child.shortcut}</span> : null}
                              </button>
                            ),
                          )}
                        </div>
                      ) : null}
                    </div>
                  ),
                )}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
