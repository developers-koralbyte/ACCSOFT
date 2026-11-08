# DocFlow (working name)

AI document intake for small Malaysian bookkeeping firms. Clients send receipts and invoices, the app reads and codes them, the accountant approves in one click, and the bill lands in Xero as a draft.

## What works today

- Clients screen: who still owes documents this month, with a one click WhatsApp reminder (opens WhatsApp with the message prefilled, no WhatsApp API needed).
- Add documents: drop PDFs or photos, each is read and sent to the review queue.
- Review queue: supplier, invoice number, date, amounts, account and tax code are all editable. Warnings appear for mismatched totals, missing invoice numbers, duplicates and low confidence.
- Approve and post: creates a DRAFT bill in Xero (never an approved one), so the accountant keeps final control.
- My business mode (top right toggle): for SMEs who do their own accounting. Same reading and review, but approving just files the document, with a dashboard and CSV export for the accountant. Firm and business modes keep separate demo data.
- Import WhatsApp chat: upload a chat export (.zip with media). Photos and PDFs are found, matched to who sent them and when, filtered by month, skipped if already imported, and read in batches of 40.
- Demo mode: with no keys at all, everything runs on sample data so you can click through the whole flow.

## Run it

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000.

## Turn on real extraction

Add your key to `.env.local`:

```
ANTHROPIC_API_KEY=your_key_here
```

Documents are then read by Claude instead of returning sample data.

## Connect Xero

1. Create an app at https://developer.xero.com/app/manage (choose "Web app").
2. Set the redirect URI to `http://localhost:3000/api/xero/callback` (add your Vercel URL later).
3. Put the client id and secret in `.env.local`:

```
XERO_CLIENT_ID=...
XERO_CLIENT_SECRET=...
XERO_REDIRECT_URI=http://localhost:3000/api/xero/callback
```

4. Restart, then click "Connect Xero" in the top bar and authorise the Xero demo company first.

## Before real client data goes in

These are deliberate shortcuts to get a working MVP. Fix them before any real client documents are used:

1. Storage is the browser's localStorage. Move clients and bills to a database such as Postgres on Vercel.
2. The Xero session is held in an httpOnly cookie. Move tokens to the database and add proper user login for firm staff.
3. Tax codes map to a generic Xero input tax type. Match them to each client organisation's actual Malaysian tax rates (SST) before posting.
4. Account names are suggestions only. Map them to each client's real chart of accounts through the Xero accounts endpoint.
5. Add a data protection review. Client invoices contain personal and commercial information, so cover PDPA obligations and your engagement letters.

## Notes

- Hosting limit: Vercel rejects request bodies over about 4.5 MB. Phone photos are shrunk in the browser before upload and the server refuses files over 4 MB.
- WhatsApp chat export dates are read as day/month/year.

## Next features

1. WhatsApp Business API intake so client messages arrive in the queue automatically.
2. Bank statement reconciliation.
3. Bahasa Malaysia and Indonesian document testing with a real sample set.
4. QuickBooks and Zoho Books connectors.
