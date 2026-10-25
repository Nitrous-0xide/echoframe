import { contextBridge, ipcRenderer } from 'electron';
import type { AppSettings, AudioFeatures, EchoAPI, PlaybackState, RuntimeStatus, TimedLine, WordTimingKind } from '../src/types';

const api: EchoAPI = {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (patch: Partial<AppSettings>) => ipcRenderer.invoke('settings:save', patch),
  getStatus: () => ipcRenderer.invoke('status:get'),
  setOverlayVisible: (value: boolean) => ipcRenderer.invoke('overlay:visible', value),
  onSettings(callback: (settings: AppSettings) => void) {
    const listener = (_event: Electron.IpcRendererEvent, value: AppSettings) => callback(value);
    ipcRenderer.on('settings:changed', listener);
    return () => ipcRenderer.removeListener('settings:changed', listener);
  },
  onStatus(callback: (status: RuntimeStatus) => void) {
    const listener = (_event: Electron.IpcRendererEvent, value: RuntimeStatus) => callback(value);
    ipcRenderer.on('status:changed', listener);
    return () => ipcRenderer.removeListener('status:changed', listener);
  },
  listAudioDevices: () => ipcRenderer.invoke('audio:devices'),
  onAudioFrame(callback: (frame: AudioFeatures) => void) {
    const listener = (_event: Electron.IpcRendererEvent, value: AudioFeatures) => callback(value);
    ipcRenderer.on('audio:frame', listener);
    return () => ipcRenderer.removeListener('audio:frame', listener);
  },
  publishPlayback: (state: PlaybackState) => ipcRenderer.invoke('playback:publish', state),
  publishLyrics: (lines: TimedLine[], timing?: WordTimingKind) => ipcRenderer.invoke('lyrics:publish', lines, timing),
  setPlaybackSource: (source: 'system' | 'local') => ipcRenderer.invoke('playback:source', source),
  getPlayback: () => ipcRenderer.invoke('playback:get'),
  getLyrics: () => ipcRenderer.invoke('lyrics:get'),
  onPlayback(callback: (state: PlaybackState) => void) {
    const listener = (_event: Electron.IpcRendererEvent, value: PlaybackState) => callback(value);
    ipcRenderer.on('playback:changed', listener);
    return () => ipcRenderer.removeListener('playback:changed', listener);
  },
  onLyrics(callback: (lines: TimedLine[]) => void) {
    const listener = (_event: Electron.IpcRendererEvent, value: TimedLine[]) => callback(value);
    ipcRenderer.on('lyrics:changed', listener);
    return () => ipcRenderer.removeListener('lyrics:changed', listener);
  }
};
contextBridge.exposeInMainWorld('echo', api);
