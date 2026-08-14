# Development Journal

## 2026-08-14 - Start without a stopped-instance address

- Allowed a stopped instance with no reported address to enter the start workflow.
- Refreshed the instance before every readiness Ping so an address exposed after startup is used.
- Kept version 0.0.35 from the existing version-bump commit.

## 2026-08-14 - Trailing force flag

- Accepted `-f` at either edge of terminal command input so `rc exec list -f` bypasses voting as intended.
- Kept middle `-f` tokens as part of the Minecraft command.

## 2026-08-14 - Force execution and vote cancellation

- Added authority-5-only `-f` execution for terminal and lifecycle commands; it skips voting/delay but preserves validation and instance locking.
- Allowed a vote initiator to reject their own active vote after automatic approval.
- Reworded cross-chat lock conflicts to distinguish an active operation from the instance's reported lifecycle status.

## 2026-08-14 - QQ button vote parsing

- Accepted QQ official button messages whose confirmed at-self content remains `@bot-name decision`.
- Kept ordinary visible mentions invalid unless Koishi reports `stripped.atSelf`; added both regression cases.

## 2026-08-14 - Lifecycle command routing

- Moved lifecycle entry points from `rc <action>` to native `server <action>` / `server.<action>` subcommands.
- Kept lifecycle selection, voting, locking, and completion behavior unchanged; bumped the package to 0.0.33.

## 2026-08-14 - Instance lifecycle voting

- Added configurable `start`, `stop`, `restart`, and kill-then-start commands with fresh selection and state revalidation.
- Added per-instance locking shared with terminal execution, optional existing voting/delay, and a five-minute total deadline.
- Completion uses stopped status or Minecraft Ping; ambiguous network/5xx responses are monitored without API retries.
- Windows TypeScript compilation and 25 targeted voting/lifecycle tests pass; no commit was created.

## 2026-08-14

- Initialized minimal project memory from the current command, client, configuration, and test structure.
- Current task: add voted instance start/stop/restart/kill operations with per-instance locking and completion detection.
- Existing uncommitted voting-delay changes are user-owned and must be preserved.
