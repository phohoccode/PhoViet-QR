import { describe, expect, it } from "vitest";
import { cartReducer, getCartView, getCheckoutReadiness, prepareOrderDraft, lineKeyFor, formatVnd, cartScopeKey } from "../../../src/features/cart/domain";
import { CART_LIMITS } from "../../../src/lib/validations/cart";
import { add, id, menu, qrCode, readyState, resolution, selection } from "./fixtures";

describe("cart intent and integer preview",()=>{
 it("merges normalized item/options/note and never exceeds max quantity",()=>{
  const opts=menu().items[0].options.map(option=>option.id);
  let state=add(readyState(),{...selection(2),optionIds:opts,note:"  Ít đá\u0000  "});
  state=add(state,{...selection(3),optionIds:[...opts].reverse(),note:"Ít đá"});
  expect(state.lines).toHaveLength(1);expect(state.lines[0].quantity).toBe(5);expect(state.lines[0].note).toBe("Ít đá");
  expect(getCartView(state).estimatedSubtotalVnd).toBe((29000+6000+3000)*5);
  expect(add(state,{...selection(95),optionIds:opts,note:"Ít đá"}).lastIssue?.code).toBe("QUANTITY_INVALID");
  expect(add(state,{...selection(95),optionIds:opts,note:"Ít đá"}).lines[0].quantity).toBe(5);
 });
 it("keeps different notes/options distinct; edit merges by stable key, not names or prices",()=>{
  let state=add(readyState());state=add(state,{...selection(),note:"Ít đá"});state=add(state,{...selection(),optionIds:[menu().items[0].options[0].id]});
  expect(state.lines).toHaveLength(3);const oldKey=state.lines[1].lineKey;
  state=cartReducer(state,{type:"note",lineKey:oldKey,note:"  "});expect(state.lines).toHaveLength(2);expect(state.lines[0].quantity).toBe(2);
  const otherKey=state.lines[1].lineKey;state=cartReducer(state,{type:"options",lineKey:otherKey,optionIds:[]});
  expect(state.lines).toHaveLength(1);expect(state.lines[0].quantity).toBe(3);expect(state.lines[0].lineKey).toBe(lineKeyFor(selection()));
 });
 it("edits quantity/note/options, removes and clears with correct integer totals",()=>{
  let state=add(readyState());state=cartReducer(state,{type:"quantity",lineKey:state.lines[0].lineKey,quantity:2});
  state=cartReducer(state,{type:"options",lineKey:state.lines[0].lineKey,optionIds:[menu().items[0].options[0].id]});
  expect(getCartView(state).estimatedSubtotalVnd).toBe(70000);
  state=cartReducer(state,{type:"note",lineKey:state.lines[0].lineKey,note:"  <b>Ít đá</b>\n  "});expect(state.lines[0].note).toBe("<b>Ít đá</b>");
  state=cartReducer(state,{type:"remove",lineKey:state.lines[0].lineKey});expect(getCartView(state)).toMatchObject({isEmpty:true,itemCount:0,estimatedSubtotalVnd:0});
  state=cartReducer(add(state),{type:"clear"});expect(state.lines).toEqual([]);
 });
 it("rejects unavailable/hidden/missing items, foreign/unavailable/repeated options, unsafe input",()=>{
  const base=readyState();
  for(const quantity of [NaN,Infinity,0,-1,1.5,100])expect(add(base,{...selection(),quantity}).lastIssue?.code).toBe("QUANTITY_INVALID");
  expect(add(base,{...selection(),menuItemId:menu().items[1].id}).lastIssue?.code).toBe("ITEM_UNAVAILABLE");
  expect(add(base,{...selection(),menuItemId:id(500)}).lastIssue?.code).toBe("ITEM_NOT_FOUND");
  expect(add(base,{...selection(),optionIds:[id(600)]}).lastIssue?.code).toBe("INVALID_OPTION");
  const option=menu().items[0].options[0].id;
  expect(add(base,{...selection(),optionIds:[option,option]}).lastIssue?.code).toBe("INVALID_OPTION");
  expect(add(base,{...selection(),note:"x".repeat(501)}).lastIssue?.code).toBe("NOTE_TOO_LONG");
  expect(add(base,{...selection(),priceVnd:1}).lastIssue?.code).toBe("INVALID_INPUT");
  expect(add(base,{...selection(),previewTotalVnd:1}).lastIssue?.code).toBe("INVALID_INPUT");
 });
 it("enforces max lines, safe integer unit/sum/multiply and supports zero prices",()=>{
  let state=readyState();for(let n=0;n<CART_LIMITS.maxLines;n++)state=add(state,{...selection(),note:String(n)});
  expect(state.lines).toHaveLength(100);expect(add(state,{...selection(),note:"overflow"}).lastIssue?.code).toBe("CART_LIMIT_EXCEEDED");
  const huge=menu();huge.items[0].priceVnd=Number.MAX_SAFE_INTEGER;
  const base=cartReducer(readyState(),{type:"menu",menu:huge});
  expect(add(base,selection(2)).lastIssue?.code).toBe("CART_TOTAL_OVERFLOW");
  expect(add(base,{...selection(),optionIds:[huge.items[0].options[0].id]}).lastIssue?.code).toBe("CART_TOTAL_OVERFLOW");
  const single=add(base);expect(add(single,{...selection(),note:"other"}).lastIssue?.code).toBe("CART_TOTAL_OVERFLOW");
  expect(getCartView(add(readyState(),{...selection(),menuItemId:menu().items[3].id})).estimatedSubtotalVnd).toBe(0);
  expect(()=>formatVnd(1.5)).toThrow();expect(formatVnd(29000)).toContain("29.000");
 });
});

