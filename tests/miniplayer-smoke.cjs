const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');

const exe = path.join(__dirname, '..', 'release', 'win-unpacked', 'ECHOFRAME.exe');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function freePort() { return new Promise((resolve) => { const server = net.createServer(); server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(() => resolve(port)); }); }); }
async function pages(port) { return (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()); }
function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
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
  const userData = path.join(os.tmpdir(), `echoframe-miniplayer-${process.pid}`);
  const child = spawn(exe, [`--remote-debugging-port=${port}`, `--user-data-dir=${userData}`], { windowsHide: true, stdio: 'ignore' });
  try {
    let studio = null;
    for (let i = 0; i < 60 && !studio; i++) {
      try { studio = (await pages(port)).find((p) => p.title === 'ECHOFRAME Studio') ?? null; } catch { /* wait */ }
      if (!studio) await sleep(250);
    }
    if (!studio) throw new Error('studio did not start');
    const page = await connect(studio.webSocketDebuggerUrl);
    await evaluate(page, `window.echo.saveSettings({ miniplayerEnabled: true, miniplayerSide: 'right', miniplayerScale: 1, miniplayerOpacity: .94, miniplayerX: null, miniplayerY: null })`);
    const audio = fs.readFileSync(path.join(__dirname, '..', 'examples', 'demo-stereo.wav')).toString('base64');
    await evaluate(page, `(() => { const bytes = Uint8Array.from(atob('${audio}'), (c) => c.charCodeAt(0)); const file = new File([bytes], 'demo-stereo.wav', {type: 'audio/wav'}); const transfer = new DataTransfer(); transfer.items.add(file); const input = document.querySelector('input[accept^="audio/"]'); input.files = transfer.files; input.dispatchEvent(new Event('change', {bubbles: true})); })()`);
    await sleep(1000);
    const lrc = fs.readFileSync(path.join(__dirname, '..', 'examples', 'demo.lrc'), 'utf8');
    await evaluate(page, `(() => { const file = new File([${JSON.stringify(lrc)}], 'demo.lrc', {type: 'text/plain'}); const transfer = new DataTransfer(); transfer.items.add(file); const input = document.querySelector('input[accept^=".lrc"]'); input.files = transfer.files; input.dispatchEvent(new Event('change', {bubbles: true})); })()`);
    await sleep(500);
    await evaluate(page, `(() => { const audio = document.querySelector('audio'); audio.currentTime = 1.5; return audio.play().catch(() => {}); })()`);
    await sleep(700);

    let mini = null;
    for (let i = 0; i < 40 && !mini; i++) {
      mini = (await pages(port)).find((p) => p.title === 'ECHOFRAME Miniplayer') ?? null;
      if (!mini) await sleep(150);
    }
    if (!mini) throw new Error('miniplayer did not appear');
    let mp = await connect(mini.webSocketDebuggerUrl);
    await sleep(500);

    const layout = await evaluate(mp, `({
      transport: !!document.querySelector('.mp-transport'),
      infoOpen: !!document.querySelector('.mp-info.open'),
      controlCount: document.querySelectorAll('.mp-transport button').length,
      lyricsVisible: !!document.querySelector('.mp-line')
    })`);
    if (!layout.transport || layout.infoOpen || layout.controlCount !== 5 || !layout.lyricsVisible) throw new Error(`Unexpected initial panel layout: ${JSON.stringify(layout)}`);
    console.log('Transport is visible without opening details; lyrics are showing.');

    await evaluate(mp, `document.querySelector('.mp-now')?.click()`);
    await sleep(450);
    const infoLayout = await evaluate(mp, `({ infoOpen: !!document.querySelector('.mp-info.open'), transport: !!document.querySelector('.mp-transport') })`);
    if (!infoLayout.infoOpen || !infoLayout.transport) throw new Error('Song details replaced the transport');
    await evaluate(mp, `document.querySelector('.mp-info .mp-icon-btn')?.click()`);
    await sleep(350);
    console.log('Song details open inline with the transport still visible.');

    const bounce = () => evaluate(mp, `(() => {
      const word = document.querySelector('.mp-line.active .mp-word.sung');
      return { panel: document.querySelector('.mp-panel')?.className ?? '', word: !!word, animation: word ? getComputedStyle(word).animationName : '' };
    })()`);
    let bounceState = await bounce();
    if (!bounceState.word) throw new Error('No active sung word to bounce');
    if (!bounceState.panel.includes('bounce-soft') || bounceState.animation !== 'mpBounceSoft') throw new Error(`Soft bounce is not applied: ${JSON.stringify(bounceState)}`);
    await page.call('Runtime.evaluate', { expression: `window.echo.saveSettings({ miniplayerBounceStyle: 'spring' })`, awaitPromise: true });
    await sleep(500);
    bounceState = await bounce();
    if (!bounceState.panel.includes('bounce-spring') || bounceState.animation !== 'mpBounceSpring') throw new Error(`Spring bounce is not applied: ${JSON.stringify(bounceState)}`);
    await page.call('Runtime.evaluate', { expression: `window.echo.saveSettings({ miniplayerBounce: false })`, awaitPromise: true });
    await sleep(500);
    bounceState = await bounce();
    if (bounceState.panel.includes('bounce-') || bounceState.animation !== 'none') throw new Error(`Bounce did not turn off: ${JSON.stringify(bounceState)}`);
    await page.call('Runtime.evaluate', { expression: `window.echo.saveSettings({ miniplayerBounce: true, miniplayerBounceStyle: 'soft' })`, awaitPromise: true });
    await sleep(400);
    console.log('Word bounce switches style and turns off cleanly.');

    await evaluate(page, `document.querySelector('audio').currentTime = 2`);
    await sleep(250);
    const before = await evaluate(page, `document.querySelector('audio').currentTime`);
    await evaluate(mp, `document.querySelectorAll('.mp-tbtn.mp-seek')[1]?.click()`);
    await sleep(700);
    const after = await evaluate(page, `document.querySelector('audio').currentTime`);
    if (!(after - before > 8)) throw new Error(`Forward 10 s did not move local playback (${before} -> ${after})`);
    await evaluate(mp, `document.querySelector('.mp-play')?.click()`);
    await sleep(700);
    if (!(await evaluate(page, `document.querySelector('audio').paused`))) throw new Error('Miniplayer pause did not pause local playback');
    await evaluate(mp, `document.querySelector('.mp-play')?.click()`);
    await sleep(600);
    if (await evaluate(page, `document.querySelector('audio').paused`)) throw new Error('Miniplayer play did not resume local playback');
    console.log('Always-visible play/pause and ±10 s control local playback.');

    const boundsOf = async (target) => {
      const connection = await connect(target.webSocketDebuggerUrl);
      const position = await evaluate(connection, `({ x: window.screenX, y: window.screenY })`);
      connection.close();
      return position;
    };
    const findMiniplayer = async () => {
      for (let i = 0; i < 40; i++) {
        const target = (await pages(port)).find((p) => p.title === 'ECHOFRAME Miniplayer');
        if (target) return target;
        await sleep(150);
      }
      return null;
    };

    await evaluate(page, `window.echo.saveSettings({ miniplayerX: 240, miniplayerY: 150, miniplayerEnabled: false })`);
    await sleep(500);
    await evaluate(page, `window.echo.saveSettings({ miniplayerEnabled: true })`);
    mini = await findMiniplayer();
    if (!mini) throw new Error('miniplayer did not reopen at its remembered position');
    const placed = await boundsOf(mini);
    if (Math.abs(placed.x - 240) > 2 || Math.abs(placed.y - 150) > 2) throw new Error(`Remembered position was not applied: ${JSON.stringify(placed)}`);
    let stored = await evaluate(page, `window.echo.getSettings()`);
    if (stored.miniplayerX !== 240 || stored.miniplayerY !== 150) throw new Error(`Stored position was lost: ${stored.miniplayerX},${stored.miniplayerY}`);
    await page.call('Runtime.evaluate', { expression: `window.echo.saveSettings({ miniplayerOpacity: .6 })`, awaitPromise: true });
    await sleep(800);
    const afterOpacity = await boundsOf(mini);
    if (Math.abs(afterOpacity.x - 240) > 2 || Math.abs(afterOpacity.y - 150) > 2) throw new Error(`Changing opacity moved the panel: ${JSON.stringify(afterOpacity)}`);
    console.log('Position is remembered and stays put when opacity changes.');

    await page.call('Runtime.evaluate', { expression: `window.echo.saveSettings({ miniplayerSide: 'left' })`, awaitPromise: true });
    await sleep(800);
    const afterSide = await boundsOf(mini);
    stored = await evaluate(page, `window.echo.getSettings()`);
    if (afterSide.x !== 16 || stored.miniplayerX !== null) throw new Error(`Side change did not re-anchor the panel: ${JSON.stringify(afterSide)} / ${stored.miniplayerX}`);
    if (stored.miniplayerOpacity !== .6) throw new Error('Opacity setting was not saved');
    console.log('Side change re-anchors the panel and opacity persists.');

    mp = await connect(mini.webSocketDebuggerUrl);
    await sleep(400);
    const background = await evaluate(mp, `getComputedStyle(document.querySelector('.mp-panel')).backgroundColor`);
    if (!/0\.6/.test(background)) throw new Error(`Background opacity is not applied: ${background}`);
    console.log(`Background opacity is applied: ${background}.`);


    mp.close(); page.close();
  } finally {
    spawnSync('taskkill', ['/T', '/F', '/PID', String(child.pid)], { windowsHide: true, stdio: 'ignore' });
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
