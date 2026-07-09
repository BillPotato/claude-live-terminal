#!/usr/bin/env node
'use strict';
// PostToolUse fallback: if a wrapped command never wrote its .exit marker
// (denied, timed out, interrupted), write "?" so the extension's terminal
// footer resolves instead of showing a spinner forever.
const fs = require('fs');
const lib = require('./lib');

function main() {
  const input = lib.readStdinJson();
  if (!input) return;
  const command = (input.tool_input && input.tool_input.command) || '';
  const m = command.match(/cmd-(\d+-[a-z0-9]+)\.log/);
  if (!m) return;
  const exitFile = lib.exitPath(m[1]);
  if (!fs.existsSync(exitFile)) {
    try {
      fs.writeFileSync(exitFile, '?');
    } catch (e) {
      // live dir gone; nothing to resolve
    }
  }
}

main();
