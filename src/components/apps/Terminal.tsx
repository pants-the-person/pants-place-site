import { useEffect, useRef, useState } from 'preact/hooks';
import type { AppProps } from '../../kernel/types';

const KEY_SCANCODES: Record<string, number> = {
  Enter: 0x1c,
  Backspace: 0x0e,
  Tab: 0x0f,
  Escape: 0x01,
  ArrowUp: 0x48,
  ArrowDown: 0x50,
  ArrowLeft: 0x4b,
  ArrowRight: 0x4d,
  Delete: 0x53,
  Insert: 0x52,
  Home: 0x47,
  End: 0x4f,
  PageUp: 0x49,
  PageDown: 0x51,
  F1: 0x3b,
  F2: 0x3c,
  F3: 0x3d,
  F4: 0x3e,
  F5: 0x3f,
  F6: 0x40,
  F7: 0x41,
  F8: 0x42,
  F9: 0x43,
  F10: 0x44,
  F11: 0x57,
  F12: 0x58,
};

const CTRL_SCANCODES: Record<string, number> = {
  a: 0x1e,
  b: 0x30,
  c: 0x2e,
  d: 0x20,
  e: 0x12,
  f: 0x21,
  g: 0x22,
  h: 0x23,
  i: 0x17,
  j: 0x24,
  k: 0x25,
  l: 0x26,
  m: 0x32,
  n: 0x31,
  o: 0x18,
  p: 0x19,
  q: 0x10,
  r: 0x13,
  s: 0x1f,
  t: 0x14,
  u: 0x16,
  v: 0x2f,
  w: 0x11,
  x: 0x2d,
  y: 0x15,
  z: 0x2c,
};


const CHAR_SCANCODES: Record<string, number> = {
  '1': 0x02, '2': 0x03, '3': 0x04, '4': 0x05, '5': 0x06, '6': 0x07, '7': 0x08, '8': 0x09, '9': 0x0a, '0': 0x0b,
  '-': 0x0c, '=': 0x0d,
  q: 0x10, w: 0x11, e: 0x12, r: 0x13, t: 0x14, y: 0x15, u: 0x16, i: 0x17, o: 0x18, p: 0x19,
  '[': 0x1a, ']': 0x1b,
  a: 0x1e, s: 0x1f, d: 0x20, f: 0x21, g: 0x22, h: 0x23, j: 0x24, k: 0x25, l: 0x26,
  ';': 0x27, "'": 0x28, '`': 0x29, '\\': 0x2b,
  z: 0x2c, x: 0x2d, c: 0x2e, v: 0x2f, b: 0x30, n: 0x31, m: 0x32,
  ',': 0x33, '.': 0x34, '/': 0x35, ' ': 0x39,
};

const SHIFTED_CHARS: Record<string, string> = {
  '!': '1', '@': '2', '#': '3', '$': '4', '%': '5', '^': '6', '&': '7', '*': '8', '(': '9', ')': '0',
  '_': '-', '+': '=', '{': '[', '}': ']', '|': '\\', ':': ';', '"': "'", '~': '`', '<': ',', '>': '.', '?': '/',
};

type TerminalEntry = {
  root: HTMLElement | null;
  emulator: any;
  focus: () => void;
  paste: () => void;
};

const terminalEntries = new Set<TerminalEntry>();
let activeTerminal: TerminalEntry | null = null;
let terminalListenerAttached = false;

function setActiveTerminal(active: TerminalEntry | null, focus = false) {
  activeTerminal = active;
  for (const entry of terminalEntries) {
    try {
      entry.emulator.keyboard_set_enabled(entry === active);
    } catch {
      /* older v86 */
    }
  }
  if (active && focus) active.focus();
}

function onTerminalPointerDown(event: PointerEvent) {
  const target = event.target as HTMLElement;
  const clickedWindow = target.closest('.win98-window');
  let hit: TerminalEntry | null = null;

  if (clickedWindow) {
    for (const entry of terminalEntries) {
      if (entry.root?.closest('.win98-window') === clickedWindow) {
        hit = entry;
        break;
      }
    }

    // Fallback: map the terminal's input element to its emulator. This keeps
    // click routing correct even if the component root ref was not available
    // when the terminal registered (lazy window mounting).
    if (!hit) {
      const input = clickedWindow.querySelector('.dos-mobile-input') as
        | (HTMLInputElement & { __emulator?: any })
        | null;
      if (input?.__emulator) {
        hit =
          [...terminalEntries].find((entry) => entry.emulator === input.__emulator) ?? null;
      }
    }
  }

  const coarse = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
  const focus = Boolean(
    coarse &&
      hit &&
      hit.root?.contains(target) &&
      !target.closest('button, input, textarea, select, a'),
  );
  setActiveTerminal(hit, focus);
}


