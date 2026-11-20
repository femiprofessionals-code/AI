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
  try { if (musicPlayer) musicPlayer.volume = cfg.musicVolume; } catch {}
}

let generation = 0;
let ttsVoice: string | undefined;
let ready = false;

// Only three players exist for the whole app (voice, effects, music) and they
// are reused with replace(). Cheap tablets have very few audio decoders, so
// creating a player per clip makes sound stop working after a few taps.
let voicePlayer: AudioPlayer | null = null;
let sfxPlayer: AudioPlayer | null = null;
let musicPlayer: AudioPlayer | null = null;
let voiceListener: ((s: any) => void) | null = null;
let musicListener: ((s: any) => void) | null = null;
let voiceFailures = 0; // after repeated clip failures, use the tablet's voice directly

function getVoicePlayer() {
  if (!voicePlayer) {
    voicePlayer = createAudioPlayer(null, { updateInterval: 100 } as any);
    voicePlayer.addListener('playbackStatusUpdate', (st) => voiceListener?.(st));
  }
  return voicePlayer;
}
function resetVoicePlayer() {
  try { voicePlayer?.pause(); voicePlayer?.remove(); } catch {}
  voicePlayer = null;
}

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

// Plays one clip on the shared voice player. Resolves true when it played,
// false when it could not start (the caller then uses text-to-speech).
function playSource(source: number | string, volume: number, gen: number): Promise<boolean> {
  return new Promise((resolve) => {
    if (gen !== generation) return resolve(true);
    let p: AudioPlayer;
    try { p = getVoicePlayer(); } catch { return resolve(false); }
    let done = false;
    let started = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      clearTimeout(guard);
      voiceListener = null;
      if (!ok) { voiceFailures++; resetVoicePlayer(); } else if (started) voiceFailures = 0;
      resolve(ok);
    };
    // If the clip has not started after 2.5 s it failed: fall back to speech.
    let guard = setTimeout(() => finish(started), 2500);
    voiceListener = (st) => {
      if (gen !== generation) return finish(true);
      if (started && st.didJustFinish) return finish(true);
      if (!started && (st.playing || st.currentTime > 0)) {
        started = true;
        clearTimeout(guard);
        const left = st.duration > 0 ? st.duration - st.currentTime : 15;
        guard = setTimeout(() => finish(true), (left + 1.5) * 1000);
      }
    };
    try {
      p.volume = volume;
      p.replace(source as any);
      p.play();
    } catch { finish(false); }
  });
}

function speakTts(text: string, gen: number): Promise<void> {
  return new Promise((resolve) => {
    if (gen !== generation || !text) return resolve();
    const guard = setTimeout(resolve, 15000);
    const done = () => { clearTimeout(guard); resolve(); };
    try {
      Speech.speak(text, { voice: ttsVoice, language: ttsVoice ? undefined : 'en-GB', rate: 0.85, pitch: 1.05, volume: cfg.narrationVolume, onDone: done, onStopped: done, onError: done });
    } catch { done(); }
  });
}

export function hasClip(text: string) {
  return !!VOICE[lineKey(text)];
}

async function speakSegment(seg: string, gen: number) {
  const tts = seg === '{name}' ? cfg.name || 'friend' : seg;
  const tryClip = async (src: number | string) => {
    if (voiceFailures >= 3) return speakTts(tts, gen); // clips keep failing on this device
    if (!(await playSource(src, cfg.narrationVolume, gen)) && gen === generation) await speakTts(tts, gen);
  };
  if (seg === '{name}') {
    if (cfg.recordings['{name}']) return tryClip(cfg.recordings['{name}']);
    if (cfg.useParentNameClip && STARTER.nameClip && cfg.name === STARTER.childName) return tryClip(STARTER.nameClip);
    return speakTts(tts, gen);
  }
  const key = lineKey(seg);
  if (cfg.recordings[key]) return tryClip(cfg.recordings[key]);
  if (VOICE[key]) return tryClip(VOICE[key]);
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
  voiceListener = null;
  try { voicePlayer?.pause(); } catch {}
  Speech.stop().catch(() => {});
  cfg.onCaption?.(null);
}

export function sfx(name: SfxName) {
  try {
    if (!sfxPlayer) sfxPlayer = createAudioPlayer(null);
    sfxPlayer.volume = cfg.sfxVolume;
    sfxPlayer.replace(SFX[name]);
    sfxPlayer.play();
  } catch {}
}

export function playMusic(source: number | string, onStatus?: (t: number, done: boolean) => void): () => void {
  try {
    if (!musicPlayer) {
      musicPlayer = createAudioPlayer(null, { updateInterval: 200 } as any);
      musicPlayer.addListener('playbackStatusUpdate', (st) => musicListener?.(st));
    }
    const me = (st: any) => onStatus?.(st.currentTime, st.didJustFinish);
    musicListener = me;
    musicPlayer.volume = cfg.musicVolume;
    musicPlayer.replace(source as any);
    musicPlayer.play();
    return () => { if (musicListener === me) stopMusic(); };
  } catch {
    return () => {};
  }
}

export function stopMusic() {
  musicListener = null;
  try { musicPlayer?.pause(); } catch {}
}

export function stopAll() {
  stopSpeech();
  stopMusic();
}

/** Play a file (a parent recording preview). */
export async function playFile(uri: string) {
  stopSpeech();
  await playSource(uri, cfg.narrationVolume, generation);
}
