/**
 * Short, order-sensitive fingerprint of a list of strings: its length plus two
 * independent 32-bit hashes (FNV-1a and djb2) over each value's length and
 * characters. Use it as a cache key part where the list itself is too long to key
 * on (a year of order numbers is ~70,000).
 */
export function listFingerprint(values: readonly string[]): string {
  let fnv = 0x811c9dc5;
  let djb = 5381;
  const mix = (code: number) => {
    fnv = Math.imul(fnv ^ code, 0x01000193);
    djb = (Math.imul(djb, 33) + code) | 0;
  };
  for (const value of values) {
    mix(value.length & 0xffff); // length first, so value boundaries can't shift
    mix(value.length >>> 16);
    for (let i = 0; i < value.length; i++) mix(value.charCodeAt(i));
  }
  return `${values.length}:${(fnv >>> 0).toString(36)}.${(djb >>> 0).toString(36)}`;
}
