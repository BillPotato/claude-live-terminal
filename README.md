# Claude Live Terminal

Stream Claude Code's Bash/PowerShell command output **live** into VS Code
integrated terminals — a workaround for
[anthropics/claude-code#14280](https://github.com/anthropics/claude-code/issues/14280),
where the extension's chat panel only shows shell output *after* a command
finishes.

Long builds, tests, and installs now stream line-by-line in a real terminal, so
you can watch progress, tell "working" from "frozen", and cancel early when you
spot an error.

## How it works

The Claude panel itself can't be made to stream (that needs a native fix from
Anthropic). Instead this project has two cooperating pieces that talk through
log files in `~/.claude/live-terminal/`:

```
Claude runs a command
      │
      ▼
[ Claude Code plugin ]  PreToolUse hook rewrites the command so its output is
  claude-live-terminal  tee'd to  ~/.claude/live-terminal/cmd-<id>.log  (while
      │                 still returning in full to Claude).
      ▼
~/.claude/live-terminal/cmd-<id>.log   ← grows live
      │
      ▼
[ VS Code extension ]   Watches that folder and streams each log into an
  Claude Live Terminal   integrated terminal, with a running header and a
                         ✔/✖ exit-code + duration footer.
```

Sequential commands in a session reuse one terminal (like a real shell);
commands that overlap (parallel tool calls, background tasks) each get their own
numbered terminal — `Claude Shell (ab12)`, `Claude Shell (ab12) #2`, …

The two pieces are independent: with only the plugin installed the logs still
land in `~/.claude/live-terminal/` and you can watch any of them with
`Get-Content -Wait <log>` (PowerShell) or `tail -f <log>` (bash). The extension
just makes it automatic and pretty.

## Install

### 1. The Claude Code plugin

Needs Node.js on your PATH (the same Node the extension uses).

**For the VS Code Claude extension (and to keep it enabled everywhere), install
it persistently via the bundled local marketplace** — the repo root is a
marketplace whose one plugin lives in `plugin/`:

```bash
claude plugin marketplace add "C:/Personal/Files/git/claude-terminal-plugin"
claude plugin install claude-live-terminal@claude-live-terminal-market
```

This enables it at **user scope**, shared by the CLI and the VS Code extension.
After installing, **reload the VS Code Claude panel** (Command Palette →
"Developer: Reload Window", or run `/reload-plugins` in a Claude session) so the
extension picks it up. Verify with `claude plugin list` (Status: ✔ enabled).

> The `--plugin-dir` flag loads the plugin for **one CLI session only** and the
> VS Code extension never sees it — use it just for quick local testing:
> `claude --plugin-dir "C:/Personal/Files/git/claude-terminal-plugin/plugin"`.

Note: the plugin manifest deliberately does **not** list `hooks` or `skills` —
Claude Code auto-loads the standard `hooks/hooks.json` and `skills/` directories,
and naming them again makes the plugin fail to load with a "duplicate hooks file"
error.

Toggle wrapping at any time from inside Claude:

- `/claude-live-terminal:live-off` — stop wrapping commands
- `/claude-live-terminal:live-on` — resume
- `/claude-live-terminal:live-status` — show state + log directory

### 2. The VS Code extension

```bash
cd vscode-extension
npm install
npm run compile
npm run package          # produces claude-live-terminal-0.1.0.vsix
code --install-extension claude-live-terminal-0.1.0.vsix
```

Or press `F5` in the `vscode-extension/` folder to run it in an Extension
Development Host for testing.

The extension activates on startup and immediately begins watching
`~/.claude/live-terminal/`. Nothing to configure.

## Verify it works

1. Install both pieces: the plugin (`claude plugin install …`, then reload) and
   the companion extension (running in your VS Code window).
2. In the VS Code Claude panel, ask Claude to run something slow, e.g.
   `ping -n 10 127.0.0.1` (Windows) or
   `for i in $(seq 1 10); do echo $i; sleep 1; done` (bash).
3. A **Claude Shell** terminal appears and the output streams in live, ending
   with `✔ exit 0 · 10s`.

## Troubleshooting: "Claude starts and nothing happens"

The plugin alone produces **no visible UI** — it only writes log files under
`~/.claude/live-terminal/`. The terminals are created by the **companion VS Code
extension**. So "nothing happens" almost always means one of:

1. **The VS Code extension isn't installed/running.** Build and install it (see
   step 2 above), then reload VS Code. Confirm it's active in the Extensions
   view. Without it, no terminals appear.
2. **No command has run yet.** The plugin only reacts to Bash/PowerShell tool
   calls. Ask Claude to run something; a `Claude Shell` terminal appears on the
   first command.
3. **You approved a permission prompt for the wrapped command.** Each wrapped
   command shows up for approval as a `. '…cmd-….ps1' … | Tee-Object …` (or
   `( … ) | tee …`) line — approve it. To stop being prompted every time, either
   run in a permission mode that auto-approves shell tools, or add an allow-rule
   for the wrapper. To turn wrapping off entirely, use
   `/claude-live-terminal:live-off`.

Quick check that the plugin half works, even without the extension:

```powershell
Get-ChildItem "$env:USERPROFILE\.claude\live-terminal"   # PowerShell
```
```bash
ls ~/.claude/live-terminal                                # bash
```

After Claude runs a command you should see `cmd-<id>.{json,log,exit}` (plus a
`.ps1` on Windows). If the `.log` has the command's output, the plugin is working
and the issue is the extension side. If only a `.json` appears with **no `.log`**,
the wrapped command was blocked before running — make sure you're on this version
(the PowerShell wrapper was rewritten to pass the tool sandbox; see
[plugin/README.md](plugin/README.md)).

## Known tradeoffs

- **The Claude panel shows the wrapped command.** Because the hook rewrites the
  command via `updatedInput`, the chat transcript shows the wrapper line, not the
  bare command.
- **Prefix-based permission allow-rules may stop matching.** A rule like
  `Bash(npm test*)` won't match once the command is wrapped. On Windows the
  wrapped PowerShell command is a dot-sourced temp file whose path changes each
  run, so per-command allow-rules can't target it — approve interactively, use a
  broad rule, or `/claude-live-terminal:live-off` while relying on such rules.
- **The PowerShell tool's static safety check no longer sees the inner command**
  on Windows (it runs from a temp `.ps1`). This is what lets otherwise-blocked
  commands stream; disable the plugin if you need that check.
- Requires Node.js on PATH for the plugin hooks.

See [`plugin/README.md`](plugin/README.md) for hook internals and the log-file
protocol.
