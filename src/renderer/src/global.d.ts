import type { HQBridge } from '../../preload/index.ts';

declare global {
  interface Window {
    hq: HQBridge;
  }
}

export {};
