import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import * as Speech from 'expo-speech';
import { lineKey, splitName, normalizeLine } from './keys';
import { VOICE } from './voiceManifest.generated';
import { STARTER } from '../private.generated';

// Plays narration (one line at a time), sound effects and music.
// Fallback order for every narration line:
//   1. a parent recording of that line   2. the bundled Teacher Joy clip
//   3. Android text-to-speech             4. (silent) the caption stays on screen

const SFX = {
  pop: require('../../assets/audio/sfx/pop.m4a'),
  correct: require('../../assets/audio/sfx/correct.m4a'),
  tryagain: require('../../assets/audio/sfx/tryagain.m4a'),
  sparkle: require('../../assets/audio/sfx/sparkle.m4a'),
  fanfare: require('../../assets/audio/sfx/fanfare.m4a'),
  whoosh: require('../../assets/audio/sfx/whoosh.m4a'),
  flip: require('../../assets/audio/sfx/flip.m4a'),
  drop: require('../../assets/audio/sfx/drop.m4a'),
  snap: require('../../assets/audio/sfx/snap.m4a'),
};
export type SfxName = keyof typeof SFX;

export const SONGS: Record<string, number> = {
  L1: require('../../assets/audio/music/L1.m4a'),
  L2: require('../../assets/audio/music/L2.m4a'),
  L3: require('../../assets/audio/music/L3.m4a'),
  L4: require('../../assets/audio/music/L4.m4a'),
  L5: require('../../assets/audio/music/L5.m4a'),
  L6: require('../../assets/audio/music/L6.m4a'),
  L7: require('../../assets/audio/music/L7.m4a'),
  L8: require('../../assets/audio/music/L8.m4a'),
  L9: require('../../assets/audio/music/L9.m4a'),
};

type Config = {
  narrationVolume: number;
  sfxVolume: number;
  musicVolume: number;
  name: string;
  useParentNameClip: boolean;
  recordings: Record<string, string>; // line key -> file uri
  onCaption?: (text: string | null) => void;
};

const cfg: Config = { narrationVolume: 1, sfxVolume: 0.8, musicVolume: 0.8, name: '', useParentNameClip: true, recordings: {} };
export function configureAudio(c: Partial<Config>) {
  Object.assign(cfg, c);
  if (musicPlayer) musicPlayer.volume = cfg.musicVolume;
}

let generation = 0;
let narrator: AudioPlayer | null = null;
let musicPlayer: AudioPlayer | null = null;
const sfxPlayers: Partial<Record<SfxName, AudioPlayer>> = {};
let ttsVoice: string | undefined;
let ready = false;

export async function initAudio() {
  if (ready) return;
  ready = true;
  try {
    await setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: false, interruptionMode: 'duckOthers' } as any);
  } catch {}
  try {
    const voices = await Speech.getAvailableVoicesAsync();
    const en = voices.filter((v) => v.language?.toLowerCase().startsWith('en'));
    const pick = (lang: string) => en.find((v) => v.language.toLowerCase().replace('_', '-') === lang && /female|#female|-f-/i.test(v.identifier + v.name)) ?? en.find((v) => v.language.toLowerCase().replace('_', '-') === lang);
    ttsVoice = (pick('en-ng') ?? pick('en-gb') ?? pick('en-us') ?? en[0])?.identifier;
  } catch {}
}

function playSource(source: number | string, volume: number, gen: number): Promise<void> {
  return new Promise((resolve) => {
    if (gen !== generation) return resolve();
    const p = createAudioPlayer(source as any);
    narrator = p;
    p.volume = volume;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(guard);
      sub.remove();
      try { p.remove(); } catch {}
      if (narrator === p) narrator = null;
      resolve();
    };
    // Safety nets so a lesson can never freeze on a clip: give up if it has
    // not started after 4 s, and never wait longer than its length + 1.5 s.
    let guard = setTimeout(finish, 4000);
    let started = false;
    const sub = p.addListener('playbackStatusUpdate', (s) => {
      if (s.didJustFinish || gen !== generation) return finish();
      if (!started && (s.playing || s.currentTime > 0) && s.duration > 0) {
        started = true;
        clearTimeout(guard);
        guard = setTimeout(finish, (s.duration - s.currentTime + 1.5) * 1000);
      }
    });
    try { p.play(); } catch { finish(); }
  });
}

