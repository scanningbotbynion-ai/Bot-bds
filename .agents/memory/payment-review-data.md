---
name: Payment review data
description: The paid-access review flow uses a registered email and Payment ID, not login credentials.
---

For Chinese Auto Bot payment review, collect the registered email and Payment ID after explicit consent. A six-digit app-issued access PIN may be sent to authorized Telegram admins only after the PIN page clearly discloses this and the user explicitly consents. Never request or forward account passwords, Gmail passwords, or verification codes from email, SMS, or another service.

**Why:** The owner clarified that the form uses a Payment ID instead of a password, that the six-digit PIN is an app-issued access code, and explicitly approved Telegram PIN review with disclosure and consent.

**How to apply:** Keep the payment form limited to email and Payment ID. Require an unchecked-by-default consent before forwarding an app-issued PIN; never forward third-party login/verification codes or passwords. Avoid persisting the raw PIN and redact the Telegram review message after the decision or expiry.
