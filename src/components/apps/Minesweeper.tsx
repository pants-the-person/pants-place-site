import { useEffect, useMemo, useState } from 'preact/hooks';
import { showDialog } from '../../kernel/dialogs';
import { playSound } from '../../kernel/audio';
import type { AppProps } from '../../kernel/types';

type Cell = {
  mine: boolean;
  revealed: boolean;
  flagged: boolean;
  adjacent: number;
};

type Level = 'beginner' | 'intermediate' | 'expert';

const LEVELS: Record<Level, { cols: number; rows: number; mines: number; label: string }> = {
  beginner: { cols: 9, rows: 9, mines: 10, label: 'Beginner' },
  intermediate: { cols: 16, rows: 16, mines: 40, label: 'Intermediate' },
  expert: { cols: 30, rows: 16, mines: 99, label: 'Expert' },
};

function makeBoard(cols: number, rows: number): Cell[][] {
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ({ mine: false, revealed: false, flagged: false, adjacent: 0 })),
  );
}

function neighbors(board: Cell[][], x: number, y: number) {
  const out: [number, number][] = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (board[ny]?.[nx]) out.push([nx, ny]);
    }
  }
  return out;
}

export default function Minesweeper({ api }: AppProps) {
  const [level, setLevel] = useState<Level>('beginner');
  const config = LEVELS[level];
  const [board, setBoard] = useState<Cell[][]>(() => makeBoard(config.cols, config.rows));
  const [status, setStatus] = useState<'ready' | 'playing' | 'won' | 'lost'>('ready');
  const [time, setTime] = useState(0);
  const [surprised, setSurprised] = useState(false);
  const [best, setBest] = useState<Record<Level, number>>(() => {
    try {
      return JSON.parse(localStorage.getItem('pp98:mines-best') ?? '{}');
    } catch {
      return {} as Record<Level, number>;
    }
  });

  const remaining = useMemo(() => {
    const flags = board.flat().filter((c) => c.flagged).length;
    return config.mines - flags;
  }, [board, config.mines]);

  useEffect(() => {
    if (status !== 'playing') return;
    const timer = setInterval(() => setTime((t) => Math.min(999, t + 1)), 1000);
    return () => clearInterval(timer);
  }, [status]);

  function reset(nextLevel: Level = level) {
    const next = LEVELS[nextLevel];
    setLevel(nextLevel);
    setBoard(makeBoard(next.cols, next.rows));
    setStatus('ready');
    setTime(0);
    playSound('click');
  }

  function placeMines(boardIn: Cell[][], safeX: number, safeY: number) {
    const copy = boardIn.map((row) => row.map((cell) => ({ ...cell })));
    const safe = new Set<string>();
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) safe.add(`${safeX + dx},${safeY + dy}`);
    }
    let placed = 0;
    while (placed < config.mines) {
      const x = Math.floor(Math.random() * config.cols);
      const y = Math.floor(Math.random() * config.rows);
      if (copy[y][x].mine || safe.has(`${x},${y}`)) continue;
      copy[y][x].mine = true;
      placed++;
    }
    for (let y = 0; y < config.rows; y++) {
      for (let x = 0; x < config.cols; x++) {
        copy[y][x].adjacent = neighbors(copy, x, y).filter(([nx, ny]) => copy[ny][nx].mine).length;
      }
    }
    return copy;
  }

  function reveal(boardIn: Cell[][], x: number, y: number) {
    const copy = boardIn.map((row) => row.map((cell) => ({ ...cell })));
    const stack: [number, number][] = [[x, y]];
    while (stack.length) {
      const [cx, cy] = stack.pop()!;
      const cell = copy[cy]?.[cx];
      if (!cell || cell.revealed || cell.flagged) continue;
      cell.revealed = true;
      if (cell.mine) continue;
      if (cell.adjacent === 0) {
        for (const [nx, ny] of neighbors(copy, cx, cy)) {
          if (!copy[ny][nx].revealed) stack.push([nx, ny]);
        }
      }
    }
    return copy;
  }

  function finish(next: Cell[][], won: boolean) {
    if (won) {
      playSound('chime');
      const nextBest = { ...best, [level]: best[level] ? Math.min(best[level], time) : time };
      setBest(nextBest);
      localStorage.setItem('pp98:mines-best', JSON.stringify(nextBest));
      setStatus('won');
      void showDialog({
        title: 'Minesweeper',
        message: `You win! Your time: ${time} seconds.`,
        icon: '/icons/mine.svg',
      });
    } else {
      playSound('error');
      setStatus('lost');
    }
    setBoard(next);
  }

  function clickCell(x: number, y: number) {
    if (status === 'won' || status === 'lost') return;
    let nextBoard = board;
    if (status === 'ready') {
      nextBoard = placeMines(board, x, y);
      setStatus('playing');
    }
    const cell = nextBoard[y][x];
    if (cell.flagged || cell.revealed) return;
    if (cell.mine) {
      const exploded = nextBoard.map((row) => row.map((c) => ({ ...c, revealed: c.revealed || c.mine })));
      finish(exploded, false);
      return;
    }
    const revealed = reveal(nextBoard, x, y);
    const unrevealed = revealed.flat().filter((c) => !c.revealed && !c.mine).length;
    if (unrevealed === 0) finish(revealed, true);
    else setBoard(revealed);
  }

  function flag(x: number, y: number) {
    if (status === 'won' || status === 'lost') return;
    const next = board.map((row) => row.map((cell) => ({ ...cell })));
    const cell = next[y][x];
    if (cell.revealed) return;
    cell.flagged = !cell.flagged;
    setBoard(next);
    playSound('click');
  }

  const faceIcon =
    status === 'lost'
      ? '/icons/face-dead.svg'
      : status === 'won'
        ? '/icons/face-win.svg'
        : surprised
          ? '/icons/face-oops.svg'
          : '/icons/face-smile.svg';

  return (
    <div class="minesweeper" onContextMenu={(event) => event.preventDefault()}>
      <div class="menu-bar">
        <button onClick={() => reset()}>Game</button>
        <button onClick={() => api.notify('Right-click to flag a mine.')}>Help</button>
      </div>
      <div class="mines-top">
        <div class="mines-counter">{String(Math.max(-99, remaining)).padStart(3, '0')}</div>
        <button class="mines-face" onClick={() => reset()} onPointerDown={() => setSurprised(true)} onPointerUp={() => setSurprised(false)}>
          <img src={faceIcon} width="24" height="24" alt="" />
        </button>
        <div class="mines-counter">{String(time).padStart(3, '0')}</div>
      </div>
      <div class="mines-board-wrap">
        <div
          class="mines-board"
          style={{ gridTemplateColumns: `repeat(${config.cols}, 16px)` }}
          onPointerLeave={() => setSurprised(false)}
        >
          {board.map((row, y) =>
            row.map((cell, x) => (
              <button
                key={`${x}-${y}`}
                class={`mine-cell ${cell.revealed ? 'revealed' : ''} ${cell.mine && cell.revealed ? 'mine' : ''} ${cell.flagged ? 'flagged' : ''}`}
                onClick={() => clickCell(x, y)}
                onContextMenu={(event) => {
                  event.preventDefault();
                  flag(x, y);
                }}
                onPointerDown={() => setSurprised(true)}
                onPointerUp={() => setSurprised(false)}
                aria-label={`cell ${x} ${y}`}
              >
                {cell.revealed
                  ? cell.mine
                    ? <img src="/icons/mine.svg" alt="mine" width="12" height="12" />
                    : cell.adjacent > 0
                      ? cell.adjacent
                      : ''
                  : cell.flagged
                    ? <img src="/icons/flag.svg" alt="flag" width="12" height="12" />
                    : ''}
              </button>
            )),
          )}
        </div>
      </div>
      <div class="mines-levels">
        {(['beginner', 'intermediate', 'expert'] as Level[]).map((name) => (
          <button class={level === name ? 'active' : ''} onClick={() => reset(name)}>
            {LEVELS[name].label}
          </button>
        ))}
        <span style={{ marginLeft: 'auto' }}>Best: {best[level] ?? '--'}</span>
      </div>
    </div>
  );
}
