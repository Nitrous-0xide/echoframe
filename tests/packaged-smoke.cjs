const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');

const exe = path.join(__dirname, '..', 'release', 'win-unpacked', 'ECHOFRAME.exe');
if (!fs.existsSync(exe)) throw new Error('Build the installer before running this smoke test.');
function freePort() { return new Promise((resolve) => { const server = net.createServer(); server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(() => resolve(port)); }); }); }
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

(async () => {
  const port = await freePort();
  const userData = path.join(os.tmpdir(), `echoframe-package-smoke-${process.pid}`);
  const child = spawn(exe, [`--remote-debugging-port=${port}`, `--user-data-dir=${userData}`],
    { env: { ...process.env, ECHOFRAME_SMOKE: '1' }, windowsHide: true, stdio: 'ignore' });
  try {
    let target;
    for (let i = 0; i < 50; i++) {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/json/list`);
        const pages = await response.json();
        target = pages.find((page) => page.title === 'ECHOFRAME Studio');
        if (target) break;
      } catch { /* Wait for Electron to start. */ }
      await sleep(200);
    }
    if (!target) throw new Error('Packaged studio did not start.');
    const result = await new Promise((resolve, reject) => {
      const ws = new WebSocket(target.webSocketDebuggerUrl);
      const timeout = setTimeout(() => { ws.close(); reject(new Error('Packaged IPC timed out.')); }, 12000);
      ws.onopen = () => ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: {
        expression: `(async () => {
          let status = await window.echo.getStatus();
          for (let i = 0; i < 15 && !(await window.echo.getPlayback()).trackId; i++) {
            await new Promise(resolve => setTimeout(resolve, 200));
            status = await window.echo.getStatus();
          }
          for (let i = 0; i < 30 && status.lyricsStatus === 'searching'; i++) {
            await new Promise(resolve => setTimeout(resolve, 200));
            status = await window.echo.getStatus();
          }
          const lyrics = await window.echo.getLyrics();
          return { status, playback: await window.echo.getPlayback(), lyricsCount: lyrics.length,
            wordsCount: lyrics.reduce((count, line) => count + (line.words?.length || 0), 0) };
        })()`,
        awaitPromise: true, returnByValue: true
      } }));
      ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        if (message.id !== 1) return;
        clearTimeout(timeout); ws.close();
        if (message.error || message.result?.exceptionDetails) reject(new Error(JSON.stringify(message.error ?? message.result.exceptionDetails)));
        else resolve(message.result.result.value);
      };
      ws.onerror = reject;
    });
    if (result.status.playbackSource !== 'system') throw new Error('Packaged app is not following Windows media.');
    if (!result.status.gpu || !result.playback) throw new Error('Packaged IPC returned incomplete state.');
    if (result.lyricsCount && !result.wordsCount) throw new Error('Timed lines did not become individual word events.');
    console.log(`Packaged app started. Media source: ${result.status.mediaSource || 'none active'}. Track: ${result.playback.title || 'none active'}. Lyrics: ${result.lyricsCount} lines, ${result.wordsCount} words (${result.status.lyricsTiming || 'none'} timing).`);
  } finally {
    spawnSync('taskkill', ['/T', '/F', '/PID', String(child.pid)], { windowsHide: true, stdio: 'ignore' });
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
