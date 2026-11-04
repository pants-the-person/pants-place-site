import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { documents } from '../../kernel/content';
import { showDialog } from '../../kernel/dialogs';
import { openApp } from '../../kernel/windows';
import type { AppProps } from '../../kernel/types';

export default function Notepad({ appProps, api }: AppProps) {
  const filename = String(appProps.filename ?? 'Untitled.txt');
  const title = String(appProps.title ?? 'Untitled');
  const initial = String(appProps.body ?? localStorage.getItem(`pp98:note:${filename}`) ?? '');
  const [text, setText] = useState(initial);
  const [dirty, setDirty] = useState(false);
  const [wrap, setWrap] = useState(false);
  const [caret, setCaret] = useState({ line: 1, col: 1 });
  const areaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    api.setTitle(`${dirty ? '*' : ''}${title} - Notepad`);
  }, [dirty, title]);

  const saved = useMemo(() => localStorage.getItem(`pp98:note:${filename}`), [filename]);

  function save() {
    localStorage.setItem(`pp98:note:${filename}`, text);
    setDirty(false);
    api.notify(`Saved ${filename}`);
  }

  async function saveAs() {
    const name = await showDialog({
      title: 'Save As',
      message: 'Save this document in C:\\My Documents as:',
      icon: '/icons/notepad.svg',
      input: { value: filename, label: 'File name:' },
      buttons: [
        { id: 'ok', label: 'Save', default: true },
        { id: 'cancel', label: 'Cancel' },
      ],
    });
    if (name === 'cancel' || !name.trim()) return;
    localStorage.setItem(`pp98:note:${name}`, text);
    setDirty(false);
    api.notify(`Saved ${name}`);
  }

  async function open() {
    const name = await showDialog({
      title: 'Open',
      message: 'Type the name of a document in C:\\My Documents:',
      icon: '/icons/folder.svg',
      input: { value: '', label: 'File name:', placeholder: 'WELCOME.TXT' },
      buttons: [
        { id: 'ok', label: 'Open', default: true },
        { id: 'cancel', label: 'Cancel' },
      ],
    });
    if (name === 'cancel') return;
    const needle = name.trim().toLowerCase();
    const doc = documents.value.find(
      (d) => d.filename.toLowerCase() === needle || d.title.toLowerCase() === needle,
    );
    if (!doc) {
      void showDialog({
        title: 'Open',
        message: `Cannot find the file "${name}".`,
        kind: 'error',
        icon: '/icons/notepad.svg',
      });
      return;
    }
    openApp('notepad', { title: doc.title, body: doc.body, filename: doc.filename });
  }

  function updateCaret() {
    const area = areaRef.current;
    if (!area) return;
    const before = area.value.slice(0, area.selectionStart);
    const lines = before.split('\n');
    setCaret({ line: lines.length, col: (lines[lines.length - 1]?.length ?? 0) + 1 });
  }

  function insertDate() {
    const area = areaRef.current;
    if (!area) return;
    const stamp = new Date().toLocaleString();
    const start = area.selectionStart;
    const next = `${text.slice(0, start)}${stamp}${text.slice(area.selectionEnd)}`;
    setText(next);
    setDirty(true);
    requestAnimationFrame(() => {
      area.selectionStart = area.selectionEnd = start + stamp.length;
      area.focus();
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div class="menu-bar">
        <button onClick={save}>File</button>
        <button onClick={() => void showDialog({ title: 'Edit', message: 'Use the keyboard, like it is 1998.', icon: '/icons/notepad.svg' })}>Edit</button>
        <button onClick={() => setWrap((w) => !w)}>Search</button>
        <button onClick={() => openApp('help')}>Help</button>
      </div>
      <div class="toolbar">
        <button onClick={() => { setText(''); setDirty(true); }}>New</button>
        <button onClick={open}>Open</button>
        <button onClick={save}>Save</button>
        <button onClick={saveAs}>Save As</button>
        <button onClick={insertDate}>Date</button>
        <button class={wrap ? 'active' : ''} onClick={() => setWrap((w) => !w)}>Wrap</button>
      </div>
      <textarea
        ref={areaRef}
        value={text}
        wrap={wrap ? 'soft' : 'off'}
        onInput={(event) => {
          setText((event.target as HTMLTextAreaElement).value);
          setDirty(true);
          updateCaret();
        }}
        onClick={updateCaret}
        onKeyUp={updateCaret}
        onKeyDown={(event) => {
          if (event.key === 'F5') {
            event.preventDefault();
            insertDate();
          }
          if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
            event.preventDefault();
            save();
          }
        }}
        spellcheck={false}
        style={{
          flex: 1,
          minHeight: 0,
          margin: '2px 4px',
          padding: '3px 5px',
          resize: 'none',
          border: 0,
          background: '#fff',
          color: '#000',
          fontFamily: "'Px437 IBM VGA 8x16', monospace",
          fontSize: '16px',
          lineHeight: '16px',
          boxShadow:
            'inset 1px 1px #808080, inset -1px -1px #dfdfdf, inset 2px 2px #000, inset -2px -2px #fff',
          outline: 'none',
        }}
      />
      <div class="status-bar">
        <div class="status-bar-field">Ln {caret.line}, Col {caret.col}</div>
        <div class="status-bar-field">{saved ? 'Saved locally' : 'Not saved'}</div>
        <div class="status-bar-field">{text.length} chars</div>
      </div>
    </div>
  );
}
