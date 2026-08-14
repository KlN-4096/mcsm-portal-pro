# Client And Errors

- All panel requests go through `MCSManagerClient.request()` so API-key injection, sanitised debug logging, timeout handling, and response unwrapping stay consistent.
- MCSManager instance status is normalized to `running`, `stopped`, `starting`, `stopping`, or `unknown` in `src/client.ts`.
- Cached instance discovery is suitable for display, not for operation completion checks; control flows must request fresh state.
- Mutating instance work acquires the client's per-node/per-instance operation lock before voting and releases it only after cancellation, failure, timeout, or completion.
- Force execution accepts an edge `-f` before or after terminal input, requires Koishi authority 5, skips voting and its delay, but still performs selection, state validation, and instance locking.
- Lifecycle completion uses fresh MCSManager status for `stopped` and Minecraft Server List Ping for readiness; `restart` must observe an interruption before accepting Ping recovery.
- A lifecycle deadline is shared by every API, status, and Ping phase. Ambiguous network/5xx responses are polled without repeating the mutating API.
- User-facing failures are localized through the command message scope; technical details are logged with `mcsm-portal-pro`.
- Never log or embed `connection.apiKey` outside the sanitized request path.
