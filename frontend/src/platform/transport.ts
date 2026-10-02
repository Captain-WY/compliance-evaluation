export const TOKEN_KEY = 'compliance-platform-token';
export const tokenStore = { get: () => localStorage.getItem(TOKEN_KEY), set: (value:string) => localStorage.setItem(TOKEN_KEY,value), clear: () => {localStorage.removeItem(TOKEN_KEY);window.dispatchEvent(new Event('platform-session-ended'));} };
export async function requestRaw(path:string, init:RequestInit = {}) {
 const headers = new Headers(init.headers); const token=tokenStore.get();
 if(token) headers.set('Authorization',`Bearer ${token}`);
 if(init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) headers.set('Content-Type','application/json');
 const response=await fetch(path,{...init,headers});
 if(response.status===401 && !path.includes('/auth/login')) tokenStore.clear();
 return response;
}
export class ApiError extends Error {constructor(message:string, public status:number, public code?:string, public details?:unknown){super(message);}}
export async function requestJson<T=any>(path:string,init:RequestInit={}):Promise<T>{
 const response=await requestRaw(path,init); const json=await response.json().catch(()=>({}));
 if(!response.ok || ('code' in json && ![0,200,'0','200'].includes(json.code))) throw new ApiError(json.message || json.detail || '请求失败',response.status,json.code,json.details);
 return ('data' in json ? json.data : json) as T;
}
