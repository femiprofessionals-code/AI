import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { repo } from '../../db/repo';

// The PIN itself is never stored: only a salted SHA-256 hash, in secure storage.
const KEY = 'parent_pin_hash';
const SALT_KEY = 'parent_pin_salt';

async function getItem(k: string) {
  if (Platform.OS === 'web') return repo.getSetting(k);
  return SecureStore.getItemAsync(k);
}
async function setItem(k: string, v: string) {
  if (Platform.OS === 'web') return repo.setSetting(k, v);
  return SecureStore.setItemAsync(k, v);
}

export async function hasPin() {
  return !!(await getItem(KEY));
}

export async function setPin(pin: string) {
  const salt = Array.from(Crypto.getRandomBytes(16), (b) => b.toString(16).padStart(2, '0')).join('');
  const hash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${salt}:${pin}`);
  await setItem(SALT_KEY, salt);
  await setItem(KEY, hash);
}

export async function checkPin(pin: string) {
  const salt = await getItem(SALT_KEY);
  const hash = await getItem(KEY);
  if (!salt || !hash) return false;
  return (await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${salt}:${pin}`)) === hash;
}

export async function clearPin() {
  if (Platform.OS === 'web') { repo.setSetting(KEY, ''); return; }
  await SecureStore.deleteItemAsync(KEY);
  await SecureStore.deleteItemAsync(SALT_KEY);
}
