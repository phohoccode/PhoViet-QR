import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterEach, expect, it, vi } from "vitest";
import { createMenuItemInput, patchMenuItemInput, createCategoryInput, ownerMenuQuery, publicMenuQuery } from "../../../src/lib/validations/menu";
import { fetchPublicMenu, MenuApiError } from "../../../src/features/customer/api-client";
import { createCategory, updateMenuItem } from "../../../src/features/owner/api-client";
import { publicMenuResponse, ownerMenuResponse } from "../../../src/lib/validations/menu";
const item = { requestId: randomUUID(), categoryId: randomUUID(), name: "  Cà phê  ", description: null, priceVnd: 0, imageUrl: null, active: true, available: false, options: [] };
afterEach(() => vi.unstubAllGlobals());
it("published JSON fixtures match runtime schemas and contain consistent category references",()=>{
  for(const [file,schema] of [["menu-public.json",publicMenuResponse],["menu-owner.json",ownerMenuResponse]] as const){
    const envelope=JSON.parse(readFileSync(`docs/contracts/fixtures/${file}`,"utf8"));
    expect(envelope.error).toBeNull();const menu=schema.parse(envelope.data);expect(menu.categories).toHaveLength(2);
    expect(menu.categories[0].name).toBe("Cà phê");
    expect(menu.items.length).toBeGreaterThanOrEqual(4);
    for(const item of menu.items)expect(menu.categories.some(c=>c.id===item.categoryId)).toBe(true);
    expect(menu.items.some(i=>!i.available)).toBe(true);expect(menu.items.some(i=>i.options.length===2)).toBe(true);
  }
});
it("accepts integer zero and trims names; rejects forged scope/quantity/unknown fields", () => {
  expect(createMenuItemInput.parse(item).name).toBe("Cà phê");
  for (const extra of [{storeId:randomUUID()},{quantity:1},{priceVnd:-1},{priceVnd:1.5},{priceVnd:Number.MAX_SAFE_INTEGER+1},{name:"  "},{name:"x".repeat(121)}]) expect(createMenuItemInput.safeParse({...item,...extra}).success).toBe(false);
});
it("allows only approved HTTPS image hosts without credentials/ports/fragments", () => {
  for(const imageUrl of ["javascript:alert(1)","data:image/png;base64,a","http://images.unsplash.com/x","https://localhost/x","https://images.unsplash.com.evil.test/x","https://evil@images.unsplash.com/x","https://images.unsplash.com:8443/x","https://images.unsplash.com/x#secret"])
    expect(createMenuItemInput.safeParse({...item,imageUrl}).success).toBe(false);
  expect(createMenuItemInput.safeParse({...item,imageUrl:"https://images.unsplash.com/photo?width=200"}).success).toBe(true);
});
it("requires CAS timestamp, command ID and changed fields; validates option pricing and count", () => {
  const command={requestId:randomUUID(),expectedUpdatedAt:"2026-10-23T12:00:00.123456+00:00"};
  expect(patchMenuItemInput.safeParse(command).success).toBe(false);
  expect(patchMenuItemInput.safeParse({...command,available:false}).success).toBe(true);
  for(const options of [[{name:"Milk",priceDeltaVnd:-1,available:true}],[{name:"Milk",priceDeltaVnd:1,active:true}],Array.from({length:51},()=>({name:"a",priceDeltaVnd:0,available:true}))])
    expect(createMenuItemInput.safeParse({...item,options}).success).toBe(false);
});
it("validates category/query input and preserves false query semantics", () => {
  expect(ownerMenuQuery.parse({includeInactive:"false"}).includeInactive).toBe(false);
  expect(ownerMenuQuery.safeParse({includeInactive:"0"}).success).toBe(false);
  expect(publicMenuQuery.safeParse({qrCode:"abc",storeId:randomUUID()}).success).toBe(false);
  expect(createCategoryInput.safeParse({requestId:randomUUID(),name:"a",sortOrder:0.5,active:true}).success).toBe(false);
});
it("adapters use credentialed no-store requests and preserve caller command IDs", async () => {
  const mocked=vi.fn().mockImplementation(async()=>new Response(JSON.stringify({data:{items:[]},error:null})));vi.stubGlobal("fetch",mocked);
  await fetchPublicMenu("A_B");
  expect(mocked).toHaveBeenLastCalledWith("/api/public/menu?qrCode=A_B",expect.objectContaining({credentials:"include",cache:"no-store"}));
  await createCategory({requestId:item.requestId,name:"Coffee",sortOrder:1,active:true});
  expect(JSON.parse(mocked.mock.calls.at(-1)![1].body).requestId).toBe(item.requestId);
  await updateMenuItem(item.categoryId,{requestId:item.requestId,expectedUpdatedAt:"2026-10-23T00:00:00Z",priceVnd:0});
  expect(mocked.mock.calls.at(-1)![1].method).toBe("PATCH");
});
it("keeps API errors distinct from network failure and menu empty", async () => {
  vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response(JSON.stringify({data:null,error:{code:"INVALID_QR",message:"QR lỗi"}}),{status:404})));
  await expect(fetchPublicMenu("a")).rejects.toBeInstanceOf(MenuApiError);
  vi.stubGlobal("fetch",vi.fn().mockRejectedValue(new TypeError("offline")));
  await expect(fetchPublicMenu("a")).rejects.toBeInstanceOf(TypeError);
});
