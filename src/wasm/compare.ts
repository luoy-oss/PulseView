export interface NumericTolerance {
  absolute: number;
  relative: number;
}

export const DEFAULT_NUMERIC_TOLERANCE: NumericTolerance = {
  absolute: 1e-12,
  relative: 1e-9,
};

let comparisonOverride: boolean | null = null;

export function setWasmComparisonForTests(enabled: boolean | null): void {
  comparisonOverride = enabled;
}

export function numbersEquivalent(
  left: number,
  right: number,
  tolerance: NumericTolerance = DEFAULT_NUMERIC_TOLERANCE,
): boolean {
  if (Object.is(left, right)) return true;
  if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
  const allowed = tolerance.absolute
    + tolerance.relative * Math.max(Math.abs(left), Math.abs(right));
  return Math.abs(left - right) <= allowed;
}

export function assertNumericArraysEquivalent(
  moduleName: string,
  inputSize: number,
  tsValues: ArrayLike<number>,
  wasmValues: ArrayLike<number>,
  tolerance: NumericTolerance = DEFAULT_NUMERIC_TOLERANCE,
): void {
  if (tsValues.length !== wasmValues.length) {
    throw new Error(
      `[WASM mismatch] ${moduleName}: input=${inputSize}, length TS=${tsValues.length}, WASM=${wasmValues.length}`,
    );
  }
  for (let index = 0; index < tsValues.length; index++) {
    if (!numbersEquivalent(tsValues[index], wasmValues[index], tolerance)) {
      throw new Error(
        `[WASM mismatch] ${moduleName}: input=${inputSize}, index=${index}, TS=${tsValues[index]}, WASM=${wasmValues[index]}`,
      );
    }
  }
}

export function assertIntegerArraysEquivalent(
  moduleName: string,
  inputSize: number,
  tsValues: ArrayLike<number>,
  wasmValues: ArrayLike<number>,
): void {
  if (tsValues.length !== wasmValues.length) {
    throw new Error(
      `[WASM mismatch] ${moduleName}: input=${inputSize}, length TS=${tsValues.length}, WASM=${wasmValues.length}`,
    );
  }
  for (let index = 0; index < tsValues.length; index++) {
    if (tsValues[index] !== wasmValues[index]) {
      throw new Error(
        `[WASM mismatch] ${moduleName}: input=${inputSize}, index=${index}, TS=${tsValues[index]}, WASM=${wasmValues[index]}`,
      );
    }
  }
}

export function dualRun<T>(
  moduleName: string,
  inputSize: number,
  tsRun: () => T,
  wasmRun: () => T,
  assertEquivalent: (tsValue: T, wasmValue: T) => void,
): T {
  const shouldCompare = comparisonOverride ?? (import.meta.env?.DEV ?? true);
  if (!shouldCompare) {
    try {
      return wasmRun();
    } catch (error) {
      markWasmFallback(error, moduleName);
      return tsRun();
    }
  }
  const tsValue = tsRun();
  let wasmValue: T;
  try {
    wasmValue = wasmRun();
  } catch (error) {
    markWasmFallback(error, moduleName);
    return tsValue;
  }
  try {
    assertEquivalent(tsValue, wasmValue);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`[WASM mismatch] ${moduleName}: input=${inputSize}; ${message}`);
  }
  return wasmValue;
}
import { markWasmFallback } from './runtime.ts';
