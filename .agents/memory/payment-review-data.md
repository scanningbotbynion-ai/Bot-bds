---
name: Payment review data
description: The paid-access review flow uses a registered email and Payment ID, not login credentials.
---

For Chinese Auto Bot payment review, collect the registered email and Payment ID after explicit consent. The user chose to run a second Telegram bot alongside the first for payment review; send it only the email and Payment ID, and let either bot's Right/Wrong buttons resolve the same request. Keep access PINs out of the database; the existing primary-bot PIN review remains temporary and must be redacted after decision or expiry. Never request or forward account passwords or verification codes from email, SMS, or another service.

**Why:** The owner clarified that the form uses a Payment ID, chose a second bot for the same payment-review workflow, limited the new bot's data to email and Payment ID, and said the access PIN does not need to be stored.

**How to apply:** Keep the payment form limited to email and Payment ID with explicit consent. For dual-bot payment reviews, persist each message's bot identity so both bots' messages can be updated and redacted correctly; keep key-management commands on the primary bot. Preserve the existing PIN review only as a temporary, consented primary-bot flow until the user decides whether to remove or replace that second step. Never forward third-party login/verification codes or passwords.
