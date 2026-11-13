import { fmtDate, fmtRM, monthName } from "../money";
import type { Lang } from "./types";

// ALL client-facing message wording lives in this one file, in three languages.
//
// DRAFT TRANSLATIONS: the Bahasa Malaysia ("ms") and Mandarin ("zh", Simplified Chinese) text below was written
// by the developer, not by a native speaker. Have each checked before real use. The screen shows a visible
// "draft" warning for these two languages until `draft` is set to false here.

export interface QuestionFacts {
  date: string; // YYYY-MM-DD
  amount: number; // sen
  side: "debit" | "credit";
  payee: string;
}

interface Pack {
  label: string;
  draft: boolean;
  paid: string;
  received: string;
  month: (ym: string) => string;
  single: (q: { date: string; amount: string; verb: string; payee: string }) => string;
  intro: (n: number, client: string, month: string) => string;
  item: (i: number, q: { date: string; amount: string; verb: string; payee: string }) => string;
  outro: string;
  missingIntro: (client: string, month: string) => string;
  missingItem: (label: string) => string;
  missingOutro: string;
  kinds: Record<string, string>;
}

const MS_MONTHS = ["Januari", "Februari", "Mac", "April", "Mei", "Jun", "Julai", "Ogos", "September", "Oktober", "November", "Disember"];

export const PACKS: Record<Lang, Pack> = {
  en: {
    label: "English",
    draft: false,
    paid: "paid to",
    received: "received from",
    month: (ym) => monthName(ym),
    single: (q) => `Hi, on ${q.date} ${q.amount} was ${q.verb} ${q.payee}. What was this for? You can reply with a photo of the bill or a short note.`,
    intro: (n, client, month) => `Hi, we have ${n} questions about ${client} for ${month}:`,
    item: (i, q) => `${i}. On ${q.date}, ${q.amount} was ${q.verb} ${q.payee}. What was this for?`,
    outro: "You can reply to each with a photo of the bill or a short note. Thank you!",
    missingIntro: (client, month) => `Hi, to finish ${month} for ${client} we are still missing:`,
    missingItem: (label) => `- ${label}`,
    missingOutro: "Please send photos or PDFs here on WhatsApp. Thank you!",
    kinds: {
      Rent: "Rent receipt or invoice",
      Utilities: "Utilities bill",
      "Telephone and internet": "Phone and internet bill",
      "Bank statement": "Bank statement",
    },
  },
  ms: {
    label: "Bahasa Malaysia",
    draft: true,
    paid: "dibayar kepada",
    received: "diterima daripada",
    month: (ym) => `${MS_MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`,
    single: (q) => `Hai, pada ${q.date} ${q.amount} telah ${q.verb} ${q.payee}. Untuk apakah bayaran ini? Anda boleh balas dengan gambar bil atau nota ringkas.`,
    intro: (n, client, month) => `Hai, kami ada ${n} soalan tentang ${client} untuk ${month}:`,
    item: (i, q) => `${i}. Pada ${q.date}, ${q.amount} telah ${q.verb} ${q.payee}. Untuk apakah ini?`,
    outro: "Sila balas setiap satu dengan gambar bil atau nota ringkas. Terima kasih!",
    missingIntro: (client, month) => `Hai, untuk melengkapkan ${month} bagi ${client}, kami masih belum menerima:`,
    missingItem: (label) => `- ${label}`,
    missingOutro: "Sila hantar gambar atau PDF di sini melalui WhatsApp. Terima kasih!",
    kinds: {
      Rent: "Resit atau invois sewa",
      Utilities: "Bil utiliti",
      "Telephone and internet": "Bil telefon dan internet",
      "Bank statement": "Penyata bank",
    },
  },
  zh: {
    label: "Mandarin (Simplified)",
    draft: true,
    paid: "付给",
    received: "收到来自",
    month: (ym) => `${ym.slice(0, 4)}年${Number(ym.slice(5, 7))}月`,
    single: (q) => `您好，${q.date} 有一笔 ${q.amount} ${q.verb} ${q.payee}。请问这笔款项是做什么用的？您可以回复账单照片或简短说明。`,
    intro: (n, client, month) => `您好，关于${client}${month}的账目，我们有${n}个问题：`,
    item: (i, q) => `${i}. ${q.date}，${q.amount} ${q.verb} ${q.payee}。这是做什么用的？`,
    outro: "请逐条回复账单照片或简短说明。谢谢！",
    missingIntro: (client, month) => `您好，为了完成${client}${month}的账目，我们还缺少：`,
    missingItem: (label) => `- ${label}`,
    missingOutro: "请把照片或PDF发到这个WhatsApp。谢谢！",
    kinds: {
      Rent: "租金收据或发票",
      Utilities: "水电费账单",
      "Telephone and internet": "电话和网络账单",
      "Bank statement": "银行对账单",
    },
  },
};

export const LANGS: Lang[] = ["en", "ms", "zh"];

export function isDraft(lang: Lang): boolean {
  return PACKS[lang].draft;
}

const facts = (lang: Lang, q: QuestionFacts) => ({
  date: fmtDate(q.date),
  amount: fmtRM(q.amount),
  verb: q.side === "debit" ? PACKS[lang].paid : PACKS[lang].received,
  payee: q.payee,
});

// One question as a sentence, for the screen.
export function questionSentence(lang: Lang, q: QuestionFacts): string {
  return PACKS[lang].single(facts(lang, q));
}

// All open questions for a client in ONE message. A single question uses the short form.
export function buildQuestionMessage(lang: Lang, client: string, month: string, questions: QuestionFacts[]): string {
  const p = PACKS[lang];
  if (questions.length === 0) return "";
  if (questions.length === 1) return p.single(facts(lang, questions[0]));
  const lines = questions.map((q, i) => p.item(i + 1, facts(lang, q)));
  return [p.intro(questions.length, client, p.month(month)), ...lines, p.outro].join("\n");
}

export function kindLabel(lang: Lang, kind: string): string {
  return PACKS[lang].kinds[kind] ?? kind;
}

export function buildMissingMessage(lang: Lang, client: string, month: string, kinds: string[]): string {
  const p = PACKS[lang];
  if (kinds.length === 0) return "";
  return [p.missingIntro(client, p.month(month)), ...kinds.map((k) => p.missingItem(kindLabel(lang, k))), p.missingOutro].join("\n");
}
