import { app } from 'electron';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Settings } from '../shared/types.ts';

const FILE = () => join(app.getPath('userData'), 'settings.json');

const DEFAULTS: Settings = {
  savePath: null,
  schoolTeamRow: null,
  theme: 'system',
  brandPack: 'real',
  portraitsDir: null,
  logosDir: null,
  autoUpdate: true,
  uiScale: 1
};

let current: Settings | null = null;

export function getSettings(): Settings {
  if (current) return current;
  try {
    const raw = JSON.parse(readFileSync(FILE(), 'utf8').replace(/^﻿/, ''));
    current = { ...DEFAULTS, ...raw };
  } catch {
    current = { ...DEFAULTS };
  }
  return current!;
}

export function updateSettings(patch: Partial<Settings>): Settings {
  current = { ...getSettings(), ...patch };
  try {
    mkdirSync(dirname(FILE()), { recursive: true });
    writeFileSync(FILE(), JSON.stringify(current, null, 2), 'utf8');
  } catch {
    // Non-fatal: settings just won't persist this run.
  }
  return current;
}
