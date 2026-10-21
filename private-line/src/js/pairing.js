// Creating a private line, joining it with the code, and moving to a replacement phone.
import { doc, getDoc, setDoc, updateDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { db } from './backend.js';
import { pairIdFor, recoveryHash } from './crypto.js';

export class PairError extends Error {
  constructor(message, code) { super(message); this.code = code; }
}

function friendly(e) {
  if (e instanceof PairError) return e;
  if (e && e.code === 'permission-denied') return new PairError('This code cannot be used on this phone.', 'denied');
  if (e && (e.code === 'unavailable' || /offline/i.test(e.message))) {
    return new PairError('No internet connection. Activation needs a connection once.', 'offline');
  }
  return new PairError(e && e.message ? e.message : String(e));
}

/** Start a new line: this phone takes place "a". */
export async function createPair(uid, code, name, pin) {
  const pairId = await pairIdFor(code);
  const recovery = await recoveryHash(code, 'a', pin);
  try {
    await setDoc(doc(db, 'pairs', pairId), {
      v: 1,
      createdAt: serverTimestamp(),
      slots: { a: { uid, name, recovery, joinedAt: Date.now() }, b: null },
    });
  } catch (e) { throw friendly(e); }
  return { pairId, slot: 'a' };
}

/**
 * Look up a code before joining.
 * Returns 'free' (second place available), 'mine' (this phone is already in it),
 * or 'full' (two phones already: only a replacement with the PIN is possible).
 */
export async function inspectCode(uid, code) {
  const pairId = await pairIdFor(code);
  let snap;
  try {
    snap = await getDoc(doc(db, 'pairs', pairId));
  } catch (e) {
    // Full lines are unreadable to outsiders by design.
    if (e.code === 'permission-denied') return { pairId, state: 'full' };
    throw friendly(e);
  }
  if (!snap.exists()) throw new PairError('No private line uses this code. Check it and try again.', 'not-found');
  const { slots } = snap.data();
  if (slots.a.uid === uid) return { pairId, state: 'mine', slot: 'a', data: snap.data() };
  if (slots.b && slots.b.uid === uid) return { pairId, state: 'mine', slot: 'b', data: snap.data() };
  return { pairId, state: slots.b ? 'full' : 'free', data: snap.data() };
}

/** Take the second place. */
export async function joinPair(uid, code, name, pin) {
  const pairId = await pairIdFor(code);
  const recovery = await recoveryHash(code, 'b', pin);
  try {
    await updateDoc(doc(db, 'pairs', pairId), { 'slots.b': { uid, name, recovery, joinedAt: Date.now() } });
  } catch (e) {
    if (e.code === 'permission-denied') throw new PairError('Someone else has just taken the second place on this line.', 'full');
    throw friendly(e);
  }
  return { pairId, slot: 'b' };
}

/**
 * Replacement phone: move place a or b to this phone. Works only with the same PIN that place
 * was set up with (the server compares the code+PIN proof without ever seeing the PIN).
 */
export async function recoverPair(uid, code, pin, name) {
  const pairId = await pairIdFor(code);
  for (const slot of ['a', 'b']) {
    const recovery = await recoveryHash(code, slot, pin);
    try {
      await updateDoc(doc(db, 'pairs', pairId), {
        [`slots.${slot}`]: { uid, name, recovery, joinedAt: Date.now() },
      });
      return { pairId, slot };
    } catch (e) {
      if (e.code !== 'permission-denied') throw friendly(e);
    }
  }
  throw new PairError('Wrong PIN for this line.', 'wrong-pin');
}

/** Change your name or PIN on the line. */
export async function updateOwnSlot(pairId, slot, current, changes) {
  await updateDoc(doc(db, 'pairs', pairId), { [`slots.${slot}`]: { ...current, ...changes } });
}

/** Live view of the pair (other person's name, joins, replacement of this phone). */
export function watchPair(pairId, cb, onError) {
  return onSnapshot(doc(db, 'pairs', pairId), (snap) => cb(snap.exists() ? snap.data() : null), onError);
}
