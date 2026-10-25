using System.Text.Json;
using Windows.Media.Control;

internal static class MediaWatcher
{
    public static async Task<int> Run()
    {
        try
        {
            var manager = await GlobalSystemMediaTransportControlsSessionManager.RequestAsync();
            using var stop = new CancellationTokenSource();
            _ = Task.Run(() => { Console.ReadLine(); stop.Cancel(); });
            string? lastIdentity = null;
            long lastPosition = -1;
            while (!stop.IsCancellationRequested)
            {
                try
                {
                    var sessions = manager.GetSessions().ToArray();
                    var session = sessions.FirstOrDefault(s => s.GetPlaybackInfo()?.PlaybackStatus == GlobalSystemMediaTransportControlsSessionPlaybackStatus.Playing)
                        ?? sessions.FirstOrDefault(s => s == manager.GetCurrentSession())
                        ?? sessions.FirstOrDefault();
                    object state;
                    bool playing;
                    if (session is null)
                    {
                        playing = false;
                        state = new { source = "", title = "", artist = "", album = "", positionMs = 0L, durationMs = 0L, playing = false };
                    }
                    else
                    {
                        var media = await session.TryGetMediaPropertiesAsync();
                        var timeline = session.GetTimelineProperties();
                        playing = session.GetPlaybackInfo()?.PlaybackStatus == GlobalSystemMediaTransportControlsSessionPlaybackStatus.Playing;
                        var position = timeline.Position.TotalMilliseconds;
                        if (playing && timeline.LastUpdatedTime.Year > 2000)
                            position += Math.Clamp((DateTimeOffset.UtcNow - timeline.LastUpdatedTime).TotalMilliseconds, 0, 10000);
                        state = new
                        {
                            source = session.SourceAppUserModelId,
                            title = media.Title ?? "", artist = media.Artist ?? "", album = media.AlbumTitle ?? "",
                            positionMs = (long)Math.Clamp(position, 0, Math.Max(0, (timeline.EndTime - timeline.StartTime).TotalMilliseconds)),
                            durationMs = (long)Math.Max(0, (timeline.EndTime - timeline.StartTime).TotalMilliseconds),
                            playing
                        };
                    }
                    var json = JsonSerializer.Serialize(state);
                    var identity = string.Join('|', state.GetType().GetProperties()
                        .Where(p => p.Name is "source" or "title" or "artist" or "playing")
                        .Select(p => p.GetValue(state)?.ToString()));
                    var emittedPosition = state.GetType().GetProperty("positionMs")?.GetValue(state) as long? ?? 0;
                    // While playing, report every poll so the renderer can re-anchor its
                    // playback clock before extrapolation drifts away from the player.
                    if (identity != lastIdentity || playing || Math.Abs(emittedPosition - lastPosition) > 1000)
                    {
                        Console.WriteLine(json);
                        lastIdentity = identity;
                        lastPosition = emittedPosition;
                    }
                }
                catch (Exception error) { Console.Error.WriteLine(error.Message); }
                await Task.Delay(500, stop.Token).ContinueWith(_ => { });
            }
            return 0;
        }
        catch (Exception error)
        {
            Console.Error.WriteLine(error.Message);
            return 1;
        }
    }
}
