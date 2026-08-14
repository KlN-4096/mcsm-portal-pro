import type { Context, Session } from "koishi";

const FORCE_EXECUTION_AUTHORITY = 5;

export function hasForceExecutionAuthority(ctx: Context, session: Session) {
  return ctx.permissions.test([`authority:${FORCE_EXECUTION_AUTHORITY}`], session);
}

export function parseForceInput(input: string) {
  let value = input.trim();
  let force = false;
  if (value === "-f") return { input: undefined, force: true };
  if (value.startsWith("-f ")) {
    value = value.slice(3).trimStart();
    force = true;
  }
  if (value.endsWith(" -f")) {
    value = value.slice(0, -3).trimEnd();
    force = true;
  }
  return { input: value || undefined, force };
}
