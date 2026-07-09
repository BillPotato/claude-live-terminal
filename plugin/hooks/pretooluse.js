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

// The original command is written to a .ps1 file and dot-sourced by path. This
// matters for two reasons:
//   1. Claude Code's PowerShell tool rejects `& { ... }` (script-block via the
//      call operator) as a "dynamic expression"; invoking a script *by path*
//      passes the validator.
//   2. Dot-sourcing (`.`) runs the script in the caller's scope, so Set-Location
//      and other state persist across tool calls, matching un-wrapped behavior.
// Out-String -Stream flattens ErrorRecords (PS 5.1 wraps native stderr in them
// under 2>&1) into plain lines; Tee-Object streams them live to the log.
function buildPowerShell(scriptFile, log, exit) {
  const S = psQuotedPath(scriptFile);
  const L = psQuotedPath(log);
  const E = psQuotedPath(exit);
  return (
    '. ' + S + ' 2>&1 | Out-String -Stream | Tee-Object -FilePath ' + L + ' -Append\n' +
    '$' + SENTINEL + ' = $LASTEXITCODE; if ($null -eq $' + SENTINEL + ') { $' + SENTINEL + ' = 0 }\n' +
    'Set-Content -LiteralPath ' + E + ' -Value $' + SENTINEL + ' -Encoding Ascii\n' +
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

  let wrapped;
  if (tool === 'PowerShell') {
    const scriptFile = lib.scriptPath(id, 'ps1');
    lib.writeScript(scriptFile, command, true); // UTF-8 BOM for PS 5.1
    wrapped = buildPowerShell(scriptFile, log, exit);
  } else {
    wrapped = buildBash(command, log, exit);
  }

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
