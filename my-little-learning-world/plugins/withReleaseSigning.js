// Signs release builds with the family's own key instead of the shared debug key.
// The keystore lives in private/ (never committed). Path and passwords come from
// private/signing.json at build time; without it the build falls back to debug signing.
const { withAppBuildGradle } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    const file = path.join(__dirname, '..', 'private', 'signing.json');
    if (!fs.existsSync(file)) return cfg;
    const s = JSON.parse(fs.readFileSync(file, 'utf8'));
    const store = path.join(__dirname, '..', 'private', s.storeFile).replace(/\\/g, '/');
    let g = cfg.modResults.contents;
    if (!g.includes('signingConfigs.family')) {
      g = g.replace(/signingConfigs\s*\{/, `signingConfigs {\n        family {\n            storeFile file('${store}')\n            storePassword '${s.storePassword}'\n            keyAlias '${s.keyAlias}'\n            keyPassword '${s.keyPassword}'\n        }`);
      g = g.replace(/(release\s*\{[^}]*?)signingConfig signingConfigs\.debug/, '$1signingConfig signingConfigs.family');
    }
    cfg.modResults.contents = g;
    return cfg;
  });
};
