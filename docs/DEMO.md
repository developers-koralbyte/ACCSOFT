# DocFlow demo guide

Working name: DocFlow. The promise: "Every client's month complete by the 5th, without chasing."

This is a working demo on invented sample data. This guide gives the demo script, what is real versus simulated, how the main rules work, and the open items that need your input.

## Routes

| Route | What it is |
|---|---|
| `/` | Public landing page. "Open the demo" goes to `/board`. |
| `/pricing` | Public pricing page with a calculator. |
| `/board` | The month board (firm home screen). |
| `/clients` | Client list, WhatsApp chase, ledger and financial year end settings. |
| `/statements` | Bank statements: upload, proof, matching. |
| `/questions` | Client questions, answers, missing documents chaser. |
| `/month` | Checklist, balance per books, two-step sign-off, snapshot, reopen, activity log. |
| `/export` | Ledger CSV and audit pack for an approved month. |
| `/year-end` | Financial year view and Year-end pack. |
| `/inbox`, `/upload`, `/import`, `/business` | Review queue, add documents, WhatsApp import, "My business" mode (unchanged features). |

## The demo script

### Fastest: the guided demo (about two minutes, no API key)

Press **Start guided demo** on the landing page or the board. It restores the sample data, then a panel walks seven steps and ticks each one off as you do it:

1. **Upload a sample statement.** Click "September 2026 (clean)", then "October 2026 (follows September)".
2. **See it proven to the cent.** Opening plus money in, less money out, equals closing, and every running balance agrees. (Optional: the Bank B sample shows a break pointed to the exact line, with a one-click fix.)
3. **Match the lines.** On October, accept the Bintang suggestion, then press "Confirm all 7 proposed categories". Nothing is ever confirmed automatically.
4. **Ask the client.** Two payments have no document (Ali Trading and the rent). Send them as one WhatsApp message, then record the answers ("Use example answer" fills one in).
5. **Month board.** Seri Murni is ready to approve.
6. **Approve with two people.** Mark it prepared as Aisyah, switch "Acting as" to Daniel in the top bar, tick the acknowledgement for the missing rent receipt, approve. The month locks.
7. **Download the audit pack** from Exports.

### The longer talking version

- **Board.** "1 of 6 clients complete for October." BlueRiver is complete. Kenanga and Harmoni are in progress. Seri Murni and Lotus Kitchen are waiting for a statement (Chase button). Pixel Orchard was chased on 6 November, the grace period is over, and the 5th has passed, so it is Blocked.
- **A real statement.** Ask the firm owner for one digital bank statement PDF and use "Choose PDF". It is read in the browser, never uploaded. A password protected PDF asks for the password and keeps it in memory only.
- **The break.** The Bank B sample (Lotus Kitchen) shows "Break at line 4". Jump to it and use the suggested amount, and the proof turns green.
- **Locking.** After approval try to edit a matched bill in the Review queue: it is locked, but posting to Xero still works. Reopen the month with a reason to unlock.
- **Exports.** Change a client's Ledger on the Clients page (Xero, QuickBooks, SQL Account, AutoCount, Zoho Books, Other) and download the bank lines.
- **Year-end.** On `/year-end`, pick BlueRiver (June year end) and download the Year-end pack.
- **Business mode.** Switch to "My business": sample documents (clearly labelled), a one-row board, and "Invite my accountant" (a prefilled WhatsApp message).

**Reset demo** in the top bar restores the sample data after a confirmation. It also wipes stored statement PDFs and the guided demo progress.

## How the main rules work

