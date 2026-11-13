// The ONLY place a client message leaves the app. Today it opens a WhatsApp chat with the text prefilled
// (a wa.me link). When the WhatsApp Business API is ready, replace the body of sendWhatsApp and nothing else changes.

export interface SendResult {
  ok: boolean;
  channel: "wa-link";
  url: string;
}

export function whatsappUrl(phone: string, text: string): string {
  return `https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;
}

export function sendWhatsApp(phone: string, text: string): SendResult {
  const url = whatsappUrl(phone, text);
  let ok = true;
  try {
    ok = window.open(url, "_blank", "noopener") !== null;
  } catch {
    ok = false;
  }
  return { ok, channel: "wa-link", url };
}
