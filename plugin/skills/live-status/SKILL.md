---
name: live-status
description: Show whether Claude Live Terminal streaming is enabled and where the live logs are
---

Report the current state of Claude Live Terminal to the user.

1. Check whether `~/.claude/live-terminal/disabled` exists and count recent command logs, e.g.:

   ```
   node -e "const p=require('path'),f=require('fs'),d=p.join(require('os').homedir(),'.claude','live-terminal');let files=[];try{files=f.readdirSync(d)}catch(e){};console.log(JSON.stringify({disabled:f.existsSync(p.join(d,'disabled')),dir:d,logs:files.filter(x=>x.endsWith('.log')).length}))"
   ```

2. Tell the user:
   - Whether streaming is **enabled** (no `disabled` flag) or **disabled**.
   - The live log directory path.
   - How many command logs are currently present.
   - Reminder: live rendering in integrated terminals requires the companion "Claude Live Terminal" VS Code extension; without it, they can watch a log manually with `Get-Content -Wait <log>` (PowerShell) or `tail -f <log>` (bash).
