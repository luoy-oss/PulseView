import { loadGeneratedWasm } from './loader.ts';
import type { PulseViewWasmExports } from './loader.ts';

export type WasmRuntimeStatus = 'unavailable' | 'loading' | 'ready' | 'fallback';

export interface WasmRuntimeState {
  status: WasmRuntimeStatus;
  error: Error | null;
  failedModule?: string;
}

let state: WasmRuntimeState = { status: 'unavailable', error: null };
let exportsValue: PulseViewWasmExports | null = null;
let pending: Promise<PulseViewWasmExports | null> | null = null;
let generation = 0;

export function getWasmState(): Readonly<WasmRuntimeState> {
  return state;
}

export function getWasmExports(): PulseViewWasmExports | null {
  return exportsValue;
}

export function markWasmFallback(error: unknown, moduleName: string): void {
  const normalized = error instanceof Error ? error : new Error(String(error));
  state = { status: 'fallback', error: normalized, failedModule: moduleName };
  exportsValue = null;
}

export function initializeWasm(
  loader: () => Promise<PulseViewWasmExports> = loadGeneratedWasm,
): Promise<PulseViewWasmExports | null> {
  if (exportsValue) return Promise.resolve(exportsValue);
  if (pending) return pending;
  const currentGeneration = generation;
  state = { status: 'loading', error: null };
  const request = loader()
    .then((loaded) => {
      if (currentGeneration !== generation) return null;
      exportsValue = loaded;
      state = { status: 'ready', error: null };
      return loaded;
    })
    .catch((error: unknown) => {
      if (currentGeneration !== generation) return null;
      const normalized = error instanceof Error ? error : new Error(String(error));
      state = { status: 'fallback', error: normalized, failedModule: 'initialization' };
      return null;
    })
    .finally(() => {
      if (pending === request) pending = null;
    });
  pending = request;
  return pending;
}

export function disableWasm(): void {
  generation++;
  state = { status: 'unavailable', error: null };
  exportsValue = null;
  pending = null;
}

export function resetWasmRuntimeForTests(): void {
  disableWasm();
}
