import * as vscode from 'vscode';
import { ClaudePty } from './pty';
import { CommandMeta } from './protocol';

interface Slot {
  terminal: vscode.Terminal;
  pty: ClaudePty;
}

/**
 * Maps a Claude session to one or more integrated terminals. Sequential
 * commands in a session reuse the same terminal (like a real shell); commands
 * that overlap a still-running one spawn an additional numbered terminal, so
 * parallel/background tool calls each get their own live view.
 */
export class TerminalManager {
  private slots = new Map<string, Slot[]>();
  private shownSessions = new Set<string>();

  dispatch(meta: CommandMeta): void {
    const key = meta.sessionId;
    let list = this.slots.get(key);
    if (!list) {
      list = [];
      this.slots.set(key, list);
    }
    // Drop slots whose terminal the user closed.
    list = list.filter((s) => !s.pty.isClosed);
    this.slots.set(key, list);

    let slot = list.find((s) => !s.pty.busy && !s.pty.isClosed);
    if (!slot) {
      slot = this.createSlot(key, list.length);
      list.push(slot);
    }
    slot.pty.run(meta);

    if (!this.shownSessions.has(key)) {
      this.shownSessions.add(key);
      slot.terminal.show(true);
    }
  }

  private createSlot(sessionId: string, index: number): Slot {
    const pty = new ClaudePty();
    const short = sessionId.slice(0, 4) || 'sess';
    const name = index === 0 ? `Claude Shell (${short})` : `Claude Shell (${short}) #${index + 1}`;
    const terminal = vscode.window.createTerminal({ name, pty: pty.pty });
    return { terminal, pty };
  }

  showAll(): void {
    for (const list of this.slots.values()) {
      for (const slot of list) {
        if (!slot.pty.isClosed) {
          slot.terminal.show(true);
          return;
        }
      }
    }
  }

  dispose(): void {
    for (const list of this.slots.values()) {
      for (const slot of list) {
        slot.terminal.dispose();
      }
    }
    this.slots.clear();
  }
}
