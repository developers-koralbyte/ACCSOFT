// Copies the pdf.js worker from the installed package into /public so it is served from our own origin.
// Runs on install, dev and build, so the worker always matches the installed pdfjs-dist version.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const from = path.join(root, "node_modules/pdfjs-dist/build/pdf.worker.min.js");
const to = path.join(root, "public/pdf.worker.min.js");
if (fs.existsSync(from)) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}
