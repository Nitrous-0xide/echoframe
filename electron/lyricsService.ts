import { parseLrc } from '../src/lyrics/lrc';
import { parseLyricsfile } from '../src/lyrics/lyricsfile';
import { withWordTiming } from '../src/lyrics/wordTiming';
import type { TimedLine, WordTimingKind } from '../src/types';

interface RecordData { trackName?: unknown; artistName?: unknown; duration?: unknown; instrumental?: unknown; syncedLyrics?: unknown; lyricsfile?: unknown }
export interface LookupTrack { title: string; artist: string; album?: string; durationMs: number }
export interface LyricsResult { lines: TimedLine[]; available: boolean; timing: WordTimingKind }
const client = 'ECHOFRAME/0.9.7 (Windows desktop app)';
const normalize = (s: string) => s.toLocaleLowerCase().normalize('NFKD').replace(/\p{Diacritic}/gu, '').replace(/[^a-z0-9]+/g, ' ').trim();
function valid(record: RecordData, track: LookupTrack) {
  if (!normalize(track.title) || !normalize(track.artist)) return false;
  if (normalize(String(record.trackName ?? '')) !== normalize(track.title)) return false;
  if (normalize(String(record.artistName ?? '')) !== normalize(track.artist)) return false;
  if (track.durationMs > 0 && typeof record.duration === 'number' && Math.abs(record.duration * 1000 - track.durationMs) > 5000) return false;
  return true;
}
function timedLines(record: RecordData): TimedLine[] {
  if (record.instrumental === true) return [];
  const structured = typeof record.lyricsfile === 'string' ? parseLyricsfile(record.lyricsfile) : [];
  return structured.length ? structured : parseLrc(typeof record.syncedLyrics === 'string' ? record.syncedLyrics : '');
}
export class LrclibClient {
  private lastRequest = 0;
  private retryUntil = 0;
  private cache = new Map<string, LyricsResult>();
  private async request(url: URL, signal: AbortSignal, retries = 2): Promise<unknown> {
    const wait = Math.max(0, this.lastRequest + 400 - Date.now(), this.retryUntil - Date.now());
    if (wait) await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, wait);
      signal.addEventListener('abort', () => { clearTimeout(timer); reject(signal.reason); }, { once: true });
    });
    this.lastRequest = Date.now();
    const response = await fetch(url, { signal, headers: { 'User-Agent': client, 'Accept': 'application/json' } });
    if (response.status === 429 || response.status === 503) {
      const retrySeconds = Number(response.headers.get('retry-after'));
      this.retryUntil = Date.now() + (Number.isFinite(retrySeconds) && retrySeconds > 0 ? Math.min(retrySeconds, 300) * 1000 : 5000);
      if (retries > 0) return this.request(url, signal, retries - 1);
      throw new Error(`LRCLIB is rate-limiting requests; retry after ${Math.ceil((this.retryUntil - Date.now()) / 1000)}s.`);
    }
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`LRCLIB returned HTTP ${response.status}.`);
    if (!(response.headers.get('content-type') ?? '').includes('application/json')) throw new Error('LRCLIB returned an unexpected response.');
    const body = await response.text();
    if (body.length > 1_000_000) throw new Error('LRCLIB response was too large.');
    return JSON.parse(body) as unknown;
  }
  async lookup(track: LookupTrack, signal: AbortSignal): Promise<LyricsResult> {
    const key = `${normalize(track.title)}|${normalize(track.artist)}|${Math.round(track.durationMs / 1000)}`;
    const cached = this.cache.get(key);
    if (cached) return cached;
    const exact = new URL('https://lrclib.net/api/get');
    exact.searchParams.set('track_name', track.title);
    exact.searchParams.set('artist_name', track.artist);
    if (track.album) exact.searchParams.set('album_name', track.album);
    if (track.durationMs >= 1000 && track.durationMs <= 3_600_000) exact.searchParams.set('duration', String(Math.round(track.durationMs / 1000)));
    let value = await this.request(exact, signal);
    let record = value && typeof value === 'object' ? value as RecordData : null;
    if (!record || !valid(record, track) || timedLines(record).length === 0) {
      const search = new URL('https://lrclib.net/api/search');
      search.searchParams.set('track_name', track.title);
      search.searchParams.set('artist_name', track.artist);
      value = await this.request(search, signal);
      record = Array.isArray(value) ? value.find((candidate): candidate is RecordData => !!candidate && typeof candidate === 'object' && valid(candidate as RecordData, track) && timedLines(candidate as RecordData).length > 0) ?? null : null;
    }
    const timed = withWordTiming(record ? timedLines(record) : []);
    const result = { lines: timed.lines, available: !!record, timing: timed.timing };
    if (this.cache.size >= 100) this.cache.delete(this.cache.keys().next().value!);
    this.cache.set(key, result);
    return result;
  }
}
