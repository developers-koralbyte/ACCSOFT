import type { MemoryEntry } from "./types";

// Payee memory: a person's answer for a payee, remembered per client.
// A memory entry applies to any line whose payee words include all of the entry's words.
export function findMemory(memory: Record<string, MemoryEntry>, lineTokens: string[]): MemoryEntry | undefined {
  const set = new Set(lineTokens);
  let best: MemoryEntry | undefined;
  let bestLen = 0;
  for (const m of Object.values(memory)) {
    const words = m.key.split(" ").filter(Boolean);
    if (words.length > bestLen && words.every((w) => set.has(w))) {
      best = m;
      bestLen = words.length;
    }
  }
  return best;
}

export function keyCovers(memoryKey: string, otherKey: string): boolean {
  const have = new Set(otherKey.split(" ").filter(Boolean));
  const words = memoryKey.split(" ").filter(Boolean);
  return words.length > 0 && words.every((w) => have.has(w));
}
