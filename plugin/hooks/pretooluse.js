#!/usr/bin/env node
'use strict';
// PreToolUse hook: rewrites Bash/PowerShell tool commands so their output is
// tee'd live into ~/.claude/live-terminal/cmd-<id>.log while still flowing
// back to Claude. The companion VS Code extension tails these logs into
// integrated terminals. Emitting nothing (exit 0) leaves the command untouched.
const lib = require('./lib');

const SENTINEL = '__clt_ec';

function bashQuotedPath(p) {
  // Git Bash handles forward slashes in Windows paths; backslashes inside
  // double quotes are fragile.
  return '"' + p.replace(/\\/g, '/') + '"';
}

function psQuotedPath(p) {
  return "'" + p.replace(/'/g, "''") + "'";
}

// Merged 2>&1 pipeline: stderr streams to the live log too, and PIPESTATUS[0]
// preserves the real exit code without `exit` (which could kill a persistent
// tool shell). The subshell parens make multi-statement commands and heredocs
// safe to embed verbatim.
function buildBash(command, log, exit) {
  const L = bashQuotedPath(log);
  const E = bashQuotedPath(exit);
  return (
    '( ' + command + '\n' +
    ') 2>&1 | tee -a ' + L + '; ' +
    SENTINEL + '=${PIPESTATUS[0]}; ' +
    'echo $' + SENTINEL + ' > ' + E + '; ' +
    '(exit $' + SENTINEL + ')'
  );
}

// Out-String -Stream flattens ErrorRecords (PS 5.1 wraps native stderr in
// them under 2>&1) into plain lines for both Claude and the log. LASTEXITCODE
// is reset first so a cmdlet-only command doesn't report a stale code.
function buildPowerShell(command, log, exit) {
  const L = psQuotedPath(log);
  const E = psQuotedPath(exit);
  return (
    '$global:LASTEXITCODE = 0\n' +
    '& {\n' + command + '\n} 2>&1 | Out-String -Stream | Tee-Object -FilePath ' + L + ' -Append\n' +
    '$' + SENTINEL + ' = $LASTEXITCODE; if ($null -eq $' + SENTINEL + ') { $' + SENTINEL + ' = 0 }\n' +
    'Set-Content -Path ' + E + ' -Value $' + SENTINEL + ' -Encoding Ascii\n' +
    '$global:LASTEXITCODE = $' + SENTINEL
  );
}

function main() {
  const input = lib.readStdinJson();
  if (!input) return;
  const tool = input.tool_name;
  const command = input.tool_input && input.tool_input.command;
  if (!command || typeof command !== 'string' || !command.trim()) return;
  if (tool !== 'Bash' && tool !== 'PowerShell') return;
  if (command.includes(SENTINEL)) return; // already wrapped
  if (lib.isDisabled()) return;

  lib.ensureDir();
  const id = lib.genId();
  const log = lib.logPath(id);
  const exit = lib.exitPath(id);

  const wrapped = tool === 'PowerShell'
    ? buildPowerShell(command, log, exit)
    : buildBash(command, log, exit);

  lib.writeMeta(id, {
    id,
    sessionId: input.session_id || 'unknown',
    cwd: input.cwd || '',
    command,
    tool,
    startedAt: Date.now(),
  });

  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      updatedInput: { command: wrapped },
    },
  }));
}

main();
