/**
 * Client-side password help. The server is the authority (length rules and a breach check);
 * this only gives people early, honest feedback and a safe way to pick something strong.
 */

export const MIN_LENGTH = 10;

export interface Strength {
  /** 0 = nothing typed, 1 = weak … 4 = strong. */
  level: 0 | 1 | 2 | 3 | 4;
  label: string;
  /** Short, specific things that would help. Empty when there is nothing useful to say. */
  tips: string[];
}

const COMMON = [
  "password",
  "passw0rd",
  "123456",
  "12345678",
  "qwerty",
  "azerty",
  "letmein",
  "welcome",
  "iloveyou",
  "admin",
  "kigali",
  "rwanda",
  "mdl",
];

const SEQUENCES = ["abcdefghijklmnopqrstuvwxyz", "0123456789", "qwertyuiop", "asdfghjkl"];

function hasSequence(value: string): boolean {
  const lower = value.toLowerCase();
  for (const seq of SEQUENCES) {
    for (let i = 0; i + 4 <= seq.length; i += 1) {
      const chunk = seq.slice(i, i + 4);
      if (lower.includes(chunk) || lower.includes([...chunk].reverse().join(""))) return true;
    }
  }
  return false;
}

/** Rough entropy in bits from the character pool and length, then penalised for easy patterns. */
function estimateBits(value: string): number {
  let pool = 0;
  if (/[a-z]/.test(value)) pool += 26;
  if (/[A-Z]/.test(value)) pool += 26;
  if (/[0-9]/.test(value)) pool += 10;
  if (/[^a-zA-Z0-9]/.test(value)) pool += 28;
  if (pool === 0) return 0;
  const distinct = new Set(value).size;
  // Repeated characters add little: weight length by how many different ones there are.
  const effectiveLength = Math.min(value.length, distinct * 2);
  return effectiveLength * Math.log2(pool);
}

export function scorePassword(value: string, personal: string[] = []): Strength {
  if (value.length === 0) return { level: 0, label: "", tips: [] };
  const tips: string[] = [];
  const lower = value.toLowerCase();

  const known = [
    ...COMMON,
    ...personal.map((p) => p.trim().toLowerCase()).filter((p) => p.length >= 3),
  ];
  const containsKnown = known.some((k) => lower.includes(k));
  if (containsKnown) tips.push("Avoid common words, your name and your email.");
  if (value.length < MIN_LENGTH) tips.push(`Use at least ${MIN_LENGTH} characters.`);
  if (hasSequence(value)) tips.push("Avoid runs like abcd or 1234.");

  let bits = estimateBits(value);
  if (containsKnown) bits -= 20;
  if (hasSequence(value)) bits -= 10;

  let level: Strength["level"] = 1;
  if (value.length >= MIN_LENGTH) {
    if (bits >= 90) level = 4;
    else if (bits >= 65) level = 3;
    else if (bits >= 45) level = 2;
  }
  if (value.length >= MIN_LENGTH && level < 3 && tips.length === 0)
    tips.push("Add another word or two to make it stronger.");

  const label = ["", "Weak", "Fair", "Good", "Strong"][level] ?? "";
  return { level, label, tips };
}

/** 128 short, concrete, easy-to-spell words: 7 bits each. Place and nature words from Rwanda and the region. */
export const WORDS = [
  "kivu",
  "kigali",
  "nyungwe",
  "akagera",
  "virunga",
  "muhazi",
  "huye",
  "rubavu",
  "musanze",
  "volcano",
  "gorilla",
  "sunrise",
  "river",
  "lantern",
  "mango",
  "banana",
  "coffee",
  "tea",
  "millet",
  "sorghum",
  "bean",
  "maize",
  "cassava",
  "papaya",
  "hill",
  "valley",
  "lake",
  "island",
  "forest",
  "meadow",
  "garden",
  "harvest",
  "drum",
  "basket",
  "weaver",
  "potter",
  "tailor",
  "builder",
  "teacher",
  "doctor",
  "pilot",
  "singer",
  "dancer",
  "farmer",
  "fisher",
  "runner",
  "writer",
  "painter",
  "copper",
  "silver",
  "amber",
  "indigo",
  "scarlet",
  "ivory",
  "ebony",
  "saffron",
  "falcon",
  "heron",
  "ibis",
  "eagle",
  "zebra",
  "buffalo",
  "antelope",
  "giraffe",
  "monkey",
  "otter",
  "turtle",
  "beetle",
  "firefly",
  "butterfly",
  "cricket",
  "sparrow",
  "rain",
  "thunder",
  "breeze",
  "cloud",
  "star",
  "moon",
  "comet",
  "dawn",
  "bridge",
  "tower",
  "window",
  "market",
  "school",
  "library",
  "kitchen",
  "harbor",
  "marble",
  "pebble",
  "anchor",
  "compass",
  "candle",
  "bottle",
  "ladder",
  "pencil",
  "rocket",
  "engine",
  "pixel",
  "signal",
  "circuit",
  "binary",
  "network",
  "cursor",
  "brave",
  "gentle",
  "bright",
  "swift",
  "quiet",
  "mighty",
  "humble",
  "lucky",
  "orange",
  "lemon",
  "ginger",
  "pepper",
  "honey",
  "sugar",
  "cocoa",
  "vanilla",
  "tiger",
  "panda",
  "koala",
  "lizard",
  "parrot",
  "dolphin",
  "walrus",
  "badger",
] as const;

/** Uniform pick using crypto randomness. 128 divides 256, so masking a byte has no modulo bias. */
function randomIndex(max: number, bytes: Uint8Array, cursor: { i: number }): number {
  if (max !== 128 && max !== 100) throw new Error("unsupported range");
  for (;;) {
    const byte = bytes[cursor.i % bytes.length] ?? 0;
    cursor.i += 1;
    if (max === 128) return byte & 127;
    if (byte < 200) return byte % 100; // reject 200-255 so 0-99 stay uniform
  }
}

/** Five words plus a two-digit number: about 37 bits of randomness on top of a long, typeable length. */
export function generatePassphrase(random: (n: number) => Uint8Array = secureBytes): string {
  const bytes = random(64);
  const cursor = { i: 0 };
  const words = Array.from({ length: 5 }, () => WORDS[randomIndex(128, bytes, cursor)] ?? "kivu");
  const number = String(randomIndex(100, bytes, cursor)).padStart(2, "0");
  return `${words.join("-")}-${number}`;
}

function secureBytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  globalThis.crypto.getRandomValues(out);
  return out;
}
