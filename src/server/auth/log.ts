import "server-only";

const events = {
  "auth.login_rejected": "warn",
  "auth.membership_denied": "warn",
  "auth.provider_unavailable": "error",
  "auth.membership_unavailable": "error",
  "auth.login_failed": "error",
  "auth.logout_failed": "error",
  "auth.guard_failed": "error",
  "auth.refresh_failed": "error",
  "auth.cookie_write_failed": "error",
  "auth.unexpected_failure": "error",
} as const;

export type AuthLogEvent = keyof typeof events;

/** Fixed event names only: never accept an Error, request, identity or metadata. */
export function logAuthEvent(input: AuthLogEvent): void {
  const event = Object.hasOwn(events, input) ? input : "auth.unexpected_failure";
  const level = events[event];
  console[level](JSON.stringify({ level, event }));
}
