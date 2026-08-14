# Voting

- Vote input is scoped to the originating group and each user is counted at most once.
- Plain vote commands must match the configured command plus a supported decision word.
- Mention votes require Koishi's `stripped.atSelf`; never infer a bot mention from display text alone.
- QQ official button input may leave `@bot-name decision` in `stripped.content` even when `atSelf` is true, so strip that visible prefix before parsing the decision.
- Vote result and progress message failures must not keep a settled vote or instance lock alive.
