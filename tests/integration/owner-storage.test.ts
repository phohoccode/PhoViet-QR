import { execFileSync } from 'node:child_process';
import { randomUUID, createHmac } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { readFileSync } from 'node:fs';
import { beforeAll, afterAll, expect, it } from 'vitest';
import sharp from 'sharp';
import { createClient } from '@supabase/supabase-js';
import { uploadMenuImage, cleanupMenuImages } from '../../src/server/menu/storage';
import { createMenuItem, updateMenuItem, fetchOwnerMenu } from '../../src/server/menu/service';
import { menuStorageClient, hotfixRpc } from '../../src/server/menu/hotfix';

// Genuine local Supabase Storage API. Dedicated ephemeral container + loopback
// reverse proxy; no hosted URL/credential is ever used or logged by this test.
const status = JSON.parse(execFileSync(process.execPath, ['node_modules/supabase/dist/supabase.js','status','-o','json'], { encoding:'utf8',stdio:['ignore','pipe','pipe'] }));
if (status.API_URL !== 'http://127.0.0.1:15421') throw Error('Refusing non-local Storage integration');
const dbContainer = 'supabase_db_qr-ordering-p1c02-local';
const container = `hf01_storage_${randomUUID().replaceAll('-','')}`;
const owner = { storeId:randomUUID(),authUserId:randomUUID() };
const foreign = { storeId:randomUUID(),authUserId:randomUUID() };
const category = randomUUID();
let proxy: Server;
let authJwtSecret: string;
const sql = (q: string) => execFileSync('docker',['exec','-i',dbContainer,'psql','-U','postgres','-d','postgres','-Atq','-v','ON_ERROR_STOP=1'],{input:q,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const envOf = (name:string) => Object.fromEntries(JSON.parse(execFileSync('docker',['inspect',name],{encoding:'utf8'}))[0].Config.Env.map((e:string)=>{ const at=e.indexOf('=');return [e.slice(0,at),e.slice(at+1)]; }));
const image = async (format:'jpeg'|'png'|'webp') => new File([new Uint8Array(await sharp({create:{width:20,height:16,channels:3,background:'#35977d'}}).toFormat(format).toBuffer())],`soup.${format}`,{type:`image/${format}`});
const uploaded: string[] = [];

beforeAll(async () => {
  if (sql("select to_regprocedure('public.hf01_owner_execute(text,jsonb)') is not null") !== 't') throw Error('Apply migration018 to LOCAL database before Storage tests');
  sql(readFileSync('supabase/migrations/20261024001900_menu_images_bucket.sql','utf8'));
  const dbEnv = envOf(dbContainer), authEnv = envOf('supabase_auth_qr-ordering-p1c02-local');
  const secret = authEnv.GOTRUE_JWT_SECRET;
  authJwtSecret=secret;
  const options = {
    ANON_KEY:status.ANON_KEY, SERVICE_KEY:status.SERVICE_ROLE_KEY, AUTH_JWT_SECRET:secret,
    DATABASE_URL:`postgres://supabase_storage_admin:${encodeURIComponent(dbEnv.POSTGRES_PASSWORD || 'postgres')}@db:5432/postgres`,
    DATABASE_SEARCH_PATH:'storage', TENANT_ID:'stub', REGION:'local', GLOBAL_S3_BUCKET:'stub',
    STORAGE_BACKEND:'file', FILE_STORAGE_BACKEND_PATH:'/var/lib/storage', FILE_SIZE_LIMIT:'5242880',
    ENABLE_IMAGE_TRANSFORMATION:'false', API_EXTERNAL_URL:'http://127.0.0.1:15426',
  };
  try {
    execFileSync('docker',['run','-d','--name',container,'--network','supabase_network_qr-ordering-p1c02-local','-p','127.0.0.1:15426:5000',...Object.entries(options).flatMap(([k,v])=>['-e',`${k}=${v}`]),'public.ecr.aws/supabase/storage-api:v1.82.1'],{stdio:'ignore'});
  } catch { throw Error('Could not start isolated local Storage API'); }
  let healthy=false;
  for(let n=0;n<80;n++) { await new Promise(r=>setTimeout(r,250)); try { if((await fetch('http://127.0.0.1:15426/status')).ok){healthy=true;break;} } catch{} }
  if(!healthy) throw Error('Local Storage API failed its readiness check');
  proxy=createServer(async(req,res)=>{
    try {
      const chunks:Buffer[]=[];for await(const chunk of req) chunks.push(Buffer.from(chunk));
      const storage=req.url?.startsWith('/storage/v1/');
      const url=storage ? `http://127.0.0.1:15426${req.url!.slice('/storage/v1'.length)}` : `${status.API_URL}${req.url}`;
      const headers=new Headers();for(const [k,v] of Object.entries(req.headers)) if(v && !['host','connection','content-length'].includes(k)) headers.set(k,Array.isArray(v)?v.join(','):v);
      const response=await fetch(url,{method:req.method,headers,...(!['GET','HEAD'].includes(req.method!)?{body:Buffer.concat(chunks)}:{})});
      res.statusCode=response.status; response.headers.forEach((v,k)=>{if(!['content-encoding','content-length','transfer-encoding'].includes(k))res.setHeader(k,v);});
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch {res.statusCode=502;res.end();}
  });
  await new Promise<void>(r=>proxy.listen(15427,'127.0.0.1',r));
  process.env.NEXT_PUBLIC_SUPABASE_URL='http://127.0.0.1:15427';
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=status.ANON_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY=status.SERVICE_ROLE_KEY;
  sql(`insert into auth.users(id) values('${owner.authUserId}'),('${foreign.authUserId}');insert into public.stores(id,name) values('${owner.storeId}','HF01 Storage test'),('${foreign.storeId}','Other Storage test');insert into public.owner_members(store_id,auth_user_id) values('${owner.storeId}','${owner.authUserId}'),('${foreign.storeId}','${foreign.authUserId}');insert into public.menu_categories(id,store_id,name) values('${category}','${owner.storeId}','Images');notify pgrst,'reload schema';`);
  await new Promise(r=>setTimeout(r,300));
},60000);
afterAll(async()=>{
  if(proxy) {
    const paths = JSON.parse(sql(`select coalesce(json_agg(path),'[]') from public.menu_image_assets where store_id='${owner.storeId}'`));
    if(paths.length) await menuStorageClient().storage.from('menu-images').remove(paths);
  }
  if(proxy) await new Promise<void>(r=>proxy.close(()=>r()));
  try {execFileSync('docker',['rm','-f',container],{stdio:'ignore'});}catch{}
  // Fixture objects only; never remove any pre-existing menu image.
  sql(`begin;set local session_replication_role=replica;delete from public.outbox_events where aggregate_id in('${owner.storeId}','${foreign.storeId}');delete from public.menu_audit_log where store_id='${owner.storeId}';delete from public.operation_requests where store_id='${owner.storeId}';delete from public.menu_items where store_id='${owner.storeId}';delete from public.menu_categories where store_id='${owner.storeId}';delete from public.menu_image_assets where store_id='${owner.storeId}';delete from public.owner_members where store_id in('${owner.storeId}','${foreign.storeId}');delete from public.stores where id in('${owner.storeId}','${foreign.storeId}');delete from auth.users where id in('${owner.authUserId}','${foreign.authUserId}');commit;`);
});

it('actual JPEG/PNG/WebP uploads are served publicly and attach to owner/customer menu',async()=>{
  for(const format of ['jpeg','png','webp'] as const) {
    const result=await uploadMenuImage(owner,await image(format)); uploaded.push(result.storagePath);
    expect(result.storagePath).toMatch(new RegExp(`^stores/${owner.storeId}/uploads/`));
    const response=await fetch(result.imageUrl); expect(response.ok).toBe(true);
    const decoded=await sharp(Buffer.from(await response.arrayBuffer())).metadata();expect(decoded.format).toBe('webp');
    const created=await createMenuItem(owner,{requestId:randomUUID(),categoryId:category,name:`Image ${format}`,description:null,priceVnd:10000,imageUrl:result.imageUrl,available:true,active:true,options:[]});
    expect(created.imagePath).toBe(result.storagePath);
    expect((await fetchOwnerMenu(owner)).items.some(i=>i.id===created.id && i.imageUrl===result.imageUrl)).toBe(true);
    expect(sql(`select public.menu_snapshot('${owner.storeId}',false,false)->'items'`)).toContain(result.imageUrl);
  }
});

it('rejects malformed bytes, forged MIME/extensions, over-size files and non-owner scope',async()=>{
  for(const file of [new File(['<svg/>'],'x.png',{type:'image/png'}),new File(['GIF89a'],'x.gif',{type:'image/gif'}),new File([await (await image('png')).arrayBuffer()],'x.jpg',{type:'image/jpeg'}),new File([await (await image('png')).arrayBuffer()],'x.svg',{type:'image/png'}),new File([await (await image('png')).arrayBuffer()],'../x.png',{type:'image/png'})]) {
    await expect(uploadMenuImage(owner,file)).rejects.toMatchObject({code:'UNSUPPORTED_MEDIA_TYPE'});
  }
  await expect(uploadMenuImage(owner,new File([new Uint8Array(5*1024*1024+1)],'x.png',{type:'image/png'}))).rejects.toMatchObject({code:'FILE_TOO_LARGE'});
  await expect(uploadMenuImage({...owner,authUserId:foreign.authUserId},await image('png'))).rejects.toMatchObject({code:'FORBIDDEN'});
});

it('actual bucket RLS refuses direct anon/authenticated writes and deletes, even under another store path',async()=>{
  const part=(v:object)=>Buffer.from(JSON.stringify(v)).toString('base64url');
  const data=`${part({alg:'HS256',typ:'JWT'})}.${part({role:'authenticated',sub:owner.authUserId,exp:Math.floor(Date.now()/1000)+300})}`;
  const ownerJwt=`${data}.${createHmac('sha256',authJwtSecret).update(data).digest('base64url')}`;
  for(const token of [status.ANON_KEY,ownerJwt]) {
    const client=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,status.ANON_KEY,{auth:{persistSession:false},global:{headers:{Authorization:`Bearer ${token}`}}});
    for(const store of [owner.storeId,foreign.storeId]) {
      const result=await client.storage.from('menu-images').upload(`stores/${store}/uploads/${randomUUID()}.png`,await image('png'));
      expect(result.error).not.toBeNull();
    }
    // Storage intentionally returns an empty successful selection for objects
    // invisible under DELETE RLS. Actual continued existence proves no deletion.
    const deletion=await client.storage.from('menu-images').remove([uploaded[0]]);
    expect(deletion.error !== null || deletion.data?.length === 0).toBe(true);
    expect((await fetch(`http://127.0.0.1:15427/storage/v1/object/public/menu-images/${uploaded[0]}`)).ok).toBe(true);
  }
});

it('replacement/remove cleanup uses real Storage API and preserves the new object',async()=>{
  const old=await uploadMenuImage(owner,await image('png'));
  const food=await createMenuItem(owner,{requestId:randomUUID(),categoryId:category,name:'Replace',description:null,priceVnd:1,imageUrl:old.url,available:true,active:true,options:[]});
  const next=await uploadMenuImage(owner,await image('webp'));
  const changed=await updateMenuItem(owner,food.id,{requestId:randomUUID(),expectedUpdatedAt:food.updatedAt,imageUrl:next.url});
  expect(changed.imagePath).toBe(next.storagePath);
  expect((await cleanupMenuImages(owner.storeId)).removed).toBeGreaterThan(0);
  expect((await fetch(old.url)).ok).toBe(false);expect((await fetch(next.url)).ok).toBe(true);
  await updateMenuItem(owner,food.id,{requestId:randomUUID(),expectedUpdatedAt:changed.updatedAt,imageUrl:null});
  await cleanupMenuImages(owner.storeId);expect((await fetch(next.url)).ok).toBe(false);
});

it('Storage service outage returns no false success and retains durable cleanup evidence',async()=>{
  execFileSync('docker',['stop',container],{stdio:'ignore'});
  await expect(uploadMenuImage(owner,await image('png'))).rejects.toMatchObject({code:'UPLOAD_FAILED'});
  execFileSync('docker',['start',container],{stdio:'ignore'});
  await new Promise(r=>setTimeout(r,1000));
  expect(Number(sql(`select count(*) from public.menu_image_assets where store_id='${owner.storeId}' and state='uploading'`))).toBeGreaterThan(0);
  expect((await menuStorageClient().rpc('hf01_owner_execute',{action:'archive_item',input:{storeId:owner.storeId,ownerId:foreign.authUserId,id:randomUUID()}})).data.error).toBe('FORBIDDEN');
  await expect(hotfixRpc('hf01_owner_execute','ready_image',{storeId:foreign.storeId,ownerId:foreign.authUserId,path:uploaded[0]})).rejects.toMatchObject({code:'RESOURCE_NOT_FOUND'});
});
