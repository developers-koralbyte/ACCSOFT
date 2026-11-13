import { loadFile } from "../files";
import type { AppState } from "../types";
import type { PdfFile } from "./audit";

// Where the app still holds a statement's PDF: this browser's file store, or the bundled sample files.
export async function gatherPdfs(state: AppState, statementIds: string[]): Promise<Record<string, PdfFile>> {
  const out: Record<string, PdfFile> = {};
  for (const id of statementIds) {
    const st = state.statements.find((s) => s.id === id);
    if (!st) continue;
    const f = await loadFile(id);
    if (f) {
      out[id] = { name: f.name, data: f.data };
    } else if (st.kind === "sample" && /\.pdf$/i.test(st.fileName) && !st.fileName.includes(" ")) {
      try {
        const res = await fetch(`/samples/${st.fileName}`);
        if (res.ok) out[id] = { name: st.fileName, data: new Uint8Array(await res.arrayBuffer()) };
      } catch {
        /* not held */
      }
    }
  }
  return out;
}

