import {toast} from 'sonner';
export function developmentBoundary(operation:string,write=false){
 window.dispatchEvent(new CustomEvent('platform-development-only',{detail:operation}));
 if(write){const message=`开发占位功能尚未接入持久化：${operation}`;toast.error(message);throw new Error(message);}
}
