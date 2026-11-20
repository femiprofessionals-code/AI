#!/usr/bin/env python3
"""Teacher Joy's narration with the Kokoro offline neural voice (af_heart).

Renders every line in tools/out/lines.json to assets/audio/voice/<key>.m4a.
Lines that contain {name} are also rendered whole with the child's name from
private/profile.json, so her name is spoken naturally inside the sentence.
Usage: python3 tools/gen-voice.py [--force]
"""
import argparse, json, os, subprocess, sys, tempfile
import numpy as np, soundfile as sf
from kokoro_onnx import Kokoro
sys.path.insert(0, os.path.dirname(__file__))
from linekey import line_key, normalize

ap = argparse.ArgumentParser()
ap.add_argument('--force', action='store_true')
ap.add_argument('--voice', default='af_heart')
ap.add_argument('--speed', type=float, default=0.88)
args = ap.parse_args()

OUT = 'assets/audio/voice'
os.makedirs(OUT, exist_ok=True)
k = Kokoro('/opt/kokoro/model.onnx', '/opt/kokoro/voices.npz')

# Spelling hints so the voice says local and child words the way we want.
SAY = {'Sola': 'Shola', 'PVS': 'P V S', 'jollof': 'jollof'}
def speakable(t):
    for a, b in SAY.items():
        t = t.replace(a, b)
    return t

jobs = [(l['key'], l['text']) for l in json.load(open('tools/out/lines.json'))]
name = ''
if os.path.exists('private/profile.json'):
    name = json.load(open('private/profile.json')).get('childName', '')
if name:
    for t in json.load(open('tools/out/name-lines.json')):
        full = normalize(t.replace('{name}', name))
        jobs.append((line_key(full), full))
    jobs.append((line_key(name), name))
jobs = [j for j in dict(jobs).items()]
todo = [j for j in jobs if args.force or not os.path.exists(f'{OUT}/{j[0]}.m4a')]
print(f'{len(jobs)} clips, {len(todo)} to render', flush=True)
tmp = tempfile.mkdtemp()
for i, (key, text) in enumerate(todo):
    audio, sr = k.create(speakable(text), voice=args.voice, speed=args.speed, lang='en-us')
    pad = np.zeros(int(sr * 0.12), dtype=np.float32)
    wav = f'{tmp}/{key}.wav'
    sf.write(wav, np.concatenate([pad, audio, pad, pad]), sr)
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav, '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11',
                    '-ar', '44100', '-ac', '1', '-c:a', 'aac', '-b:a', '64k', f'{OUT}/{key}.m4a'], check=True)
    os.remove(wav)
    if i % 50 == 0:
        print(f'  {i}/{len(todo)}', flush=True)
missing = [j for j in jobs if not os.path.exists(f'{OUT}/{j[0]}.m4a')]
print('missing:', len(missing))
json.dump(sorted(j[0] for j in jobs), open('tools/out/clip-keys.json', 'w'))
sys.exit(1 if missing else 0)
