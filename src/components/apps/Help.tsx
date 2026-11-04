import { useState } from 'preact/hooks';
import { openApp } from '../../kernel/windows';
import { showDialog } from '../../kernel/dialogs';
import type { AppProps } from '../../kernel/types';

const TOPICS = [
  { id: 'welcome', title: 'Welcome to Pants Place 98' },
  { id: 'desktop', title: 'Using the desktop' },
  { id: 'dos', title: 'MS-DOS Prompt & FreeDOS' },
  { id: 'winamp', title: 'Winamp & media' },
  { id: 'ie', title: 'Internet Explorer' },
  { id: 'trouble', title: 'Troubleshooting' },
  { id: 'credits', title: 'Credits & licenses' },
];

export default function Help({ api }: AppProps) {
  const [topic, setTopic] = useState('welcome');

  return (
    <div class="help-app">
      <div class="menu-bar">
        <button onClick={() => void showDialog({ title: 'About Help', message: 'Windows Help\n\nA hand-written help file for Pants Place 98.', icon: '/icons/help.svg' })}>Options</button>
        <button onClick={() => api.close()}>Exit</button>
      </div>
      <div class="help-body">
        <div class="help-sidebar">
          <div class="help-sidebar-title">Contents</div>
          {TOPICS.map((item) => (
            <button class={`help-topic ${topic === item.id ? 'active' : ''}`} onClick={() => setTopic(item.id)}>
              {item.title}
            </button>
          ))}
        </div>
        <div class="help-content">
          {topic === 'welcome' ? (
            <>
              <h2>Welcome to Pants Place 98</h2>
              <p>This is a small, functional love letter to the late 1990s desktop. Everything you see is HTML, CSS and TypeScript, with a few pieces of WebAssembly doing the heavy lifting.</p>
              <p>Use the Start menu, double-click desktop icons, drag windows around, and right-click the desktop to change the wallpaper.</p>
              <button onClick={() => openApp('notepad', { title: 'Welcome', filename: 'WELCOME.TXT' })}>Open the welcome document</button>
            </>
          ) : null}
          {topic === 'desktop' ? (
            <>
              <h2>Using the desktop</h2>
              <ul>
                <li>Drag a window by its title bar.</li>
                <li>Resize from any edge or corner.</li>
                <li>Double-click a title bar to maximize.</li>
                <li>Use the taskbar to switch or minimize windows.</li>
                <li>Right-click the desktop for wallpaper and display options.</li>
                <li>Start &gt; Shut Down to power off or restart.</li>
              </ul>
            </>
          ) : null}
          {topic === 'dos' ? (
            <>
              <h2>MS-DOS Prompt &amp; FreeDOS</h2>
              <p>The MS-DOS Prompt is not a simulation of a command line. It is a real FreeDOS 7.10 virtual machine running in v86, an x86 emulator compiled to WebAssembly.</p>
              <p>Try these commands: <code>VER</code>, <code>DIR</code>, <code>MEM</code>, <code>CLS</code>, <code>INVADERS</code>, <code>SNAKE</code>, <code>TETRIS</code>.</p>
              <button onClick={() => openApp('terminal')}>Open MS-DOS Prompt</button>
            </>
          ) : null}
          {topic === 'winamp' ? (
            <>
              <h2>Winamp &amp; media</h2>
              <p>Winamp builds its playlist from <code>public/media</code>. Drop in <code>.mid</code>, <code>.midi</code>, <code>.ogg</code> or <code>.oga</code> files and restart the dev server.</p>
              <p>MIDI files are synthesized with the TimGM6mb General MIDI SoundFont through spessasynth. OGG files use the Web Audio API. Both share the 10-band EQ and spectrum analyser.</p>
              <button onClick={() => openApp('winamp')}>Open Winamp</button>
            </>
          ) : null}
          {topic === 'ie' ? (
            <>
              <h2>Internet Explorer</h2>
              <p>The browser loads a static fake internet under <code>/web</code>. The address bar translates period-correct URLs into real routes, so you can type a fake hostname or use the Favorites menu.</p>
              <p>Start at the PantsNet homepage, sign the guestbook, or search AltaVista.</p>
              <button onClick={() => openApp('ie', { address: 'http://www.pantsplace.net/' })}>Open Internet Explorer</button>
            </>
          ) : null}
          {topic === 'trouble' ? (
            <>
              <h2>Troubleshooting</h2>
              <p>If the FreeDOS VM fails to boot, make sure the files in <code>public/v86</code> are being served with the correct MIME types. If MIDI is silent, press play once to unlock audio, then wait for the SoundFont to load.</p>
              <p>For a genuinely 1998 experience, you can trigger a blue screen of death:</p>
              <button onClick={() => window.dispatchEvent(new CustomEvent('pants:bsod'))}>Trigger BSOD</button>
            </>
          ) : null}
          {topic === 'credits' ? (
            <>
              <h2>Credits &amp; licenses</h2>
              <ul>
                <li>Astro, Preact, and 98.css (MIT).</li>
                <li>React95 icons (MIT).</li>
                <li>v86 (BSD-2-Clause).</li>
                <li>FreeDOS (GPL-2.0).</li>
                <li>TimGM6mb SoundFont (GPL-2.0).</li>
                <li>spessasynth_lib (Apache-2.0).</li>
                <li>Px437 IBM VGA font (CC BY-SA 4.0).</li>
                <li>“Skiessi - C64” (CC BY 3.0), via Wikimedia Commons.</li>
              </ul>
              <p>Windows 98, Internet Explorer, and Winamp are trademarks of their respective owners. This is an unofficial fan project.</p>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
