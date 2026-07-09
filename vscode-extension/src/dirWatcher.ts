import * as fs from 'fs';
import * as path from 'path';
import { LIVE_DIR, META_RE, CommandMeta } from './protocol';

/**
 * Watches the live-terminal directory for new cmd-<id>.json meta files and
 * hands each fresh command to the callback exactly once. Uses fs.watch with a
 * polling fallback (network drives, some Windows setups miss events).
 */
export class DirWatcher {
  private seen = new Set<string>();
  private watcher: fs.FSWatcher | undefined;
  private poll: ReturnType<typeof setInterval> | undefined;

  constructor(private readonly onCommand: (meta: CommandMeta) => void) {}

  start(): void {
    fs.mkdirSync(LIVE_DIR, { recursive: true });
    this.cleanupOld();
    // Ignore anything already present at startup (old/orphaned commands): mark
    // them seen so we only render commands that begin after activation.
    for (const f of this.safeReaddir()) {
      const m = f.match(META_RE);
      if (m) {
        this.seen.add(m[1]);
      }
    }
    try {
      this.watcher = fs.watch(LIVE_DIR, (_event, filename) => {
        if (filename) {
          this.consider(String(filename));
        }
      });
    } catch {
      // fall back to polling only
    }
    this.poll = setInterval(() => this.scan(), 500);
  }

  private scan(): void {
    for (const f of this.safeReaddir()) {
      this.consider(f);
    }
  }

  private consider(filename: string): void {
    const m = filename.match(META_RE);
    if (!m) {
      return;
    }
    const id = m[1];
    if (this.seen.has(id)) {
      return;
    }
    let meta: CommandMeta;
    try {
      const raw = fs.readFileSync(path.join(LIVE_DIR, filename), 'utf8');
      meta = JSON.parse(raw);
    } catch {
      return; // meta not fully written yet; next scan retries
    }
    if (!meta || !meta.id) {
      return;
    }
    this.seen.add(id);
    this.onCommand(meta);
  }

  private safeReaddir(): string[] {
    try {
      return fs.readdirSync(LIVE_DIR);
    } catch {
      return [];
    }
  }

  private cleanupOld(): void {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    for (const f of this.safeReaddir()) {
      if (!f.startsWith('cmd-')) {
        continue;
      }
      const full = path.join(LIVE_DIR, f);
      try {
        if (fs.statSync(full).mtimeMs < cutoff) {
          fs.unlinkSync(full);
        }
      } catch {
        // ignore
      }
    }
  }

  dispose(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = undefined;
    }
    if (this.poll) {
      clearInterval(this.poll);
      this.poll = undefined;
    }
  }
}
