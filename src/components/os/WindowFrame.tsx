import { useEffect, useRef, useState } from 'preact/hooks';
import { focusWindow, minimizeWindow, toggleMaximizeWindow, closeWindow, updateWindowBounds } from '../../kernel/windows';
import type { WindowState } from '../../kernel/types';
import { playSound } from '../../kernel/audio';
import { settings } from '../../kernel/settings';
import { openContextMenu } from '../../kernel/menu';

interface Props {
  window: WindowState;
  active: boolean;
  children: any;
}

type DragState = {
  startX: number;
  startY: number;
  origX: number;
  origY: number;
  origW: number;
  origH: number;
  edge?: string;
};

export default function WindowFrame({ window: win, active, children }: Props) {
  const drag = useRef<DragState | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!dragging) return;
    const move = (event: PointerEvent) => {
      const state = drag.current;
      if (!state) return;
      const dx = event.clientX - state.startX;
      const dy = event.clientY - state.startY;
      const maxY = window.innerHeight - 32;
      if (state.edge) {
        let x = state.origX;
        let y = state.origY;
        let w = state.origW;
        let h = state.origH;
        if (state.edge.includes('e')) w = Math.max(win.minW, state.origW + dx);
        if (state.edge.includes('s')) h = Math.max(win.minH, state.origH + dy);
        if (state.edge.includes('w')) {
          w = Math.max(win.minW, state.origW - dx);
          x = state.origX + (state.origW - w);
        }
        if (state.edge.includes('n')) {
          h = Math.max(win.minH, state.origH - dy);
          y = state.origY + (state.origH - h);
        }
        updateWindowBounds(win.id, { x, y, w, h });
      } else {
        const x = Math.max(-win.w + 80, Math.min(window.innerWidth - 80, state.origX + dx));
        const y = Math.max(0, Math.min(maxY - 20, state.origY + dy));
        updateWindowBounds(win.id, { x, y });
      }
    };
    const up = () => {
      drag.current = null;
      setDragging(false);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [dragging, win.id, win.minW, win.minH, win.w]);

  function beginDrag(event: PointerEvent, edge?: string) {
    if (event.button !== 0) return;
    if ((event.target as HTMLElement).closest('.title-bar-controls')) return;
    if (win.mode === 'max' && !edge) return;
    event.preventDefault();
    event.stopPropagation();
    focusWindow(win.id);
    drag.current = {
      startX: event.clientX,
      startY: event.clientY,
      origX: win.x,
      origY: win.y,
      origW: win.w,
      origH: win.h,
      edge,
    };
    setDragging(true);
    if (!edge && !settings.value.dragContents) {
      // The classic outline-drag mode is approximated by lowering opacity.
    }
  }

  function close() {
    playSound('click');
    closeWindow(win.id);
  }
  function minimize() {
    playSound('click');
    minimizeWindow(win.id);
  }
  function max() {
    playSound('click');
    toggleMaximizeWindow(win.id);
  }

  const style: Record<string, string> = {
    left: `${win.x}px`,
    top: `${win.y}px`,
    width: `${win.w}px`,
    height: `${win.h}px`,
    zIndex: String(win.z),
  };

  return (
    <div
      class={`win98-window ${active ? 'active' : 'inactive'} ${win.mode === 'max' ? 'maximized' : ''} ${win.mode === 'min' ? 'minimized' : ''} ${dragging ? 'dragging' : ''}`}
      style={style}
      onPointerDown={() => focusWindow(win.id)}
      role="dialog"
      aria-label={win.title}
    >
      <div
        class="title-bar"
        onPointerDown={(e) => beginDrag(e)}
        onDblClick={max}
        onContextMenu={(event) => {
          event.preventDefault();
          openContextMenu(event, [
            { label: win.mode === 'max' ? 'Restore' : 'Maximize', action: max },
            { label: 'Minimize', action: minimize },
            { separator: true },
            { label: 'Close', action: close },
          ]);
        }}
      >
        <img class="title-bar-icon" src={win.icon} alt="" width="16" height="16" />
        <span class="title-bar-text">{win.title}</span>
        <span class="title-bar-controls">
          <button data-action="minimize" aria-label="Minimize" onClick={minimize} />
          <button
            data-action={win.mode === 'max' ? 'restore' : 'maximize'}
            aria-label={win.mode === 'max' ? 'Restore' : 'Maximize'}
            onClick={max}
          />
          <button data-action="close" aria-label="Close" onClick={close} />
        </span>
      </div>
      <div class="window-body">{children}</div>
      {win.resizable && win.mode !== 'max' ? (
        <>
          <div class="resize-handle resize-n" onPointerDown={(e) => beginDrag(e, 'n')} />
          <div class="resize-handle resize-s" onPointerDown={(e) => beginDrag(e, 's')} />
          <div class="resize-handle resize-e" onPointerDown={(e) => beginDrag(e, 'e')} />
          <div class="resize-handle resize-w" onPointerDown={(e) => beginDrag(e, 'w')} />
          <div class="resize-handle resize-ne" onPointerDown={(e) => beginDrag(e, 'ne')} />
          <div class="resize-handle resize-nw" onPointerDown={(e) => beginDrag(e, 'nw')} />
          <div class="resize-handle resize-se" onPointerDown={(e) => beginDrag(e, 'se')} />
          <div class="resize-handle resize-sw" onPointerDown={(e) => beginDrag(e, 'sw')} />
        </>
      ) : null}
    </div>
  );
}
