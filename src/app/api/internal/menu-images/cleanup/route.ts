import type { NextRequest } from "next/server";
import { apiSuccess, apiFailure, noQuery } from "@/server/security/api";
import { verifyReconcileSecret } from "@/server/payments/service";
import { cleanupMenuImages } from "@/server/menu/storage";
import { createHash, timingSafeEqual } from "node:crypto";
import { ApiFault } from "@/server/security/api";
export const runtime = "nodejs";
export const maxDuration = 60;
/** Vercel Cron uses GET with CRON_SECRET. Manual POST keeps the existing
 * internal-job authentication convention. Neither path is public. */
export async function GET(request: NextRequest) {
  try {
    noQuery(request);
    const secret = process.env.CRON_SECRET;
    if (!secret || secret.length < 32 || !timingSafeEqual(createHash("sha256").update(request.headers.get("authorization") ?? "").digest(), createHash("sha256").update(`Bearer ${secret}`).digest())) throw new ApiFault("UNAUTHORIZED");
    let removed = 0, pending = 0;
    for (let batch = 0; batch < 3; batch++) {
      const result = await cleanupMenuImages(); removed += result.removed; pending += result.pending;
      if (result.removed + result.pending < 10) break;
    }
    return apiSuccess({ removed, pending });
  } catch (error) { return apiFailure(error); }
}
export async function POST(request: NextRequest) {
  try {
    noQuery(request); verifyReconcileSecret(request);
    return apiSuccess(await cleanupMenuImages());
  } catch (error) { return apiFailure(error); }
}
