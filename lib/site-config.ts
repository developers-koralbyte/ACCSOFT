// CONTACT DETAILS FOR THE PUBLIC PAGES. PLACEHOLDER VALUES: replace them before sharing the site.
// Both the landing page and the pricing page read from here, so this is the only place to change.

export const SITE = {
  name: "DocFlow",
  // WhatsApp number in international format, digits only. PLACEHOLDER: not a real number.
  whatsappNumber: "60100000000",
  whatsappMessage: "Hi, I would like to talk about DocFlow for my accounting firm.",
  // PLACEHOLDER: not a real address.
  email: "hello@example.com",
  emailSubject: "DocFlow enquiry",
};

export function whatsappContactUrl(): string {
  return `https://wa.me/${SITE.whatsappNumber}?text=${encodeURIComponent(SITE.whatsappMessage)}`;
}

export function emailContactUrl(): string {
  return `mailto:${SITE.email}?subject=${encodeURIComponent(SITE.emailSubject)}`;
}
