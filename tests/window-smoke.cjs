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
    const timer = setTimeout(() => reject(new Error('CDP connect timed out')), 8000);
    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (!message.id || !pending.has(message.id)) return;
      const { resolve: done, reject: fail } = pending.get(message.id); pending.delete(message.id);
      if (message.error || message.result?.exceptionDetails) fail(new Error(JSON.stringify(message.error ?? message.result.exceptionDetails))); else done(message.result);
    };
    ws.onopen = () => { clearTimeout(timer); resolve({
      call(method, params, timeout = 8000) {
        return new Promise((done, fail) => {
          const id = nextId++;
          const limit = setTimeout(() => { pending.delete(id); fail(new Error(`${method} timed out`)); }, timeout);
          pending.set(id, { resolve: (value) => { clearTimeout(limit); done(value); }, reject: (error) => { clearTimeout(limit); fail(error); } });
          ws.send(JSON.stringify({ id, method, params }));
        });
      },
      close() { ws.close(); }
    }); };
    ws.onerror = reject;
  });
}
async function evaluate(page, expression) {
  const result = await page.call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  return result.result?.value;
}

(async () => {
  const port = await freePort();
  const userData = path.join(os.tmpdir(), `echoframe-window-${process.pid}`);
  const child = spawn(exe, [`--remote-debugging-port=${port}`, `--user-data-dir=${userData}`], { windowsHide: true, stdio: 'ignore' });
  const cleanup = () => { spawnSync('taskkill', ['/T', '/F', '/PID', String(child.pid)], { windowsHide: true, stdio: 'ignore' }); };
  const failSafe = setTimeout(() => { console.error('Window control check timed out.'); cleanup(); process.exit(1); }, 45000);
  try {
    let studio = null;
    for (let i = 0; i < 60 && !studio; i++) {
      try { studio = (await pages(port)).find((p) => p.title === 'ECHOFRAME Studio') ?? null; } catch { /* wait */ }
      if (!studio) await sleep(250);
    }
    if (!studio) throw new Error('studio did not start');
    const page = await connect(studio);
    await sleep(800);
    let state = await evaluate(page, 'window.echo.getWindowState()');
    console.log('Initial window state:', state);
    if (state.maximized) throw new Error('Studio started maximized');
    await evaluate(page, `window.echo.windowControl('maximize')`);
    await sleep(900);
    state = await evaluate(page, 'window.echo.getWindowState()');
    console.log('After maximize:', state);
    if (!state.maximized) throw new Error('Maximize control did not maximize the studio');
    await evaluate(page, `window.echo.windowControl('maximize')`);
    await sleep(900);
    state = await evaluate(page, 'window.echo.getWindowState()');
    console.log('After restore:', state);
    if (state.maximized) throw new Error('Restore control did not restore the studio');
    console.log('Custom maximize and restore controls work.');
    await page.call('Runtime.evaluate', { expression: `window.echo.windowControl('close'); 'sent'`, awaitPromise: false, returnByValue: true });
    let closed = false;
    for (let i = 0; i < 30 && !closed; i++) {
      await sleep(200);
      closed = !(await pages(port)).some((p) => p.title === 'ECHOFRAME Studio');
    }
    if (!closed) throw new Error('Close control did not close the studio window');
    console.log('Custom close control closes the studio and leaves the app running.');
    page.close();
  } finally {
    clearTimeout(failSafe);
    cleanup();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
