import type { Context, Session } from "koishi";

const FORCE_EXECUTION_AUTHORITY = 5;

export function hasForceExecutionAuthority(ctx: Context, session: Session) {
  return ctx.permissions.test([`authority:${FORCE_EXECUTION_AUTHORITY}`], session);
}