describe("menu reconciliation and review gates",()=>{
 it("price/revision change keeps lines/old preview, exposes proposed price and waits for explicit review",()=>{
  let state=add(readyState());const updated=menu();updated.menuRevision="changed";updated.items[0].priceVnd=31000;
  state=cartReducer(state,{type:"menu",menu:updated});
  expect(state.lines).toHaveLength(1);expect(getCartView(state)).toMatchObject({requiresReview:true,estimatedSubtotalVnd:29000});
  expect(getCartView(state).lines[0].proposedUnitPriceVnd).toBe(31000);expect(getCheckoutReadiness(state).status).toBe("cart_invalid");
  state=cartReducer(state,{type:"confirm_review"});expect(getCartView(state).estimatedSubtotalVnd).toBe(31000);expect(getCheckoutReadiness(state).status).toBe("ready_to_review");
 });
 it("removed/sold out option or item blocks confirmation without deleting or substituting",()=>{
  const original=add(readyState(),{...selection(),optionIds:[menu().items[0].options[0].id]});
  for(const change of ["option","soldout","hidden"]){const updated=menu();updated.menuRevision="changed";
   if(change==="option")updated.items[0].options=[];if(change==="soldout")updated.items[0].available=false;if(change==="hidden")updated.items=updated.items.slice(1);
   const state=cartReducer(original,{type:"menu",menu:updated});expect(state.lines).toEqual(original.lines);
   expect(getCheckoutReadiness(state).status).toBe("cart_invalid");expect(cartReducer(state,{type:"confirm_review"}).lastIssue).not.toBeNull();
  }
 });
 it("rejects malformed or inactive owner menu and blocks freshness until valid snapshot",()=>{
  const state=add(readyState());const updated=menu();updated.items[0].options.push({...updated.items[0].options[0]});
  expect(cartReducer(state,{type:"menu",menu:updated}).menuFresh).toBe(false);
  expect(cartReducer(state,{type:"menu",menu:{...menu(),items:menu().items.map(i=>({...i,active:false}))}}).menuFresh).toBe(false);
  expect(cartReducer(state,{type:"menu",menu:{items:[]}}).lastIssue?.code).toBe("MENU_INVALID");
 });
 it("refresh needed/offline leaves RAM intact and never calls order or creates submission IDs",()=>{
  const state=add(readyState());for(const action of [{type:"stale"},{type:"online",online:false}] as const){const next=cartReducer(state,action);expect(next.lines).toEqual(state.lines);expect(getCheckoutReadiness(next).status).toBe("menu_refresh_needed");expect(prepareOrderDraft(next).ok).toBe(false);}
 });
});

