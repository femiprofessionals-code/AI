#!/usr/bin/env python3
"""Synthesise sound effects and the 9 lesson songs (chant over an original
backing tune). Everything is generated from code: no third-party samples.
Writes assets/audio/sfx/*.m4a, assets/audio/music/<lesson>.m4a and
src/audio/songTimings.generated.json (when each sung line starts).
"""
import json, os, subprocess, tempfile, wave
import numpy as np
from piper import PiperVoice, SynthesisConfig

SR = 44100
os.makedirs('assets/audio/sfx', exist_ok=True)
os.makedirs('assets/audio/music', exist_ok=True)
tmp = tempfile.mkdtemp()

def tone(freq, dur, amp=0.4, kind='bell', attack=0.005):
    t = np.arange(int(SR * dur)) / SR
    if kind == 'bell':  # soft marimba/bell: fundamental + octave, fast decay
        w = np.sin(2 * np.pi * freq * t) + 0.35 * np.sin(2 * np.pi * freq * 2 * t) + 0.1 * np.sin(2 * np.pi * freq * 3.01 * t)
        env = np.exp(-t * 6)
    elif kind == 'pad':
        w = np.sin(2 * np.pi * freq * t) + 0.2 * np.sin(2 * np.pi * freq * 2 * t)
        env = np.minimum(1, t / 0.08) * np.exp(-t * 1.2)
    else:  # pluck/bass
        w = np.sin(2 * np.pi * freq * t)
        env = np.exp(-t * 4)
    env *= np.minimum(1, t / attack)
    return amp * w * env

def mix(buf, sig, at):
    i = int(at * SR)
    end = min(len(buf), i + len(sig))
    buf[i:end] += sig[: end - i]

def save(name, sig, path):
    sig = sig / max(1e-6, np.max(np.abs(sig))) * 0.89
    wav = f'{tmp}/{name}.wav'
    with wave.open(wav, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((sig * 32767).astype(np.int16).tobytes())
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav, '-c:a', 'aac', '-b:a', '96k', path], check=True)

N = lambda n: 440 * 2 ** ((n - 69) / 12)  # MIDI note -> Hz

# ---------------- sound effects ----------------
def sfx():
    def buf(d): return np.zeros(int(SR * d))
    b = buf(0.18); mix(b, tone(N(84), 0.15, kind='bell'), 0); save('pop', b, 'assets/audio/sfx/pop.m4a')
    b = buf(0.7)
    for i, n in enumerate([72, 76, 79, 84]): mix(b, tone(N(n), 0.4), i * 0.08)
    save('correct', b, 'assets/audio/sfx/correct.m4a')
    b = buf(0.6); mix(b, tone(N(67), 0.4, amp=0.3), 0); mix(b, tone(N(64), 0.4, amp=0.3), 0.18)
    save('tryagain', b, 'assets/audio/sfx/tryagain.m4a')  # gentle two notes down, never a buzzer
    b = buf(1.0)
    for i, n in enumerate([84, 88, 91, 96, 91, 96]): mix(b, tone(N(n), 0.3, amp=0.25), i * 0.06)
    save('sparkle', b, 'assets/audio/sfx/sparkle.m4a')
    b = buf(2.2)
    for i, n in enumerate([60, 64, 67, 72]): mix(b, tone(N(n), 0.5), i * 0.13)
    for n in [72, 76, 79, 84]: mix(b, tone(N(n), 1.6, amp=0.25, kind='pad'), 0.6)
    save('fanfare', b, 'assets/audio/sfx/fanfare.m4a')
    rng = np.random.default_rng(1)
    noise = rng.standard_normal(int(SR * 0.5)); t = np.arange(len(noise)) / SR
    wh = np.convolve(noise, np.ones(40) / 40, mode='same') * np.sin(np.pi * t / 0.5)
    save('whoosh', wh, 'assets/audio/sfx/whoosh.m4a')
    b = buf(0.25); mix(b, tone(N(76), 0.12, amp=0.3), 0); mix(b, tone(N(81), 0.12, amp=0.3), 0.06)
    save('flip', b, 'assets/audio/sfx/flip.m4a')
    t = np.arange(int(SR * 0.3)) / SR
    drop = 0.5 * np.sin(2 * np.pi * (900 - 1500 * t) * t) * np.exp(-t * 12)
    save('drop', drop, 'assets/audio/sfx/drop.m4a')
    b = buf(0.35); mix(b, tone(N(60), 0.3, kind='pluck'), 0); mix(b, tone(N(72), 0.2, amp=0.2), 0.05)
    save('snap', b, 'assets/audio/sfx/snap.m4a')

