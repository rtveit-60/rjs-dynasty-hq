import { app } from 'electron';
import { appendFileSync, mkdirSync, readFileSync, renameSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Local diagnostics: a plain-text log in userData/logs plus short, stable
 * error codes users can read off an error screen and report. Everything
 * stays on the machine — logging is a file write, never a network call.
 */

let file: string | null = null;

/** Rotate at ~512KB so the log never grows unbounded; keep one prior file. */
const ROTATE_BYTES = 512 * 1024;

export function initLog(): void {
  try {
    const dir = join(app.getPath('userData'), 'logs');
    mkdirSync(dir, { recursive: true });
    file = join(dir, 'hq.log');
    try {
      if (statSync(file).size > ROTATE_BYTES) {
        renameSync(file, join(dir, 'hq-prev.log'));
      }
    } catch {
      // First run — nothing to rotate.
    }
    line('INFO', 'app', `${app.getName()} ${app.getVersion()} starting`, {
      platform: process.platform,
      arch: process.arch,
      electron: process.versions.electron,
      packaged: app.isPackaged
    });
    process.on('uncaughtException', (err) => {
      reportError('uncaught', err);
    });
    process.on('unhandledRejection', (reason) => {
      reportError('unhandled-rejection', reason);
    });
  } catch {
    // Diagnostics must never take the app down with them.
    file = null;
  }
}

function line(level: 'INFO' | 'WARN' | 'ERROR', area: string, msg: string, extra?: unknown): void {
  let text = `${new Date().toISOString()} [${level}] [${area}] ${msg}`;
  if (extra !== undefined) {
    try {
      text += ` | ${JSON.stringify(extra)}`;
    } catch {
      // Unserializable extras drop silently rather than break the log line.
    }
  }
  if (level !== 'INFO') console.error(`[hq] ${text}`);
  if (!file) return;
  try {
    appendFileSync(file, text + '\n');
  } catch {
    // A full or locked disk shouldn't cascade.
  }
}

export const log = {
  info: (area: string, msg: string, extra?: unknown) => line('INFO', area, msg, extra),
  warn: (area: string, msg: string, extra?: unknown) => line('WARN', area, msg, extra),
  error: (area: string, msg: string, extra?: unknown) => line('ERROR', area, msg, extra)
};

export function logPath(): string | null {
  return file;
}

/**
 * A short, stable code for an error: the same bug produces the same code
 * every time (hash of name, message and the top stack frame), so one code
 * from a user report pins down the failure without needing the whole log.
 */
export function errorCode(err: unknown): string {
  const e = err instanceof Error ? err : new Error(String(err));
  const frame = (e.stack ?? '').split('\n').find((l) => l.trimStart().startsWith('at ')) ?? '';
  const seed = `${e.name}|${e.message}|${frame.trim()}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `HQ-${h.toString(16).toUpperCase().padStart(8, '0').slice(0, 4)}`;
}

/** Log an error with its full stack and hand back the code to show the user. */
export function reportError(area: string, err: unknown, extra?: unknown): string {
  const e = err instanceof Error ? err : new Error(String(err));
  const code = errorCode(e);
  line('ERROR', area, `${code} ${e.name}: ${e.message}`, extra);
  if (e.stack && file) {
    try {
      appendFileSync(file, e.stack.split('\n').slice(1).join('\n') + '\n');
    } catch {
      // Stack write is best-effort.
    }
  }
  return code;
}

/** The last portion of the log, for the copyable diagnostics report. */
export function tailLog(maxBytes = 4096): string {
  if (!file) return '';
  try {
    const raw = readFileSync(file, 'utf8');
    return raw.length > maxBytes ? raw.slice(raw.length - maxBytes) : raw;
  } catch {
    return '';
  }
}
