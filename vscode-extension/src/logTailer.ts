import * as fs from 'fs';
import { StringDecoder } from 'string_decoder';
import { logPath, exitPath } from './protocol';

/**
 * Tails one command's log file by polling from a byte offset and watches for
 * its .exit marker. Handles UTF-8 and UTF-16 LE logs (PowerShell 5.1's
 * Tee-Object writes UTF-16 LE with a BOM).
 */
export class CommandStream {
  private offset = 0;
  private decoder: StringDecoder | undefined;
  private timer: ReturnType<typeof setInterval> | undefined;
  private finished = false;

  constructor(
    private readonly id: string,
    private readonly onData: (text: string) => void,
    private readonly onExit: (code: string) => void,
  ) {}

  start(): void {
    this.timer = setInterval(() => this.tick(), 250);
  }

  dispose(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    this.finished = true;
  }

  private tick(): void {
    if (this.finished) {
      return;
    }
    this.readNew();
    let exitRaw: string | undefined;
    try {
      exitRaw = fs.readFileSync(exitPath(this.id), 'utf8');
    } catch {
      return; // still running
    }
    this.finished = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    // The exit marker is written after the log pipeline completes, but give
    // the filesystem a moment to settle before the final drain.
    setTimeout(() => {
      this.readNew();
      const code = exitRaw!.replace(/^﻿/, '').replace(/\0/g, '').trim() || '?';
      this.onExit(code);
    }, 200);
  }

  private readNew(): void {
    let size: number;
    try {
      size = fs.statSync(logPath(this.id)).size;
    } catch {
      return; // log not created yet
    }
    if (size <= this.offset) {
      return;
    }
    let buf: Buffer;
    try {
      const fd = fs.openSync(logPath(this.id), 'r');
      try {
        buf = Buffer.alloc(size - this.offset);
        fs.readSync(fd, buf, 0, buf.length, this.offset);
      } finally {
        fs.closeSync(fd);
      }
    } catch {
      return;
    }
    this.offset = size;

    let chunk: Buffer = buf;
    if (!this.decoder) {
      if (chunk.length >= 2 && chunk[0] === 0xff && chunk[1] === 0xfe) {
        this.decoder = new StringDecoder('utf16le');
        chunk = chunk.subarray(2);
      } else if (chunk.length >= 3 && chunk[0] === 0xef && chunk[1] === 0xbb && chunk[2] === 0xbf) {
        this.decoder = new StringDecoder('utf8');
        chunk = chunk.subarray(3);
      } else {
        this.decoder = new StringDecoder('utf8');
      }
    }
    const text = this.decoder.write(chunk);
    if (text) {
      this.onData(text);
    }
  }
}
