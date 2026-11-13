import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { SITE } from "@/lib/site-config";

// The product name must come from SITE.name, so renaming it later is a one-line change.
function files(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return files(p);
    return /\.(ts|tsx)$/.test(e.name) ? [p] : [];
  });
}

describe("product name", () => {
  const root = path.join(__dirname, "..");
  const sources = [...files(path.join(root, "app")), ...files(path.join(root, "lib"))].filter((f) => !f.endsWith("lib/site-config.ts"));

  it("is not hardcoded in any app or lib code (comments are allowed)", () => {
    const offenders: string[] = [];
    for (const f of sources) {
      fs.readFileSync(f, "utf8").split("\n").forEach((line, i) => {
        const code = line.trim();
        if (/^(\/\/|\*|\/\*)/.test(code)) return;
        if (code.includes(SITE.name)) offenders.push(`${path.relative(root, f)}:${i + 1}`);
      });
    }
    expect(offenders).toEqual([]);
  });

  it("has a single place that defines it", () => {
    expect(SITE.name.length).toBeGreaterThan(0);
  });
});
