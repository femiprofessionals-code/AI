/*
 * Local JSON storage in the app's user-data folder
 * (%APPDATA%\Executive Assistant Desk\data.json on Windows).
 * Writes go to a temp file first and are renamed into place so a crash or
 * power loss never leaves a half-written file; the previous copy is kept as data.json.bak.
 */
const fs = require('fs');
const path = require('path');

const { DEFAULT_SETTINGS, emptyData, normalize } = require('../shared/data');

class Store {
  constructor(dir) {
    this.dir = dir;
    this.file = path.join(dir, 'data.json');
    this.data = emptyData();
  }

  load() {
    fs.mkdirSync(this.dir, { recursive: true });
    for (const f of [this.file, this.file + '.bak']) {
      try {
        this.data = normalize(JSON.parse(fs.readFileSync(f, 'utf8')));
        return this.data;
      } catch (e) {
        if (e.code !== 'ENOENT') console.error('Could not read', f, e.message);
      }
    }
    this.data = emptyData();
    return this.data;
  }

  save() {
    fs.mkdirSync(this.dir, { recursive: true });
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf8');
    if (fs.existsSync(this.file)) {
      try { fs.copyFileSync(this.file, this.file + '.bak'); } catch (_) { /* best effort */ }
    }
    fs.renameSync(tmp, this.file);
  }
}

module.exports = { Store, DEFAULT_SETTINGS, emptyData, normalize };
