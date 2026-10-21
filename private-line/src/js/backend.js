// Firebase connection: anonymous sign-in (the pair code is the real "account"), Firestore with
// an offline cache (messages readable and sendable without a connection), Storage, Functions.
import { initializeApp } from 'firebase/app';
import { initializeAuth, indexedDBLocalPersistence, signInAnonymously, connectAuthEmulator, onAuthStateChanged } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentSingleTabManager, connectFirestoreEmulator } from 'firebase/firestore';
import { getStorage, connectStorageEmulator } from 'firebase/storage';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';

// Set at build time from src/firebase-config.json or the FIREBASE_WEB_CONFIG secret (see build-www.js).
/* global __FIREBASE_CONFIG__ */
const buildConfig = __FIREBASE_CONFIG__;
const params = new URLSearchParams(location.search);
export const TEST = params.has('test');
const EMULATOR = TEST && params.has('emu');

export const config = EMULATOR
  ? { apiKey: 'emulator', authDomain: 'localhost', projectId: 'demo-private-line', storageBucket: 'demo-private-line.appspot.com', appId: '1:1:web:1', messagingSenderId: '1' }
  : buildConfig;

export const configured = !!(config.apiKey && config.projectId && config.appId);

export let app, auth, db, storage, functions;

export function init() {
  if (!configured) return false;
  app = initializeApp(config);
  auth = initializeAuth(app, { persistence: indexedDBLocalPersistence });
  db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentSingleTabManager() }) });
  storage = getStorage(app);
  functions = getFunctions(app);
  if (EMULATOR) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
    connectStorageEmulator(storage, '127.0.0.1', 9199);
    connectFunctionsEmulator(functions, '127.0.0.1', 5001);
  }
  return true;
}

/** Resolves with this phone's (anonymous) user once signed in. */
export function signedInUser() {
  return new Promise((resolve, reject) => {
    const stop = onAuthStateChanged(auth, async (user) => {
      if (user) { stop(); resolve(user); return; }
      try { await signInAnonymously(auth); } catch (e) { stop(); reject(e); }
    });
  });
}
