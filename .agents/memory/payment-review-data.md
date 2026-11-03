---
name: Payment review data
description: The paid-access review flow uses a registered email and Payment ID, not login credentials.
---

For Chinese Auto Bot payment review, collect the registered email and Payment ID after explicit consent. A six-digit app-issued access PIN may be sent to authorized Telegram admins only after the first-page checkbox clearly includes this and the user explicitly consents. Never request or forward account passwords, Gmail passwords, or verification codes from email, SMS, or another service.

**Why:** The owner clarified that the form uses a Payment ID instead of a password, that the six-digit PIN is app-issued, approved Telegram PIN review with disclosure and consent, moved that consent to the first form page, and chose immediate continuation after PIN submission rather than waiting for admin review.

**How to apply:** Keep the payment form limited to email and Payment ID. Collect unchecked-by-default consent on the first form page for sharing an app-issued PIN, then carry that consent through the current browser session without repeating the notice on the PIN page. After Telegram accepts the PIN notification, continue immediately without waiting for an admin decision; Right/Wrong does not gate navigation. Never forward third-party login/verification codes or passwords. Avoid persisting the raw PIN and redact the Telegram review message after the decision or expiry.
