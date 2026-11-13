// "Invite my accountant" in business mode: a prefilled WhatsApp message. No number, so WhatsApp lets the person choose a contact.
export function inviteAccountantMessage(siteUrl: string): string {
  return `Hi, I use DocFlow to keep my documents and bank statements in one place, so my month is ready for you without chasing. Could you take a look? ${siteUrl}`;
}

export function inviteAccountantUrl(siteUrl: string): string {
  return `https://wa.me/?text=${encodeURIComponent(inviteAccountantMessage(siteUrl))}`;
}
