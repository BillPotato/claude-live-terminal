---
name: live-on
description: Enable Claude Live Terminal — resume wrapping shell commands with live-output logging
---

Enable live-output streaming by deleting the disable flag file, then confirm to the user.

1. Delete the file `~/.claude/live-terminal/disabled` if it exists. Use a cross-platform approach, e.g.:

   ```
   node -e "const p=require('path'),f=require('fs'),t=p.join(require('os').homedir(),'.claude','live-terminal','disabled');try{f.unlinkSync(t)}catch(e){}"
   ```

2. Tell the user that live terminal streaming is now **on**: every Bash/PowerShell command will stream its output to `~/.claude/live-terminal/` where the companion VS Code extension renders it in integrated terminals.
