import { useEffect, useRef, useState } from 'preact/hooks';

export interface WineMenuItem {
  label?: string;
  shortcut?: string;
  id?: number;
  separator?: boolean;
  disabled?: boolean;
  checked?: boolean;
  children?: WineMenuItem[];
}

export interface WineMenu {
  label: string;
  top?: number;
  id?: number;
  items: WineMenuItem[];
}

export interface WineHostMenuItem {
  label: string;
  action: string;
  shortcut?: string;
}

export interface WineMenuCommand {
  top: number;
  child?: number;
  sub?: number;
}

interface Props {
  menus: WineMenu[];
  hostItems: WineHostMenuItem[];
  onCommand: (command: WineMenuCommand) => void;
  onHostAction: (action: string) => void;
}

export default function WineMenuBar({ menus, hostItems, onCommand, onHostAction }: Props) {
  const [open, setOpen] = useState<number | null>(null);
  const [sub, setSub] = useState<number | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  const allMenus: Array<WineMenu | { label: string; host: true; items: WineHostMenuItem[] }> = [
    ...menus,
    { label: 'Wine', host: true, items: hostItems },
  ];

  useEffect(() => {
    function close(event: PointerEvent) {
      if (barRef.current?.contains(event.target as Node)) return;
      setOpen(null);
      setSub(null);
    }
    function closeFromIframe() {
      setOpen(null);
      setSub(null);
    }
    document.addEventListener('pointerdown', close, true);
    window.addEventListener('pants:wine-blur', closeFromIframe);
    return () => {
      document.removeEventListener('pointerdown', close, true);
      window.removeEventListener('pants:wine-blur', closeFromIframe);
    };
  }, []);

  function show(index: number) {
    setOpen(index);
    setSub(null);
  }

  function choose(menuIndex: number, itemIndex: number, item: WineMenuItem) {
    if (item.disabled || item.separator) return;
    if (item.children?.length) {
      setSub(sub === itemIndex ? null : itemIndex);
      return;
    }
    setOpen(null);
    setSub(null);
    onCommand({ top: menuIndex, child: itemIndex });
  }

  function chooseSub(menuIndex: number, itemIndex: number, subIndex: number, item: WineMenuItem) {
    if (item.disabled || item.separator) return;
    setOpen(null);
    setSub(null);
    onCommand({ top: menuIndex, child: itemIndex, sub: subIndex });
  }

  return (
    <div class="menu-bar wine-menu-bar" ref={barRef}>
      {allMenus.map((menu, index) => {
        const host = 'host' in menu;
        const items = menu.items;
        const isOpen = open === index;
        const empty = !items.length;
        const menuTop = host ? index : (menu.top ?? index);
        return (
          <div class="wine-menu-root" key={`${menu.label}-${index}`}>
            <button
              class={isOpen ? 'wine-menu-button open' : 'wine-menu-button'}
              onClick={() => {
                if (empty && !host) {
                  onCommand({ top: menuTop });
                  return;
                }
                setOpen(isOpen ? null : index);
                setSub(null);
              }}
              onMouseEnter={() => {
                if (open !== null && open !== index) show(index);
              }}
            >
              {menu.label}
            </button>
            {isOpen && !empty ? (
              <div class="wine-menu-drop" role="menu">
                {host
                  ? (items as WineHostMenuItem[]).map((item) => (
                      <button
                        class="wine-menu-item"
                        onClick={() => {
                          setOpen(null);
                          onHostAction(item.action);
                        }}
                      >
                        <span class="wine-menu-check" />
                        <span class="wine-menu-label">{item.label}</span>
                        {item.shortcut ? <span class="wine-menu-shortcut">{item.shortcut}</span> : null}
                      </button>
                    ))
                  : (items as WineMenuItem[]).map((item, itemIndex) =>
                      item.separator ? (
                        <div class="wine-menu-separator" />
                      ) : (
                        <div class="wine-menu-item-wrap">
                          <button
                            class={`wine-menu-item ${item.disabled ? 'disabled' : ''}`}
                            onClick={() => choose(menuTop, itemIndex, item)}
                            onMouseEnter={() => setSub(item.children?.length ? itemIndex : null)}
                          >
                            <span class="wine-menu-check">{item.checked ? '✓' : ''}</span>
                            <span class="wine-menu-label">{item.label}</span>
                            {item.shortcut ? <span class="wine-menu-shortcut">{item.shortcut}</span> : null}
                            {item.children?.length ? <span class="wine-menu-arrow">▸</span> : null}
                          </button>
                          {sub === itemIndex && item.children?.length ? (
                            <div class="wine-menu-drop wine-menu-subdrop" role="menu">
                              {item.children.map((child, subIndex) =>
                                child.separator ? (
                                  <div class="wine-menu-separator" />
                                ) : (
                                  <button
                                    class={`wine-menu-item ${child.disabled ? 'disabled' : ''}`}
                                    onClick={() => chooseSub(menuTop, itemIndex, subIndex, child)}
                                  >
                                    <span class="wine-menu-check">{child.checked ? '✓' : ''}</span>
                                    <span class="wine-menu-label">{child.label}</span>
                                    {child.shortcut ? <span class="wine-menu-shortcut">{child.shortcut}</span> : null}
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
