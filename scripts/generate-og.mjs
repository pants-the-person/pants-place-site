import { chromium } from 'playwright';

const html = `<!doctype html>
<html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; }
  body { margin: 0; width: 1200px; height: 630px; background: #008080; font-family: Tahoma, Arial, sans-serif; overflow: hidden; }
  .grid { position: absolute; inset: 0; background-image: radial-gradient(rgba(255,255,255,.13) 1px, transparent 1px); background-size: 6px 6px; opacity: .35; }
  .window { position: absolute; left: 110px; top: 96px; width: 980px; height: 420px; background: #c0c0c0; padding: 4px;
    box-shadow: inset -1px -1px #000, inset 1px 1px #dfdfdf, inset -2px -2px #808080, inset 2px 2px #fff; }
  .title { height: 30px; display: flex; align-items: center; gap: 8px; padding: 0 6px; color: #fff; font-weight: 700; font-size: 18px;
    background: linear-gradient(90deg, #000080, #1084d0); }
  .title .flag { width: 20px; height: 20px; background: conic-gradient(#ff0000 0 25%, #00a800 0 50%, #0000ff 0 75%, #ffff00 0); }
  .body { padding: 28px 34px; height: calc(100% - 30px); background: #c0c0c0; }
  h1 { margin: 0 0 10px; font-size: 54px; line-height: 1; letter-spacing: -1px; color: #000080; text-shadow: 3px 3px 0 #fff; }
  .sub { font-size: 23px; margin-bottom: 26px; color: #222; }
  .row { display: flex; gap: 14px; }
  .box { flex: 1; background: #fff; border: 2px inset #808080; padding: 14px; min-height: 120px; }
  .box b { display: block; font-size: 20px; color: #000080; margin-bottom: 6px; }
  .box span { font-size: 16px; color: #333; line-height: 1.3; }
  .taskbar { position: absolute; left: 0; right: 0; bottom: 0; height: 44px; background: #c0c0c0; display: flex; align-items: center; padding: 4px 8px; gap: 8px;
    box-shadow: inset 0 2px #fff, inset 0 3px #dfdfdf; }
  .start { height: 32px; padding: 0 14px; display: flex; align-items: center; gap: 8px; font-weight: 700; font-size: 17px;
    box-shadow: inset -1px -1px #000, inset 1px 1px #fff, inset -2px -2px #808080, inset 2px 2px #dfdfdf; }
  .tab { height: 30px; padding: 0 12px; display: flex; align-items: center; font-size: 15px;
    box-shadow: inset -1px -1px #000, inset 1px 1px #fff, inset -2px -2px #808080, inset 2px 2px #dfdfdf; }
  .tray { margin-left: auto; height: 30px; padding: 0 14px; display: flex; align-items: center; font-size: 15px;
    box-shadow: inset 1px 1px #808080, inset -1px -1px #fff; }
</style></head><body>
  <div class="grid"></div>
  <div class="window">
    <div class="title"><span class="flag"></span><span>Pants Place 98</span><span style="margin-left:auto;font-size:12px">_ □ ✕</span></div>
    <div class="body">
      <h1>PANTS PLACE 98</h1>
      <div class="sub">A complete retro desktop in your browser.</div>
      <div class="row">
        <div class="box"><b>FreeDOS VM</b><span>A real x86 virtual machine running in WebAssembly.</span></div>
        <div class="box"><b>Winamp</b><span>MIDI and OGG playback with a General MIDI SoundFont.</span></div>
        <div class="box"><b>The fake web</b><span>A 1998 internet with news, blogs, guestbooks and webrings.</span></div>
      </div>
    </div>
  </div>
  <div class="taskbar">
    <div class="start"><span style="width:16px;height:16px;background:conic-gradient(#ff0000 0 25%,#00a800 0 50%,#0000ff 0 75%,#ffff00 0);display:inline-block"></span>Start</div>
    <div class="tab">MS-DOS Prompt</div>
    <div class="tab">Winamp</div>
    <div class="tray">11:59 PM</div>
  </div>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(html);
await page.screenshot({ path: 'public/og.png' });
await browser.close();
console.log('wrote public/og.png');
