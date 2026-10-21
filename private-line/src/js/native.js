// Phone features through Capacitor: storage, push notifications, fingerprint, vibration,
// and the ringtone. Each one degrades gracefully in a desktop browser (used by the tests).
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { PushNotifications } from '@capacitor/push-notifications';
import { Haptics } from '@capacitor/haptics';
import { App } from '@capacitor/app';
import { NativeBiometric } from '@capgo/capacitor-native-biometric';

export const NATIVE = Capacitor.isNativePlatform();

/* ---------- Local storage on this phone ---------- */
export async function load(key, fallback = null) {
  try {
    const { value } = await Preferences.get({ key });
    return value == null ? fallback : JSON.parse(value);
  } catch (_) { return fallback; }
}
export const save = (key, value) => Preferences.set({ key, value: JSON.stringify(value) });
export const remove = (key) => Preferences.remove({ key });

/* ---------- Fingerprint / face ---------- */
export async function biometricAvailable() {
  if (!NATIVE) return false;
  try { return (await NativeBiometric.isAvailable()).isAvailable; } catch (_) { return false; }
}
export async function biometricVerify() {
  try {
    await NativeBiometric.verifyIdentity({ reason: 'Unlock Private Line', title: 'Private Line', subtitle: 'Confirm it\'s you' });
    return true;
  } catch (_) { return false; }
}

/* ---------- Vibration ---------- */
export function vibrate(ms = 300) {
  if (NATIVE) Haptics.vibrate({ duration: ms }).catch(() => {});
  else if (navigator.vibrate) navigator.vibrate(ms);
}

/* ---------- Ringtone while a call rings (app open) ---------- */
let ring = null;
export function startRingtone(outgoing) {
  stopRingtone();
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const gain = ctx.createGain();
    gain.gain.value = outgoing ? 0.12 : 0.35;
    gain.connect(ctx.destination);
    let stopped = false;
    const burst = () => {
      if (stopped) return;
      const t = ctx.currentTime;
      // Classic double ring (incoming) or a soft ring-back tone (outgoing).
      const pattern = outgoing ? [[0, 1.2]] : [[0, 0.4], [0.6, 0.4]];
      for (const [off, len] of pattern) {
        for (const f of outgoing ? [440, 480] : [880, 1100]) {
          const o = ctx.createOscillator();
          o.frequency.value = f;
          o.connect(gain);
          o.start(t + off);
          o.stop(t + off + len);
        }
      }
      if (!outgoing) vibrate(800);
    };
    burst();
    const timer = setInterval(burst, outgoing ? 4000 : 2500);
    ring = { stop: () => { stopped = true; clearInterval(timer); ctx.close().catch(() => {}); } };
  } catch (_) { /* no audio */ }
}
export function stopRingtone() {
  if (ring) { ring.stop(); ring = null; }
}

/* ---------- Push notifications (messages & calls while the app is closed) ---------- */
// Set at build time: true when android/app/google-services.json was present (see build-www.js).
/* global __PUSH_ENABLED__ */
export const pushAvailable = NATIVE && __PUSH_ENABLED__;

export async function setupPush(onToken, onOpen) {
  if (!pushAvailable) return 'unavailable';
  await PushNotifications.createChannel({
    id: 'messages', name: 'Messages', description: 'New messages', importance: 4, visibility: 0, vibration: true, sound: 'message.wav',
  }).catch(() => {});
  await PushNotifications.createChannel({
    id: 'calls', name: 'Calls', description: 'Incoming calls (rings)', importance: 5, visibility: 1, vibration: true, sound: 'ringtone.wav', lights: true, lightColor: '#0F766E',
  }).catch(() => {});
  let perm = await PushNotifications.checkPermissions();
  if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') perm = await PushNotifications.requestPermissions();
  if (perm.receive !== 'granted') return 'denied';
  PushNotifications.addListener('registration', (t) => onToken(t.value));
  PushNotifications.addListener('registrationError', (e) => console.error('push registration failed', e));
  PushNotifications.addListener('pushNotificationActionPerformed', (a) => onOpen(a.notification && a.notification.data));
  await PushNotifications.register();
  return 'granted';
}

export async function clearNotifications() {
  if (pushAvailable) await PushNotifications.removeAllDeliveredNotifications().catch(() => {});
}

/* ---------- App lifecycle ---------- */
export function onAppState(cb) {
  if (NATIVE) App.addListener('appStateChange', ({ isActive }) => cb(isActive));
  else document.addEventListener('visibilitychange', () => cb(document.visibilityState === 'visible'));
}
export function onBackButton(cb) {
  if (NATIVE) App.addListener('backButton', cb);
}
export function exitApp() { if (NATIVE) App.minimizeApp().catch(() => {}); }
