// Words stripped from a bank description before comparing payee names.
// Add to these lists freely: the normaliser picks them up with no other change.

// Malaysian transfer wording and channel names.
export const TRANSFER_WORDS: string[] = [
  "DUITNOW", "IBG", "IBFT", "JOMPAY", "FPX", "TRF", "TRANSFER", "PYMT", "PAYMENT", "PAY", "GIRO", "INSTANT",
  "ONLINE", "QR", "CT", "MBB", "TO", "FR", "FROM", "INTO", "A/C", "AC", "ACCOUNT", "INTER", "BANK", "BILLER",
  "REF", "REFERENCE", "INV", "INVOICE", "MERCHANT", "PURCHASE", "TXN", "TRANSACTION", "CASH", "BILL", "CHQ", "CHEQUE",
];

// Company suffixes, so "Sinar Fuel Card Sdn Bhd" and "SINAR FUEL CARD" compare equal.
export const COMPANY_SUFFIXES: string[] = ["SDN", "BHD", "BERHAD", "PLT", "LLP", "LTD", "ENTERPRISE", "ENT", "CO"];

// Month names and abbreviations that banks add to references ("RENT OCT 2026").
export const MONTH_WORDS: string[] = [
  "JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "SEPT", "OCT", "NOV", "DEC",
  "JANUARY", "FEBRUARY", "MARCH", "APRIL", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER",
];

// Multi word phrases removed before splitting into words.
export const NOISE_PHRASES: RegExp[] = [/DUIT\s?NOW/g, /INTER[-\s]?BANK/g, /A\/C/g, /\bIBG\b/g];
