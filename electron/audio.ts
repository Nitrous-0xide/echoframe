import { app } from 'electron';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import path from 'node:path';
import type { AudioDevice, AudioFeatures } from '../src/types';

function helperPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'EchoAudio.exe')
    : path.join(app.getAppPath(), 'native', 'EchoAudio', 'bin', 'Release', 'net9.0-windows10.0.19041.0', 'EchoAudio.exe');
}
export { helperPath };
function finite(value: unknown, min = -100, max = 100): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : 0;
}
function parseFrame(value: unknown): AudioFeatures | null {
  if (!value || typeof value !== 'object') return null;
  const frame = value as Record<string, unknown>;
  return {
    timestampMs: finite(frame.timestampMs, 0, Number.MAX_SAFE_INTEGER),
    leftRms: finite(frame.leftRms, 0, 1), rightRms: finite(frame.rightRms, 0, 1),
    balance: finite(frame.balance, -1, 1), midEnergy: finite(frame.midEnergy, 0, 1),
    sideEnergy: finite(frame.sideEnergy, 0, 1), bass: finite(frame.bass, 0, 10),
    midrange: finite(frame.midrange, 0, 10), treble: finite(frame.treble, 0, 10),
    spectralFlux: finite(frame.spectralFlux, 0, 10), transient: finite(frame.transient, 0, 1),
    stereoMovement: finite(frame.stereoMovement, -100, 100), onset: frame.onset === true,
    intensity: finite(frame.intensity, 0, 1)
  };
}

export class AudioBridge {
  private capture: ChildProcessWithoutNullStreams | null = null;
  private stopping = false;
  private lines = '';
  onFrame?: (frame: AudioFeatures) => void;
  onState?: (active: boolean, error?: string) => void;

  get active() { return !!this.capture; }

  async listDevices(): Promise<AudioDevice[]> {
    return new Promise((resolve) => {
      const child = spawn(helperPath(), ['--devices'], { windowsHide: true, stdio: 'pipe' });
      let output = '';
      const timeout = setTimeout(() => { child.kill(); resolve([]); }, 5000);
      child.stdout.on('data', (data: Buffer) => { output += data.toString('utf8'); if (output.length > 65536) child.kill(); });
      child.on('error', () => { clearTimeout(timeout); resolve([]); });
      child.on('close', () => {
        clearTimeout(timeout);
        try {
          const value: unknown = JSON.parse(output);
          resolve(Array.isArray(value) ? value.filter((d): d is AudioDevice => !!d && typeof d.id === 'string' && typeof d.name === 'string').slice(0, 100) : []);
        } catch { resolve([]); }
      });
    });
  }

  start(deviceId: string) {
    this.stop();
    this.stopping = false;
    this.lines = '';
    const child = spawn(helperPath(), ['--capture', deviceId], { windowsHide: true, stdio: 'pipe' });
    this.capture = child;
    child.stdout.on('data', (data: Buffer) => {
      this.lines += data.toString('utf8');
      if (this.lines.length > 65536) { this.lines = ''; return; }
      let split: number;
      while ((split = this.lines.indexOf('\n')) >= 0) {
        const line = this.lines.slice(0, split); this.lines = this.lines.slice(split + 1);
        if (line.length > 8192) continue;
        try { const frame = parseFrame(JSON.parse(line)); if (frame) this.onFrame?.(frame); }
        catch { /* Ignore malformed frames from the helper. */ }
      }
    });
    let errorText = '';
    child.stderr.on('data', (data: Buffer) => { errorText = (errorText + data.toString('utf8')).slice(-300); });
    child.on('error', (error) => { if (this.capture === child) { this.capture = null; this.onState?.(false, error.message); } });
    child.on('close', (code) => {
      if (this.capture !== child) return;
      this.capture = null;
      this.onState?.(false, this.stopping ? undefined : `Audio capture stopped (${code ?? 'unknown'}): ${errorText}`);
    });
    this.onState?.(true);
  }

  stop() {
    if (!this.capture) return;
    const child = this.capture;
    this.capture = null;
    this.stopping = true;
    try { child.stdin.write('stop\n'); } catch { /* Process may already have exited. */ }
    setTimeout(() => { if (!child.killed) child.kill(); }, 1000).unref();
    this.onState?.(false);
  }
}
