const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

app.setPath('userData', path.join(os.tmpdir(), `echoframe-local-${process.pid}`));

app.whenReady().then(async () => {
  const window = new BrowserWindow({ width: 1100, height: 760, show: false, webPreferences: { offscreen: true } });
  try {
    await window.loadFile(path.join(__dirname, '..', 'dist', 'index.html'), { query: { view: 'studio' } });
    const audio = fs.readFileSync(path.join(__dirname, '..', 'examples', 'demo-stereo.wav')).toString('base64');
    await window.webContents.executeJavaScript(`(() => { const bytes = Uint8Array.from(atob('${audio}'), c => c.charCodeAt(0)); const file = new File([bytes], 'demo-stereo.wav', {type:'audio/wav'}); const transfer = new DataTransfer(); transfer.items.add(file); const input = document.querySelector('input[accept^="audio/"]'); input.files = transfer.files; input.dispatchEvent(new Event('change', {bubbles:true})); })()`);
    await new Promise((resolve) => setTimeout(resolve, 800));
    const lyricText = fs.readFileSync(path.join(__dirname, '..', 'examples', 'demo.lrc'), 'utf8');
    await window.webContents.executeJavaScript(`(() => { const file = new File([${JSON.stringify(lyricText)}], 'demo.lrc', {type:'text/plain'}); const transfer = new DataTransfer(); transfer.items.add(file); const input = document.querySelector('input[accept^=".lrc"]'); input.files = transfer.files; input.dispatchEvent(new Event('change', {bubbles:true})); })()`);
    await new Promise((resolve) => setTimeout(resolve, 250));
    const state = await window.webContents.executeJavaScript(`({ text: document.body.innerText, audio: document.querySelector('audio')?.getAttribute('src') ?? '', lines: document.querySelectorAll('.lyric-timeline li').length })`);
    if (!state.text.includes('6 local lines loaded') || !state.audio.startsWith('blob:') || state.lines !== 6) throw new Error(`Local file or LRC did not load into Now Playing: ${JSON.stringify(state)}`);
    fs.mkdirSync(path.join(__dirname, '..', 'artifacts'), { recursive: true });
    fs.writeFileSync(path.join(__dirname, '..', 'artifacts', 'now-playing-local.png'), (await window.webContents.capturePage()).toPNG());
    console.log('Local audio and enhanced LRC loaded successfully.');
  } catch (error) { console.error(error); process.exitCode = 1; }
  finally { window.destroy(); app.quit(); }
});
