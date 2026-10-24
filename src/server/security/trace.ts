import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

const context = new AsyncLocalStorage<{ correlationId: string }>();
// Deliberately accepts no arbitrary fields, request headers, provider errors or bodies.
export function traceEvent(event: "api.internal_failure" | "payment.provision_pending" | "pickup.recovery_pending") {
  const entry = JSON.stringify({ event, correlationId: context.getStore()?.correlationId ?? randomUUID() });
  if (event === "api.internal_failure") console.error(entry);
  else console.warn(entry);
}
export async function withApiTrace<T extends Response>(request: Request, action: () => Promise<T>): Promise<T> {
  // Never trust or reflect an inbound X-Request-Id (may contain secrets or log injection).
  const correlationId = randomUUID(), started = performance.now();
  return context.run({ correlationId }, async () => {
    const response = await action();
    response.headers.set("X-Request-Id", correlationId);
    console.info(JSON.stringify({ event: "api.request", correlationId, method: request.method,
      status: response.status, durationMs: Math.round(performance.now() - started) }));
    return response;
  });
}
