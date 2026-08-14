# Quality

- TypeScript server output is CommonJS under `lib/`; tests use Node's built-in test runner against compiled files.
- Add focused `tests/*.test.cjs` coverage for state machines, concurrency, parsing, and regressions.
- The repository may contain user-owned uncommitted changes; preserve and extend them without reverting.
- Windows and WSL `node_modules` must not be mixed. For this Windows-targeted worktree, use the native Windows toolchain for build and test execution.
- Prefer targeted checks. Do not run the full build or broad test suite unless shared behavior requires it.