- **Balance proof.** Opening plus credits less debits must equal closing, exact to the sen. Where running balances are printed, every line is checked. A statement is "Proven to the cent" only when the closing balance ties exactly and every line has a balance. Otherwise it is a break (with the exact line) or "totals only" (amber).
- **Matching.** Rules run in order: exact amount with an invoice reference in the bank description (ignoring dashes, spaces and case), then exact amount with the payee within 7 days, then exact amount with a single candidate within 3 days. The rule is recorded per line. A document is matched once across all of a client's statements. Lines nothing explains are Suggested, Bank only or Unexplained. Model suggestions need an API key and are never applied automatically.
- **Reconciled** needs nothing Suggested, nothing Unexplained, and every Bank only category confirmed by a person. Money-in "Sales receipts" is a proposal until a person confirms it.
- **Month board.** Every stage is derived from the data, never stored by hand. A missing statement is **Waiting** until the client has been chased, `CHASE_GRACE_DAYS` (3) have passed, and the cutoff (`MONTH_CUTOFF_DAY`, the 5th of the following month) has passed. Then it is **Blocked**. Both values are in `lib/config.ts`.
- **Approval** needs every statement proven (or totals-only with the warning acknowledged), every statement Reconciled, no open questions, and two different people (Prepared by, then Reviewed by). Missing documents do not block, but the approver must tick an acknowledgement unless each is marked "Not needed this month". The log says "Approved with N documents outstanding".
- **Snapshot and locking.** Approval stores the month's results. Screens show that snapshot, so an approved month cannot change when bills are edited or added later. Statement edits, decisions, answers, uploads and the bills used in that month are locked (Xero posting still works). Reopening needs a reason and is logged.
- **Activity log.** Every correction, acceptance, category confirmation, question, answer, chase, approval and reopening, with who and when.

## Exports and the audit pack

Exports exist only for **approved** months and are built from the snapshot.

| Ledger | What you get | Status |
|---|---|---|
| Xero | Bank statement CSV: `*Date, *Amount, Payee, Description, Reference, Cheque Number`, money out negative | Layout as I know it. Verify with a test import. Draft bill posting is untouched. |
| QuickBooks | 3 columns (Date, Description, Amount) or 4 columns (Date, Description, Credit, Debit), dates DD/MM/YYYY | Layout as I know it. Verify the date format against the QuickBooks region setting. |
| SQL Account, AutoCount, Zoho Books | Column mapping preset in `lib/export/presets.ts` | **Draft template: verify before use.** The file name contains `DRAFT-template-verify-before-use`. |
| Other | One CSV with every field | Final |

The **audit pack** is one ZIP: `reconciliation-statement.html` (open and print), `line-by-line.csv` (the rule or person behind each match), `client-questions-and-answers.csv`, `sign-off.csv`, `activity-log.csv`, the ledger CSV, and `source-statements/` with the PDFs the browser still holds. **Balance per books** is optional on the month page. If entered, the statement shows bank, books and the difference. If blank, it is titled "Bank statement review summary" with no books section. DocFlow never invents a books balance.

Statement PDFs are kept in this browser's IndexedDB only (15 MB per file, 60 MB total, with a friendly message when full). Reset wipes them, and "Remove file" on a statement deletes the PDF and keeps the figures.

## Pricing (on `/pricing`, maths in `lib/pricing.ts`)

- Firm: RM199 per month, includes 10 active clients, then RM25 per active client per month, and RM20 per client from the 51st. Each client includes 100 documents and 4 bank statements a month. Extra documents RM0.20 each.
- Year-end catch-up pack: RM150 per company, one-off.
- Business (self-serve): free up to 30 documents a month.
- Founding firm offer: first 10 firms, free for 60 days, then 50% off for 12 months.
- An active client is one that sends at least one document or statement in the month.
- Reading of the tiers: 60 active clients cost RM199 + 40 x RM25 + 10 x RM20 = RM1,399.

## What is real and what is simulated

Real: PDF reading in the browser, the balance proof, continuity, year-end views, matching rules, payee memory, the date-aware tax table, reconciliation, questions, the board, sign-off, snapshot and locking, every export and the audit pack. Amounts are integer sen in all new code.

