# Structure

- `src/index.ts` creates runtime configuration, the MCSManager client, and command registrations.
- `src/commands.ts` registers root and dot commands and owns read-only portal actions.
- `src/command-execution.ts` resolves terminal-command targets and executes commands after optional voting.
- `src/command-voting.ts` owns chat vote state, presentation, cancellation, and execution delay.
- `src/client.ts` owns MCSManager HTTP access, normalization, caches, Minecraft probes, and per-instance terminal queues.
- `src/config.ts`, `src/config.locales.ts`, and `src/locales.ts` define runtime configuration and bilingual text.
- Keep user workflows in focused modules; do not add lifecycle orchestration to `src/commands.ts`.