function isCoarsePointer() {
  return typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
}

function sendCharTo(emulator: any, char: string) {
  try {
    const shiftedBase = SHIFTED_CHARS[char];
    const upper = char.length === 1 && char >= 'A' && char <= 'Z' ? char.toLowerCase() : null;
    const base = shiftedBase ?? upper ?? char.toLowerCase();
    const code = CHAR_SCANCODES[base];
    if (!code) return;
    emulator.keyboard_set_enabled(true);
    if (shiftedBase || upper) {
      emulator.keyboard_send_scancodes([0x2a, code, code | 0x80, 0xaa]);
    } else {
      emulator.keyboard_send_scancodes([code, code | 0x80]);
    }
  } catch {
    /* ignore */
  }
}

function sendScancodeTo(emulator: any, code: number) {
  try {
    emulator.keyboard_set_enabled(true);
    emulator.keyboard_send_scancodes([code, code | 0x80]);
  } catch {
    /* ignore */
  }
}

function sendCtrlTo(emulator: any, code: number) {
  try {
    emulator.keyboard_set_enabled(true);
    emulator.keyboard_send_scancodes([0x1d, code, code | 0x80, 0x9d]);
  } catch {
    /* ignore */
  }
}

function onTerminalKeyDown(event: KeyboardEvent) {
  if (!activeTerminal || isCoarsePointer()) return;
  const target = event.target as HTMLElement | null;
  if (document.querySelector('.win98-dialog') || target?.closest?.('input, textarea, select')) {
    setActiveTerminal(null);
    return;
  }
  event.preventDefault();
  event.stopImmediatePropagation();

  const entry = activeTerminal;
  const key = event.key;
  const scancode = KEY_SCANCODES[key];
  if (scancode) {
    sendScancodeTo(entry.emulator, scancode);
    return;
  }

  if (event.ctrlKey || event.altKey || event.metaKey) {
    if (event.ctrlKey && CTRL_SCANCODES[key.toLowerCase()]) {
      if (key.toLowerCase() === 'v') {
        entry.paste();
      } else {
        sendCtrlTo(entry.emulator, CTRL_SCANCODES[key.toLowerCase()]);
      }
    }
    return;
  }

  if (key.length === 1) {
    sendCharTo(entry.emulator, key);
  }
}

function onTerminalKeyUp(event: KeyboardEvent) {
  if (!activeTerminal || isCoarsePointer()) return;
  const target = event.target as HTMLElement | null;
  if (document.querySelector('.win98-dialog') || target?.closest?.('input, textarea, select')) {
    setActiveTerminal(null);
    return;
  }
  event.preventDefault();
  event.stopImmediatePropagation();
}

function registerTerminal(entry: TerminalEntry) {
  terminalEntries.add(entry);
  // The newly opened terminal becomes the active one; every other terminal
  // is disabled so keys can never be delivered to multiple VMs.
  setActiveTerminal(entry);
  if (!terminalListenerAttached) {
    document.addEventListener('pointerdown', onTerminalPointerDown, true);
    document.addEventListener('keydown', onTerminalKeyDown, true);
    document.addEventListener('keyup', onTerminalKeyUp, true);
    terminalListenerAttached = true;
  }
}

function unregisterTerminal(entry: TerminalEntry) {
  const wasActive = activeTerminal === entry;
  terminalEntries.delete(entry);
  try {
    entry.emulator.keyboard_set_enabled(false);
  } catch {
    /* ignore */
  }
  if (wasActive) setActiveTerminal(null);
  if (!terminalEntries.size && terminalListenerAttached) {
    document.removeEventListener('pointerdown', onTerminalPointerDown, true);
    document.removeEventListener('keydown', onTerminalKeyDown, true);
    document.removeEventListener('keyup', onTerminalKeyUp, true);
    terminalListenerAttached = false;
    activeTerminal = null;
  }
}

