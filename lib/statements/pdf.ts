import type { PageText, TextItem } from "./parse";

// A thin layer over pdfjs-dist so the same code runs in the browser and in tests.

/* eslint-disable @typescript-eslint/no-explicit-any */
export type PdfJs = any;
export type PdfDoc = any;

export class PdfPasswordError extends Error {
  reason: "need" | "wrong";
  constructor(reason: "need" | "wrong") {
    super(reason === "need" ? "This PDF is password protected." : "That password did not open the PDF.");
    this.reason = reason;
  }
}

// Browser only. The worker file is copied into /public so it is served from the same origin.
export async function loadBrowserPdfjs(): Promise<PdfJs> {
  const mod: PdfJs = await import("pdfjs-dist/build/pdf");
  mod.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.js";
  return mod;
}

// The password is passed in memory for this one call and is never stored by this module.
export async function openPdf(pdfjs: PdfJs, data: Uint8Array, password?: string): Promise<PdfDoc> {
  const task = pdfjs.getDocument({ data: data.slice(), password, isEvalSupported: false, useSystemFonts: true });
  try {
    return await task.promise;
  } catch (err: any) {
    if (err && err.name === "PasswordException") {
      throw new PdfPasswordError(err.code === 2 ? "wrong" : "need");
    }
    throw err;
  }
}

const MIN_TEXT_ITEMS = 5;

export interface ReadPages {
  pages: PageText[];
  scanned: number[]; // 1 based page numbers with no usable text layer
  pageCount: number;
}

export async function readPages(doc: PdfDoc): Promise<ReadPages> {
  const pages: PageText[] = [];
  const scanned: number[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();
    const items: TextItem[] = [];
    for (const it of content.items as any[]) {
      if (typeof it.str !== "string" || !it.str.trim()) continue;
      items.push({ str: it.str, x: it.transform[4], y: it.transform[5], w: it.width });
    }
    if (items.length < MIN_TEXT_ITEMS) scanned.push(n);
    else pages.push({ page: n, items });
  }
  return { pages, scanned, pageCount: doc.numPages };
}

// Browser only: a page as a JPEG, for scanned pages that need live extraction. Returns base64 without the prefix.
export async function renderPageJpeg(doc: PdfDoc, pageNo: number, maxWidth = 1400): Promise<string> {
  const page = await doc.getPage(pageNo);
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: Math.min(2, maxWidth / base.width) });
  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  await page.render({ canvasContext: canvas.getContext("2d") as CanvasRenderingContext2D, viewport }).promise;
  return canvas.toDataURL("image/jpeg", 0.72).split(",")[1];
}
