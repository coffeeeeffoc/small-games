export const RANDOM_VERSION = 'sha256-counter-v1';
const INITIAL = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
const K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];
const rotr = (value, bits) => (value >>> bits) | (value << (32 - bits));

// UTF-8 and SHA-256 are synchronous and do not require DOM, TextEncoder,
// Web Crypto, Node built-ins or platform globals in the shared rules bundle.
export function sha256(message) {
  const bytes = [];
  for (const character of String(message)) {
    let point = character.codePointAt(0);
    if (point >= 0xd800 && point <= 0xdfff) point = 0xfffd;
    if (point < 0x80) bytes.push(point);
    else if (point < 0x800) bytes.push(0xc0 | (point >>> 6), 0x80 | (point & 63));
    else if (point < 0x10000) bytes.push(0xe0 | (point >>> 12), 0x80 | ((point >>> 6) & 63), 0x80 | (point & 63));
    else bytes.push(0xf0 | (point >>> 18), 0x80 | ((point >>> 12) & 63), 0x80 | ((point >>> 6) & 63), 0x80 | (point & 63));
  }
  const bitLength = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  const upperLength = Math.floor(bitLength / 4294967296);
  for (let shift = 24; shift >= 0; shift -= 8) bytes.push((upperLength >>> shift) & 255);
  for (let shift = 24; shift >= 0; shift -= 8) bytes.push((bitLength >>> shift) & 255);
  const hash = [...INITIAL];
  for (let offset = 0; offset < bytes.length; offset += 64) {
    const words = Array(64);
    for (let i = 0; i < 16; i++) {
      const p = offset + i * 4;
      words[i] = ((bytes[p] << 24) | (bytes[p + 1] << 16) | (bytes[p + 2] << 8) | bytes[p + 3]) >>> 0;
    }
    for (let i = 16; i < 64; i++) {
      const a = words[i - 15], b = words[i - 2];
      const sigma0 = rotr(a, 7) ^ rotr(a, 18) ^ (a >>> 3);
      const sigma1 = rotr(b, 17) ^ rotr(b, 19) ^ (b >>> 10);
      words[i] = (words[i - 16] + sigma0 + words[i - 7] + sigma1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = hash;
    for (let i = 0; i < 64; i++) {
      const sigma1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const choice = (e & f) ^ (~e & g);
      const t1 = (h + sigma1 + choice + K[i] + words[i]) >>> 0;
      const sigma0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (sigma0 + majority) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    [a, b, c, d, e, f, g, h].forEach((word, i) => { hash[i] = (hash[i] + word) >>> 0; });
  }
  return hash.map((word) => word.toString(16).padStart(8, '0')).join('');
}
export function createCounterRng(seed) { return { algorithm: RANDOM_VERSION, key: String(seed), counter: 0 }; }
export function nextCounterRandom(rng) {
  const digest = sha256(`three-choose-two/${RANDOM_VERSION}\u0000${rng.key}\u0000${rng.counter}`);
  return { rng: { ...rng, counter: rng.counter + 1 }, value: Number.parseInt(digest.slice(0, 8), 16) / 4294967296 };
}
