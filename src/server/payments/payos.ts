import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { PayOS } from "@payos/node";
import { z } from "zod";
import { ApiFault } from "@/server/security/api";
import type {
  PaymentGateway,
  PaymentInstructions,
  PaymentIntent,
  VerifiedPaymentEvent,
} from "./gateway";

const config = z.object({
  PAYOS_STORE_ID: z.uuid(),
  PAYOS_CLIENT_ID: z.string().trim().min(1),
  PAYOS_API_KEY: z.string().trim().min(1),
  PAYOS_CHECKSUM_KEY: z.string().trim().min(1),
  PAYOS_ACCOUNT_NUMBER: z.string().regex(/^\d{4,40}$/),
  PAYMENT_RETURN_ORIGIN: z.url().refine((value) => {
    const u = new URL(value);
    return (
      u.origin === value &&
      !u.username &&
      !u.password &&
      (u.protocol === "https:" ||
        (process.env.NODE_ENV !== "production" &&
          ["http://localhost", "http://127.0.0.1"].some((p) =>
            value.startsWith(p + ":"),
          )))
    );
  }),
});
export function paymentConfig() {
  const parsed = config.safeParse(process.env);
  if (!parsed.success) throw new ApiFault("PAYMENT_PROVIDER_UNAVAILABLE");
  return parsed.data;
}
const signedData = z
  .object({
    orderCode: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    amount: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    description: z.string().max(2000),
    accountNumber: z.string().min(1).max(100),
    reference: z.string().min(1).max(200),
    transactionDateTime: z.string().regex(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/),
    currency: z.string().min(1).max(16),
    paymentLinkId: z.string().min(1).max(128),
    code: z.string().max(16),
  })
  .passthrough();
const webhook = z.object({
  data: signedData,
  signature: z.string().regex(/^[a-f0-9]{64}$/),
  code: z.string(),
  success: z.boolean(),
});

export class PayosGateway implements PaymentGateway {
  private readonly env = paymentConfig();
  private readonly client = new PayOS({
    clientId: this.env.PAYOS_CLIENT_ID,
    apiKey: this.env.PAYOS_API_KEY,
    checksumKey: this.env.PAYOS_CHECKSUM_KEY,
    timeout: 10000,
    maxRetries: 0,
    logLevel: "off",
  });

  async createPayment(intent: PaymentIntent): Promise<PaymentInstructions> {
    // orderCode is allocated durably once. An uncertain response never gets a new reference.
    const origin = this.env.PAYMENT_RETURN_ORIGIN;
    const data = await this.client.paymentRequests.create({
      orderCode: Number(intent.reference),
      amount: intent.amountVnd,
      description: "QR ORDER",
      returnUrl: `${origin}/order/${intent.orderId}`,
      cancelUrl: `${origin}/order/${intent.orderId}`,
      expiredAt: Math.floor(Date.parse(intent.expiresAt) / 1000),
    });
    if (
      data.orderCode !== Number(intent.reference) ||
      data.amount !== intent.amountVnd ||
      data.currency !== "VND" ||
      data.accountNumber !== this.env.PAYOS_ACCOUNT_NUMBER ||
      data.status !== "PENDING"
    )
      throw new Error("Provider response mismatch");
    const url = new URL(data.checkoutUrl);
    if (
      url.protocol !== "https:" ||
      url.hostname !== "pay.payos.vn" ||
      url.port ||
      url.username ||
      url.password ||
      !data.qrCode || !/^[a-f0-9]{32}$/i.test(data.paymentLinkId)
    )
      throw new Error("Invalid provider instructions");
    return {
      paymentLinkId: data.paymentLinkId,
      accountNumber: data.accountNumber,
      checkoutUrl: url.href,
      qrPayload: data.qrCode,
    };
  }

  async verifyWebhook(body: unknown): Promise<unknown> {
    const parsed = webhook.safeParse(body);
    if (!parsed.success) throw new ApiFault("VALIDATION_ERROR");
    // The payOS protocol signs sorted data, not the raw HTTP bytes. Preserve all
    // original data keys, including optional ones, before validating the projection.
    const data = (body as { data: Record<string, unknown> }).data;
    const expected = await this.client.crypto.createSignatureFromObj(
      data,
      this.env.PAYOS_CHECKSUM_KEY,
    );
    if (
      !expected ||
      !timingSafeEqual(
        Buffer.from(expected, "hex"),
        Buffer.from(parsed.data.signature, "hex"),
      )
    )
      throw new ApiFault("UNAUTHORIZED");
    // Top-level success/code are NOT signed. Only data.code controls paid status.
    return data;
  }
  parseEvent(verified: unknown): VerifiedPaymentEvent {
    const data = signedData.parse(verified);
    if (!z.iso.datetime({ offset: true }).safeParse(data.transactionDateTime.replace(" ", "T") + "+07:00").success) throw new ApiFault("VALIDATION_ERROR");
    const occurredAt = new Date(
      data.transactionDateTime.replace(" ", "T") + "+07:00",
    );
    if (!Number.isFinite(occurredAt.getTime()))
      throw new ApiFault("VALIDATION_ERROR");
    const canonical = JSON.stringify(
      Object.fromEntries(
        Object.entries(data).sort(([a], [b]) => a.localeCompare(b)),
      ),
    );
    return {
      eventId: createHash("sha256").update(canonical).digest("hex"),
      transactionId: data.reference,
      reference: String(data.orderCode),
      paymentLinkId: data.paymentLinkId,
      accountNumber: data.accountNumber,
      amountVnd: data.amount,
      currency: data.currency,
      paid: data.code === "00",
      occurredAt: occurredAt.toISOString(),
    };
  }
  async getPaymentStatus(reference: string) {
    const data = z.object({ id: z.string().regex(/^[a-f0-9]{32}$/i), orderCode: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
      amount: z.number().int().positive().max(Number.MAX_SAFE_INTEGER), status: z.enum(["PENDING", "CANCELLED", "UNDERPAID", "PAID", "EXPIRED", "PROCESSING", "FAILED"]) })
      .parse(await this.client.paymentRequests.get(Number(reference)));
    return {
      status: data.status,
      amountVnd: data.amount,
      paymentLinkId: data.id,
      reference: String(data.orderCode),
    };
  }
}
