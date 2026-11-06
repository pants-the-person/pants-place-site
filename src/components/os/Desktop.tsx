import { useEffect, useRef, useState } from 'preact/hooks';
import type { ComponentType } from 'preact';
import DesktopIcons from './DesktopIcons';
import Taskbar from './Taskbar';
import StartMenu from './StartMenu';
import WindowFrame from './WindowFrame';
import DialogHost from './DialogHost';
import ContextMenuHost from './ContextMenu';
import { activeWindowId, getApp, getAppApi, openApp, startMenuOpen, windows, closeAllWindows } from '../../kernel/windows';
import { initSettings } from '../../kernel/settings';
import { startPlayerLoop, stopPlayerLoop } from '../../kernel/player';
import { playSound } from '../../kernel/audio';
import { showDialog } from '../../kernel/dialogs';
import { documents as documentStore, initFileSystem, mediaFiles } from '../../kernel/content';
import { installFilesystemBridge } from '../../kernel/fs-bridge';
import { closeContextMenu as closeSharedMenu, openContextMenu as openSharedMenu } from '../../kernel/menu';
import { startDeepLink, type PersonalSiteDeepLink } from '../../kernel/autostart';
import type { AppProps, DesktopDocument, WindowState } from '../../kernel/types';

function WindowContent({ win }: { win: WindowState }) {
  const [Component, setComponent] = useState<ComponentType<AppProps> | null>(null);
  const app = getApp(win.appId);

  useEffect(() => {
    let cancelled = false;
    setComponent(null);
    if (!app) return;
    app
      .component()
      .then((mod) => {
        if (!cancelled) setComponent(() => mod.default);
      })
      .catch((error) => {
        console.error('Failed to load app', win.appId, error);
      });
    return () => {
      cancelled = true;
    };
  }, [win.appId]);

  if (!Component) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', height: '100%', gap: '8px' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ marginBottom: '8px' }}>Loading {app?.title ?? win.appId}...</div>
          <div class="progress-indicator" style={{ width: '220px' }}>
            <div class="progress-indicator-bar" style={{ width: '60%' }} />
          </div>
        </div>
      </div>
    );
  }

  return <Component windowId={win.id} appProps={win.props} api={getAppApi(win.id)} />;
}

