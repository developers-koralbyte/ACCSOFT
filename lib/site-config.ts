// Site-wide settings. The public pages and the app read from here, so renaming the product or changing a contact
// detail is a one-line change in this file.

export const SITE = {
  // The product name. Every screen reads it from here.
  name: "DocFlow",
  // True while the name is a working name: the app header shows a small "working name" tag.
  workingName: true,
  // WhatsApp number in international format, digits only, starting with 60. Left empty on purpose:
  // while it is empty, every WhatsApp contact button on the public pages is hidden.
  whatsappNumber: "",
  whatsappMessage: "Hi, I would like to talk about DocFlow for my accounting firm.",
  email: "alisyed@koralbyte.com",
  emailSubject: "Walkthrough request",
};

// A usable number is digits only, starting with 60.
export function isWhatsappNumber(n: string): boolean {
  return /^60\d{8,11}$/.test(n);
}

export function whatsappConfigured(): boolean {
  return isWhatsappNumber(SITE.whatsappNumber);
}

// Empty when no number is set, so a dead link can never be shown.
export function whatsappContactUrl(): string {
  return whatsappConfigured() ? `https://wa.me/${SITE.whatsappNumber}?text=${encodeURIComponent(SITE.whatsappMessage)}` : "";
}

export function emailContactUrl(subject: string = SITE.emailSubject, body?: string): string {
  return `mailto:${SITE.email}?subject=${encodeURIComponent(subject)}${body ? `&body=${encodeURIComponent(body)}` : ""}`;
}
