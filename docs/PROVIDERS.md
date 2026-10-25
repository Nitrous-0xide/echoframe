# Playback and lyrics providers

ECHOFRAME follows the current Windows media session by default and can also play a user-selected local file. It requests timed lyrics from [LRCLIB](https://lrclib.net/docs) using the title, artist, and duration. Local LRC/enhanced LRC files override an online result for the current local track. Local audio files stay in the studio window; only playback position, metadata text, timing, and compact audio features cross the Electron IPC boundary. No captured system-audio samples are stored or transmitted.

The TypeScript interfaces in `src/contracts.ts` define replaceable playback, lyrics, capture, analysis, theme, placement, and rendering providers. The current providers include Windows Global System Media Transport Controls, the local HTML audio element, LRCLIB timed LRC, local LRC parser, embedded artwork reader, Windows WASAPI helper, placement engine, and Three.js renderer. Windows media detection works when the playing app publishes title, artist, and timeline metadata to Windows. Some players do not provide this data. Online lookup requires an internet connection and may have no timed match.

## Spotify boundary

ECHOFRAME observes Windows media-session metadata exposed by the operating system, including Spotify desktop sessions when Spotify publishes them. It does not call the Spotify Platform, scrape Spotify lyrics, request Spotify OAuth access, or claim that synced lyrics are available through Spotify's Web API. Lyrics come from LRCLIB and may be unavailable for some tracks. Spotify's [Developer Policy](https://developer.spotify.com/policy) restricts synchronization in applications built with the Spotify Platform; its [Web API playback reference](https://developer.spotify.com/documentation/web-api/reference/get-information-about-the-users-current-playback) repeats that restriction. ECHOFRAME does not use that platform. A generic browser session cannot reliably identify which site is playing.

## Local lyrics timing

- Standard LRC supplies line times. ECHOFRAME estimates start times for each word within a capped line interval and labels the timing as estimated; it does not claim exact word synchronization.
- Enhanced LRC supplies word markers. Each marked word becomes its own timed object, including repeated words.
- LRCLIB Lyricsfile records may supply `lines[].words` with recorded word timestamps. ECHOFRAME uses these when available. If a record has only line timestamps, it estimates word times and labels them accordingly. Mixed records retain recorded times where present and estimate only missing lines.
- If no local LRC is loaded, ECHOFRAME looks up timed lyrics at LRCLIB. It uses strict title, artist, and duration checks to avoid displaying lyrics for the wrong recording. It does not animate untimed plain lyrics as if they were synchronized. If no timed match exists, playback continues without lyrics. The studio preview continues to offer simulated visuals when there is no track.
- The LRCLIB client identifies itself, spaces requests, caches results in memory, follows `Retry-After`, and never uploads audio. Temporary failures trigger delayed retries while the same track remains active; changing tracks or loading a local LRC cancels the pending lookup.

## Windows capture

The native helper uses WASAPI loopback on a selected render endpoint. [Microsoft's loopback documentation](https://learn.microsoft.com/windows/win32/coreaudio/loopback-recording) notes shared-mode and protected-stream limits. ECHOFRAME requires a fresh opt-in each launch. It sends only computed features through a bounded child-process pipe, not raw audio. Device selection includes any active Windows render endpoint, including headphones when exposed by the driver.
