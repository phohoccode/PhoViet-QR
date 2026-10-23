import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { useCart } from "../../../src/features/cart";
import { createCartStore } from "../../../src/features/cart/store";
import { serializeCart, readCart, writeCart } from "../../../src/features/cart/storage";
import { cartReducer, cartScopeKey, getCheckoutReadiness } from "../../../src/features/cart/domain";
import { CART_LIMITS } from "../../../src/lib/validations/cart";
import { add, id, menu, memoryStorage, qrCode, readyState, resolution, selection } from "./fixtures";

describe("versioned untrusted session storage",()=>{
 it("projects only allowed intent/numeric fields; never persists note PII, menu labels, auth or state",()=>{
  const state=add(readyState("dine_in",true),{...selection(),note:"My phone: 0901234567"});
  const serialized=serializeCart(state)!;
  expect(serialized).not.toContain("0901234567");expect(serialized).not.toContain("My phone");expect(serialized).not.toContain("Cà phê");
  expect(serialized).not.toMatch(/requiresSessionCode|cookie|token|secret|sessionCode|accepted|paid|ticketNo|lineKey|name/);
  expect(JSON.parse(serialized)).toMatchObject({version:1,boundSessionId:id(3),lines:[{noteOmitted:true}]});
 });
 it("malformed JSON/unknown fields/version/overflow/too many lines are rejected safely",()=>{
  const state=add(readyState()),storage=memoryStorage(),key=cartScopeKey(state.context!);const valid=JSON.parse(serializeCart(state)!);
  const cases=["{",JSON.stringify({...valid,version:2}),JSON.stringify({...valid,sessionCode:"secret"}),JSON.stringify({...valid,lines:[{...valid.lines[0],quantity:1.5}]}),
   JSON.stringify({...valid,lines:[{...valid.lines[0],snapshot:{basePriceVnd:NaN,options:[]}}]}),JSON.stringify({...valid,lines:Array.from({length:101},()=>valid.lines[0])}),"x".repeat(CART_LIMITS.maxStorageBytes+1)];
  for(const raw of cases){storage.setItem(key,raw);expect(readCart(storage,state.context!)).toMatchObject({cart:null,issue:{code:"STORAGE_CORRUPT"}});}
 });
 it("rejects pasted storage from another QR/table/store/mode; scoped keys are separate",()=>{
  const state=add(readyState("dine_in",true)),storage=memoryStorage(),raw=serializeCart(state)!;
  for(const context of [{...state.context!,qrCode:"OTHER"},{...state.context!,storeId:id(20)},{...state.context!,tableId:id(21)},readyState().context!]){
   storage.setItem(cartScopeKey(context),raw);expect(readCart(storage,context).issue?.code).toBe("STORAGE_SCOPE_MISMATCH");
  }
 });
 it("rejects forged duplicate canonical lines before edit/remove can target multiple rows",()=>{
  const state=add(readyState()),storage=memoryStorage(),raw=JSON.parse(serializeCart(state)!);
  raw.lines.push({...raw.lines[0],quantity:99});storage.setItem(cartScopeKey(state.context!),JSON.stringify(raw));
  expect(readCart(storage,state.context!)).toMatchObject({cart:null,issue:{code:"STORAGE_CORRUPT"}});
 });
 it("restored note omissions keep separate lines and require explicit note decisions",async()=>{
  let state=add(readyState(),{...selection(),note:"A"});state=add(state,{...selection(),note:"B"});
  const storage=memoryStorage();writeCart(storage,state);
  const store=createCartStore({qrCode,storage,loadMenu:async()=>menu(),loadResolution:async()=>resolution()});await store.initialize();
  expect(store.getState().lines).toHaveLength(2);expect(new Set(store.getState().lines.map(l=>l.lineKey)).size).toBe(2);
  expect(store.getState().lines.every(line=>line.note===null&&line.noteNeedsReview)).toBe(true);
  expect(store.confirmReview()).toMatchObject({ok:false,issue:{code:"NOTE_REVIEW_REQUIRED"}});
  for(const line of [...store.getState().lines])store.updateNote(line.lineKey,null);
  expect(store.getState().lines).toHaveLength(1);expect(store.getState().lines[0].quantity).toBe(2);
  expect(store.confirmReview().ok).toBe(true);expect(store.getCheckoutReadiness().status).toBe("ready_to_review");
 });
 it("storage access failure/quota falls back to RAM and a warning without fake checkout success",async()=>{
  const denied={getItem:()=>{throw Error("denied");},setItem:()=>{throw Error("quota");},removeItem:()=>{throw Error("denied");}};
  const store=createCartStore({qrCode,storage:denied,loadMenu:async()=>menu(),loadResolution:async()=>resolution()});await store.initialize();
  expect(store.addLine(selection()).ok).toBe(true);expect(store.getView().issues.some(i=>i.code==="STORAGE_UNAVAILABLE")).toBe(true);
  expect(store.getView().itemCount).toBe(1);store.setOnline(false);expect(store.getCheckoutReadiness().status).toBe("menu_refresh_needed");
 });
});

