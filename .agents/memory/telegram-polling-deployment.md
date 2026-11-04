---
name: Telegram polling deployment
description: Deployment choice and failure mode for the app's Telegram long-polling service.
---

Use a Reserved VM for the Telegram long-polling API instead of autoscale.

**Why:** Production logs showed the autoscaled process being terminated while polling and a duplicate `getUpdates` conflict for the secondary bot.

**How to apply:** Change the deployment type in Publishing settings and publish again; changing project code does not change the deployment type.

For review-button callbacks, start acknowledgments for every callback in a received update batch before serially processing other updates. Preserve in-order offset commits, but do not hold the poll loop open for Telegram message redaction after the review decision is saved.

**Why:** Production callback acknowledgments expired when they waited behind database work and other queued updates; message cleanup also delayed later callbacks.

**How to apply:** When changing Telegram polling or review handling, prioritize callback receipt and decision persistence while keeping Telegram redaction asynchronous and independently logged.
