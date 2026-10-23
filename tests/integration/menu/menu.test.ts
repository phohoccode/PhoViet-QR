import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { createCategory, updateCategory, createMenuItem, updateMenuItem, fetchOwnerMenu, fetchPublicMenu, fetchCategories } from "../../../src/server/menu/service";
import { hashSecret } from "../../../src/server/security/crypto";
import { publicMenuResponse, ownerMenuResponse } from "../../../src/lib/validations/menu";

const status=JSON.parse(execFileSync(process.execPath,["node_modules/supabase/dist/supabase.js","status","-o","json"],{encoding:"utf8",stdio:["ignore","pipe","pipe"]}));
if(status.API_URL!=="http://127.0.0.1:15421")throw Error("Refusing non-local menu tests");
const admin=createClient(status.API_URL,status.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const sql=(input:string,db="postgres")=>execFileSync("docker",["exec","-i","supabase_db_qr-ordering-p1c02-local","psql","-U","postgres","-d",db,"-At","-v","ON_ERROR_STOP=1"],{input,encoding:"utf8",stdio:["pipe","pipe","pipe"]}).trim();
const stores=[randomUUID(),randomUUID()], table=randomUUID(), codes=[randomBytes(16).toString("hex"),randomBytes(16).toString("hex")];
const users:string[]=[], browserToken=randomBytes(32).toString("base64url");
const context={token:browserToken,browserHash:hashSecret(browserToken),grantProof:hashSecret(`qr-guest-grant-v1:${browserToken}`),isNew:true};
const owner=()=>({storeId:stores[0],authUserId:users[0]}), foreign=()=>({storeId:stores[1],authUserId:users[1]});
let category:Awaited<ReturnType<typeof createCategory>>, item:Awaited<ReturnType<typeof createMenuItem>>, foreignCategory:typeof category;
const input=(categoryId:string)=>({requestId:randomUUID(),categoryId,name:"Coffee",description:null,priceVnd:29000,imageUrl:null,active:true,available:true,options:[{name:"Milk",priceDeltaVnd:3000,available:true}]});
beforeAll(async()=>{
 process.env.NEXT_PUBLIC_SUPABASE_URL=status.API_URL;process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=status.PUBLISHABLE_KEY||status.ANON_KEY;process.env.SUPABASE_SERVICE_ROLE_KEY=status.SERVICE_ROLE_KEY;
 for(let index=0;index<3;index++){const r=await admin.auth.admin.createUser({email:`menu-${randomUUID()}@example.invalid`,password:`${randomUUID()}aA!9`,email_confirm:true});if(r.error||!r.data.user)throw Error("Auth setup failed");users.push(r.data.user.id);}
 sql(`begin;insert into public.stores(id,name) values('${stores[0]}','Menu A'),('${stores[1]}','Menu B');
 insert into public.owner_members(store_id,auth_user_id) values('${stores[0]}','${users[0]}'),('${stores[1]}','${users[1]}');
 insert into public.dining_tables(id,store_id,label) values('${table}','${stores[0]}','Menu table');
 insert into public.qr_codes(store_id,type,table_id,public_code) values('${stores[0]}','table','${table}','${codes[0]}'),('${stores[0]}','takeaway',null,'${codes[1]}');commit;`);
});
afterAll(async()=>{
 const qrIds=JSON.parse(sql(`select coalesce(json_agg(id),'[]') from public.qr_codes where store_id='${stores[0]}'`)) as string[];
 const bucketKeys=[...users.flatMap(id=>[`owner:${id}:read`,`owner:${id}:write`]),...qrIds.map(id=>`read:${context.browserHash}:${id}`)].map(hashSecret);
 sql(`begin;delete from public.menu_audit_log where store_id in('${stores.join("','")}');delete from public.operation_requests where store_id in('${stores.join("','")}');
 delete from public.outbox_events where aggregate_id in('${stores.join("','")}');delete from public.menu_item_options where store_id in('${stores.join("','")}');
 delete from public.menu_items where store_id in('${stores.join("','")}');delete from public.menu_categories where store_id in('${stores.join("','")}');
 delete from public.qr_codes where store_id in('${stores.join("','")}');delete from public.dining_tables where store_id in('${stores.join("','")}');
 delete from public.owner_members where store_id in('${stores.join("','")}');delete from public.stores where id in('${stores.join("','")}');
 delete from public.guest_browser_contexts where token_hash='${context.browserHash}';delete from public.security_rate_buckets where key_hash in('${bucketKeys.join("','")}');commit;`);
 for(const id of users)expect((await admin.auth.admin.deleteUser(id)).error).toBeNull();
});
describe("real menu database and services",()=>{
 it("empty QR menu is valid and table/takeaway share the same public snapshot",async()=>{
  const a=await fetchPublicMenu(codes[0],context), b=await fetchPublicMenu(codes[1],context);
  expect(publicMenuResponse.parse(a).items).toEqual([]);expect(a.menuRevision).toBe(b.menuRevision);expect(a.categories).toEqual([]);
  expect(JSON.stringify(a)).not.toMatch(/owner|storeId|session|codeHash/);
 });
 it("creates categories/items/options once and emits audit/revision/outbox atomically",async()=>{
  category=await createCategory(owner(),{requestId:randomUUID(),name:" Coffee ",sortOrder:2,active:true});
  foreignCategory=await createCategory(foreign(),{requestId:randomUUID(),name:"Other",sortOrder:1,active:true});
  await createMenuItem(foreign(),{...input(foreignCategory.id),name:"Foreign only"});
  const before=await fetchPublicMenu(codes[0],context), command=input(category.id);
  const [a,b]=await Promise.all([createMenuItem(owner(),command),createMenuItem(owner(),command)]);expect(a).toEqual(b);item=a;
  expect(a.options).toHaveLength(1);expect(a.name).toBe("Coffee");
  expect(sql(`select count(*) from public.menu_items where store_id='${stores[0]}'`)).toBe("1");
  expect(sql(`select count(*) from public.menu_audit_log where entity_id='${a.id}'`)).toBe("1");
  expect(sql(`select count(*) from public.outbox_events where aggregate_id='${stores[0]}' and topic='menu.updated'`)).toBe("2");
  expect((await fetchPublicMenu(codes[0],context)).menuRevision).not.toBe(before.menuRevision);
  expect((await fetchPublicMenu(codes[0],context)).items.some(row=>row.name==="Foreign only")).toBe(false);
  await expect(createMenuItem(owner(),{...command,priceVnd:1})).rejects.toMatchObject({code:"DUPLICATE_REQUEST_CONFLICT"});
 });
 it("denies nonmembers, forged memberships and cross-store category/item updates",async()=>{
  await expect(fetchOwnerMenu({storeId:stores[0],authUserId:users[2]})).rejects.toMatchObject({code:"FORBIDDEN"});
  await expect(fetchOwnerMenu({...foreign(),storeId:stores[0]})).rejects.toMatchObject({code:"FORBIDDEN"});
  await expect(updateMenuItem(foreign(),item.id,{requestId:randomUUID(),expectedUpdatedAt:item.updatedAt,priceVnd:5})).rejects.toMatchObject({code:"RESOURCE_NOT_FOUND"});
  await expect(createMenuItem(owner(),input(foreignCategory.id))).rejects.toMatchObject({code:"RESOURCE_NOT_FOUND"});
  await expect(updateCategory(foreign(),category.id,{requestId:randomUUID(),expectedUpdatedAt:category.updatedAt,name:"Stolen"})).rejects.toMatchObject({code:"RESOURCE_NOT_FOUND"});
 });
 it("same timestamp competing patches have one winner; replay precedes stale CAS",async()=>{
  const a={requestId:randomUUID(),expectedUpdatedAt:item.updatedAt,priceVnd:31000}, b={...a,requestId:randomUUID(),priceVnd:32000};
  const results=await Promise.allSettled([updateMenuItem(owner(),item.id,a),updateMenuItem(owner(),item.id,b)]);
  expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(1);
  const win=results.findIndex(r=>r.status==="fulfilled"), fulfilled=results[win];if(fulfilled.status!=="fulfilled")throw Error();item=fulfilled.value;
  expect(results[1-win]).toMatchObject({status:"rejected",reason:{code:"INVALID_STATE_TRANSITION"}});
  expect(await updateMenuItem(owner(),item.id,win===0?a:b)).toEqual(item);
 });
 it("failed option ownership validates before any item/option/revision changes",async()=>{
  const before=await fetchOwnerMenu(owner());
  await expect(updateMenuItem(owner(),item.id,{requestId:randomUUID(),expectedUpdatedAt:item.updatedAt,priceVnd:999,options:[{id:randomUUID(),name:"Fake",priceDeltaVnd:1,available:true}]})).rejects.toMatchObject({code:"VALIDATION_ERROR"});
  const after=await fetchOwnerMenu(owner());expect(after.menuRevision).toBe(before.menuRevision);expect(after.items).toEqual(before.items);
  await expect(createMenuItem(owner(),{...input(category.id),options:[{id:item.options[0].id,name:"Existing",priceDeltaVnd:0,available:true}]})).rejects.toMatchObject({code:"VALIDATION_ERROR"});
 });
 it("option replacement preserves inactive rows, public hides them, rejects duplicate IDs",async()=>{
  const old=item.options[0];
  await expect(updateMenuItem(owner(),item.id,{requestId:randomUUID(),expectedUpdatedAt:item.updatedAt,options:[old,old]})).rejects.toMatchObject({code:"VALIDATION_ERROR"});
  item=await updateMenuItem(owner(),item.id,{requestId:randomUUID(),expectedUpdatedAt:item.updatedAt,options:[{name:"Extra coffee",priceDeltaVnd:6000,available:true}]});
  expect(item.options.find(o=>o.id===old.id)?.available).toBe(false);
  expect(sql(`select count(*) from public.menu_item_options where id='${old.id}'`)).toBe("1");
  expect(sql("select has_table_privilege('service_role','public.menu_items','delete')")).toBe("f");
  expect((await fetchPublicMenu(codes[0],context)).items[0].options.map(o=>o.name)).toEqual(["Extra coffee"]);
 });
 it("available=false stays public; inactive category hides its items; owner can restore",async()=>{
  item=await updateMenuItem(owner(),item.id,{requestId:randomUUID(),expectedUpdatedAt:item.updatedAt,available:false,priceVnd:0});
  expect((await fetchPublicMenu(codes[0],context)).items[0]).toMatchObject({priceVnd:0,available:false});
  category=await updateCategory(owner(),category.id,{requestId:randomUUID(),expectedUpdatedAt:category.updatedAt,active:false});
  expect((await fetchPublicMenu(codes[0],context)).items).toEqual([]);
  expect((await fetchOwnerMenu(owner())).items).toHaveLength(1);expect((await fetchOwnerMenu(owner(),false)).items).toEqual([]);
  await expect(createMenuItem(owner(),input(category.id))).rejects.toMatchObject({code:"VALIDATION_ERROR"});
  item=await updateMenuItem(owner(),item.id,{requestId:randomUUID(),expectedUpdatedAt:item.updatedAt,active:false});
  category=await updateCategory(owner(),category.id,{requestId:randomUUID(),expectedUpdatedAt:category.updatedAt,active:true});
  expect((await fetchPublicMenu(codes[0],context)).items).toEqual([]);
  item=await updateMenuItem(owner(),item.id,{requestId:randomUUID(),expectedUpdatedAt:item.updatedAt,active:true});
  expect(ownerMenuResponse.parse(await fetchOwnerMenu(owner())).items).toHaveLength(1);
 });
 it("normalizes category names, stable sorting, and latest request sees revised prices",async()=>{
  await expect(createCategory(owner(),{requestId:randomUUID(),name:" coffee ",sortOrder:0,active:true})).rejects.toMatchObject({code:"VALIDATION_ERROR"});
  const earlier=await createCategory(owner(),{requestId:randomUUID(),name:"Tea",sortOrder:-1,active:true});
  await createMenuItem(owner(),{...input(earlier.id),name:"Tea",options:[]});
  const menu=await fetchPublicMenu(codes[1],context);expect(menu.categories.map(c=>c.id)).toEqual([earlier.id,category.id]);
  expect(menu.items[0].name).toBe("Tea");expect(menu.items.find(i=>i.id===item.id)?.priceVnd).toBe(0);
  expect((await fetchCategories(owner())).map(c=>c.id)).toEqual([earlier.id,category.id]);
 });
 it("denies QR disabled/table inactive/missing and preserves browse during store pause",async()=>{
  await expect(fetchPublicMenu("missing",context)).rejects.toMatchObject({code:"INVALID_QR"});
  sql(`update public.qr_codes set active=false where public_code='${codes[0]}'`);
  await expect(fetchPublicMenu(codes[0],context)).rejects.toMatchObject({code:"INVALID_QR"});
  sql(`update public.qr_codes set active=true where public_code='${codes[0]}';update public.dining_tables set active=false where id='${table}'`);
  await expect(fetchPublicMenu(codes[0],context)).rejects.toMatchObject({code:"INVALID_QR"});
  sql(`update public.dining_tables set active=true where id='${table}';update public.stores set accepting_orders=false where id='${stores[0]}'`);
  expect((await fetchPublicMenu(codes[0],context)).items.length).toBeGreaterThan(0);
 });
 it("same-store FK, integer constraints and RLS/RPC revoke hold on PostgreSQL",async()=>{
  expect(()=>sql(`insert into public.menu_items(store_id,category_id,name,price_vnd) values('${stores[1]}','${category.id}','bad',1)`)).toThrow();
  expect(()=>sql(`update public.menu_items set price_vnd=-1 where id='${item.id}'`)).toThrow();
  for(const role of ["anon","authenticated"]){
   for(const t of ["menu_categories","menu_items","menu_item_options","menu_audit_log"])
    expect(()=>sql(`set role ${role};select * from public.${t}`)).toThrow();
   expect(()=>sql(`set role ${role};select public.p2_menu_execute('owner','{}')`)).toThrow();
  }
 });
 it("DB constraint failure late in an option replacement rolls back all earlier writes",async()=>{
  const before=await fetchOwnerMenu(owner());
  const current=before.items.find(row=>row.id===item.id)!;
  const audit=sql(`select count(*) from public.menu_audit_log where store_id='${stores[0]}'`);
  // Deliberately bypass HTTP validation to fail after UPDATE item and the first
  // option INSERT, proving the RPC transaction protects against partial state.
  const r=await admin.rpc("p2_menu_execute",{action:"patch_item",input:{ownerId:users[0],storeId:stores[0],id:item.id,requestId:randomUUID(),expectedUpdatedAt:current.updatedAt,priceVnd:777,
    options:[{name:"First",priceDeltaVnd:0,available:true},{name:"Invalid",priceDeltaVnd:-1,available:true}]}});
  expect(r.error).not.toBeNull();
  const after=await fetchOwnerMenu(owner());expect(after.items).toEqual(before.items);expect(after.menuRevision).toBe(before.menuRevision);
  expect(sql(`select count(*) from public.menu_audit_log where store_id='${stores[0]}'`)).toBe(audit);
 });
 it("seed is repeatable without changing items, owner edits or public locators",()=>{
  const seed=readFileSync("supabase/seed.sql","utf8");sql(seed);
  const before=sql("select menu_revision from public.stores where id='c0200000-0000-4000-8000-000000000001'");
  sql(seed);expect(sql("select count(*) from public.menu_items where store_id='c0200000-0000-4000-8000-000000000001'")).toBe("4");
  expect(sql("select menu_revision from public.stores where id='c0200000-0000-4000-8000-000000000001'")).toBe(before);
 });
 it("fresh isolated DB applies all migrations without default service privileges",()=>{
  const db=`menu_fresh_${randomUUID().replaceAll("-","")}`;sql(`create database ${db}`);
  try{
   sql("create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$select null::uuid$$;create schema extensions;create extension pgcrypto schema extensions;",db);
   for(const file of ["20261023000100_foundation.sql","20261023000200_owner_bootstrap_privileges.sql","20261023000300_table_sessions_guest_access.sql","20261023000400_session_row_lock_privileges.sql","20261023000500_menu.sql"]){
    sql(readFileSync(`supabase/migrations/${file}`,"utf8"),db);
    if(file.includes("foundation"))sql("revoke all on public.stores,public.owner_members,public.qr_codes,public.dining_tables from service_role",db);
   }
   expect(sql("select has_function_privilege('anon','public.p2_menu_execute(text,jsonb)','execute')",db)).toBe("f");
   expect(sql("select count(*) from pg_class where relnamespace='public'::regnamespace and relkind='r' and relrowsecurity",db)).toBe("15");
   sql(`insert into auth.users values('${users[0]}');insert into public.stores(id,name) values('${stores[0]}','fresh');insert into public.owner_members(store_id,auth_user_id) values('${stores[0]}','${users[0]}');`,db);
   const command={ownerId:users[0],storeId:stores[0],requestId:randomUUID(),name:"Fresh",sortOrder:1,active:true};
   expect(sql(`set role service_role;select public.p2_menu_execute('create_category','${JSON.stringify(command)}')`,db)).toContain('"name": "Fresh"');
  }finally{sql(`drop database ${db} with(force)`);}
 });
});
