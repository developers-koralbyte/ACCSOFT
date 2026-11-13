// Settings kept in one place so they are easy to find and change.

// A month's statement is due by this day of the FOLLOWING month ("complete by the 5th").
export const MONTH_CUTOFF_DAY = 5;

// The month the demo opens on.
export const DEMO_MONTH = "2026-10";

// Document categories a client normally sends every month. A category counts as recurring when it
// appeared in at least RECURRING_MIN_MONTHS of the previous RECURRING_LOOKBACK_MONTHS months.
// "Bank statement" is always handled as well. Add categories here to chase more.
export const RECURRING_CATEGORIES = ["Rent", "Utilities", "Telephone and internet"];
export const RECURRING_LOOKBACK_MONTHS = 3;
export const RECURRING_MIN_MONTHS = 2;
export const BANK_STATEMENT_KIND = "Bank statement";

// After a client is chased, a missing statement stays "Waiting" for this many days before it can turn Blocked.
export const CHASE_GRACE_DAYS = 3;

// Browser file storage limits (uploaded statement PDFs kept for the audit pack).
export const MAX_FILE_BYTES = 15 * 1024 * 1024;
export const MAX_TOTAL_FILE_BYTES = 60 * 1024 * 1024;
