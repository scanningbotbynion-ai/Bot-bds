---
name: Payment review data
description: The paid-access review flow uses a registered email and Payment ID, not login credentials.
---

For Chinese Auto Bot payment review, collect the registered email and Payment ID after explicit consent. The owner wants payment-review notifications sent through both Telegram bots. Keep access PINs out of the database; the existing primary-bot PIN review remains temporary and must be redacted after decision or expiry. Never request or forward account passwords or verification codes from email, SMS, or another service.

**Why:** The owner clarified that the form uses a Payment ID, access PINs should not be stored, and payment-review messages should reach admins through both bots.

**How to apply:** Keep the payment form limited to email and Payment ID with explicit consent. Send review notifications and process admin callbacks through both configured bots; persist each message's bot identity so both messages can be updated and redacted after a decision. Preserve the existing PIN review only as a temporary, consented primary-bot flow until the user decides whether to remove or replace that second step. Never forward third-party login/verification codes or passwords.
