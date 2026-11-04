import { useEffect, useRef, useState } from 'preact/hooks';
import { readTextFile, writeTextFile, createTextFile } from '../../kernel/content';
import { showDialog } from '../../kernel/dialogs';
import { openApp } from '../../kernel/windows';
import type { AppProps } from '../../kernel/types';

export default function Notepad({ appProps, api }: AppProps) {
  const initialFilename = String(appProps.filename ?? 'Untitled.txt');
  const initialTitle = String(appProps.title ?? 'Untitled');
  const [filename, setFilename] = useState(initialFilename);
  const [title, setTitle] = useState(initialTitle);
  const [filePath, setFilePath] = useState(String(appProps.path ?? ''));
  const [text, setText] = useState(String(appProps.body ?? ''));
  const [dirty, setDirty] = useState(false);
  const [wrap, setWrap] = useState(false);
  const [caret, setCaret] = useState({ line: 1, col: 1 });
  const [saved, setSaved] = useState(Boolean(appProps.path));
  const areaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    api.setTitle(`${dirty ? '*' : ''}${title} - Notepad`);
  }, [dirty, title]);

  useEffect(() => {
    if (appProps.body !== undefined || !filePath) return;
    let alive = true;
    void readTextFile(filePath)
      .then((body) => {
        if (!alive) return;
        setText(body);
        setDirty(false);
        setSaved(true);
      })
      .catch(() => {
        if (alive) setFilePath('');
      });
    return () => {
      alive = false;
    };
  }, [filePath, appProps.body]);

  async function save() {
    const nextPath = filePath || `c:\\My Documents\\${filename}`;
    try {
      await writeTextFile(nextPath, text);
      setFilePath(nextPath);
      setSaved(true);
      setDirty(false);
      api.notify(`Saved ${nextPath}`);
    } catch (error) {
      void showDialog({
        title: 'Save',
        message: 'The document could not be saved.',
        detail: error instanceof Error ? error.message : String(error),
        kind: 'error',
        icon: '/icons/notepad.svg',
      });
    }
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
    const clean = name.trim().replace(/[\\/:*?"<>|]/g, '_');
    const nextPath = `c:\\My Documents\\${clean}`;
    try {
      if (filePath) {
        await writeTextFile(nextPath, text);
      } else {
        await createTextFile('c:\\My Documents', clean, text);
      }
      setFilename(clean);
      setTitle(clean);
      setFilePath(nextPath);
      setSaved(true);
      setDirty(false);
      api.notify(`Saved ${nextPath}`);
    } catch (error) {
      void showDialog({
        title: 'Save As',
        message: 'The document could not be saved.',
        detail: error instanceof Error ? error.message : String(error),
        kind: 'error',
        icon: '/icons/notepad.svg',
      });
    }
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
    if (name === 'cancel' || !name.trim()) return;
    const target = `c:\\My Documents\\${name.trim().replace(/[\\/:*?"<>|]/g, '_')}`;
    try {
      const body = await readTextFile(target);
      openApp('notepad', {
        title: `${name.trim()} - Notepad`,
        filename: name.trim(),
        path: target,
        body,
      });
    } catch (error) {
      void showDialog({
        title: 'Open',
        message: `Cannot find the file "${name}".`,
        detail: error instanceof Error ? error.message : String(error),
        kind: 'error',
        icon: '/icons/notepad.svg',
      });
    }
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
        <button onClick={() => void save()}>File</button>
        <button onClick={() => void showDialog({ title: 'Edit', message: 'Use the keyboard, like it is 1998.', icon: '/icons/notepad.svg' })}>Edit</button>
        <button onClick={() => setWrap((w) => !w)}>Search</button>
        <button onClick={() => openApp('help')}>Help</button>
      </div>
      <div class="toolbar">
        <button onClick={() => { setText(''); setTitle('Untitled'); setDirty(true); setFilePath(''); setSaved(false); }}>New</button>
        <button onClick={() => void open()}>Open</button>
        <button onClick={() => void save()}>Save</button>
        <button onClick={() => void saveAs()}>Save As</button>
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
            void save();
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
        <div class="status-bar-field">{filePath ? (saved ? `Saved to ${filePath}` : 'Modified') : 'Not saved'}</div>
        <div class="status-bar-field">{text.length} chars</div>
      </div>
    </div>
  );
}
