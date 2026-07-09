import * as vscode from 'vscode';
import { CommandStream } from './logTailer';
import { CommandMeta } from './protocol';

const DIM = '\x1b[2m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

function fmtDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) {
    return `${s}s`;
  }
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}m${r.toString().padStart(2, '0')}s`;
}

function fmtTime(t: number): string {
  return new Date(t).toLocaleTimeString();
}

/**
 * A single Claude-shell terminal backed by a Pseudoterminal. It renders a
 * sequence of commands (one after another, like a real shell) and exposes a
 * `busy` flag so the manager can decide whether to reuse or spawn a new one.
 */
export class ClaudePty {
  readonly onDidWrite = new vscode.EventEmitter<string>();
  readonly onDidClose = new vscode.EventEmitter<number | void>();
  readonly pty: vscode.Pseudoterminal;

  private opened = false;
  private queue: CommandMeta[] = [];
  private active: CommandStream | undefined;
  private activeMeta: CommandMeta | undefined;
  private atLineStart = true;
  private closed = false;

  constructor() {
    this.pty = {
      onDidWrite: this.onDidWrite.event,
      onDidClose: this.onDidClose.event,
      open: () => {
        this.opened = true;
        this.write(`${DIM}Claude Live Terminal — command output streams here.${RESET}\r\n`);
        this.pump();
      },
      close: () => {
        this.closed = true;
        if (this.active) {
          this.active.dispose();
          this.active = undefined;
        }
      },
    };
  }

  get busy(): boolean {
    return this.active !== undefined || this.queue.length > 0;
  }

  get isClosed(): boolean {
    return this.closed;
  }

  run(meta: CommandMeta): void {
    this.queue.push(meta);
    if (this.opened) {
      this.pump();
    }
  }

  private pump(): void {
    if (this.active || this.closed) {
      return;
    }
    const meta = this.queue.shift();
    if (!meta) {
      return;
    }
    this.activeMeta = meta;
    this.atLineStart = true;
    this.writeHeader(meta);
    const stream = new CommandStream(
      meta.id,
      (text) => this.writeBody(text),
      (code) => this.finish(code),
    );
    this.active = stream;
    stream.start();
  }

  private writeHeader(meta: CommandMeta): void {
    const cmd = meta.command.replace(/\r?\n/g, ' ');
    const cwd = meta.cwd ? `  ${DIM}${meta.cwd}${RESET}` : '';
    this.write(`\r\n${BOLD}▶ ${cmd}${RESET}${cwd}  ${DIM}${fmtTime(meta.startedAt)}${RESET}\r\n`);
  }

  private writeBody(text: string): void {
    // Normalize bare LFs to CRLF for the terminal, without doubling existing CRs.
    const out = text.replace(/\r?\n/g, '\r\n');
    this.write(out);
    if (out.length > 0) {
      this.atLineStart = out.endsWith('\n');
    }
  }

  private finish(code: string): void {
    if (!this.atLineStart) {
      this.write('\r\n');
    }
    const meta = this.activeMeta;
    const dur = meta ? fmtDuration(Date.now() - meta.startedAt) : '';
    let footer: string;
    if (code === '0') {
      footer = `${GREEN}✔ exit 0${RESET}`;
    } else if (code === '?') {
      footer = `${YELLOW}? interrupted${RESET}`;
    } else {
      footer = `${RED}✖ exit ${code}${RESET}`;
    }
    this.write(`${footer}${dur ? ` ${DIM}· ${dur}${RESET}` : ''}\r\n`);
    if (this.active) {
      this.active.dispose();
    }
    this.active = undefined;
    this.activeMeta = undefined;
    this.pump();
  }

  private write(s: string): void {
    if (!this.closed) {
      this.onDidWrite.fire(s);
    }
  }
}
