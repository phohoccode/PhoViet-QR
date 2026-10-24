import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ApiFault } from '../../src/server/security/api';

const state = vi.hoisted(()=>({ owner:vi.fn(),archive:vi.fn(),upload:vi.fn() }));
vi.mock('../../src/server/security/owner',()=>({ requireApiOwner:state.owner }));
vi.mock('../../src/server/menu/hotfix',()=>({ archiveResource:state.archive }));
vi.mock('../../src/server/menu/storage',()=>({ uploadMenuImage:state.upload }));
import { POST } from '../../src/app/api/owner/menu/upload/route';
import { DELETE as tableDelete } from '../../src/app/api/owner/tables/[id]/route';
import { DELETE as categoryDelete } from '../../src/app/api/owner/menu/categories/[id]/route';
import { DELETE as itemDelete } from '../../src/app/api/owner/menu/[id]/route';

beforeEach(()=>{vi.resetAllMocks();delete process.env.APP_ORIGIN;});
const formRequest = () => { const form=new FormData();form.append('file',new File(['not inspected in guard test'],'x.png',{type:'image/png'}));return new NextRequest('http://localhost/api/owner/menu/upload',{method:'POST',headers:{origin:'http://localhost'},body:form}); };
it('unauthenticated uploads/archives stop before service or Storage IO',async()=>{
  state.owner.mockRejectedValue(new ApiFault('UNAUTHORIZED'));
  expect((await POST(formRequest())).status).toBe(401);
  for(const handler of [tableDelete,categoryDelete,itemDelete]) expect((await handler(new NextRequest('http://localhost/api/owner/test',{method:'DELETE',headers:{origin:'http://localhost'}}),{params:Promise.resolve({id:'x'})})).status).toBe(401);
  expect(state.archive).not.toHaveBeenCalled();expect(state.upload).not.toHaveBeenCalled();
});
it('cross-site requests are forbidden and oversized multipart is bounded before parsing',async()=>{
  expect((await POST(new NextRequest('http://localhost/api/owner/menu/upload',{method:'POST',headers:{origin:'https://attacker.invalid'}}))).status).toBe(403);
  state.owner.mockResolvedValue({storeId:'verified-store',authUserId:'verified-owner'});
  const form=new FormData();form.append('file',new File([new Uint8Array(6*1024*1024)],'x.png',{type:'image/png'}));
  expect((await POST(new NextRequest('http://localhost/api/owner/menu/upload',{method:'POST',headers:{origin:'http://localhost'},body:form}))).status).toBe(413);
  expect(state.upload).not.toHaveBeenCalled();
});
it('archive conflicts use stable envelope/count and authenticated owner context',async()=>{
  state.owner.mockResolvedValue({storeId:'verified-store',authUserId:'verified-owner'});
  state.archive.mockRejectedValue(new ApiFault('CATEGORY_NOT_EMPTY',{count:3}));
  const response=await categoryDelete(new NextRequest('http://localhost/api/owner/test',{method:'DELETE',headers:{origin:'http://localhost'}}),{params:Promise.resolve({id:'target'})});
  expect(response.status).toBe(409);expect((await response.json()).error).toMatchObject({code:'CATEGORY_NOT_EMPTY',details:{count:3}});
  expect(state.archive).toHaveBeenCalledWith({storeId:'verified-store',authUserId:'verified-owner'},'category','target');
});
