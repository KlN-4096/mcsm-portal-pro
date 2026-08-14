# Development Journal

## 2026-08-14 - Instance lifecycle voting

- Added configurable `start`, `stop`, `restart`, and kill-then-start commands with fresh selection and state revalidation.
- Added per-instance locking shared with terminal execution, optional existing voting/delay, and a five-minute total deadline.
- Completion uses stopped status or Minecraft Ping; ambiguous network/5xx responses are monitored without API retries.
- Windows TypeScript compilation and 25 targeted voting/lifecycle tests pass; no commit was created.

## 2026-08-14

- Initialized minimal project memory from the current command, client, configuration, and test structure.
- Current task: add voted instance start/stop/restart/kill operations with per-instance locking and completion detection.
- Existing uncommitted voting-delay changes are user-owned and must be preserved.
