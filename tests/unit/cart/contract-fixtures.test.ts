import { describe, expect, it } from "vitest";
import scenarios from "../../../docs/contracts/fixtures/cart-scenarios.json";
import { addCartLineSchema, cartResolutionSchema } from "../../../src/lib/validations/cart";
import { cartReducer, getCheckoutReadiness, initialCartState } from "../../../src/features/cart/domain";
import { menu } from "./fixtures";

describe("shared Gemini cart scenarios", () => {
  it("validates both R01 modes and all selections; readiness respects unverified table", () => {
    for (const input of Object.values(scenarios.selections)) expect(addCartLineSchema.safeParse(input).success).toBe(true);
    for (const [name, context] of Object.entries(scenarios.contexts)) {
      const resolution = cartResolutionSchema.parse(context.resolution);
      let state = { ...initialCartState(), hydrated: true };
      state = cartReducer(state, { type: "resolution", qrCode: context.qrCode, resolution });
      state = cartReducer(state, { type: "menu", menu: menu() });
      state = cartReducer(state, { type: "add", input: scenarios.selections.normal });
      expect(getCheckoutReadiness(state).status).toBe(name === "dineInUnverified" ? "verify_table_session" : "ready_to_review");
      expect(cartReducer(state, { type: "add", input: scenarios.selections.soldOut }).lastIssue?.code).toBe("ITEM_UNAVAILABLE");
      state = cartReducer(state, { type: "add", input: scenarios.selections.noteA });
      state = cartReducer(state, { type: "add", input: scenarios.selections.noteB });
      expect(state.lines).toHaveLength(3);
    }
  });
  it("menu change scenarios preserve intent and block unavailable options and changed prices", () => {
    const context = scenarios.contexts.takeaway;
    let state = cartReducer({ ...initialCartState(), hydrated: true }, { type: "resolution", qrCode: context.qrCode, resolution: context.resolution });
    state = cartReducer(state, { type: "menu", menu: menu() });
    state = cartReducer(state, { type: "add", input: scenarios.selections.withOption });
    const changed = menu(), change = scenarios.menuChanges;
    changed.menuRevision = change.menuRevision;
    const item = changed.items.find(row => row.id === change.itemId)!;
    item.priceVnd = change.priceVnd;
    const repriced = cartReducer(state, { type: "menu", menu: changed });
    expect(getCheckoutReadiness(repriced).status).toBe("cart_invalid");
    expect(repriced.lines).toEqual(state.lines);
    item.options = item.options.filter(option => option.id !== change.removedOptionId);
    const removed = cartReducer(state, { type: "menu", menu: changed });
    expect(getCheckoutReadiness(removed).issues.some(issue => issue.code === "INVALID_OPTION")).toBe(true);
    expect(cartReducer(removed, { type: "confirm_review" }).lastIssue?.code).toBe("INVALID_OPTION");
  });
});
