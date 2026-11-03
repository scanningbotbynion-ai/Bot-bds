---
name: Payment review data
description: The paid-access review flow uses a registered email and Payment ID, not login credentials.
---

For Chinese Auto Bot payment review, collect the registered email and Payment ID. The owner issues an app-specific access PIN to paying users; users may submit that PIN for Telegram admin review after an explicit disclosure and consent. “Right” approves the next step; “Wrong” rejects it. Never request or forward account passwords, Gmail passwords, or verification codes from email, SMS, or another service.

**Why:** The owner clarified that the form uses a Payment ID instead of a password, and that the six-digit PIN is an access code they issue to paid users.

**How to apply:** Keep the payment form limited to email and Payment ID. Only send the owner-issued bot access PIN to Telegram after clear consent; never forward third-party login or verification codes.
