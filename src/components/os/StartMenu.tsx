import { useState } from 'preact/hooks';
import { startMenuOpen, openApp } from '../../kernel/windows';
import { showDialog } from '../../kernel/dialogs';
import { webSites } from '../../kernel/web';
import { wineAppsByCategory, wineAppsById, type WineAppInfo } from '../../generated/wine-apps';
import { openWineApp } from '../../kernel/wine';
import { quoteWindowsArg } from '../../kernel/paths';
import type { DesktopDocument } from '../../kernel/types';

const arrow = <span class="arrow" />;

const WINE_GAME_GROUPS: Array<{ label: string; apps: WineAppInfo[] }> = [
  {
    label: 'Card & Board',
    apps: ['freecell', 'sol', 'cruel', 'golf', 'pegged', 'taipei', 'tictac', 'reversi', 'spider', 'qblackjack']
      .map((id) => wineAppsById[id])
      .filter(Boolean),
  },
  {
    label: 'Arcade & Puzzle',
    apps: [
      'snake',
      'wep16_rodent',
      'wep16_jezzball',
      'winmine_wep',
      'ski32',
      'pinball',
      'marbles',
      'bricks',
      'empipe',
      'funtris',
      'peaks',
      'pyramid',
      'fourstones',
      'cwordzap',
      'dxball',
      'blobby_volley',
    ]
      .map((id) => wineAppsById[id])
      .filter(Boolean),
  },
  {
    label: 'Demos',
    apps: ['starcraft_shareware', 'diablo_shareware', 'heroes2_demo', 'rct', 'quake2_demo', 'quake3_demo']
      .map((id) => wineAppsById[id])
      .filter(Boolean),
  },
];

function WineStartItem({ app, launch }: { app: WineAppInfo; launch: (id: string) => void }) {
  return (
    <button class="start-item" data-wine-app={app.id} onClick={() => launch(app.id)}>
      <img src={app.icon} alt="" width="18" height="18" style={{ imageRendering: 'pixelated' }} />
      <span class="label">{app.title}</span>
    </button>
  );
}

