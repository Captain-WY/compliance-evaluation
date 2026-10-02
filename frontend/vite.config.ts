import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
export default defineConfig({plugins:[react(),tailwindcss()],resolve:{alias:{'@cases':path.resolve(__dirname,'src/modules/cases/src'),'@':path.resolve(__dirname,'.')}},server:{host:'127.0.0.1',port:3010,proxy:{'/api':{target:process.env.API_PROXY_TARGET || 'http://127.0.0.1:8010',changeOrigin:true}}}});
