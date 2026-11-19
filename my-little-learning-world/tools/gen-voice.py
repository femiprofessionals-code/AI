#!/usr/bin/env python3
"""Generate Teacher Joy's narration clips with the offline Piper voice engine.

Reads tools/out/lines.json (from collect-lines.ts) and writes one mono AAC
clip per line to assets/audio/voice/<key>.m4a. Existing clips are reused, so
re-running after a content change only renders the new lines.
Usage: python3 tools/gen-voice.py [--model /opt/piper/en_GB-jenny_dioco-medium.onnx]
"""
import argparse, json, os, re, subprocess, sys, tempfile, wave
from concurrent.futures import ThreadPoolExecutor

from piper import PiperVoice, SynthesisConfig

ap = argparse.ArgumentParser()
ap.add_argument('--model', default='/opt/piper/en_GB-jenny_dioco-medium.onnx')
ap.add_argument('--out', default='assets/audio/voice')
ap.add_argument('--force', action='store_true')
args = ap.parse_args()

# Spelling fixes so the voice says local names well.
LEXICON = {
    'Ngozi': 'N-go-zee',
    'Sola': 'Shaw-la',
    'Ada': 'Ah-dah',
    'Kiki': 'Kee-kee',
    'Bibi': 'Bee-bee',
    'jollof': 'jaw-lof',
    'PVS': 'P V S',
}

def speakable(text: str) -> str:
    for k, v in LEXICON.items():
        text = re.sub(rf'\b{k}\b', v, text)
    return text

os.makedirs(args.out, exist_ok=True)
lines = json.load(open('tools/out/lines.json'))
voice = PiperVoice.load(args.model)
# Slow, warm, child-directed pace.
cfg = SynthesisConfig(length_scale=1.3, noise_scale=0.6, noise_w_scale=0.8)

todo = [l for l in lines if args.force or not os.path.exists(f"{args.out}/{l['key']}.m4a")]
print(f'{len(lines)} lines, {len(todo)} to render', flush=True)
tmp = tempfile.mkdtemp()

def encode(item):
    key, wav_path = item
    # Trim leading silence, add a short tail, normalise loudness, mono AAC 48k.
    subprocess.run([
        'ffmpeg', '-y', '-loglevel', 'error', '-i', wav_path,
        '-af', 'silenceremove=start_periods=1:start_threshold=-50dB,apad=pad_dur=0.25,loudnorm=I=-16:TP=-1.5:LRA=11',
        '-ar', '44100', '-ac', '1', '-c:a', 'aac', '-b:a', '56k', f'{args.out}/{key}.m4a',
    ], check=True)
    os.remove(wav_path)

pending = []
with ThreadPoolExecutor(max_workers=3) as pool:
    for i, l in enumerate(todo):
        wav_path = f"{tmp}/{l['key']}.wav"
        with wave.open(wav_path, 'wb') as wf:
            voice.synthesize_wav(speakable(l['text']), wf, syn_config=cfg)
        pending.append(pool.submit(encode, (l['key'], wav_path)))
        if i % 100 == 0:
            print(f'  {i}/{len(todo)}', flush=True)
    for p in pending:
        p.result()

missing = [l for l in lines if not os.path.exists(f"{args.out}/{l['key']}.m4a")]
print('missing:', len(missing))
sys.exit(1 if missing else 0)
