import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { helperPath } from './audio';

export interface MediaFrame { source: string; title: string; artist: string; album: string; positionMs: number; durationMs: number; playing: boolean }
function parseMedia(value: unknown): MediaFrame | null {
  if (!value || typeof value !== 'object') return null;
  const frame = value as Record<string, unknown>;
  const str = (v: unknown, max: number) => typeof v === 'string' ? v.slice(0, max) : '';
  const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(86400000, v)) : 0;
  return { source: str(frame.source, 300), title: str(frame.title, 200), artist: str(frame.artist, 200), album: str(frame.album, 200), positionMs: num(frame.positionMs), durationMs: num(frame.durationMs), playing: frame.playing === true };
}
export class MediaBridge {
  private child: ChildProcessWithoutNullStreams | null = null;
  private buffer = '';
  onFrame?: (frame: MediaFrame) => void;
  onError?: (error: string) => void;
  start() {
    if (this.child) return;
    const child = spawn(helperPath(), ['--media-watch'], { windowsHide: true, stdio: 'pipe' });
    this.child = child;
    this.buffer = '';
    child.stdout.on('data', (data: Buffer) => {
      this.buffer += data.toString('utf8');
      if (this.buffer.length > 65536) { this.buffer = ''; return; }
      let index: number;
      while ((index = this.buffer.indexOf('\n')) >= 0) {
        const line = this.buffer.slice(0, index); this.buffer = this.buffer.slice(index + 1);
        if (line.length > 8192) continue;
        try { const frame = parseMedia(JSON.parse(line)); if (frame) this.onFrame?.(frame); } catch { /* Ignore malformed helper output. */ }
      }
    });
    let stderr = '';
    child.stderr.on('data', (data: Buffer) => { stderr = (stderr + data.toString('utf8')).slice(-300); });
    child.on('error', (error) => { if (this.child === child) { this.child = null; this.onError?.(error.message); } });
    child.on('close', (code) => { if (this.child === child) { this.child = null; this.onError?.(`Windows media detection stopped (${code ?? 'unknown'}): ${stderr}`); } });
  }
  stop() {
    const child = this.child;
    this.child = null;
    if (!child) return;
    try { child.stdin.write('stop\n'); } catch { /* Already closed. */ }
    setTimeout(() => { if (!child.killed) child.kill(); }, 1000).unref();
  }
}