export default function StartMenu({ documents }: { documents: DesktopDocument[] }) {
  const [sub, setSub] = useState<string | null>(null);
  const [nested, setNested] = useState<string | null>(null);

  const close = () => {
    startMenuOpen.value = false;
    setSub(null);
    setNested(null);
  };

  const openTop = (key: string) => {
    setSub(key);
    setNested(null);
  };

  const launch = (appId: string, props?: Record<string, unknown>) => {
    close();
    openApp(appId, props);
  };

  const launchWine = (id: string) => {
    close();
    openWineApp(id);
  };

  const info = (title: string, message: string) => {
    close();
    void showDialog({ title, message, icon: '/icons/help.svg' });
  };

  async function runDialog() {
    close();
    const result = await showDialog({
      title: 'Run',
      message: 'Type the name of a program, folder, document, or Internet resource, and Windows will open it for you.',
      icon: '/icons/computer.svg',
      input: { label: 'Open:', placeholder: 'notepad' },
      buttons: [
        { id: 'ok', label: 'OK', default: true },
        { id: 'cancel', label: 'Cancel' },
      ],
    }).catch(() => 'cancel');
    if (result === 'cancel') return;
    const command = result.trim().toLowerCase();
    if (!command) return;
    const wineMap: Record<string, string> = {
      notepad: 'notepad',
      calc: 'calc',
      calculator: 'calc',
      mspaint: 'mspaint98',
      paint: 'mspaint98',
      wordpad: 'wordpad',
      winmine: 'winmine_wep',
      minesweeper: 'winmine_wep',
      taskman: 'taskman',
      regedit: 'regedit',
    };
    if (wineMap[command]) {
      close();
      openWineApp(wineMap[command]);
      return;
    }
    if (command === 'winamp') {
      close();
      openApp('winamp');
      return;
    }
    const map: Record<string, [string, Record<string, unknown>?]> = {
      command: ['terminal'],
      cmd: ['terminal'],
      'command.com': ['terminal'],
      explorer: ['computer'],
      iexplore: ['ie'],
      ie: ['ie'],
      control: ['control'],
      help: ['help'],
    };
    if (map[command]) {
      launch(map[command][0], map[command][1]);
      return;
    }
    if (command.startsWith('wine ')) {
      const id = command.slice(5).trim();
      close();
      if (openWineApp(id)) return;
    }
    if (command === 'pinball' || command === 'sol' || command === 'ski32') {
      close();
      openWineApp(command);
      return;
    }
    if (command.startsWith('http') || command.includes('.')) {
      launch('ie', { address: command });
      return;
    }
    void showDialog({
      title: 'Run',
      message: `Windows cannot find "${result}". Make sure you typed the name correctly, and then try again.`,
      kind: 'error',
      icon: '/icons/computer.svg',
    });
  }

  async function findFiles() {
    close();
    const query = await showDialog({
      title: 'Find: All Files',
      message: 'Search My Documents for files whose name or contents contain:',
      icon: '/icons/find.svg',
      input: { label: 'Named:', placeholder: 'wasm' },
      buttons: [
        { id: 'ok', label: 'Find Now', default: true },
        { id: 'cancel', label: 'Cancel' },
      ],
    }).catch(() => 'cancel');
    if (query === 'cancel' || !query.trim()) return;
    const needle = query.toLowerCase();
    const matches = documents.filter(
      (doc) =>
        doc.title.toLowerCase().includes(needle) ||
        doc.filename.toLowerCase().includes(needle) ||
        doc.body.toLowerCase().includes(needle),
    );
    if (!matches.length) {
      void showDialog({
        title: 'Find: All Files',
        message: `No files found containing "${query}".`,
        icon: '/icons/find.svg',
      });
      return;
    }
    const body = [
      'FIND RESULTS',
      `Search term: ${query}`,
      '',
      ...matches.map((doc) => `${doc.filename}\t${doc.title}\tC:\\My Documents`),
      '',
      `${matches.length} file(s) found.`,
    ].join('\n');
    openApp('notepad', {
      title: 'Find Results',
      filename: 'FIND.TXT',
      body,
    });
  }

  async function shutDown() {
    close();
    const result = await showDialog({
      title: 'Shut Down Windows',
      message: 'What do you want the computer to do?',
      icon: '/icons/power.svg',
      buttons: [
        { id: 'shutdown', label: 'Shut down', default: true },
        { id: 'restart', label: 'Restart' },
        { id: 'dos', label: 'Restart in MS-DOS mode' },
        { id: 'cancel', label: 'Cancel' },
      ],
    }).catch(() => 'cancel');
    if (result === 'cancel') return;
    window.dispatchEvent(new CustomEvent('pants:power', { detail: result }));
  }

  return (
    <div class="start-menu" onClick={(e) => e.stopPropagation()}>
      <div class="start-menu-sidebar">Pants Place 98</div>
      <div class="start-menu-main">
        <div class="start-menu-items">
          <button class="start-item" onClick={() => launch('ie', { address: 'http://www.pants.place/downloads/' })}>
            <img src="/icons/ie-16.svg" alt="" width="18" height="18" />
            <span class="label">Windows Update</span>
          </button>

          <div class="start-item-wrap" style={{ position: 'relative' }}>
            <button
              class={`start-item ${sub === 'programs' ? 'open' : ''}`}
              onClick={() => openTop('programs')}
              onMouseEnter={() => openTop('programs')}
            >
              <img src="/icons/folder.svg" alt="" width="18" height="18" />
              <span class="label">Programs</span>
              {arrow}
            </button>
            {sub === 'programs' ? (
              <div class="start-submenu" style={{ bottom: 'auto', top: 0 }}>
                <div style={{ position: 'relative' }}>
                  <button
                    class={`start-item ${nested === 'accessories' ? 'open' : ''}`}
                    onMouseEnter={() => setNested('accessories')}
                    onClick={() => setNested('accessories')}
                  >
                    <img src="/icons/folder-16.svg" alt="" width="18" height="18" />
                    <span class="label">Accessories</span>
                    {arrow}
                  </button>
                  {nested === 'accessories' ? (
                    <div class="start-submenu">
                      <div class="start-separator" />
                      <button class="start-item" onClick={() => launch('winamp')}>
                        <img src="/icons/winamp.svg" alt="" width="18" height="18" />
                        <span class="label">Winamp</span>
                      </button>
                      {wineAppsByCategory.accessories
                        .filter((app) => app.id !== 'winamp' && app.id !== 'winamp_mod')
                        .map((app) => (
                          <WineStartItem key={app.id} app={app} launch={launchWine} />
                        ))}
                    </div>
                  ) : null}
                </div>
                <div style={{ position: 'relative' }}>
                  <button
                    class={`start-item ${nested === 'games' ? 'open' : ''}`}
                    onMouseEnter={() => setNested('games')}
                    onClick={() => setNested('games')}
                  >
                    <img src="/icons/mine.svg" alt="" width="18" height="18" />
                    <span class="label">Games</span>
                    {arrow}
                  </button>
                  {nested === 'games' ? (
                    <div class="start-submenu start-submenu-scroll" style={{ top: 'auto', bottom: 0 }}>
                      <div class="start-separator" />
                      {WINE_GAME_GROUPS.map((group) => (
                        <div class="start-submenu-group" key={group.label}>
                          <div class="start-submenu-heading">{group.label}</div>
                          {group.apps.map((app) => (
                            <WineStartItem key={app.id} app={app} launch={launchWine} />
                          ))}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
                <div style={{ position: 'relative' }}>
                  <button
                    class={`start-item ${nested === 'system-tools' ? 'open' : ''}`}
                    onMouseEnter={() => setNested('system-tools')}
                    onClick={() => setNested('system-tools')}
                  >
                    <img src="/icons/settings.svg" alt="" width="18" height="18" />
                    <span class="label">System Tools</span>
                    {arrow}
                  </button>
                  {nested === 'system-tools' ? (
                    <div class="start-submenu">
                      {wineAppsByCategory.system.map((app) => (
                        <WineStartItem key={app.id} app={app} launch={launchWine} />
                      ))}
                    </div>
                  ) : null}
                </div>
                <div style={{ position: 'relative' }}>
                  <button
                    class={`start-item ${nested === 'online' ? 'open' : ''}`}
                    onMouseEnter={() => setNested('online')}
                    onClick={() => setNested('online')}
                  >
                    <img src="/icons/dial.svg" alt="" width="18" height="18" />
                    <span class="label">Online Services</span>
                    {arrow}
                  </button>
                  {nested === 'online' ? (
                    <div class="start-submenu">
                      <button class="start-item" onClick={() => launch('ie')}>
                        <img src="/icons/ie.svg" alt="" width="18" height="18" />
                        <span class="label">Internet Explorer</span>
                      </button>
                      <button class="start-item" onClick={() => info('Outlook Express', 'Outlook Express is not installed.')}>
                        <img src="/icons/ie.svg" alt="" width="18" height="18" />
                        <span class="label">Outlook Express</span>
                      </button>
                    </div>
                  ) : null}
                </div>
                <div class="start-separator" />
                <button class="start-item" onClick={() => launch('terminal')}>
                  <img src="/icons/dos.svg" alt="" width="18" height="18" />
                  <span class="label">MS-DOS Prompt</span>
                </button>
                <button class="start-item" onClick={() => launch('computer', { path: [] })}>
                  <img src="/icons/folder.svg" alt="" width="18" height="18" />
                  <span class="label">Windows Explorer</span>
                </button>
              </div>
            ) : null}
          </div>

          <div style={{ position: 'relative' }}>
            <button
              class={`start-item ${sub === 'favorites' ? 'open' : ''}`}
              onClick={() => openTop('favorites')}
              onMouseEnter={() => openTop('favorites')}
            >
              <img src="/icons/ie-16.svg" alt="" width="18" height="18" />
              <span class="label">Favorites</span>
              {arrow}
            </button>
            {sub === 'favorites' ? (
              <div class="start-submenu" style={{ bottom: 'auto', top: 0 }}>
                {webSites
                  .filter((site) => site.favorite)
                  .map((site) => (
                    <button class="start-item" onClick={() => launch('ie', { address: site.host })}>
                      <img src="/icons/ie-16.svg" alt="" width="18" height="18" />
                      <span class="label">{site.title}</span>
                    </button>
                  ))}
              </div>
            ) : null}
          </div>

          <div style={{ position: 'relative' }}>
            <button
              class={`start-item ${sub === 'documents' ? 'open' : ''}`}
              onClick={() => openTop('documents')}
              onMouseEnter={() => openTop('documents')}
            >
              <img src="/icons/folder.svg" alt="" width="18" height="18" />
              <span class="label">Documents</span>
              {arrow}
            </button>
            {sub === 'documents' ? (
              <div class="start-submenu" style={{ bottom: 'auto', top: 0 }}>
                <button class="start-item" onClick={() => launch('computer', { path: ['My Documents'] })}>
                  <img src="/icons/folder.svg" alt="" width="18" height="18" />
                  <span class="label">My Documents</span>
                </button>
                <div class="start-separator" />
                {documents.slice(0, 6).map((doc) => (
                  <button
                    class="start-item"
                    onClick={() => {
                      close();
                      openWineApp('notepad', {
                        args: quoteWindowsArg(`C:\\My Documents\\${doc.filename}`),
                        title: `${doc.filename} - Notepad`,
                      });
                    }}
                  >
                    <img src="/icons/file-text.svg" alt="" width="18" height="18" />
                    <span class="label">{doc.filename}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div style={{ position: 'relative' }}>
            <button
              class={`start-item ${sub === 'settings' ? 'open' : ''}`}
              onClick={() => openTop('settings')}
              onMouseEnter={() => openTop('settings')}
            >
              <img src="/icons/settings.svg" alt="" width="18" height="18" />
              <span class="label">Settings</span>
              {arrow}
            </button>
            {sub === 'settings' ? (
              <div class="start-submenu" style={{ bottom: 'auto', top: 0 }}>
                <button class="start-item" onClick={() => launch('display')}>
                  <img src="/icons/settings.svg" alt="" width="18" height="18" />
                  <span class="label">Display Properties</span>
                </button>
                <button class="start-item" onClick={() => launch('control')}>
                  <img src="/icons/settings.svg" alt="" width="18" height="18" />
                  <span class="label">Control Panel</span>
                </button>
                <button class="start-item" onClick={() => info('Taskbar Properties', 'Taskbar options are always on.')}>
                  <img src="/icons/settings.svg" alt="" width="18" height="18" />
                  <span class="label">Taskbar &amp; Start Menu...</span>
                </button>
                <button class="start-item" onClick={() => info('Folder Options', 'Folder options are set to Web style.')}>
                  <img src="/icons/folder.svg" alt="" width="18" height="18" />
                  <span class="label">Folder Options...</span>
                </button>
              </div>
            ) : null}
          </div>

          <div style={{ position: 'relative' }}>
            <button
              class={`start-item ${sub === 'find' ? 'open' : ''}`}
              onClick={() => openTop('find')}
              onMouseEnter={() => openTop('find')}
            >
              <img src="/icons/find.svg" alt="" width="18" height="18" />
              <span class="label">Find</span>
              {arrow}
            </button>
            {sub === 'find' ? (
              <div class="start-submenu" style={{ bottom: 'auto', top: 0 }}>
                <button class="start-item" onClick={findFiles}>
                  <img src="/icons/find.svg" alt="" width="18" height="18" />
                  <span class="label">Files or Folders...</span>
                </button>
                <button class="start-item" onClick={() => launch('ie', { address: 'http://www.pants.place/search/' })}>
                  <img src="/icons/ie-16.svg" alt="" width="18" height="18" />
                  <span class="label">On the Internet...</span>
                </button>
              </div>
            ) : null}
          </div>

          <div class="start-separator" />

          <button class="start-item" onClick={() => launch('help')}>
            <img src="/icons/help.svg" alt="" width="18" height="18" />
            <span class="label">Help</span>
          </button>
          <button class="start-item" onClick={runDialog}>
            <img src="/icons/computer.svg" alt="" width="18" height="18" />
            <span class="label">Run...</span>
          </button>
          <div class="start-separator" />
          <button
            class="start-item"
            onClick={() => {
              close();
              window.dispatchEvent(new CustomEvent('pants:logoff'));
            }}
          >
            <img src="/icons/key.svg" alt="" width="18" height="18" />
            <span class="label">Log Off pants_the_person...</span>
          </button>
          <button class="start-item" onClick={shutDown}>
            <img src="/icons/power.svg" alt="" width="18" height="18" />
            <span class="label">Shut Down...</span>
          </button>
        </div>
      </div>
    </div>
  );
}
