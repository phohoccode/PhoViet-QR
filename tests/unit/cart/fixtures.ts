import { readFileSync } from "node:fs";
import type { MenuV1View, QRResolution } from "@contracts";
import type { CartState, CartAction } from "../../../src/features/cart/types";
import { cartReducer, initialCartState } from "../../../src/features/cart/domain";
export const id = (n: number) => `c0230000-0000-4000-8000-${String(n).padStart(12,"0")}`;
export const qrCode = "CART_DEMO_TABLE";
export const menu = (): MenuV1View => JSON.parse(readFileSync("docs/contracts/fixtures/menu-public.json","utf8")).data;
export const resolution = (mode: "dine_in" | "takeaway" = "takeaway", verified = false, session = id(3)): QRResolution => {
  const store = { id:id(1),name:"Quán demo",timezone:"Asia/Ho_Chi_Minh",acceptingOrders:true };
  if(mode === "takeaway")return { type:"takeaway",mode,store,table:null,requiresSessionCode:false,session:null };
  const table = { id:id(2),label:"Bàn 01" };
  return verified ? { type:"table",mode,store,table,requiresSessionCode:false,session:{id:session,status:"open"} } : {type:"table",mode,store,table,requiresSessionCode:true,session:null};
};
export const readyState = (mode: "dine_in" | "takeaway" = "takeaway", verified=false): CartState => {
  let state = {...initialCartState(),hydrated:true};
  for(const action of [{type:"resolution",qrCode,resolution:resolution(mode,verified)},{type:"menu",menu:menu()}] as CartAction[])state=cartReducer(state,action);
  return state;
};
export const selection = (quantity=1) => ({menuItemId:menu().items[0].id,quantity,optionIds:[],note:null});
export const add = (state: CartState, input: unknown = selection()) => cartReducer(state,{type:"add",input});
export function memoryStorage(){
  const values = new Map<string,string>();
  return { values,getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);},removeItem:(key:string)=>{values.delete(key);} };
}
