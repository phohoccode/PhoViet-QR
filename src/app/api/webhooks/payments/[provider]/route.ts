import { withApiTrace } from "@/server/security/trace";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiFault, noQuery, readJson } from "@/server/security/api";
import { orderFailure } from "@/server/orders/database";
import { receivePayosWebhook } from "@/server/payments/service";
export const runtime = "nodejs";
export async function POST(request: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  return withApiTrace(request, async () => {
    try {
      noQuery(request);
      if ((await params).provider !== "payos") throw new ApiFault("RESOURCE_NOT_FOUND");
      await receivePayosWebhook(await readJson(request, z.unknown()));
      return NextResponse.json({ code: "00", desc: "success" }, { headers: { "Cache-Control": "no-store" } });
    } catch (error) { return orderFailure(error); }
  });
}
