/*
 * Cloud sync between the desktop app and the Android app, through Firebase
 * (email/password sign-in + Firestore), using only their REST APIs and fetch, so the
 * same code runs in the desktop app's main process and in the Android app.
 *
 * Offline-first: each device keeps its full copy of the data and works without a
 * connection. Local changes are marked in data.sync.dirty and uploaded when online;
 * changes from the other device are downloaded and merged.
 *
 * Cloud layout: users/{uid}/records/{type}~{id}, one document per meeting, task,
 * deletion, or alert decision:
 *   { type, id, json (the record), updatedAt (device clock, ms), deleted, deviceId,
 *     serverUpdatedAt (server clock, set by Firestore) }
 * Conflicts: the most recent edit wins (updatedAt, then deviceId as a tie-break).
 * Downloads use the server clock, so devices with wrong clocks still get every change.
 */

const TYPES = ['meetings', 'tasks', 'alerts'];
const PULL_OVERLAP_MS = 2 * 60 * 1000; // re-read a small window to catch late-committed writes
const PAGE_SIZE = 300;
const COMMIT_CHUNK = 200;

const AUTH_ERRORS = {
  EMAIL_EXISTS: 'An account with this email already exists. Choose “Sign in” instead.',
  EMAIL_NOT_FOUND: 'No account uses this email. Choose “Create account” first.',
  INVALID_PASSWORD: 'Wrong password.',
  INVALID_LOGIN_CREDENTIALS: 'Wrong email or password.',
  INVALID_EMAIL: 'That email address is not valid.',
  MISSING_PASSWORD: 'Enter a password.',
  USER_DISABLED: 'This account has been disabled.',
  TOO_MANY_ATTEMPTS_TRY_LATER: 'Too many attempts. Wait a few minutes and try again.',
  OPERATION_NOT_ALLOWED: 'Email sign-in is not turned on in the Firebase project (Authentication → Sign-in method → Email/Password).',
  TOKEN_EXPIRED: 'Your sign-in has expired. Please sign in again.',
  USER_NOT_FOUND: 'Your account was not found. Please sign in again.',
  INVALID_REFRESH_TOKEN: 'Your sign-in has expired. Please sign in again.',
  CONFIGURATION_NOT_FOUND: 'The Firebase project is not set up for sign-in yet (enable Authentication → Email/Password).',
  API_KEY_INVALID: 'The sync settings (API key) are not valid.',
};

class SyncError extends Error {
  constructor(message, { code, auth, offline } = {}) {
    super(message);
    this.code = code;
    this.auth = !!auth; // sign-in needed again
    this.offline = !!offline; // no connection: just try later
  }
}

function friendlyAuthError(raw) {
  const code = String(raw || '').split(' ')[0].split(':')[0].trim();
  if (code.startsWith('WEAK_PASSWORD')) return 'Choose a password of at least 6 characters.';
  return AUTH_ERRORS[code] || `Sign-in failed (${raw}).`;
}

/* ------------------------------------------------------------------ */
/* Firebase REST client                                                */
/* ------------------------------------------------------------------ */
class FirebaseClient {
  /**
   * @param {object} cfg { apiKey, projectId, emulator?: { auth: 'http://host:9099', firestore: 'http://host:8080' }, fetch? }
   */
  constructor(cfg) {
    this.apiKey = cfg.apiKey;
    this.projectId = cfg.projectId;
    this.emulator = cfg.emulator || null;
    this.fetch = cfg.fetch || globalThis.fetch.bind(globalThis);
    this.timeoutMs = cfg.timeoutMs || 20000;
  }

  get configured() { return !!(this.apiKey && this.projectId); }

  authUrl(path) {
    const base = this.emulator ? `${this.emulator.auth}/identitytoolkit.googleapis.com` : 'https://identitytoolkit.googleapis.com';
    return `${base}/v1/${path}?key=${encodeURIComponent(this.apiKey)}`;
  }

  tokenUrl() {
    const base = this.emulator ? `${this.emulator.auth}/securetoken.googleapis.com` : 'https://securetoken.googleapis.com';
    return `${base}/v1/token?key=${encodeURIComponent(this.apiKey)}`;
  }

  docsBase() {
    const host = this.emulator ? this.emulator.firestore : 'https://firestore.googleapis.com';
    return `${host}/v1/projects/${encodeURIComponent(this.projectId)}/databases/(default)/documents`;
  }

