import { useEffect, useRef, useState } from 'preact/hooks';
import { showDialog } from '../../kernel/dialogs';
import type { AppProps } from '../../kernel/types';

const COLORS = [
  '#000000', '#808080', '#800000', '#808000', '#008000', '#008080', '#000080', '#800080',
  '#ffffff', '#c0c0c0', '#ff0000', '#ffff00', '#00ff00', '#00ffff', '#0000ff', '#ff00ff',
];

type Tool = 'pencil' | 'brush' | 'eraser' | 'line' | 'rect' | 'ellipse' | 'fill';

export default function Paint({ api }: AppProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [tool, setTool] = useState<Tool>('pencil');
  const [color, setColor] = useState('#000000');
  const [width, setWidth] = useState(3);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const drawing = useRef(false);
  const start = useRef({ x: 0, y: 0 });
  const snapshot = useRef<ImageData | null>(null);
  const undoStack = useRef<ImageData[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }, []);

  function getPoint(event: PointerEvent) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: Math.floor(((event.clientX - rect.left) / rect.width) * canvas.width),
      y: Math.floor(((event.clientY - rect.top) / rect.height) * canvas.height),
    };
  }

  function pushUndo() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    undoStack.current.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    if (undoStack.current.length > 12) undoStack.current.shift();
  }

  function undo() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    const previous = undoStack.current.pop();
    if (!canvas || !ctx || !previous) return;
    ctx.putImageData(previous, 0, 0);
  }

  function floodFill(x: number, y: number) {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = image.data;
    const index = (x + y * canvas.width) * 4;
    const target = [data[index], data[index + 1], data[index + 2], data[index + 3]];
    const fill = hexToRgba(color);
    if (target.every((v, i) => v === fill[i])) return;
    const stack = [[x, y]];
    const matches = (px: number, py: number) => {
      const i = (px + py * canvas.width) * 4;
      return (
        Math.abs(data[i] - target[0]) < 18 &&
        Math.abs(data[i + 1] - target[1]) < 18 &&
        Math.abs(data[i + 2] - target[2]) < 18
      );
    };
    while (stack.length) {
      const [px, py] = stack.pop()!;
      if (px < 0 || py < 0 || px >= canvas.width || py >= canvas.height) continue;
      if (!matches(px, py)) continue;
      const i = (px + py * canvas.width) * 4;
      data[i] = fill[0];
      data[i + 1] = fill[1];
      data[i + 2] = fill[2];
      data[i + 3] = 255;
      stack.push([px + 1, py], [px - 1, py], [px, py + 1], [px, py - 1]);
    }
    ctx.putImageData(image, 0, 0);
  }

  function begin(event: PointerEvent) {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const point = getPoint(event);
    start.current = point;
    setPos(point);
    if (tool === 'fill') {
      pushUndo();
      floodFill(point.x, point.y);
      return;
    }
    pushUndo();
    drawing.current = true;
    snapshot.current = ctx.getImageData(0, 0, canvas.width, canvas.height);
    ctx.beginPath();
    ctx.moveTo(point.x, point.y);
    ctx.lineCap = tool === 'brush' ? 'round' : 'square';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = tool === 'eraser' ? '#ffffff' : color;
    ctx.fillStyle = color;
    ctx.lineWidth = tool === 'eraser' ? Math.max(width, 12) : width;
    if (tool === 'pencil' || tool === 'brush' || tool === 'eraser') {
      ctx.lineTo(point.x + 0.01, point.y);
      ctx.stroke();
    }
    canvas.setPointerCapture(event.pointerId);
  }

  function move(event: PointerEvent) {
    const point = getPoint(event);
    setPos(point);
    if (!drawing.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    if (tool === 'pencil' || tool === 'brush' || tool === 'eraser') {
      ctx.lineTo(point.x, point.y);
      ctx.stroke();
      return;
    }
    if (snapshot.current) ctx.putImageData(snapshot.current, 0, 0);
    ctx.beginPath();
    if (tool === 'line') {
      ctx.moveTo(start.current.x, start.current.y);
      ctx.lineTo(point.x, point.y);
    } else if (tool === 'rect') {
      ctx.rect(start.current.x, start.current.y, point.x - start.current.x, point.y - start.current.y);
    } else if (tool === 'ellipse') {
      const rx = Math.abs(point.x - start.current.x) / 2;
      const ry = Math.abs(point.y - start.current.y) / 2;
      ctx.ellipse(
        start.current.x + (point.x - start.current.x) / 2,
        start.current.y + (point.y - start.current.y) / 2,
        rx,
        ry,
        0,
        0,
        Math.PI * 2,
      );
    }
    ctx.stroke();
  }

  function end() {
    drawing.current = false;
    snapshot.current = null;
  }

  function save() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = 'pants-paint.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
    api.notify('Saved pants-paint.png to your downloads.');
  }

  function clear() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    pushUndo();
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div class="menu-bar">
        <button onClick={save}>File</button>
        <button onClick={undo}>Edit</button>
        <button onClick={() => api.notify('Use the View menu in a real Paint.')}>View</button>
        <button onClick={clear}>Image</button>
        <button onClick={() => setColor('#000000')}>Colors</button>
        <button onClick={() => void showDialog({ title: 'About Paint', message: 'Pants Paint 98\n\nA small canvas app with pencil, brush, shapes and flood fill.', icon: '/icons/paint.svg' })}>Help</button>
      </div>
      <div class="toolbar">
        {(['pencil', 'brush', 'eraser', 'line', 'rect', 'ellipse', 'fill'] as Tool[]).map((name) => (
          <button class={tool === name ? 'active' : ''} onClick={() => setTool(name)} title={name}>
            {name === 'pencil' ? 'Pencil' : name === 'brush' ? 'Brush' : name === 'eraser' ? 'Eraser' : name === 'line' ? 'Line' : name === 'rect' ? 'Rect' : name === 'ellipse' ? 'Ellipse' : 'Fill'}
          </button>
        ))}
        <span style={{ margin: '0 4px' }}>Size</span>
        <select value={width} onChange={(event) => setWidth(Number((event.target as HTMLSelectElement).value))} style={{ height: '22px' }}>
          {[1, 2, 3, 5, 8, 12, 20].map((n) => (
            <option value={n}>{n}px</option>
          ))}
        </select>
        <button onClick={clear}>Clear</button>
        <button onClick={save}>Save</button>
      </div>
      <div class="paint-palette">
        <div class="paint-current" style={{ background: color }} title="Current color" />
        {COLORS.map((c) => (
          <button
            class={`paint-swatch ${color === c ? 'selected' : ''}`}
            style={{ background: c }}
            onClick={() => setColor(c)}
            title={c}
          />
        ))}
      </div>
      <div class="paint-canvas-wrap">
        <canvas
          ref={canvasRef}
          width="640"
          height="400"
          class="paint-canvas"
          onPointerDown={begin}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
        />
      </div>
      <div class="status-bar">
        <div class="status-bar-field">For Help, click Help Topics on the Help Menu.</div>
        <div class="status-bar-field">{pos.x},{pos.y} px</div>
        <div class="status-bar-field">{tool}</div>
      </div>
    </div>
  );
}

function hexToRgba(hex: string) {
  const value = hex.replace('#', '');
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
    255,
  ];
}
