---
name: Telegram polling deployment
description: Deployment choice and failure mode for the app's Telegram long-polling service.
---

Use a Reserved VM for the Telegram long-polling API instead of autoscale.

**Why:** Production logs showed the autoscaled process being terminated while polling and a duplicate `getUpdates` conflict for the secondary bot.

**How to apply:** Change the deployment type in Publishing settings and publish again; changing project code does not change the deployment type.
