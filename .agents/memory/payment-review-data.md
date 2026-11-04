---
name: Payment review data
description: The paid-access review flow uses a registered email and Payment ID, not login credentials.
---

For Chinese Auto Bot, use one primary Telegram bot for all new payment and app-issued PIN notices, Right/Wrong decisions, and access-key commands. Keep access PINs out of the database and redact them after decision or expiry. The old secondary token is for redacting previously sent duplicate review messages only; never poll it or use it for new notifications. Collect the registered email and Payment ID only after explicit consent. Never request or forward passwords or verification codes from email, SMS, or another service.

**Why:** The owner wants one Telegram bot as the sole admin board. The secondary poller had a duplicate `getUpdates` conflict. Payment review uses a Payment ID, and app-issued access PINs must not be stored.

**How to apply:** Send new notices and process callbacks through the primary bot only. Keep legacy bot identity on old message pointers so resolved reviews can redact both copies. Preserve consent for the app-issued PIN review; never forward third-party login or verification codes or passwords.

The owner uses “PASWD” to mean payment ID, not a password.

**Why:** The owner explicitly clarified this meaning, but subsequently requested removing the Payment ID clarification. That bare label would make the Telegram-forwarded field look like a password request.

**How to apply:** Treat the field as a payment/transaction identifier, not a password. Keep its meaning explicit to users and do not disguise credential collection behind this abbreviation.
