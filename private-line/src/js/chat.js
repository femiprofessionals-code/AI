// Messages: real-time list, sending (works offline: queued until back online), photos,
// voice notes and files, delivered/read ticks, delete for everyone, presence and typing.
import {
  collection, doc, query, orderBy, limitToLast, onSnapshot, setDoc, updateDoc, writeBatch,
  serverTimestamp,
} from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage } from './backend.js';

const messagesCol = (pairId) => collection(db, 'pairs', pairId, 'messages');

export function watchMessages(pairId, cb, onError) {
  const q = query(messagesCol(pairId), orderBy('createdAt'), limitToLast(500));
  return onSnapshot(q, { includeMetadataChanges: true }, (snap) => {
    cb(snap.docs.map((d) => {
      const m = d.data({ serverTimestamps: 'estimate' });
      return { id: d.id, ...m, at: m.createdAt ? m.createdAt.toMillis() : m.clientAt, pending: d.metadata.hasPendingWrites };
    }));
  }, onError);
}

function base(uid, type) {
  return { from: uid, type, createdAt: serverTimestamp(), clientAt: Date.now(), deliveredAt: null, readAt: null };
}

/** Send a text message. Not awaited: with no connection it is saved and sent automatically later. */
export function sendText(pairId, uid, text, replyTo) {
  const ref_ = doc(messagesCol(pairId));
  const data = { ...base(uid, 'text'), text };
  if (replyTo) data.replyTo = replyTo;
  setDoc(ref_, data).catch((e) => console.error('send failed', e));
  return ref_.id;
}

export function sendCallRecord(pairId, uid, text) {
  setDoc(doc(messagesCol(pairId)), { ...base(uid, 'call'), text }).catch(() => {});
}

/** Upload a photo / voice note / file, then post the message. Needs a connection. */
export function sendMedia(pairId, uid, blob, { type, name, mime, width, height, duration }, onProgress) {
  const msgRef = doc(messagesCol(pairId));
  const safeName = String(name || 'file').replace(/[^\w.-]+/g, '_').slice(0, 80);
  const path = `pairs/${pairId}/media/${msgRef.id}/${safeName}`;
  return new Promise((resolve, reject) => {
    const task = uploadBytesResumable(ref(storage, path), blob, { contentType: mime });
    task.on('state_changed',
      (s) => onProgress && onProgress(s.bytesTransferred / Math.max(1, s.totalBytes)),
      reject,
      async () => {
        const media = { path, mime, size: blob.size, name: safeName };
        if (width) { media.width = width; media.height = height; }
        if (duration) media.duration = duration;
        await setDoc(msgRef, { ...base(uid, type), media });
        resolve(msgRef.id);
      });
  });
}

const urlCache = new Map();
export async function mediaUrl(path) {
  if (!urlCache.has(path)) urlCache.set(path, getDownloadURL(ref(storage, path)));
  try { return await urlCache.get(path); } catch (e) { urlCache.delete(path); throw e; }
}

/** Mark the other person's messages delivered (always) and read (when the chat is on screen). */
export function acknowledge(pairId, uid, messages, read) {
  const batch = writeBatch(db);
  let n = 0;
  for (const m of messages) {
    if (m.from === uid || m.pending) continue;
    const upd = {};
    if (!m.deliveredAt) upd.deliveredAt = serverTimestamp();
    if (read && !m.readAt) upd.readAt = serverTimestamp();
    if (Object.keys(upd).length) { batch.update(doc(messagesCol(pairId), m.id), upd); n++; }
  }
  if (n) batch.commit().catch(() => {});
  return n;
}

export async function deleteForEveryone(pairId, message) {
  await updateDoc(doc(messagesCol(pairId), message.id), { deleted: true, text: '', media: null });
  if (message.media && message.media.path) deleteObject(ref(storage, message.media.path)).catch(() => {});
}

/* Presence & typing: each phone writes its own device document. */
export function updateDevice(pairId, uid, fields) {
  return setDoc(doc(db, 'pairs', pairId, 'devices', uid), { ...fields, updatedAt: serverTimestamp() }, { merge: true }).catch(() => {});
}

export function watchDevice(pairId, uid, cb) {
  return onSnapshot(doc(db, 'pairs', pairId, 'devices', uid), (s) => cb(s.exists() ? s.data() : {}), () => {});
}

/** Shrink a photo to at most 1600 px (JPEG) before sending, to save data. */
export async function compressImage(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.82));
  return { blob, width: w, height: h };
}