describe("store initialization, refresh and server evidence",()=>{
 it("SSR factory and server snapshot never touch window/sessionStorage or fetch",()=>{
  const loader=vi.fn();const store=createCartStore({qrCode,loadMenu:loader,loadResolution:loader});
  expect(loader).not.toHaveBeenCalled();expect(store.getServerSnapshot()).toBe(store.getServerSnapshot());expect(store.getState().hydrated).toBe(false);
  expect(store.getCheckoutReadiness().status).toBe("empty");
 });
 it("renders the public React hook on the server with a stable empty snapshot and no I/O",()=>{
  const loader=vi.fn(),storage={getItem:vi.fn(),setItem:vi.fn(),removeItem:vi.fn()};
  const store=createCartStore({qrCode,loadMenu:loader,loadResolution:loader,storage});
  function Probe(){const cart=useCart(store);return createElement("span",null,`${cart.view.hydrated}:${cart.view.itemCount}:${cart.checkoutReadiness.status}`);}
  expect(renderToString(createElement(Probe))).toBe("<span>false:0:empty</span>");
  expect(loader).not.toHaveBeenCalled();expect(storage.getItem).not.toHaveBeenCalled();expect(storage.setItem).not.toHaveBeenCalled();
 });
 it("sequences QR before menu, emits updates and returns safe failures when any fetch fails",async()=>{
  const events:string[]=[];let fail=false;
  const store=createCartStore({qrCode,storage:null,loadResolution:async()=>{events.push("QR");return resolution();},loadMenu:async()=>{events.push("menu");if(fail)throw Error("offline");return menu();}});
  const onUpdate=vi.fn(),unsubscribe=store.subscribe(onUpdate);expect((await store.initialize()).ok).toBe(true);expect(events).toEqual(["QR","menu"]);
  store.addLine(selection());fail=true;expect((await store.refresh()).ok).toBe(false);expect(store.getView().itemCount).toBe(1);expect(store.prepareOrderDraft().ok).toBe(false);
  expect(onUpdate).toHaveBeenCalled();unsubscribe();
 });
 it("refresh after first-load network error still hydrates the correct saved scope",async()=>{
  const storage=memoryStorage(),saved=add(readyState());writeCart(storage,saved);let fail=true;
  const store=createCartStore({qrCode,storage,loadResolution:async()=>{if(fail)throw Error();return resolution();},loadMenu:async()=>menu()});
  await store.initialize();fail=false;await store.refresh();expect(store.getView().itemCount).toBe(1);
  expect(store.getView().requiresReview).toBe(true);expect(store.confirmReview().ok).toBe(true);
 });
 it("restored prices/revision cannot make forged storage ready without fresh API and review",async()=>{
  const storage=memoryStorage(),saved=add(readyState());const raw=JSON.parse(serializeCart(saved)!);raw.lines[0].snapshot.basePriceVnd=1;raw.reviewedRevision=menu().menuRevision;
  storage.setItem(cartScopeKey(saved.context!),JSON.stringify(raw));
  const store=createCartStore({qrCode,storage,loadResolution:async()=>resolution(),loadMenu:async()=>menu()});
  expect(store.prepareOrderDraft().ok).toBe(false);await store.initialize();expect(store.getCheckoutReadiness().status).toBe("cart_invalid");
  expect(store.getView().issues.some(i=>i.code==="PRICE_CHANGED")).toBe(true);store.confirmReview();expect(store.getView().estimatedSubtotalVnd).toBe(29000);
 });
 it("saved old session cannot silently carry a cart into a new session at same table",async()=>{
  const storage=memoryStorage(),saved=add(readyState("dine_in",true));writeCart(storage,saved);
  const store=createCartStore({qrCode,storage,loadResolution:async()=>resolution("dine_in",true,id(44)),loadMenu:async()=>menu()});
  await store.initialize();expect(store.getState().contextNeedsReview).toBe(true);expect(store.confirmReview().ok).toBe(false);
  expect(store.confirmContextChange().ok).toBe(true);expect(store.confirmReview().ok).toBe(true);
 });
 it("separate QR stores never read each other's data and clearing removes only current scope",async()=>{
  const storage=memoryStorage(),loadMenu=async()=>menu(),loadResolution=async()=>resolution();
  const a=createCartStore({qrCode,storage,loadMenu,loadResolution}),b=createCartStore({qrCode:"COUNTER_B",storage,loadMenu,loadResolution});
  await a.initialize();a.addLine(selection());await b.initialize();expect(b.getView().isEmpty).toBe(true);b.addLine(selection(2));
  expect(storage.values.size).toBe(2);a.clear();expect(storage.values.size).toBe(1);expect(b.getView().itemCount).toBe(2);
 });
 it("ignores older async menu requests after invalidation and after disposal",async()=>{
  let release!:(value:ReturnType<typeof menu>)=>void;
  const store=createCartStore({qrCode,storage:null,loadResolution:async()=>resolution(),loadMenu:()=>new Promise(resolve=>{release=resolve;})});
  const pending=store.initialize();await Promise.resolve();await Promise.resolve();store.markStale();release(menu());await pending;expect(store.getState().menuFresh).toBe(false);
  store.dispose();expect(store.addLine(selection()).ok).toBe(false);
 });
 it("context switching response resets old cart rather than falsely authorizing it",async()=>{
  const store=createCartStore({qrCode,storage:null,loadResolution:async()=>resolution(),loadMenu:async()=>menu()});await store.initialize();store.addLine(selection());
  store.applyResolution(resolution("dine_in"));expect(store.getView().isEmpty).toBe(true);expect(store.getState().menuFresh).toBe(false);
 });
 it("proposed price overflow cannot be accepted and never becomes a floating total",()=>{
  let state=add(readyState(),selection(99));const next=menu();next.menuRevision="new";next.items[0].priceVnd=Number.MAX_SAFE_INTEGER;
  state=cartReducer(state,{type:"menu",menu:next});expect(cartReducer(state,{type:"confirm_review"}).lastIssue?.code).toBe("CART_TOTAL_OVERFLOW");
  expect(getCheckoutReadiness(state).status).toBe("cart_invalid");
 });
});
