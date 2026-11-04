---
name: Review integration isolation
description: Keep shared-review regression checks isolated while exercising frontend and API behavior together.
---

Shared-review regression checks must exercise the Preview boundary with synthetic
upstream state, never the published API, real payment details, or Telegram.

**Why:** The assigned regression work explicitly prohibited live payments and
Telegram messages, and requires demonstrating that Preview does not handle
production decisions locally.

**How to apply:** Install network guards before importing modules that capture
transport dependencies. When combining virtual polling/countdown intervals with
real HTTP, assertion retries must stay on the real event loop; otherwise a
correct response can arrive while assertions no longer retry. This mismatch
caused misleading failures during initial integration-test setup.