describe("QR context and draft readiness",()=>{
 it("dine-in requires server resolution; takeaway only reaches review, not payment/order success",()=>{
  let state=add(readyState("dine_in"));expect(getCheckoutReadiness(state).status).toBe("verify_table_session");
  state=cartReducer(state,{type:"resolution",qrCode,resolution:resolution("dine_in",true)});expect(getCheckoutReadiness(state).status).toBe("ready_to_review");
  const pending=resolution("dine_in",true);if(pending.type==="table"&&pending.session)pending.session.status="checkout_pending";
  expect(getCheckoutReadiness(cartReducer(state,{type:"resolution",qrCode,resolution:pending})).issues[0].code).toBe("SESSION_CHECKOUT_PENDING");
  expect(getCheckoutReadiness(add(readyState())).status).toBe("ready_to_review");expect(getCheckoutReadiness(readyState()).status).toBe("empty");
 });
 it("new session on same table requires confirmation; same session refresh does not",()=>{
  let state=add(readyState("dine_in",true));
  state=cartReducer(state,{type:"resolution",qrCode,resolution:resolution("dine_in",true)});expect(state.contextNeedsReview).toBe(false);
  state=cartReducer(state,{type:"resolution",qrCode,resolution:resolution("dine_in",true,id(99))});expect(state.contextNeedsReview).toBe(true);expect(state.lines).toHaveLength(1);
  expect(prepareOrderDraft(state).ok).toBe(false);state=cartReducer(state,{type:"confirm_context"});expect(state.boundSessionId).toBe(id(99));expect(getCheckoutReadiness(state).status).toBe("ready_to_review");
 });
 it("different QR/mode/store/table isolates context and cannot carry old lines",()=>{
  const state=add(readyState());const next=cartReducer(state,{type:"resolution",qrCode:"OTHER_QR",resolution:resolution("dine_in")});
  expect(next.lines).toEqual([]);expect(next.menu).toBeNull();expect(cartScopeKey(next.context!)).not.toBe(cartScopeKey(state.context!));
  const paused=resolution();paused.store.acceptingOrders=false;expect(getCheckoutReadiness(cartReducer(state,{type:"resolution",qrCode,resolution:paused})).issues[0].code).toBe("STORE_NOT_ACCEPTING_ORDERS");
 });
 it("order draft whitelists canonical IDs/revision/notes, has no price, token, session or idempotency key",()=>{
  const state=add(readyState());const draft=prepareOrderDraft(state);expect(draft.ok).toBe(true);
  if(draft.ok){expect(Object.keys(draft.value).sort()).toEqual(["items","menuRevision","note","qrCode"]);expect(Object.keys(draft.value.items[0]).sort()).toEqual(["menuItemId","note","optionIds","quantity"]);expect(JSON.stringify(draft.value)).not.toMatch(/price|total|secret|token|session|RequestId|paid|ticket/i);}
 });
 it("a previous QR-reset notice cannot permanently block reviewing the new scoped cart",()=>{
  let state=cartReducer(add(readyState()),{type:"resolution",qrCode:"NEW_COUNTER",resolution:resolution()});
  state=cartReducer(state,{type:"menu",menu:menu()});state=add(state);
  const updated=menu();updated.menuRevision="new-scope-price";updated.items[0].priceVnd=31000;
  state=cartReducer(state,{type:"menu",menu:updated});state=cartReducer(state,{type:"confirm_review"});
  expect(state.lastIssue).toBeNull();expect(getCheckoutReadiness(state).status).toBe("ready_to_review");
  expect(getCartView(state).estimatedSubtotalVnd).toBe(31000);
 });
});
