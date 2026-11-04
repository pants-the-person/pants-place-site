import { useState } from 'preact/hooks';
import type { AppProps } from '../../kernel/types';

export default function Calculator({ api }: AppProps) {
  const [display, setDisplay] = useState('0');
  const [accumulator, setAccumulator] = useState<number | null>(null);
  const [operation, setOperation] = useState<string | null>(null);
  const [waiting, setWaiting] = useState(false);
  const [memory, setMemory] = useState(0);

  function digit(value: string) {
    if (waiting || display === '0') {
      setDisplay(value === '.' ? '0.' : value);
      setWaiting(false);
    } else {
      if (value === '.' && display.includes('.')) return;
      setDisplay(display + value);
    }
  }

  function calculate(a: number, b: number, op: string) {
    switch (op) {
      case '+': return a + b;
      case '-': return a - b;
      case '*': return a * b;
      case '/': return b === 0 ? NaN : a / b;
      default: return b;
    }
  }

  function chooseOp(op: string) {
    const current = Number(display);
    if (accumulator !== null && operation && !waiting) {
      const result = calculate(accumulator, current, operation);
      setAccumulator(result);
      setDisplay(String(result));
    } else {
      setAccumulator(current);
    }
    setOperation(op);
    setWaiting(true);
  }

  function equals() {
    if (accumulator === null || !operation) return;
    const result = calculate(accumulator, Number(display), operation);
    setDisplay(Number.isFinite(result) ? String(Number(result.toPrecision(12))) : 'Cannot divide by zero');
    setAccumulator(null);
    setOperation(null);
    setWaiting(true);
  }

  function clear() {
    setDisplay('0');
    setAccumulator(null);
    setOperation(null);
    setWaiting(false);
  }

  function backspace() {
    if (waiting) return;
    setDisplay(display.length > 1 ? display.slice(0, -1) : '0');
  }

  function applyUnary(fn: (n: number) => number) {
    const result = fn(Number(display));
    setDisplay(String(Number(result.toPrecision(12))));
    setWaiting(true);
  }


  return (
    <div
      class="calc"
      tabIndex={0}
      onPointerDown={(event) => (event.currentTarget as HTMLElement).focus()}
      onKeyDown={(event) => {
        if (/^[0-9.]$/.test(event.key)) digit(event.key);
        if (event.key === '+' || event.key === '-' || event.key === '*' || event.key === '/') chooseOp(event.key);
        if (event.key === 'Enter' || event.key === '=') equals();
        if (event.key === 'Escape') clear();
        if (event.key === 'Backspace') backspace();
      }}
    >
      <div class="menu-bar">
        <button onClick={() => api.notify('Calculator: use the keypad or your keyboard.')}>Edit</button>
        <button onClick={clear}>View</button>
        <button onClick={() => api.notify('Calculator 98 — because every desktop needs one.')}>Help</button>
      </div>
      <div class="calc-display">{display}</div>
      <div class="calc-memory">M {memory}</div>
      <div class="calc-grid">
        <button onClick={() => { setMemory(0); }}>MC</button>
        <button onClick={() => setDisplay(String(memory))}>MR</button>
        <button onClick={() => setMemory(Number(display))}>MS</button>
        <button onClick={() => setMemory(memory + Number(display))}>M+</button>
        <button onClick={backspace}>←</button>
        <button onClick={clear}>C</button>
        <button onClick={clear}>CE</button>
        <button onClick={() => chooseOp('/')}>/</button>
        <button onClick={() => digit('7')}>7</button>
        <button onClick={() => digit('8')}>8</button>
        <button onClick={() => digit('9')}>9</button>
        <button onClick={() => chooseOp('*')}>*</button>
        <button onClick={() => digit('4')}>4</button>
        <button onClick={() => digit('5')}>5</button>
        <button onClick={() => digit('6')}>6</button>
        <button onClick={() => chooseOp('-')}>-</button>
        <button onClick={() => digit('1')}>1</button>
        <button onClick={() => digit('2')}>2</button>
        <button onClick={() => digit('3')}>3</button>
        <button onClick={() => chooseOp('+')}>+</button>
        <button onClick={() => applyUnary(Math.sqrt)}>√</button>
        <button onClick={() => digit('0')}>0</button>
        <button onClick={() => digit('.')}>.</button>
        <button onClick={equals}>=</button>
        <button onClick={() => applyUnary((n) => -n)}>±</button>
        <button onClick={() => applyUnary((n) => n / 100)}>%</button>
      </div>
    </div>
  );
}
