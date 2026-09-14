/*
  Vitest setup: an in memory IndexedDB so Dexie works in tests, plus a
  structuredClone polyfill guard for older jsdom builds.
*/
import "fake-indexeddb/auto";

if (typeof globalThis.structuredClone !== "function") {
  globalThis.structuredClone = (value: unknown) => JSON.parse(JSON.stringify(value));
}
