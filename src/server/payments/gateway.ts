import "server-only";

export type PaymentIntent = { id: string; orderId: string; reference: string; amountVnd: number; expiresAt: string };
export type PaymentInstructions = { paymentLinkId: string; checkoutUrl: string; qrPayload: string | null; accountNumber: string };
export type VerifiedPaymentEvent = {
  eventId: string; transactionId: string; reference: string; paymentLinkId: string;
  accountNumber: string; amountVnd: number; currency: string; paid: boolean; occurredAt: string;
};
export interface PaymentGateway {
  createPayment(intent: PaymentIntent): Promise<PaymentInstructions>;
  verifyWebhook(body: unknown): Promise<unknown>;
  parseEvent(verified: unknown): VerifiedPaymentEvent;
  getPaymentStatus(reference: string): Promise<{ status: string; amountVnd: number; paymentLinkId: string; reference: string }>;
}
