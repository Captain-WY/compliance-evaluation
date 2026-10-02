import {createContext,useContext,useEffect,useState, type ReactNode} from 'react';
import type {AuthUser} from '../modules/compliance-shared/types';
import {HQ_MENU_IDS,BRANCH_MENU_IDS} from '../modules/compliance-shared/constants/menu';
import {requestJson,tokenStore} from './transport';
export interface PlatformUser extends AuthUser {role_codes:string[];permissions:string[];roles:string[];realName:string;name:string;departmentId:string;email?:string;phone?:string;avatarUrl?:string;employeeNo?:string;role:string;}
export function normalizeUser(raw:Record<string,any>):PlatformUser{
 const codes:string[]=raw.role_codes || (raw.roles||[]).map((r:any)=>typeof r==='string'?r:r.code);
 const admin=codes.includes('platform_admin');const hq=admin||codes.includes('hq_business');const branch=codes.includes('branch_business');
 const displayName=raw.displayName||raw.real_name||raw.realName||raw.username;
 return {...raw,username:raw.username,id:raw.id||raw.userId,userId:raw.userId||raw.id,displayName,name:displayName,realName:displayName,role_codes:codes,roles:codes,permissions:raw.permissions||[],roleIds:raw.roleIds||codes,permissionIds:raw.permissionIds||raw.permissions||[],orgId:raw.orgId||raw.department_id,departmentId:raw.department_id||raw.orgId,department:raw.department||raw.orgName||'',organizationName:raw.organizationName||raw.orgName||'',level:raw.level||(branch?'BRANCH_COMPANY':'COMPLIANCE_DEPARTMENT'),menuMode:branch?'branch-only':'full-hq',permittedMenuIds:raw.permittedMenuIds||(hq?[...HQ_MENU_IDS,'hq-workflow-designer','hq-scheduler','hq-unified-workbench','hq-data-cockpit'].filter(id=>admin||!['hq-org','hq-dictionaries'].includes(id)):branch?BRANCH_MENU_IDS:[]),dataScope:raw.dataScope||'own',dataScopes:raw.dataScopes||[raw.dataScope||'own'],orgScopeIds:raw.orgScopeIds||[raw.orgId||raw.department_id].filter(Boolean),defaultMenuId:branch?'branch-tasks':'hq-plans',taskView:branch?'branch':'hq',avatarLabel:displayName?.slice(0,1)||'',title:raw.title||'',role:codes.includes('external_lawyer')?'EXTERNAL_LAWYER':codes.includes('department_business')||branch?'BUSINESS_UNIT':hq?'LEGAL_ADMIN':'UNASSIGNED'};
}
interface AuthValue {user:PlatformUser|null;isAuthenticated:boolean;isLoading:boolean;login:(username:string,password:string)=>Promise<PlatformUser>;logout:()=>Promise<void>;refreshUser:()=>Promise<void>}
const Context=createContext<AuthValue|null>(null);
export function AuthProvider({children}:{children:ReactNode}){
 const [user,setUser]=useState<PlatformUser|null>(null);const [isLoading,setLoading]=useState(true);
 const refreshUser=async()=>{const current=normalizeUser(await requestJson('/api/platform/auth/me'));setUser(current);localStorage.setItem('compliance-platform-user',JSON.stringify(current));};
 useEffect(()=>{const ended=()=>{setUser(null);localStorage.removeItem('compliance-platform-user');};window.addEventListener('platform-session-ended',ended);if(tokenStore.get())refreshUser().catch(()=>tokenStore.clear()).finally(()=>setLoading(false));else setLoading(false);return()=>window.removeEventListener('platform-session-ended',ended);},[]);
 const login=async(username:string,password:string)=>{const session=await requestJson('/api/platform/auth/login',{method:'POST',body:JSON.stringify({username,password})});tokenStore.set(session.access_token);try{const current=normalizeUser(await requestJson('/api/platform/auth/me'));setUser(current);localStorage.setItem('compliance-platform-user',JSON.stringify(current));return current;}catch(error){tokenStore.clear();throw error;}};
 const logout=async()=>{try{await requestJson('/api/platform/auth/logout',{method:'POST'});}finally{tokenStore.clear();}};
 return <Context.Provider value={{user,isAuthenticated:!!user,isLoading,login,logout,refreshUser}}>{children}</Context.Provider>;
}
export function useAuth(){const value=useContext(Context);if(!value)throw new Error('Missing AuthProvider');return value;}
