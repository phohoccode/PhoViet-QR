// Cleanup helper for UUID-scoped loopback fixtures only. Keys contain no PIN.
export function pinRateKeys(qrIds, browserHashes, ipHashes = []) {
  return qrIds.flatMap(id => [
    `pin-table-burst:${id}`, `pin-table-minute:${id}`,
    ...browserHashes.map(hash => `pin-device-burst:${hash}:${id}`),
    ...ipHashes.flatMap(hash => [`pin-ip-burst:${hash}:${id}`, `pin-ip-minute:${hash}:${id}`]),
  ]);
}
