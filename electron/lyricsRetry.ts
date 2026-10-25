export async function retryLookup<T>(
  operation: () => Promise<T>, signal: AbortSignal,
  onRetry: (error: unknown, attempt: number) => void,
  delaysMs = [0, 3000, 15000, 60000]
): Promise<T> {
  for (let attempt = 0; attempt < delaysMs.length; attempt++) {
    if (signal.aborted) throw signal.reason;
    const wait = delaysMs[attempt];
    if (wait > 0) await new Promise<void>((resolve, reject) => {
      const abort = () => { clearTimeout(timer); reject(signal.reason); };
      const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, wait);
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) abort();
    });
    if (signal.aborted) throw signal.reason;
    try { return await operation(); }
    catch (error) {
      if (signal.aborted || attempt === delaysMs.length - 1) throw error;
      onRetry(error, attempt + 1);
    }
  }
  throw new Error('No lyrics lookup attempts were configured.');
}
