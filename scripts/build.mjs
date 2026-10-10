import { mkdir, cp } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
await mkdir(new URL('../dist/',import.meta.url),{recursive:true});
for(const path of ['index.html','styles.css','manifest.webmanifest','sw.js','src','assets'])await cp(root+path,root+'dist/'+path,{recursive:true});
console.log('部署文件已生成至 dist/，可上传到任意支持 HTTPS 的静态网站托管服务。');
