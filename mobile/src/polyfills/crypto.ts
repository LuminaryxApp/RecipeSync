// Polyfill crypto.getRandomValues for Yjs/lib0 before anything else loads
import * as ExpoCrypto from 'expo-crypto';

if (typeof globalThis.crypto === 'undefined') {
  (globalThis as any).crypto = {};
}

if (typeof globalThis.crypto.getRandomValues === 'undefined') {
  (globalThis.crypto as any).getRandomValues = (array: Uint8Array) => {
    const bytes = ExpoCrypto.getRandomBytes(array.length);
    array.set(bytes);
    return array;
  };
}
