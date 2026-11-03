---
name: Payment review data
description: The paid-access review flow uses a registered email and Payment ID, not login credentials.
---

For Chinese Auto Bot payment review, collect only the registered email and Payment ID. Never request or forward account passwords, Gmail passwords, one-time codes, or security codes. Send the email and Payment ID to authorized Telegram admins only after the user consents. “Right” approves the next step; “Wrong” rejects it.

**Why:** The owner clarified that the field previously described as a password is a Payment ID used to review paid access.

**How to apply:** Keep the form, Telegram notification, and Terms disclosure limited to email and Payment ID. Do not turn this flow into credential or code collection.