export default function Terminal({ api }: AppProps) {
  const screenRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const emulatorRef = useRef<any>(null);
  const entryRef = useRef<TerminalEntry | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [phosphor, setPhosphor] = useState(true);
  const [scale, setScale] = useState(1);

  function focusInput() {
    const focus = () => {
      try {
        inputRef.current?.focus({ preventScroll: true });
        const input = inputRef.current;
        if (input) input.setSelectionRange(input.value.length, input.value.length);
      } catch {
        /* ignore */
      }
    };
    focus();
    // The window manager re-renders on focus. Re-focus after that render so
    // keystrokes never fall back to <body> and v86's global listeners.
    requestAnimationFrame(focus);
  }

  useEffect(() => {
    const deactivate = () => setActiveTerminal(null);
    window.addEventListener('pants:deactivate-terminal', deactivate);
    return () => window.removeEventListener('pants:deactivate-terminal', deactivate);
  }, []);

  useEffect(() => {
    let disposed = false;
    let cleanupResize: (() => void) | undefined;
    let entry: TerminalEntry | null = null;

    (async () => {
      try {
        await document.fonts.load('16px "Px437 IBM VGA 8x16"');
        const mod = await import('v86');
        if (disposed || !screenRef.current) return;

        const emulator = new (mod as any).V86({
          wasm_path: '/v86/v86.wasm',
          memory_size: 32 * 1024 * 1024,
          vga_memory_size: 2 * 1024 * 1024,
          screen: {
            container: screenRef.current,
            scaling: 1,
            encoding: 'cp437',
          },
          bios: { url: '/v86/seabios.bin' },
          vga_bios: { url: '/v86/vgabios.bin' },
          fda: { url: '/v86/freedos722.img' },
          autostart: true,
          disable_speaker: true,
        });
        emulatorRef.current = emulator;

        // v86's global listeners are useful for a single terminal, but not for
        // several. Only the clicked terminal is enabled; typing goes through
        // that terminal's own focused input.
        try {
          emulator.keyboard_set_enabled(false);
        } catch {
          /* older v86 */
        }

        entry = {
          root: rootRef.current,
          emulator,
          focus: focusInput,
          paste: () => void paste(),
        };
        entryRef.current = entry;
        if (inputRef.current) (inputRef.current as any).__emulator = emulator;
        registerTerminal(entry);

        emulator.add_listener('emulator-ready', () => {
          if (!disposed) setReady(true);
        });

        const resize = () => {
          if (!wrapRef.current) return;
          const rect = wrapRef.current.getBoundingClientRect();
          const next = Math.min(rect.width / 648, rect.height / 408);
          setScale(Math.max(0.55, Math.min(1.6, next)));
        };
        resize();
        const observer = new ResizeObserver(resize);
        if (wrapRef.current) observer.observe(wrapRef.current);
        cleanupResize = () => observer.disconnect();
      } catch (error) {
        setFailed(error instanceof Error ? error.message : String(error));
      }
    })();

    return () => {
      disposed = true;
      cleanupResize?.();
      if (entry) unregisterTerminal(entry);
      entryRef.current = null;
      try {
        emulatorRef.current?.destroy();
      } catch {
        /* ignore */
      }
      emulatorRef.current = null;
    };
  }, []);

  function getEmulator() {
    return entryRef.current?.emulator ?? emulatorRef.current;
  }

  function sendText(text: string, input?: HTMLInputElement | null) {
    try {
      const emulator = (input as any)?.__emulator ?? getEmulator();
      emulator?.keyboard_set_enabled(true);
      emulator?.keyboard_send_text(text);
    } catch {
      /* ignore */
    }
  }

  function sendScancode(code: number) {
    try {
      const emulator = getEmulator();
      emulator?.keyboard_set_enabled(true);
      emulator?.keyboard_send_scancodes([code, code | 0x80]);
    } catch {
      /* ignore */
    }
  }

  function sendCtrl(code: number) {
    try {
      const emulator = getEmulator();
      emulator?.keyboard_set_enabled(true);
      emulator?.keyboard_send_scancodes([0x1d, code, code | 0x80, 0x9d]);
    } catch {
      /* ignore */
    }
  }

  async function paste() {
    try {
      const text = await navigator.clipboard.readText();
      if (text) sendText(text);
    } catch {
      api.notify('Clipboard access was denied.');
    }
  }

  function fullscreen() {
    wrapRef.current?.requestFullscreen?.().catch(() => api.notify('Fullscreen was denied.'));
  }

  return (
    <div
      ref={rootRef}
      style={{ display: 'flex', flexDirection: 'column', height: '100%' }}
    >
      <div class="menu-bar">
        <button onClick={() => getEmulator()?.restart()}>File</button>
        <button onClick={paste}>Edit</button>
        <button onClick={() => setPhosphor((v) => !v)}>View</button>
        <button onClick={fullscreen}>Options</button>
        <button
          onClick={() =>
            api.dialog({
              title: 'About MS-DOS Prompt',
              message: 'FreeDOS 7.10 running in v86 (WebAssembly)\n\nA real x86 virtual machine in your browser. Try VER, DIR, MEM, INVADERS, SNAKE or TETRIS.',
              icon: '/icons/dos.svg',
            })
          }
        >
          Help
        </button>
      </div>
      <div class="toolbar">
        <button onClick={() => getEmulator()?.restart()}>Restart</button>
        <button onClick={fullscreen}>Full Screen</button>
        <button onClick={paste}>Paste</button>
        <button class={phosphor ? 'active' : ''} onClick={() => setPhosphor((v) => !v)}>
          CRT Filter
        </button>
        <span style={{ marginLeft: 'auto', paddingRight: '4px', color: '#404040' }}>
          FreeDOS 7.10 · v86 · 32 MB
        </span>
      </div>
      <div class="dos-wrap" ref={wrapRef}>
        {failed ? (
          <div class="dos-error">
            <div>Failed to start the FreeDOS virtual machine.</div>
            <div style={{ marginTop: '8px', color: '#ffb000' }}>{failed}</div>
            <div style={{ marginTop: '12px' }}>
              The wasm/bios/disk images are served from <code>/v86/</code>.
            </div>
          </div>
        ) : (
          <div
            ref={screenRef}
            class={`dos-screen ${phosphor ? 'phosphor' : 'color'}`}
            style={{ transform: `scale(${scale})` }}
          >
            <div class="dos-text" />
            <canvas />
          </div>
        )}
        {!ready && !failed ? (
          <div class="dos-loading">
            <div>Starting FreeDOS VM...</div>
            <div class="progress-indicator" style={{ width: '220px', marginTop: '10px' }}>
              <div class="progress-indicator-bar" style={{ width: '45%' }} />
            </div>
          </div>
        ) : null}
        <input
          ref={inputRef}
          class="dos-mobile-input"
          autocomplete="off"
          autocapitalize="off"
          spellcheck={false}
          aria-label="DOS keyboard input"
          onInput={(event) => {
            const input = event.target as HTMLInputElement;
            const value = input.value;
            if (value) sendText(value, input);
            input.value = '';
          }}
          onKeyDown={(event) => {
            const key = event.key;
            const scancode = KEY_SCANCODES[key];
            if (scancode) {
              event.preventDefault();
              sendScancode(scancode);
              return;
            }

            if (event.ctrlKey || event.altKey || event.metaKey) {
              // Stop browser shortcuts (Ctrl+N, Ctrl+L, F5, etc.) from
              // escaping the emulated machine while the terminal has focus.
              event.preventDefault();
              if (event.ctrlKey && CTRL_SCANCODES[key.toLowerCase()]) {
                if (key.toLowerCase() === 'v') {
                  void paste();
                } else {
                  sendCtrl(CTRL_SCANCODES[key.toLowerCase()]);
                }
              }
            }
          }}
          onPaste={(event) => {
            event.preventDefault();
            const text = event.clipboardData?.getData('text');
            if (text) sendText(text);
          }}
          onBlur={() => {
            const input = inputRef.current;
            if (input?.value) input.value = '';
          }}
        />
      </div>
      <div class="status-bar">
        <div class="status-bar-field">{ready ? 'FreeDOS ready. A:\\>' : 'Booting...'}</div>
        <div class="status-bar-field">v86 x86 VM</div>
        <div class="status-bar-field">WebAssembly</div>
      </div>
    </div>
  );
}
