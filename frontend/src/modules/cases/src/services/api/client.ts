import axios,{AxiosError,AxiosHeaders} from 'axios';
import {requestRaw,tokenStore} from '../../../../../platform/transport';
import {keysToCamelCase,keysToSnakeCase} from '../../utils/caseConverter';
export const getAuthToken=tokenStore.get;export const setAuthToken=tokenStore.set;export const removeAuthToken=tokenStore.clear;
const apiClient=axios.create({baseURL:'/api/v1',timeout:30000,adapter:async(config)=>{
 const path=config.url?.startsWith('/api/')?config.url:`/api/v1${config.url}`;
 const url=new URL(path,window.location.origin);Object.entries(config.params||{}).forEach(([k,v])=>{if(v!=null)url.searchParams.set(k,String(v));});
 const response=await requestRaw(url.pathname+url.search,{method:config.method?.toUpperCase(),body:config.data,headers:config.headers as unknown as HeadersInit});
 const data=config.responseType==='blob'?await response.blob():await response.json();
 const result={data,status:response.status,statusText:response.statusText,headers:new AxiosHeaders(),config};
 if(!response.ok)throw new AxiosError(data.message||data.detail||'请求失败',String(response.status),config,null,result);
 return result;
}});
apiClient.interceptors.request.use(config=>{if(config.data && !(config.data instanceof FormData) && !['/admin/','/notifications/','/approvals/','/attachments/','/business-portal/','/dashboard/','/vendor-portal/','/vendors/','/templates/'].some(part=>config.url?.includes(part)))config.data=keysToSnakeCase(config.data);if(config.params)config.params=keysToSnakeCase(config.params);return config;});
apiClient.interceptors.response.use(response=>{if(!(response.data instanceof Blob))response.data=keysToCamelCase(response.data);if(response.data?.code!=null && ![0,200].includes(response.data.code))throw new Error(response.data.message||'请求失败');return response;});
export default apiClient;
