import * as os from 'os';
import * as path from 'path';

/** Shared file-protocol constants with the Claude Code plugin hooks. */
export const LIVE_DIR = path.join(os.homedir(), '.claude', 'live-terminal');

export interface CommandMeta {
  id: string;
  sessionId: string;
  cwd: string;
  command: string;
  tool: 'Bash' | 'PowerShell';
  startedAt: number;
}

export function logPath(id: string): string {
  return path.join(LIVE_DIR, `cmd-${id}.log`);
}

export function exitPath(id: string): string {
  return path.join(LIVE_DIR, `cmd-${id}.exit`);
}

export const META_RE = /^cmd-(\d+-[a-z0-9]+)\.json$/;
