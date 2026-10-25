const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');

const exe = path.join(__dirname, '..', 'release', 'win-unpacked', 'ECHOFRAME.exe');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function freePort() { return new Promise((resolve) => { const server = net.createServer(); server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(() => resolve(port)); }); }); }
async function pages(port) { return (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()); }
function connect(target) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    const pending = new Map(); let nextId = 1;
    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (!message.id || !pending.has(message.id)) return;
      const { resolve: done, reject: fail } = pending.get(message.id); pending.delete(message.id);
      if (message.error || message.result?.exceptionDetails) fail(new Error(JSON.stringify(message.error ?? message.result.exceptionDetails))); else done(message.result);
    };
    ws.onopen = () => resolve({
      call(method, params) { return new Promise((done, fail) => { const id = nextId++; pending.set(id, { resolve: done, reject: fail }); ws.send(JSON.stringify({ id, method, params })); }); },
      close() { ws.close(); }
    });
    ws.onerror = reject;
  });
}
async function evaluate(page, expression) {
  const result = await page.call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  return result.result?.value;
}

(async () => {
  const port = await freePort();
  const userData = path.join(os.tmpdir(), `echoframe-transport-${process.pid}`);
  const child = spawn(exe, [`--remote-debugging-port=${port}`, `--user-data-dir=${userData}`], { windowsHide: true, stdio: 'ignore' });
  try {
    let studio = null;
    for (let i = 0; i < 60 && !studio; i++) {
      try { studio = (await pages(port)).find((p) => p.title === 'ECHOFRAME Studio') ?? null; } catch { /* wait */ }
      if (!studio) await sleep(250);
    }
    if (!studio) throw new Error('studio did not start');
    const page = await connect(studio);
    await evaluate(page, `window.echo.saveSettings({ miniplayerEnabled: true, miniplayerSide: 'right', miniplayerScale: 1 })`);
    const audio = fs.readFileSync(path.join(__dirname, '..', 'examples', 'demo-stereo.wav')).toString('base64');
    await evaluate(page, `(() => { const bytes = Uint8Array.from(atob('${audio}'), (c) => c.charCodeAt(0)); const file = new File([bytes], 'demo-stereo.wav', {type: 'audio/wav'}); const transfer = new DataTransfer(); transfer.items.add(file); const input = document.querySelector('input[accept^="audio/"]'); input.files = transfer.files; input.dispatchEvent(new Event('change', {bubbles: true})); })()`);
    await sleep(1000);
    const lrc = fs.readFileSync(path.join(__dirname, '..', 'examples', 'demo.lrc'), 'utf8');
    await evaluate(page, `(() => { const file = new File([${JSON.stringify(lrc)}], 'demo.lrc', {type: 'text/plain'}); const transfer = new DataTransfer(); transfer.items.add(file); const input = document.querySelector('input[accept^=".lrc"]'); input.files = transfer.files; input.dispatchEvent(new Event('change', {bubbles: true})); })()`);
    await sleep(500);
    await evaluate(page, `(() => { const audio = document.querySelector('audio'); audio.currentTime = 1.5; return audio.play().catch(() => {}); })()`);
    await sleep(700);

    let miniplayer = null;
    for (let i = 0; i < 40 && !miniplayer; i++) {
      miniplayer = (await pages(port)).find((p) => p.title === 'ECHOFRAME Miniplayer') ?? null;
      if (!miniplayer) await sleep(150);
    }
    if (!miniplayer) throw new Error('miniplayer did not appear');
    const mp = await connect(miniplayer);
    await sleep(500);
    await evaluate(mp, `document.querySelector('.mp-now')?.click()`);
    await sleep(450);

    const before = await evaluate(page, `document.querySelector('audio').currentTime`);
    await evaluate(mp, `document.querySelectorAll('.mp-tbtn.mp-seek')[1]?.click()`);
    await sleep(700);
    const after = await evaluate(page, `document.querySelector('audio').currentTime`);
    if (!(after - before > 8)) throw new Error(`Forward 10 s did not move local playback (${before} -> ${after})`);
    console.log(`Forward 10 s moved local playback from ${before.toFixed(2)}s to ${after.toFixed(2)}s.`);

    await evaluate(mp, `document.querySelector('.mp-play')?.click()`);
    await sleep(700);
    if (!(await evaluate(page, `document.querySelector('audio').paused`))) throw new Error('Miniplayer pause did not pause local playback');
    await evaluate(mp, `document.querySelector('.mp-play')?.click()`);
    await sleep(600);
    if (await evaluate(page, `document.querySelector('audio').paused`)) throw new Error('Miniplayer play did not resume local playback');
    console.log('Miniplayer play/pause controls local playback.');
    mp.close(); page.close();
  } finally {
    spawnSync('taskkill', ['/T', '/F', '/PID', String(child.pid)], { windowsHide: true, stdio: 'ignore' });
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
