// Covers Next dev/start and hosted Node workers, not only npm prestart.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { validatePinConfiguration } = await import("./server/table-sessions/pin-crypto");
    validatePinConfiguration();
  }
}
