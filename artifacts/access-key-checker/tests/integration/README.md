# Shared preview review regression check

From the workspace root:

```sh
pnpm test:review-integration
```

The same check is registered as `review-integration` for task validation.
It does not require a running workflow, database, Telegram credentials, or the
published API. It starts a private Express listener on an ephemeral loopback port
and closes it afterward. No live payments or Telegram messages are created.

The suite renders the real `App.tsx` in jsdom and uses its generated API hooks,
the real API app/middleware/router ordering, shared-review proxy, and callback
decision dispatcher. Only the upstream service/store, local database and logging
are replaced. The upstream fixture retains review IDs/types/statuses, not PINs.
Local database calls and unexpected fetch destinations fail the suite.

Coverage includes payment and PIN submission, original upstream request IDs,
pending polling, Right/Wrong decisions, routing and visible errors, submission
rate limits/outages, polling interruption/recovery without duplicate submission,
disabled preview polling (including an accidental enable flag), and the
unchanged 30-second countdown. Browser storage writes are checked for synthetic
PIN leakage. No real PINs should ever be added to fixtures or output.

Intervals and the clock are virtual for fast countdown/poll tests; HTTP and
assertion retries use the real event loop. Query retry backoff is disabled only
in the test client to check error rendering promptly. Each test clears the app's
query cache and browser storage. This is an integration/DOM check, not a live
production or real-browser smoke test.
