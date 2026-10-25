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