export default function Desktop({
  documents,
  deepLink,
}: {
  documents: DesktopDocument[];
  deepLink?: PersonalSiteDeepLink;
}) {
  const [power, setPower] = useState<'off' | 'restart' | 'logoff' | 'standby' | null>(null);
  const [bsod, setBsod] = useState(false);
  const [notify, setNotify] = useState<string | null>(null);
  const deepLinkStarted = useRef(false);

  useEffect(() => {
    initSettings();
    startPlayerLoop();
    installFilesystemBridge();
    documentStore.value = documents;
    void initFileSystem(documentStore.value, mediaFiles.value).catch((error) => {
      console.error('Filesystem initialization failed:', error);
    });

    const closeContextMenu = (event: PointerEvent) => {
      const target = event.target as HTMLElement;
      if (!target?.closest?.('.context-menu')) closeSharedMenu();
      if (!target?.closest?.('.start-menu') && !target?.closest?.('.start-button')) {
        startMenuOpen.value = false;
      }
    };
    window.addEventListener('pointerdown', closeContextMenu, true);

    const unlock = () => {
      playSound('startup');
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });

    const onPower = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      if (detail === 'shutdown') {
        playSound('shutdown');
        setPower('off');
      } else if (detail === 'restart') {
        playSound('shutdown');
        setPower('restart');
        setTimeout(() => {
          sessionStorage.removeItem('pp98:welcome');
          sessionStorage.removeItem('pp98:booted');
          window.location.href = '/?boot=1';
        }, 1600);
      } else if (detail === 'dos') {
        closeAllWindows();
        openApp('terminal');
      } else if (detail === 'standby') {
        setPower('standby');
      }
    };
    const onLogoff = () => setPower('logoff');
    const onBsod = () => setBsod(true);
    const onNotify = (event: Event) => {
      setNotify((event as CustomEvent<string>).detail);
      setTimeout(() => setNotify(null), 2800);
    };

    window.addEventListener('pants:power', onPower);
    window.addEventListener('pants:logoff', onLogoff);
    window.addEventListener('pants:bsod', onBsod);
    window.addEventListener('pants:notify', onNotify);

    if (!deepLinkStarted.current) {
      deepLinkStarted.current = true;
      startDeepLink(deepLink);
    }

    return () => {
      stopPlayerLoop();
      window.removeEventListener('pointerdown', closeContextMenu, true);
      window.removeEventListener('pants:power', onPower);
      window.removeEventListener('pants:logoff', onLogoff);
      window.removeEventListener('pants:bsod', onBsod);
      window.removeEventListener('pants:notify', onNotify);
    };
  }, []);

  function desktopContextMenu(event: MouseEvent) {
    if ((event.target as HTMLElement).closest('.win98-window')) return;
    startMenuOpen.value = false;
    openSharedMenu(event, [
      {
        label: 'Arrange Icons By',
        children: [
          { label: 'Name', action: () => desktopSort('name') },
          { label: 'Type', action: () => desktopSort('type') },
          { label: 'Size', action: () => desktopSort('size') },
        ],
      },
      { label: 'Line up Icons', action: () => undefined },
      { separator: true },
      {
        label: 'Refresh',
        action: () => {
          window.dispatchEvent(new Event('pants:refresh-desktop'));
          openApp('computer', { path: [] });
        },
      },
      { separator: true },
      {
        label: 'New',
        children: [
          { label: 'Folder', icon: '/icons/folder.svg', action: () => openApp('computer', { path: [] }) },
          { label: 'Text Document', icon: '/icons/notepad.svg', action: () => openApp('wine-notepad') },
        ],
      },
      { separator: true },
      { label: 'Properties', action: () => openApp('display') },
      {
        label: 'Shut Down...',
        action: () => window.dispatchEvent(new CustomEvent('pants:power', { detail: 'shutdown' })),
      },
    ]);
  }

  function desktopSort(mode: 'name' | 'type' | 'size') {
    window.dispatchEvent(new CustomEvent('pants:desktop-sort', { detail: mode }));
  }

  if (power === 'off') {
    return (
      <div class="shutdown-screen">
        <div>
          It&apos;s now safe to turn off
          <br />
          your computer.
          <br />
          <button
            style={{ marginTop: '24px' }}
            onClick={() => {
              sessionStorage.removeItem('pp98:booted');
              window.location.href = '/?boot=1';
            }}
          >
            Restart
          </button>
        </div>
      </div>
    );
  }

  if (power === 'restart') {
    return <div class="shutdown-screen">Windows is restarting...</div>;
  }

  if (power === 'logoff') {
    return (
      <div class="shutdown-screen">
        <div>
          It is now safe to log off.
          <br />
          <button style={{ marginTop: '24px' }} onClick={() => window.location.reload()}>
            Log on as pants_the_person
          </button>
        </div>
      </div>
    );
  }

  if (power === 'standby') {
    return (
      <div
        class="shutdown-screen"
        style={{ background: '#000', color: '#333' }}
        onClick={() => setPower(null)}
      >
        <div>Standby. Click to wake.</div>
      </div>
    );
  }

  if (bsod) {
    return (
      <div class="bsod" onClick={() => setBsod(false)}>
        {`A fatal exception 0E has occurred at 0028:C0011E36 in VXD VMM(01) +
00010E36. The current application will be terminated.

*  Press any key to terminate the current application.
*  Press CTRL+ALT+DEL again to restart your computer. You will
   lose any unsaved information in all applications.

PANTS_PLACE_98_EXCEPTION

Click anywhere to return to Windows.`}
      </div>
    );
  }

  return (
    <div id="desktop-shell">
      <div
        id="desktop"
        onContextMenu={desktopContextMenu}
        onPointerDown={(event) => {
          const target = event.target as HTMLElement;
          if (!target.closest('.start-menu') && !target.closest('.start-button')) {
            startMenuOpen.value = false;
          }
          closeSharedMenu();
        }}
      >
        <DesktopIcons />
        {windows.value.map((win) => (
          <WindowFrame window={win} active={activeWindowId.value === win.id} key={win.id}>
            <WindowContent win={win} />
          </WindowFrame>
        ))}
      </div>

      <ContextMenuHost />

      <Taskbar
        onStart={() => {
          playSound('click');
          startMenuOpen.value = !startMenuOpen.value;
          closeSharedMenu();
        }}
      />
      {startMenuOpen.value ? <StartMenu documents={documents} /> : null}
      <DialogHost />
      {notify ? (
        <div class="pants-toast">
          <img src="/icons/help.svg" alt="" width="16" height="16" />
          <span>{notify}</span>
        </div>
      ) : null}
    </div>
  );
}
