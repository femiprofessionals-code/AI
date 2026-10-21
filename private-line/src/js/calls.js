// Voice and video calls between the two phones (WebRTC, peer to peer).
// Firestore carries the call set-up ("signalling"); the audio/video goes directly between
// the phones, or through a TURN relay when a network blocks direct connections.
import {
  collection, doc, setDoc, updateDoc, onSnapshot, addDoc, query, where, serverTimestamp,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from './backend.js';

const RING_TIMEOUT_MS = 45 * 1000;
const STUN = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
let iceCache = null;

async function iceServers() {
  if (iceCache && Date.now() - iceCache.at < 3600 * 1000) return iceCache.servers;
  try {
    const res = await httpsCallable(functions, 'iceServers', { timeout: 8000 })();
    iceCache = { at: Date.now(), servers: res.data.iceServers };
    return iceCache.servers;
  } catch (_) {
    return STUN;
  }
}

/**
 * One call. Events (via onUpdate): status 'calling' | 'ringing' | 'connecting' | 'connected'
 * | 'declined' | 'busy' | 'missed' | 'ended' | 'failed', plus remote stream changes.
 */
export class Call {
  constructor({ pairId, uid, otherUid, kind, id, incoming, offer, onUpdate, ice }) {
    Object.assign(this, { pairId, uid, otherUid, kind, id, incoming, offer, onUpdate });
    this.iceOverride = ice;
    this.status = incoming ? 'ringing' : 'calling';
    this.muted = false;
    this.cameraOff = false;
    this.facing = 'user';
    this.unsubs = [];
    this.connectedAt = 0;
    this.finished = false;
  }

  get ref() { return doc(db, 'pairs', this.pairId, 'calls', this.id); }

  emit(status, extra) {
    if (status) this.status = status;
    if (this.onUpdate) this.onUpdate(this, extra);
  }

  async media() {
    this.local = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: this.kind === 'video' ? { facingMode: this.facing, width: { ideal: 1280 }, height: { ideal: 720 } } : false,
    });
    return this.local;
  }

  async peer() {
    this.pc = new RTCPeerConnection({ iceServers: this.iceOverride || (await iceServers()) });
    this.remote = new MediaStream();
    this.pc.ontrack = (e) => {
      for (const t of e.streams[0] ? e.streams[0].getTracks() : [e.track]) {
        if (!this.remote.getTracks().includes(t)) this.remote.addTrack(t);
      }
      this.emit(null, { remote: this.remote });
    };
    this.pc.onconnectionstatechange = () => {
      const s = this.pc.connectionState;
      if (s === 'connected' && this.status !== 'connected') {
        this.connectedAt = Date.now();
        this.emit('connected');
      } else if (s === 'failed') {
        this.hangup('failed');
      }
    };
    for (const t of this.local.getTracks()) this.pc.addTrack(t, this.local);
  }

  /** Caller side. */
  async start() {
    await this.media();
    await this.peer();
    const callRef = doc(collection(db, 'pairs', this.pairId, 'calls'));
    this.id = callRef.id;
    const mine = collection(callRef, 'callerCandidates');
    this.pc.onicecandidate = (e) => { if (e.candidate) addDoc(mine, e.candidate.toJSON()).catch(() => {}); };
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    await setDoc(callRef, {
      from: this.uid, to: this.otherUid, kind: this.kind, status: 'ringing',
      offer: { type: offer.type, sdp: offer.sdp }, createdAt: serverTimestamp(), clientAt: Date.now(),
    });
    this.emit('calling');
    this.unsubs.push(onSnapshot(callRef, async (snap) => {
      const d = snap.data();
      if (!d) return;
      if (d.answer && !this.pc.currentRemoteDescription) {
        this.emit('connecting');
        await this.pc.setRemoteDescription(d.answer);
      }
      if (['declined', 'busy', 'ended', 'missed'].includes(d.status) && !this.finished) this.finish(d.status);
    }));
    this.listenCandidates(collection(callRef, 'calleeCandidates'));
    this.ringTimer = setTimeout(() => {
      if (!this.connectedAt && !this.finished) this.hangup('missed');
    }, RING_TIMEOUT_MS);
  }

  /** Callee side: watch for the caller hanging up while it rings. */
  watchIncoming() {
    this.unsubs.push(onSnapshot(this.ref, (snap) => {
      const d = snap.data();
      if (d && ['ended', 'missed'].includes(d.status) && !this.finished) this.finish(d.status === 'missed' ? 'missed' : 'ended');
    }));
  }

  async accept() {
    this.emit('connecting');
    await this.media();
    await this.peer();
    const mine = collection(this.ref, 'calleeCandidates');
    this.pc.onicecandidate = (e) => { if (e.candidate) addDoc(mine, e.candidate.toJSON()).catch(() => {}); };
    await this.pc.setRemoteDescription(this.offer);
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    await updateDoc(this.ref, { answer: { type: answer.type, sdp: answer.sdp }, status: 'accepted', acceptedAt: serverTimestamp() });
    this.listenCandidates(collection(this.ref, 'callerCandidates'));
  }

  async decline(reason = 'declined') {
    await updateDoc(this.ref, { status: reason, endedAt: serverTimestamp() }).catch(() => {});
    this.finish(reason);
  }

  listenCandidates(col) {
    this.unsubs.push(onSnapshot(col, (snap) => {
      for (const ch of snap.docChanges()) {
        if (ch.type === 'added' && this.pc) this.pc.addIceCandidate(new RTCIceCandidate(ch.doc.data())).catch(() => {});
      }
    }));
  }

  toggleMute() {
    this.muted = !this.muted;
    for (const t of this.local ? this.local.getAudioTracks() : []) t.enabled = !this.muted;
    this.emit();
  }

  toggleCamera() {
    this.cameraOff = !this.cameraOff;
    for (const t of this.local ? this.local.getVideoTracks() : []) t.enabled = !this.cameraOff;
    this.emit();
  }

  async flipCamera() {
    if (this.kind !== 'video' || !this.pc) return;
    this.facing = this.facing === 'user' ? 'environment' : 'user';
    const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: this.facing } });
    const track = s.getVideoTracks()[0];
    const sender = this.pc.getSenders().find((x) => x.track && x.track.kind === 'video');
    if (sender) await sender.replaceTrack(track);
    for (const t of this.local.getVideoTracks()) { t.stop(); this.local.removeTrack(t); }
    this.local.addTrack(track);
    this.emit(null, { local: this.local });
  }

  async hangup(reason = 'ended') {
    if (this.finished) return;
    const status = reason === 'failed' ? 'ended' : reason;
    await updateDoc(this.ref, { status, endedAt: serverTimestamp() }).catch(() => {});
    this.finish(reason);
  }

  finish(reason) {
    if (this.finished) return;
    this.finished = true;
    clearTimeout(this.ringTimer);
    this.unsubs.forEach((u) => u());
    if (this.pc) this.pc.close();
    if (this.local) this.local.getTracks().forEach((t) => t.stop());
    this.duration = this.connectedAt ? Math.round((Date.now() - this.connectedAt) / 1000) : 0;
    this.emit(reason);
  }
}

/** Calls ringing for this phone. */
export function watchIncomingCalls(pairId, uid, cb) {
  const q = query(collection(db, 'pairs', pairId, 'calls'), where('to', '==', uid), where('status', '==', 'ringing'));
  return onSnapshot(q, (snap) => {
    for (const ch of snap.docChanges()) {
      if (ch.type !== 'added') continue;
      const d = ch.doc.data();
      // Ignore stale ringing calls (e.g. the caller's phone died mid-ring).
      if (Date.now() - (d.clientAt || 0) > RING_TIMEOUT_MS + 15000) continue;
      cb({ id: ch.doc.id, ...d });
    }
  }, () => {});
}

export async function markBusy(pairId, callId) {
  await updateDoc(doc(db, 'pairs', pairId, 'calls', callId), { status: 'busy', endedAt: serverTimestamp() }).catch(() => {});
}
