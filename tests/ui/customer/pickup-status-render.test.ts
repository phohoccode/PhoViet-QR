import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { TakeawayPickupCard } from "../../../src/components/customer/order/TakeawayPickupCard";

it("ready missing code renders a recoverable message once loading ends; completed never displays the old code", () => {
  const render = (extra: Partial<React.ComponentProps<typeof TakeawayPickupCard>>) => renderToStaticMarkup(React.createElement(TakeawayPickupCard, { ticketNo: 6, orderStatus: "ready", pickupCode: null, ...extra }));
  expect(render({ isLoadingPickup: true })).toContain("Đang chuẩn bị mã nhận món");
  const failed = render({ isLoadingPickup: false, pickupMessage: "Chưa tải được mã. Bấm Làm mới." });
  expect(failed).toContain("Chưa tải được mã. Bấm Làm mới.");
  expect(failed).not.toContain("Đang chuẩn bị mã nhận món");
  expect(render({ pickupCode: "000042" })).toContain("000 042");
  expect(render({ orderStatus: "completed", pickupCode: "000042" })).not.toContain("000 042");
});
