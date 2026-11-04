---
name: Telegram polling deployment
description: Deployment choice and failure mode for the app's Telegram long-polling service.
---

Use a Reserved VM for the Telegram long-polling API instead of autoscale.

**Why:** Production logs showed the autoscaled process being terminated while polling and a duplicate `getUpdates` conflict for the secondary bot.

**How to apply:** Change the deployment type in Publishing settings and publish again; changing project code does not change the deployment type.

Run only the primary Telegram bot as an active poller. Keep any retired secondary token strictly for redacting old review messages; do not poll it or send new notices through it.

**Why:** The owner wants a single Telegram admin board, and the secondary poller caused `getUpdates` conflicts.

**How to apply:** Keep bot initialization, polling, new payment/PIN notifications, callbacks, and admin commands on the primary token.

For review-button callbacks, start acknowledgments for every callback in a received update batch before serially processing other updates. Preserve in-order offset commits, but do not hold the poll loop open for outbound command replies or Telegram message redaction, including expired reviews.

**Why:** Production callback acknowledgments expired when they waited behind database work and other queued updates; message cleanup also delayed later callbacks.

**How to apply:** When changing Telegram polling or review handling, prioritize callback receipt and decision persistence. Keep outbound replies ordered but independent of polling, and keep redaction asynchronous and independently logged.

Review buttons can be delivered with the initial notice only after the request exists. Reconcile notices after recording all delivery pointers, because a quick admin can decide before delivery to other admins finishes.

**Why:** Removing the separate button-activation request avoids a second Telegram network failure point, but makes early decisions possible while notices are still being delivered. Those late notices must not retain submitted details or actionable stale buttons.

**How to apply:** Preserve atomic, first-decision-wins semantics, include the clicked message in immediate cleanup, and reconcile late deliveries against the saved outcome without blocking the submit response.
