'use strict';
const os = require('os');
const path = require('path');
const fs = require('fs');

const LIVE_DIR = path.join(os.homedir(), '.claude', 'live-terminal');

function ensureDir() {
  fs.mkdirSync(LIVE_DIR, { recursive: true });
}

function isDisabled() {
  return fs.existsSync(path.join(LIVE_DIR, 'disabled'));
}

function genId() {
  return Date.now() + '-' + Math.random().toString(36).slice(2, 6);
}

function filePath(name) {
  return path.join(LIVE_DIR, name);
}

function logPath(id) {
  return filePath('cmd-' + id + '.log');
}

function exitPath(id) {
  return filePath('cmd-' + id + '.exit');
}

// Atomic write (tmp + rename) so the extension's watcher never reads a
// half-written meta file.
function writeMeta(id, meta) {
  const p = filePath('cmd-' + id + '.json');
  fs.writeFileSync(p + '.tmp', JSON.stringify(meta));
  fs.renameSync(p + '.tmp', p);
}

function readStdinJson() {
  try {
    let raw = fs.readFileSync(0, 'utf8');
    if (raw.charCodeAt(0) === 0xfeff) {
      raw = raw.slice(1); // strip UTF-8 BOM (some shells prepend one)
    }
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

module.exports = { LIVE_DIR, ensureDir, isDisabled, genId, filePath, logPath, exitPath, writeMeta, readStdinJson };
