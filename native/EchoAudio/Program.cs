using System.Text.Json;
using NAudio.CoreAudioApi;
using NAudio.Dsp;
using NAudio.Wave;

if (args.Length == 0) return 2;
if (args[0] == "--self-test") return AnalyzerSelfTest.Run();
if (args[0] == "--media-watch") return await MediaWatcher.Run();
try
{
    using var enumerator = new MMDeviceEnumerator();
    if (args[0] == "--devices")
    {
        var devices = enumerator.EnumerateAudioEndPoints(DataFlow.Render, DeviceState.Active)
            .Select(d => new { id = d.ID, name = d.FriendlyName }).ToArray();
        Console.WriteLine(JsonSerializer.Serialize(devices));
        return 0;
    }
    if (args[0] != "--capture") return 2;
    var deviceId = args.Length > 1 ? args[1] : "";
    using var device = string.IsNullOrWhiteSpace(deviceId)
        ? enumerator.GetDefaultAudioEndpoint(DataFlow.Render, Role.Multimedia)
        : enumerator.GetDevice(deviceId);
    if (device.State != DeviceState.Active) throw new InvalidOperationException("Selected output device is unavailable.");
    using var capture = new WasapiLoopbackCapture(device);
    var waveFormat = capture.WaveFormat;
    var floatSamples = waveFormat.Encoding == WaveFormatEncoding.IeeeFloat ||
        waveFormat is WaveFormatExtensible extensible && extensible.SubFormat == Guid.Parse("00000003-0000-0010-8000-00aa00389b71");
    var analyzer = new Analyzer(waveFormat.SampleRate, waveFormat.Channels, waveFormat.BitsPerSample, floatSamples);
    var gate = new object();
    var lastSent = DateTime.UtcNow;
    capture.DataAvailable += (_, eventArgs) =>
    {
        lock (gate)
        {
            var frame = analyzer.Process(eventArgs.Buffer.AsSpan(0, eventArgs.BytesRecorded));
            if ((DateTime.UtcNow - lastSent).TotalMilliseconds < 33) return;
            lastSent = DateTime.UtcNow;
            Console.WriteLine(JsonSerializer.Serialize(frame));
        }
    };
    capture.RecordingStopped += (_, eventArgs) =>
    {
        if (eventArgs.Exception is not null) Console.Error.WriteLine(eventArgs.Exception.Message);
    };
    capture.StartRecording();
    Console.Error.WriteLine("CAPTURING " + device.FriendlyName);
    while (Console.ReadLine() is { } line && line != "stop") { }
    capture.StopRecording();
    return 0;
}
catch (Exception error)
{
    Console.Error.WriteLine(error.Message);
    return 1;
}

internal sealed class Analyzer(int sampleRate, int channels, int bitsPerSample, bool floatSamples)
{
    private readonly float[] previousSpectrum = new float[512];
    private double smoothedLeft, smoothedRight, smoothedBass, smoothedMid, smoothedTreble, smoothedFlux, lastBalance;
    private long lastTick = Environment.TickCount64;

