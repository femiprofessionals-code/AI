/*
 * Private Line server functions (Firebase Cloud Functions, 2nd gen).
 *
 * They only send push notifications, so a message or call reaches the other phone even
 * when the app is closed. Message text, photos and calls themselves never pass through here.
 *
 * - newMessage: a message was written → notify the other person ("messages" channel).
 * - newCall:    a call started → ring the other phone ("calls" channel, ringtone).
 * - iceServers: network relay details for calls (Cloudflare TURN if configured, else STUN).
 */
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');

initializeApp();
const db = getFirestore();
const EMULATOR = process.env.FUNCTIONS_EMULATOR === 'true';

// Optional: Cloudflare Realtime TURN (free tier) so calls connect on every network.
// Set TURN_KEY_ID and TURN_KEY_TOKEN in functions/.env before deploying (see README).

async function recipientOf(pairId, senderUid) {
  const pair = (await db.doc(`pairs/${pairId}`).get()).data();
  if (!pair || !pair.slots) return null;
  const { a, b } = pair.slots;
  const sender = a && a.uid === senderUid ? a : b;
  const other = a && a.uid === senderUid ? b : a;
  if (!other) return null;
  return { uid: other.uid, senderName: sender ? sender.name : 'Private Line' };
}

async function tokenOf(pairId, uid) {
  const d = await db.doc(`pairs/${pairId}/devices/${uid}`).get();
  return d.exists ? d.data().token : null;
}

async function send(pairId, toUid, message, kind) {
  if (EMULATOR) {
    // No real phones in tests: record what would have been sent.
    await db.collection('pushLog').add({ pairId, toUid, kind, message, at: FieldValue.serverTimestamp() });
    return;
  }
  const token = await tokenOf(pairId, toUid);
  if (!token) return;
  try {
    await getMessaging().send({ ...message, token });
  } catch (e) {
    if (e.code === 'messaging/registration-token-not-registered') {
      await db.doc(`pairs/${pairId}/devices/${toUid}`).delete();
    } else {
      console.error('push failed', e.code, e.message);
    }
  }
}

function preview(m) {
  if (m.deleted) return 'Message deleted';
  switch (m.type) {
    case 'image': return '📷 Photo';
    case 'audio': return '🎤 Voice message';
    case 'file': return `📎 ${(m.media && m.media.name) || 'File'}`;
    case 'call': return '📞 Call';
    default: return String(m.text || '').slice(0, 200);
  }
}

exports.newMessage = onDocumentCreated('pairs/{pairId}/messages/{messageId}', async (event) => {
  const m = event.data.data();
  if (m.type === 'call') return; // call history entries don't need a notification
  const { pairId } = event.params;
  const to = await recipientOf(pairId, m.from);
  if (!to) return;
  await send(pairId, to.uid, {
    notification: { title: to.senderName, body: preview(m) },
    data: { type: 'message', pairId, messageId: event.params.messageId },
    android: {
      priority: 'high',
      notification: { channelId: 'messages', tag: `msg-${pairId}`, icon: 'ic_stat_notify', color: '#0F766E' },
    },
  }, 'message');
});

exports.newCall = onDocumentCreated('pairs/{pairId}/calls/{callId}', async (event) => {
  const c = event.data.data();
  const { pairId, callId } = event.params;
  const to = await recipientOf(pairId, c.from);
  if (!to) return;
  await send(pairId, to.uid, {
    notification: {
      title: c.kind === 'video' ? 'Incoming video call' : 'Incoming voice call',
      body: `${to.senderName} is calling you`,
    },
    data: { type: 'call', pairId, callId, kind: c.kind || 'audio' },
    android: {
      priority: 'high',
      ttl: 45 * 1000, // a call nobody answered within 45 s is no longer worth ringing
      notification: { channelId: 'calls', tag: `call-${callId}`, icon: 'ic_stat_notify', color: '#0F766E' },
    },
  }, 'call');
});

const STUN = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];

exports.iceServers = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first.');
  const id = process.env.TURN_KEY_ID;
  const token = process.env.TURN_KEY_TOKEN;
  if (!id || !token) return { iceServers: STUN, relay: false };
  try {
    const res = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${id}/credentials/generate-ice-servers`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ttl: 6 * 3600 }),
    });
    if (!res.ok) throw new Error(`TURN ${res.status}`);
    const body = await res.json();
    return { iceServers: [...STUN, ...(body.iceServers ? [].concat(body.iceServers) : [])], relay: true };
  } catch (e) {
    console.error('TURN credentials failed', e.message);
    return { iceServers: STUN, relay: false };
  }
});
