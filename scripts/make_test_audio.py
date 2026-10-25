"""Generate a local 16-second stereo WAV for manual analyzer and LRC tests."""
import math
import struct
import wave
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / "examples" / "demo-stereo.wav"
RATE = 48000
DURATION = 16
with wave.open(str(OUT), "wb") as output:
    output.setnchannels(2)
    output.setsampwidth(2)
    output.setframerate(RATE)
    buffer = bytearray()
    for index in range(RATE * DURATION):
        t = index / RATE
        tone = math.sin(2 * math.pi * 220 * t) * .45
        pulse = .5 if 15 <= t < 16 and (t * 5) % 1 < .035 else 0
        if t < 3: left, right = tone, tone * .05
        elif t < 6: left, right = tone * .05, tone
        elif t < 9: left, right = tone * .7, tone * .7
        elif t < 12: left, right = 0, 0
        elif t < 15:
            pan = (t - 12) / 3
            left, right = tone * (1 - pan), tone * pan
        else: left, right = pulse, pulse
        buffer.extend(struct.pack("<hh", int(max(-1, min(1, left)) * 32767), int(max(-1, min(1, right)) * 32767)))
    output.writeframes(buffer)
print(OUT)