function speakTts(text: string, gen: number): Promise<void> {
  return new Promise((resolve) => {
    if (gen !== generation || !text) return resolve();
    const guard = setTimeout(resolve, 15000);
    const done = () => { clearTimeout(guard); resolve(); };
    Speech.speak(text, { voice: ttsVoice, language: ttsVoice ? undefined : 'en-GB', rate: 0.85, pitch: 1.05, volume: cfg.narrationVolume, onDone: done, onStopped: done, onError: done });
  });
}

export function hasClip(text: string) {
  return !!VOICE[lineKey(text)];
}

async function speakSegment(seg: string, gen: number) {
  if (seg === '{name}') {
    if (cfg.recordings['{name}']) return playSource(cfg.recordings['{name}'], cfg.narrationVolume, gen);
    if (cfg.useParentNameClip && STARTER.nameClip && cfg.name === STARTER.childName) return playSource(STARTER.nameClip, cfg.narrationVolume, gen);
    return speakTts(cfg.name || 'friend', gen);
  }
  const key = lineKey(seg);
  if (cfg.recordings[key]) return playSource(cfg.recordings[key], cfg.narrationVolume, gen);
  if (VOICE[key]) return playSource(VOICE[key], cfg.narrationVolume, gen);
  console.warn('[voice] no clip for:', seg);
  return speakTts(seg, gen);
}

/** Speak one or more lines in order. Resolves when finished or interrupted. */
export async function say(lines: string | string[], opts: { interrupt?: boolean } = {}) {
  const list = Array.isArray(lines) ? lines : [lines];
  if (opts.interrupt !== false) stopSpeech();
  const gen = generation;
  for (const line of list) {
    if (gen !== generation) return;
    const caption = normalizeLine(line).replace(/\{name\}/g, cfg.name || 'friend');
    cfg.onCaption?.(caption);
    for (const seg of splitName(line)) {
      if (gen !== generation) return;
      await speakSegment(seg, gen);
    }
    await new Promise((r) => setTimeout(r, 180));
  }
  if (gen === generation) cfg.onCaption?.(null);
}

export function stopSpeech() {
  generation++;
  if (narrator) {
    try { narrator.pause(); narrator.remove(); } catch {}
    narrator = null;
  }
  Speech.stop().catch(() => {});
  cfg.onCaption?.(null);
}

export function sfx(name: SfxName) {
  try {
    let p = sfxPlayers[name];
    if (!p) {
      p = createAudioPlayer(SFX[name]);
      sfxPlayers[name] = p;
    }
    p.volume = cfg.sfxVolume;
    p.seekTo(0).catch(() => {});
    p.play();
  } catch {}
}

export function playMusic(source: number | string, onStatus?: (t: number, done: boolean) => void): () => void {
  stopMusic();
  const p = createAudioPlayer(source as any, { updateInterval: 200 } as any);
  musicPlayer = p;
  p.volume = cfg.musicVolume;
  const sub = p.addListener('playbackStatusUpdate', (s) => onStatus?.(s.currentTime, s.didJustFinish));
  p.play();
  return () => {
    sub.remove();
    if (musicPlayer === p) stopMusic();
  };
}

export function stopMusic() {
  if (musicPlayer) {
    try { musicPlayer.pause(); musicPlayer.remove(); } catch {}
    musicPlayer = null;
  }
}

export function stopAll() {
  stopSpeech();
  stopMusic();
}

/** Play a file (a parent recording preview). */
export function playFile(uri: string) {
  stopSpeech();
  return playSource(uri, cfg.narrationVolume, generation);
}
