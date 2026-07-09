---
name: live-off
description: Disable Claude Live Terminal — stop wrapping shell commands with live-output logging
---

Disable live-output streaming by creating the disable flag file, then confirm to the user.

1. Create an empty file at `~/.claude/live-terminal/disabled` (create the directory first if it doesn't exist). Use a cross-platform approach, e.g.:

   ```
   node -e "const p=require('path'),f=require('fs'),d=p.join(require('os').homedir(),'.claude','live-terminal');f.mkdirSync(d,{recursive:true});f.writeFileSync(p.join(d,'disabled'),'')"
   ```

2. Tell the user that live terminal streaming is now **off**: shell commands will run unwrapped and no live logs will be written. They can re-enable it with `/claude-live-terminal:live-on`.

Note: the command you run for step 1 may itself still be wrapped by the hook (the flag takes effect for subsequent commands). That is expected.