# ---------------- songs ----------------
TUNES = {
    # bpm, chord roots (MIDI) per bar, melody riff (scale degrees over C major)
    'bright': (108, [60, 65, 67, 60], [0, 4, 7, 4, 9, 7, 4, 2]),
    'bouncy': (116, [60, 67, 65, 67], [0, 0, 4, 7, 9, 7, 4, 7]),
    'gentle': (92, [60, 57, 65, 67], [4, 2, 0, 2, 4, 4, 7, 4]),
}
MAJOR = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16]

def backing(tune, bars):
    bpm, roots, riff = TUNES[tune]
    beat = 60 / bpm; bar = beat * 4
    out = np.zeros(int(SR * (bars * bar + 2)))
    rng = np.random.default_rng(7)
    for b in range(bars):
        root = roots[b % len(roots)]
        t0 = b * bar
        mix(out, tone(N(root - 12), bar * 0.9, amp=0.35, kind='pluck'), t0)
        mix(out, tone(N(root - 12), beat, amp=0.25, kind='pluck'), t0 + 2 * beat)
        for n in (0, 4, 7):
            mix(out, tone(N(root + n), bar, amp=0.06, kind='pad'), t0)
        for i, deg in enumerate(riff):
            step = MAJOR[deg % len(MAJOR)] if deg < 10 else deg
            mix(out, tone(N(72 + step - (0 if root in (60, 65, 67) else 3)), beat * 0.45, amp=0.12), t0 + i * beat / 2)
        for i in range(8):  # soft shaker on eighths
            sh = rng.standard_normal(int(SR * 0.03)) * np.exp(-np.arange(int(SR * 0.03)) / 300) * (0.05 if i % 2 else 0.08)
            mix(out, sh, t0 + i * beat / 2)
    return out, bar

def read_wav(path):
    with wave.open(path) as w:
        sr = w.getframerate(); data = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16) / 32768
    if sr != SR:
        idx = np.arange(0, len(data), sr / SR); data = np.interp(idx, np.arange(len(data)), data)
    return data

def songs():
    voice = PiperVoice.load('/opt/piper/en_GB-jenny_dioco-medium.onnx')
    cfg = SynthesisConfig(length_scale=1.05, noise_scale=0.7, noise_w_scale=0.9)
    timings = {}
    for s in json.load(open('tools/out/songs.json')):
        clips = []
        for i, line in enumerate(s['lines']):
            p = f"{tmp}/{s['id']}-{i}.wav"
            with wave.open(p, 'wb') as wf:
                voice.synthesize_wav(line, wf, syn_config=cfg)
            subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', p, '-af', 'silenceremove=start_periods=1:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse', f'{p}.t.wav'], check=True)
            clips.append(read_wav(f'{p}.t.wav'))
        bpm = TUNES[s['tune']][0]; bar = 60 / bpm * 4
        # Each line starts on a bar line and gets as many bars as it needs.
        # The whole song is sung twice so she can join in the second time.
        starts, t = [], bar * 2
        for _ in range(2):
            for c in clips:
                starts.append(t)
                t += bar * max(1, int(np.ceil((len(c) / SR + 0.4) / bar)))
            t += bar
        total_bars = int(np.ceil(t / bar)) + 1
        music, _ = backing(s['tune'], total_bars)
        vocal = np.zeros_like(music)
        for i, st in enumerate(starts):
            mix(vocal, clips[i % len(clips)] * 0.9, st)
        song = music * 0.55 + vocal
        save(f"song-{s['id']}", song[: int(SR * (t + bar))], f"assets/audio/music/{s['id']}.m4a")
        timings[s['id']] = [round(x * 1000) for x in starts]
        print('song', s['id'], f'{t:.1f}s')
    json.dump(timings, open('src/audio/songTimings.generated.json', 'w'))

sfx()
songs()
print('done')