  async request(url, init) {
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), this.timeoutMs) : null;
    let res;
    try {
      res = await this.fetch(url, { ...init, signal: ctrl ? ctrl.signal : undefined });
    } catch (e) {
      throw new SyncError('No internet connection (will retry automatically).', { offline: true });
    } finally {
      if (timer) clearTimeout(timer);
    }
    let body = null;
    const text = await res.text();
    try { body = text ? JSON.parse(text) : null; } catch (_) { body = { raw: text }; }
    if (!res.ok) {
      const msg = body && body.error ? (body.error.message || body.error) : `HTTP ${res.status}`;
      const err = new SyncError(String(msg), { code: res.status });
      err.status = res.status;
      err.raw = msg;
      throw err;
    }
    return body;
  }

  async authCall(path, payload) {
    if (!this.configured) throw new SyncError('Sync is not set up yet: the Firebase project details are missing.');
    try {
      return await this.request(this.authUrl(path), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
    } catch (e) {
      if (e.offline) throw e;
      throw new SyncError(friendlyAuthError(e.raw || e.message), { code: e.code });
    }
  }

  static sessionFrom(r, email) {
    return {
      uid: r.localId || r.user_id,
      email: r.email || email,
      idToken: r.idToken || r.id_token,
      refreshToken: r.refreshToken || r.refresh_token,
      expiresAt: Date.now() + (Number(r.expiresIn || r.expires_in) || 3600) * 1000 - 60 * 1000,
    };
  }

  async signUp(email, password) {
    const r = await this.authCall('accounts:signUp', { email, password, returnSecureToken: true });
    return FirebaseClient.sessionFrom(r, email);
  }

  async signIn(email, password) {
    const r = await this.authCall('accounts:signInWithPassword', { email, password, returnSecureToken: true });
    return FirebaseClient.sessionFrom(r, email);
  }

  async sendPasswordReset(email) {
    await this.authCall('accounts:sendOobCode', { requestType: 'PASSWORD_RESET', email });
  }

  /** Returns a session with a valid ID token, refreshing it when it is about to expire. */
  async fresh(session) {
    if (!session || !session.refreshToken) throw new SyncError('Please sign in.', { auth: true });
    if (session.idToken && Date.now() < session.expiresAt) return session;
    let r;
    try {
      r = await this.request(this.tokenUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(session.refreshToken)}`,
      });
    } catch (e) {
      if (e.offline) throw e;
      throw new SyncError(friendlyAuthError(e.raw || e.message), { auth: true });
    }
    return { ...FirebaseClient.sessionFrom(r, session.email), email: session.email };
  }

  async firestore(session, path, payload) {
    try {
      return await this.request(`${this.docsBase()}${path.startsWith(':') ? '' : '/'}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.idToken}` },
        body: JSON.stringify(payload),
      });
    } catch (e) {
      if (e.offline) throw e;
      if (e.status === 401) throw new SyncError('Your sign-in has expired. Please sign in again.', { auth: true });
      if (e.status === 403) throw new SyncError('The cloud refused access. Check the Firestore security rules (see the setup guide).', { code: 403 });
      if (e.status === 404 && /database/i.test(e.message)) throw new SyncError('The Firestore database has not been created in the Firebase project yet.', { code: 404 });
      throw new SyncError(`Sync failed: ${e.message}`, { code: e.status });
    }
  }

  docName(uid, docId) {
    return `projects/${this.projectId}/databases/(default)/documents/users/${uid}/records/${docId}`;
  }

  async commit(session, writes) {
    return this.firestore(session, ':commit', { writes });
  }

  /** Records changed on the server after `sinceIso`, oldest first, paged. */
  async changedSince(session, sinceIso) {
    const out = [];
    let after = null;
    for (;;) {
      const q = {
        from: [{ collectionId: 'records' }],
        orderBy: [{ field: { fieldPath: 'serverUpdatedAt' }, direction: 'ASCENDING' }, { field: { fieldPath: '__name__' }, direction: 'ASCENDING' }],
        limit: PAGE_SIZE,
      };
      if (sinceIso) {
        q.where = { fieldFilter: { field: { fieldPath: 'serverUpdatedAt' }, op: 'GREATER_THAN', value: { timestampValue: sinceIso } } };
      }
      if (after) q.startAt = { values: [{ timestampValue: after.ts }, { referenceValue: after.name }], before: false };
      const rows = await this.firestore(session, `users/${session.uid}:runQuery`, { structuredQuery: q });
      const docs = (rows || []).filter((r) => r.document).map((r) => r.document);
      out.push(...docs);
      if (docs.length < PAGE_SIZE) break;
      const last = docs[docs.length - 1];
      after = { ts: last.fields.serverUpdatedAt.timestampValue, name: last.name };
    }
    return out;
  }
}

/* ------------------------------------------------------------------ */
/* Record encoding                                                     */
/* ------------------------------------------------------------------ */
function docIdFor(type, id) { return `${type}~${encodeURIComponent(id)}`; }

function encodeRecord(type, id, record, deviceId, deleted, updatedAt) {
  return {
    type: { stringValue: type },
    id: { stringValue: id },
    json: { stringValue: deleted ? '' : JSON.stringify(record) },
    updatedAt: { integerValue: String(Math.round(updatedAt)) },
    deleted: { booleanValue: !!deleted },
    deviceId: { stringValue: deviceId },
  };
}

function decodeDoc(doc) {
  const f = doc.fields || {};
  const type = f.type && f.type.stringValue;
  const id = f.id && f.id.stringValue;
  if (!TYPES.includes(type) || !id) return null;
  const deleted = !!(f.deleted && f.deleted.booleanValue);
  let record = null;
  if (!deleted) {
    try { record = JSON.parse(f.json.stringValue); } catch (_) { return null; }
  }
  return {
    type, id, deleted, record,
    updatedAt: Number(f.updatedAt && f.updatedAt.integerValue) || 0,
    deviceId: (f.deviceId && f.deviceId.stringValue) || '',
    serverUpdatedAt: f.serverUpdatedAt && f.serverUpdatedAt.timestampValue,
  };
}

/* ------------------------------------------------------------------ */
/* Local access helpers                                                */
/* ------------------------------------------------------------------ */
function getLocal(data, type, id) {
  if (type === 'alerts') return data.alertActions[id] || null;
  return data[type].find((x) => x.id === id) || null;
}

function setLocal(data, type, id, record) {
  if (type === 'alerts') { data.alertActions[id] = record; return; }
  const list = data[type];
  const i = list.findIndex((x) => x.id === id);
  if (i >= 0) list[i] = record; else list.push(record);
}

function removeLocal(data, type, id) {
  if (type === 'alerts') { delete data.alertActions[id]; return; }
  data[type] = data[type].filter((x) => x.id !== id);
}

/** True when (aTime, aDevice) is a newer edit than (bTime, bDevice). */
function newer(aTime, aDevice, bTime, bDevice) {
  if (aTime !== bTime) return aTime > bTime;
  return String(aDevice) > String(bDevice);
}

/* ------------------------------------------------------------------ */
/* Sync engine                                                         */
/* ------------------------------------------------------------------ */
class SyncEngine {
  /**
   * @param {object} opts
   *   data()            -> current data object (mutated in place)
   *   client            FirebaseClient
   *   loadSession()     -> session | null
   *   saveSession(s)    persist (or clear with null) the sign-in
   *   persist()         save data after a sync changed it
   *   onRemoteChange(changes)  called with [{type,id,deleted,record}] applied from the cloud
   */
  constructor(opts) {
    this.opts = opts;
    this.client = opts.client;
    this.running = null;
    this.again = false;
  }

  get data() { return this.opts.data(); }

  ensureDeviceId() {
    const s = this.data.sync;
    if (!s.deviceId) s.deviceId = globalThis.crypto.randomUUID();
    return s.deviceId;
  }

  status() {
    const s = this.data.sync;
    const session = this.opts.loadSession();
    return {
      configured: this.client.configured,
      signedIn: !!session,
      email: session ? session.email : '',
      lastSyncAt: s.lastSyncAt,
      lastError: s.lastError,
      pending: Object.keys(s.dirty).length,
      syncing: !!this.running,
    };
  }

  /** Mark everything on this device for upload (used right after signing in). */
  markAllDirty() {
    const d = this.data;
    for (const m of d.meetings) d.sync.dirty[`meetings/${m.id}`] = true;
    for (const t of d.tasks) d.sync.dirty[`tasks/${t.id}`] = true;
    for (const k of Object.keys(d.alertActions)) d.sync.dirty[`alerts/${k}`] = true;
  }

  async signIn(email, password, create) {
    email = String(email || '').trim().toLowerCase();
    const session = create ? await this.client.signUp(email, password) : await this.client.signIn(email, password);
    const d = this.data;
    const switching = d.sync.uid && d.sync.uid !== session.uid;
    d.sync.uid = session.uid;
    d.sync.email = session.email;
    d.sync.cursor = null; // download everything from this account
    d.sync.lastError = '';
    if (switching) d.sync.tombstones = {};
    this.markAllDirty(); // merge this device's data into the account
    this.opts.saveSession(session);
    this.opts.persist();
    return this.sync();
  }

  signOut() {
    this.opts.saveSession(null);
    const s = this.data.sync;
    s.cursor = null;
    s.lastError = '';
    s.lastSyncAt = 0;
    this.opts.persist();
  }

  /** Run a sync now; concurrent calls are merged into one follow-up run. */
  sync() {
    if (this.running) { this.again = true; return this.running; }
    this.running = (async () => {
      try {
        let result;
        do {
          this.again = false;
          result = await this.syncOnce();
        } while (this.again);
        return result;
      } finally {
        this.running = null;
      }
    })();
    return this.running;
  }

  async syncOnce() {
    const s = this.data.sync;
    let session = this.opts.loadSession();
    if (!session || !this.client.configured) return { skipped: true };
    try {
      const refreshed = await this.client.fresh(session);
      if (refreshed !== session) { session = refreshed; this.opts.saveSession(session); }
      this.ensureDeviceId();
      const pulled = await this.pull(session);
      const pushed = await this.push(session);
      s.lastSyncAt = Date.now();
      s.lastError = '';
      this.opts.persist();
      return { pulled, pushed };
    } catch (e) {
      s.lastError = e.message;
      if (e.auth) this.opts.saveSession(null);
      this.opts.persist();
      throw e;
    }
  }

  async pull(session) {
    const d = this.data;
    const s = d.sync;
    const since = s.cursor ? new Date(Date.parse(s.cursor) - PULL_OVERLAP_MS).toISOString() : null;
    const docs = await this.client.changedSince(session, since);
    const applied = [];
    let maxTs = s.cursor;
    for (const doc of docs) {
      const r = decodeDoc(doc);
      if (r && r.serverUpdatedAt && (!maxTs || r.serverUpdatedAt > maxTs)) maxTs = r.serverUpdatedAt;
      if (!r) continue;
      const key = `${r.type}/${r.id}`;
      const local = getLocal(d, r.type, r.id);
      const localTomb = s.tombstones[key];
      const localTime = local ? (local.updatedAt || 0) : (localTomb || -1);
      const localDevice = s.deviceId;
      if (local || localTomb) {
        // Same edit coming back (our own upload) or an older edit: keep ours.
        if (!newer(r.updatedAt, r.deviceId, localTime, localDevice)) {
          if (r.updatedAt === localTime && r.deviceId === localDevice) {
            // Already in the cloud; nothing to upload for this version.
            if (s.dirty[key] && (!local || local.updatedAt === r.updatedAt)) delete s.dirty[key];
            if (localTomb && r.deleted) delete s.tombstones[key];
          } else {
            s.dirty[key] = true; // ours is newer: make sure it is uploaded
          }
          continue;
        }
      }
      if (r.deleted) {
        if (local) {
          removeLocal(d, r.type, r.id);
          applied.push({ type: r.type, id: r.id, deleted: true, previous: local });
        }
      } else {
        setLocal(d, r.type, r.id, r.record);
        applied.push({ type: r.type, id: r.id, deleted: false, record: r.record, previous: local });
      }
      delete s.dirty[key];
      delete s.tombstones[key];
    }
    if (maxTs) s.cursor = maxTs;
    if (applied.length && this.opts.onRemoteChange) this.opts.onRemoteChange(applied);
    return applied.length;
  }

  async push(session) {
    const d = this.data;
    const s = d.sync;
    const keys = Object.keys(s.dirty);
    if (!keys.length) return 0;
    const deviceId = this.ensureDeviceId();
    const writes = [];
    const sent = [];
    for (const key of keys) {
      const slash = key.indexOf('/');
      const type = key.slice(0, slash);
      const id = key.slice(slash + 1);
      if (!TYPES.includes(type)) { delete s.dirty[key]; continue; }
      const local = getLocal(d, type, id);
      const tomb = s.tombstones[key];
      let fields;
      let version;
      if (local) {
        version = local.updatedAt || Date.now();
        fields = encodeRecord(type, id, local, deviceId, false, version);
      } else if (tomb) {
        version = tomb;
        fields = encodeRecord(type, id, null, deviceId, true, version);
      } else {
        delete s.dirty[key];
        continue;
      }
      writes.push({
        update: { name: this.client.docName(session.uid, docIdFor(type, id)), fields },
        updateTransforms: [{ fieldPath: 'serverUpdatedAt', setToServerValue: 'REQUEST_TIME' }],
      });
      sent.push({ key, type, id, version, tomb: !local });
    }
    for (let i = 0; i < writes.length; i += COMMIT_CHUNK) {
      await this.client.commit(session, writes.slice(i, i + COMMIT_CHUNK));
    }
    // Clear what was uploaded, unless it changed again while uploading.
    for (const x of sent) {
      const local = getLocal(d, x.type, x.id);
      if (x.tomb ? !local && s.tombstones[x.key] === x.version : local && local.updatedAt === x.version) {
        delete s.dirty[x.key];
        if (x.tomb) delete s.tombstones[x.key];
      }
    }
    return sent.length;
  }
}

module.exports = { FirebaseClient, SyncEngine, SyncError, decodeDoc, encodeRecord, docIdFor, friendlyAuthError };