    public object Process(ReadOnlySpan<byte> data)
    {
        var bytesPerSample = bitsPerSample / 8;
        var stride = Math.Max(1, channels * bytesPerSample);
        var samples = Math.Min(data.Length / stride, 1024);
        var left = new float[1024]; var right = new float[1024];
        double sumL = 0, sumR = 0, mid = 0, side = 0;
        for (var i = 0; i < samples; i++)
        {
            var offset = i * stride;
            var l = ReadSample(data.Slice(offset, bytesPerSample));
            var r = channels > 1 ? ReadSample(data.Slice(offset + bytesPerSample, bytesPerSample)) : l;
            left[i] = l; right[i] = r;
            sumL += l * l; sumR += r * r;
            mid += Math.Pow((l + r) * .5, 2); side += Math.Pow((l - r) * .5, 2);
        }
        var divisor = Math.Max(1, samples);
        var rmsL = Math.Sqrt(sumL / divisor);
        var rmsR = Math.Sqrt(sumR / divisor);
        var mono = new Complex[1024];
        for (var i = 0; i < 1024; i++)
        {
            var window = .5 - .5 * Math.Cos(2 * Math.PI * i / 1023);
            mono[i].X = (float)((left[i] + right[i]) * .5 * window);
        }
        FastFourierTransform.FFT(true, 10, mono);
        double bass = 0, midrange = 0, treble = 0, flux = 0;
        var bassCount = 0; var midCount = 0; var trebleCount = 0;
        for (var i = 1; i < 512; i++)
        {
            var hz = (double)i * sampleRate / 1024;
            var mag = Math.Sqrt(mono[i].X * mono[i].X + mono[i].Y * mono[i].Y) * 8;
            flux += Math.Max(0, mag - previousSpectrum[i]);
            previousSpectrum[i] = (float)mag;
            if (hz < 180) { bass += mag; bassCount++; }
            else if (hz < 2400) { midrange += mag; midCount++; }
            else if (hz < 12000) { treble += mag; trebleCount++; }
        }
        var now = Environment.TickCount64;
        var dt = Math.Clamp((now - lastTick) / 1000.0, .016, .5);
        lastTick = now;
        var smoothing = 1 - Math.Exp(-dt / .12);
        smoothedLeft += (rmsL - smoothedLeft) * smoothing;
        smoothedRight += (rmsR - smoothedRight) * smoothing;
        smoothedBass += (bass / Math.Max(1, bassCount) - smoothedBass) * smoothing;
        smoothedMid += (midrange / Math.Max(1, midCount) - smoothedMid) * smoothing;
        smoothedTreble += (treble / Math.Max(1, trebleCount) - smoothedTreble) * smoothing;
        smoothedFlux += (flux / 511 - smoothedFlux) * smoothing;
        var balance = (smoothedRight - smoothedLeft) / (smoothedRight + smoothedLeft + 1e-6);
        var movement = (balance - lastBalance) / dt;
        lastBalance = balance;
        var onset = flux / 511 > smoothedFlux * 1.8 && flux / 511 > .00001;
        return new
        {
            timestampMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            leftRms = smoothedLeft, rightRms = smoothedRight, balance,
            midEnergy = Math.Sqrt(mid / divisor), sideEnergy = Math.Sqrt(side / divisor),
            bass = smoothedBass, midrange = smoothedMid, treble = smoothedTreble,
            spectralFlux = smoothedFlux, transient = onset ? 1.0 : 0.0,
            stereoMovement = movement, onset,
            intensity = Math.Clamp((smoothedLeft + smoothedRight) * 2, 0, 1)
        };
    }

    private float ReadSample(ReadOnlySpan<byte> bytes)
    {
        if (floatSamples && bitsPerSample == 32) return BitConverter.ToSingle(bytes);
        if (bitsPerSample == 16) return BitConverter.ToInt16(bytes) / 32768f;
        if (bitsPerSample == 24)
        {
            var value = bytes[0] | bytes[1] << 8 | bytes[2] << 16;
            if ((value & 0x800000) != 0) value |= unchecked((int)0xff000000);
            return value / 8388608f;
        }
        if (bitsPerSample == 32) return BitConverter.ToInt32(bytes) / 2147483648f;
        return 0;
    }
}

internal static class AnalyzerSelfTest
{
    public static int Run()
    {
        var left = Frame(.7f, .02f);
        var right = Frame(.02f, .7f);
        var center = Frame(.5f, .5f);
        var quiet = Frame(0, 0);
        var transient = Frame(.9f, .9f);
        var passed = left.GetProperty("balance").GetDouble() < -.7 &&
            right.GetProperty("balance").GetDouble() > .7 &&
            Math.Abs(center.GetProperty("balance").GetDouble()) < .05 &&
            quiet.GetProperty("intensity").GetDouble() == 0 &&
            transient.GetProperty("onset").GetBoolean();
        Console.WriteLine(JsonSerializer.Serialize(new { passed, left, right, center, quiet, transient }));
        return passed ? 0 : 1;
    }
    private static JsonElement Frame(float leftAmplitude, float rightAmplitude)
    {
        var bytes = new byte[1024 * 2 * sizeof(float)];
        for (var i = 0; i < 1024; i++)
        {
            var wave = (float)Math.Sin(2 * Math.PI * 440 * i / 48000);
            BitConverter.TryWriteBytes(bytes.AsSpan(i * 8, 4), leftAmplitude * wave);
            BitConverter.TryWriteBytes(bytes.AsSpan(i * 8 + 4, 4), rightAmplitude * wave);
        }
        var result = new Analyzer(48000, 2, 32, true).Process(bytes);
        return JsonSerializer.SerializeToElement(result);
    }
}
