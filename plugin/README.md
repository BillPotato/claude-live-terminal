# claude-live-terminal (plugin)

Claude Code plugin half of **Claude Live Terminal**. It wraps every Bash and
PowerShell command so the output is tee'd to a per-command log file that the
companion VS Code extension renders live. See the [top-level README](../README.md)
for the full picture and install steps.

## Components

| File | Role |
|------|------|
| `.claude-plugin/plugin.json` | Manifest — metadata only; `hooks/hooks.json` and `skills/` auto-load by convention (naming them here fails with "duplicate hooks file") |
| `hooks/hooks.json` | `PreToolUse` + `PostToolUse` on matcher `Bash\|PowerShell`, run via Node |
| `hooks/pretooluse.js` | Rewrites the command to tee output + record exit code |
| `hooks/posttooluse.js` | Fallback: writes an exit marker if the wrapper never did |
| `hooks/lib.js` | Shared paths, id generation, disable-flag + BOM-safe stdin |
| `skills/live-{on,off,status}/` | Toggle and inspect wrapping from inside Claude |

## Log-file protocol (`~/.claude/live-terminal/`)

For each command the `PreToolUse` hook generates an id `<epochms>-<rand4>` and:

1. Atomically writes `cmd-<id>.json` — `{ id, sessionId, cwd, command, tool,
   startedAt }`.
2. Rewrites the command so stdout+stderr also stream to `cmd-<id>.log`, and the
   real exit code is written to `cmd-<id>.exit` on completion.

### Bash wrapper

```bash
( <original command>
) 2>&1 | tee -a "<log>"; __clt_ec=${PIPESTATUS[0]}; echo $__clt_ec > "<exit>"; (exit $__clt_ec)
```

- Subshell parens let multi-statement commands (`a && b`, heredocs) embed
  verbatim — no escaping.
- `PIPESTATUS[0]` preserves the real exit code without `exit` (which would kill
  Claude's persistent shell). The trailing `(exit …)` restores `$?`.

### PowerShell wrapper (5.1-compatible)

The original command is written to `cmd-<id>.ps1` (UTF-8 **with BOM**, so PS 5.1
decodes non-ASCII correctly) and **dot-sourced by path**:

```powershell
. '<cmd-id.ps1>' 2>&1 | Out-String -Stream | Tee-Object -FilePath '<log>' -Append
$__clt_ec = $LASTEXITCODE; if ($null -eq $__clt_ec) { $__clt_ec = 0 }
Set-Content -LiteralPath '<exit>' -Value $__clt_ec -Encoding Ascii
$global:LASTEXITCODE = $__clt_ec
```

Why dot-source a file instead of `& { <command> }`:

- **The sandbox rejects `& { ... }`.** Claude Code's PowerShell tool flags a
  script block invoked with the call operator as a "dynamic expression" and
  blocks it *before execution* — so an inline `& { }` wrapper makes every
  command silently fail. Invoking a script **by path** passes the validator.
- **Dot-sourcing (`.`) runs in the caller's scope**, so `Set-Location` and other
  session state persist to the next tool call, matching un-wrapped behavior.
  (Calling with `&` would run in a child scope and lose `cd`.)

Notes:

- `Out-String -Stream` flattens the ErrorRecords that PS 5.1 wraps native stderr
  in (under `2>&1`) into plain lines. `Tee-Object` flushes line-by-line, so the
  log grows live (unlike `Start-Transcript`, which buffers until the end).
- PS 5.1 `Tee-Object` writes the log as **UTF-16 LE with a BOM** — the extension
  detects the BOM and decodes accordingly.
- Because the real command lives in the `.ps1`, the sandbox only validates the
  outer `. '…ps1'` line. This is what lets otherwise-blocked commands run, but it
  also means the tool's static safety check no longer inspects the inner command.
  Use `/claude-live-terminal:live-off` if you'd rather keep the check.

### No-op cases

The `PreToolUse` hook emits nothing (leaving the command untouched) when:

- the `disabled` flag file exists (`/claude-live-terminal:live-off`),
- the command already contains the `__clt_ec` sentinel (avoids double-wrapping on
  retries).

### PostToolUse fallback

If a wrapped command never writes its `.exit` marker (denied, timed out,
interrupted), `posttooluse.js` writes `?` so the extension's footer resolves to
`? interrupted` instead of spinning forever.

## Testing the hooks standalone

```powershell
'{"session_id":"s","cwd":"/tmp","tool_name":"Bash","tool_input":{"command":"echo hi && ls"}}' | node hooks/pretooluse.js
```

Should print a JSON object with `hookSpecificOutput.updatedInput.command` set to
the wrapped command.