Simulated or limited:
- All clients, suppliers, people, account numbers and amounts are invented. Aisyah Rahman and Daniel Lim are fictional staff.
- Three October statements (BlueRiver, Kenanga, Harmoni) are seeded in code, not PDFs. The three sample PDFs in `public/samples` are real PDFs generated by `scripts/make-sample-pdfs.mjs`.
- "What clients sent in earlier months" (for the missing documents chaser) is seeded history.
- WhatsApp opens a prefilled wa.me link. There is no Business API. All sending goes through `sendWhatsApp` in `lib/chase/send.ts`.
- Storage is the browser's localStorage and IndexedDB only, behind `lib/store.ts` and `lib/files.ts`. No login, no database.
- Without `ANTHROPIC_API_KEY`: document extraction returns sample data, scanned statements are refused with a clear message, and model match suggestions are off. With a key those paths are live. They could not be tested without a key. The validation of the model's matches (exact sums in sen) is tested.
- The landing page screenshots are real screens of the demo with sample data. They are static images, so retake them if the screens change a lot.

The "Demo: sample data" badge shows on every app screen while the app runs on seeded data or demo extraction. It is not shown on the public landing and pricing pages.

## Privacy rules built in

- Only the last 4 digits of an account number are shown or stored. File names with long numbers are masked before saving.
- Online banking logins are never requested or stored. A PDF password is the only credential, kept in memory.

## Draft translations that need a native speaker

All client-facing wording is in one file: `lib/chase/templates.ts`. The screen shows a draft warning until `draft` is set to false.
- **Bahasa Malaysia (ms):** the single question, the numbered list, the closing line, the missing-documents message, the document names (Resit atau invois sewa, Bil utiliti, Bil telefon dan internet, Penyata bank) and the month names.
- **Mandarin (zh, Simplified Chinese):** the same set (租金收据或发票, 水电费账单, 电话和网络账单, 银行对账单) and the month format (2026年10月). Say if you want Traditional Chinese.

## Open items that need your input

1. **Contact details** are in `lib/site-config.ts`. The email is `alisyed@koralbyte.com`. `whatsappNumber` is empty on purpose, so every WhatsApp contact button on the public pages is hidden. Set it (digits only, starting with 60) and the buttons appear. The product name is `SITE.name` there too, and every screen reads it from that one line.
2. **SST rates and effective dates** in `lib/tax.ts` are best recollection, marked TODO. Verify every rate and date, including which services are taxed at 6% versus 8%. Bank charges are proposed at no tax, which also needs checking.
3. **Vendor templates to finalise the three draft ledgers.** For each, the sample import file or template from the vendor's own import screen, with a filled example row:
   - **SQL Account:** the import template for bank or cash book transactions (or the payment voucher and official receipt import), with the exact account code and tax code format.
   - **AutoCount:** the import template for bank transactions or the cash book entry (or payment voucher and official receipt import), with its tax code and account number format.
   - **Zoho Books:** the bank statement import sample CSV from Banking, Import statement, and how it expects categories and tax names (if it imports them).
4. **Verify the two layouts I used:** the Xero statement CSV columns, and the QuickBooks 3 and 4 column layouts with DD/MM/YYYY dates.
5. **Translations:** the Bahasa Malaysia and Mandarin drafts above.
6. **Pricing review.** Check the tier reading (clients 11 to 50 at RM25, 51 and up at RM20), the founding offer wording, and that taxes are excluded. The calculator also shows the founding price after the free 60 days.
7. **More real statements.** The parser was checked against one real digital layout (a single signed amount column with a running balance). Other banks may need tuning. Send redacted samples.
8. **Recurring documents** (`RECURRING_CATEGORIES` in `lib/config.ts`): Rent, Utilities, Telephone and internet, plus Bank statement, when seen in 2 of the previous 3 months. Tell me if you want different categories or rules.
9. **Money-in lines** that name an invoice are proposed as "Sales receipts" and always need a person to confirm.
10. **Business mode** approves in one step ("Mark month done" by You).
11. **Live API paths** (scanned statements, model match suggestions, real extraction) need a key and a test with real documents before you rely on them.
12. **Xero.** The draft bill posting code was not changed in this work. Re-test it once on the preview with your Xero app credentials.
13. **Hosting.** The preview needs no environment variables for the demo. Add `ANTHROPIC_API_KEY` and the Xero variables only when you want the live paths.
