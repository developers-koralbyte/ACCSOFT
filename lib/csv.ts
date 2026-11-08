import type { Bill } from "./types";

function cell(value: string | number | undefined): string {
  const s = value === undefined ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// A plain CSV any accountant can open in Excel or import into their software.
export function billsToCsv(bills: Bill[]): string {
  const header = [
    "Date", "Supplier", "Invoice number", "Description", "Account", "Tax code",
    "Subtotal", "Tax", "Total", "Currency", "Status", "Sent by", "Source file",
  ];
  const rows = bills.map((b) => [
    b.date, b.supplier, b.invoiceNo, b.description, b.account, b.taxCode,
    b.subtotal.toFixed(2), b.tax.toFixed(2), b.total.toFixed(2), b.currency,
    b.status, b.sentBy, b.fileName,
  ]);
  return [header, ...rows].map((r) => r.map(cell).join(",")).join("\n");
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
