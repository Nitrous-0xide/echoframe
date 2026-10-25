const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

app.setPath('userData', path.join(os.tmpdir(), `echoframe-visual-${process.pid}`));
const artifacts = path.join(__dirname, '..', 'artifacts');

async function shot(window, name) {
  fs.mkdirSync(artifacts, { recursive: true });
  const output = path.join(artifacts, name);
  fs.writeFileSync(output, (await window.webContents.capturePage()).toPNG());
  console.log(output);
}

async function clickNav(window, label) {
  await window.webContents.executeJavaScript(`[...document.querySelectorAll('nav button')].find(button => button.textContent.includes(${JSON.stringify(label)}))?.click()`);
  await new Promise((resolve) => setTimeout(resolve, 1400));
}

app.whenReady().then(async () => {
  const window = new BrowserWindow({ width: 1280, height: 820, show: false, webPreferences: { offscreen: true } });
  try {
    await window.loadFile(path.join(__dirname, '..', 'dist', 'index.html'), { query: { view: 'studio' } });
    await new Promise((resolve) => setTimeout(resolve, 1800));
    const text = await window.webContents.executeJavaScript('document.body.innerText');
    for (const expected of ['Workspace', 'Live preview', 'Overlay', 'Preset', 'Motion']) {
      if (!text.includes(expected)) throw new Error(`Home is missing ${expected}`);
    }
    if (!await window.webContents.executeJavaScript('!!document.querySelector(".stage-canvas .guide")')) throw new Error('Safe-zone guides are missing');
    const fits = await window.webContents.executeJavaScript(`(() => { const bar = document.querySelector('.session-bar')?.getBoundingClientRect(); return bar ? bar.bottom <= innerHeight + 1 : false; })()`);
    if (!fits) throw new Error('Home session bar is clipped at 1280 x 820');
    const windowControls = await window.webContents.executeJavaScript(`({
      controls: !!document.querySelector('.window-controls'),
      minimize: !!document.querySelector('[aria-label="Minimize"]'),
      maximize: !!document.querySelector('[aria-label="Maximize"]'),
      close: !!document.querySelector('[aria-label="Close studio"]')
    })`);
    if (!windowControls.controls || !windowControls.minimize || !windowControls.maximize || !windowControls.close) throw new Error(`Window controls are missing: ${JSON.stringify(windowControls)}`);
    await shot(window, 'studio-home.png');

    await clickNav(window, 'Now playing');
    const nowText = await window.webContents.executeJavaScript('document.body.innerText');
    if (!nowText.includes('Follow Windows now playing')) throw new Error('Windows media controls are missing');
    if (!nowText.includes('Sync offset')) throw new Error('Sync offset control is missing');
    await shot(window, 'now-playing-preview.png');

    await clickNav(window, 'Visual studio');
    await shot(window, 'studio-visual.png');

    await clickNav(window, 'Typography');
    await shot(window, 'studio-typography.png');

    await clickNav(window, 'Spatial audio');
    await shot(window, 'studio-audio.png');

    await clickNav(window, 'Miniplayer');
    const miniText = await window.webContents.executeJavaScript('document.body.innerText');
    if (!miniText.includes('Enable miniplayer') || !miniText.includes('Scale') || !miniText.includes('Background opacity') || !miniText.includes('Bounce words')) throw new Error('Miniplayer controls are missing');
    await window.webContents.executeJavaScript(`[...document.querySelectorAll('.switch-row')].find((row) => row.textContent.includes('Enable miniplayer'))?.querySelector('input')?.click()`);
    await new Promise((resolve) => setTimeout(resolve, 700));
    const miniOn = await window.webContents.executeJavaScript('document.body.innerText');
    if (!miniOn.includes('Lyrics in miniplayer')) throw new Error('Miniplayer toggle did not collapse the preview lyrics');
    await window.webContents.executeJavaScript(`[...document.querySelectorAll('.switch-row')].find((row) => row.textContent.includes('Enable miniplayer'))?.querySelector('input')?.click()`);
    await new Promise((resolve) => setTimeout(resolve, 400));
    await shot(window, 'studio-miniplayer.png');

    await clickNav(window, 'Keybinds');
    const keybindText = await window.webContents.executeJavaScript('document.body.innerText');
    if (!keybindText.includes('Toggle shortcuts') || !keybindText.includes('Bind') || !keybindText.includes('Hide overlay')) throw new Error('Keybind page is incomplete');
    if (!await window.webContents.executeJavaScript(`!!document.querySelector('.page.page-in')`)) throw new Error('Page transition class is missing');
    await window.webContents.executeJavaScript(`[...document.querySelectorAll('.keybind-row')].find((row) => row.textContent.includes('Miniplayer'))?.querySelector('.btn')?.click()`);
    await new Promise((resolve) => setTimeout(resolve, 250));
    await window.webContents.executeJavaScript(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'm', code: 'KeyM', ctrlKey: true, altKey: true, bubbles: true, cancelable: true }))`);
    await new Promise((resolve) => setTimeout(resolve, 400));
    const bindRow = await window.webContents.executeJavaScript(`[...document.querySelectorAll('.keybind-row')].find((row) => row.textContent.includes('Miniplayer'))?.innerText ?? ''`);
    if (!bindRow.includes('Ctrl') || !bindRow.includes('M') || !bindRow.includes('Rebind')) throw new Error(`Keybind recorder did not assign: ${bindRow}`);
    await shot(window, 'studio-keybinds.png');

    await clickNav(window, 'General');
    await window.webContents.executeJavaScript(`[...document.querySelectorAll('.switch-row')].find((row) => row.textContent.includes('Menu animations'))?.querySelector('input')?.click()`);
    await new Promise((resolve) => setTimeout(resolve, 300));
    if (!await window.webContents.executeJavaScript(`document.querySelector('.app').classList.contains('no-ui-motion')`)) throw new Error('Menu animations toggle did not apply');
    await window.webContents.executeJavaScript(`[...document.querySelectorAll('.switch-row')].find((row) => row.textContent.includes('Menu animations'))?.querySelector('input')?.click()`);
    await new Promise((resolve) => setTimeout(resolve, 250));

    window.setSize(1000, 680);
    await clickNav(window, 'Home');
    await new Promise((resolve) => setTimeout(resolve, 900));
    await shot(window, 'studio-home-small.png');

    const smallText = await window.webContents.executeJavaScript('document.body.innerText');
    if (!smallText.includes('Live preview')) throw new Error('Small layout lost the preview');

    const overlay = new BrowserWindow({ width: 800, height: 600, show: false, transparent: true, webPreferences: { offscreen: true } });
    try {
      await overlay.loadFile(path.join(__dirname, '..', 'dist', 'index.html'), { query: { view: 'overlay' } });
      await new Promise((resolve) => setTimeout(resolve, 1200));
      const info = await overlay.webContents.executeJavaScript(`({
        body: getComputedStyle(document.body).backgroundColor,
        root: getComputedStyle(document.querySelector('.overlay-root')).backgroundColor,
        canvas: !!document.querySelector('.scene canvas')
      })`);
      if (info.body !== 'rgba(0, 0, 0, 0)' || info.root !== 'rgba(0, 0, 0, 0)' || !info.canvas) throw new Error(`Overlay is not transparent: ${JSON.stringify(info)}`);
      console.log('Overlay page remains transparent with a live canvas.');
    } finally { overlay.destroy(); }
  } catch (error) { console.error(error); process.exitCode = 1; }
  finally { window.destroy(); app.quit(); }
});
