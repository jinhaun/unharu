// Local-only static preview: never proxy real APIs or read private configuration.
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp'};
http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://localhost');
  const pathname=decodeURIComponent(url.pathname);
  if(pathname.startsWith('/api/')){
   res.writeHead(503,{'Content-Type':'application/json','Cache-Control':'no-store'});
   res.end(JSON.stringify({ready:false,error:'LOCAL_PREVIEW_NO_EXTERNAL_API'}));return;
  }
  const relative=pathname==='/'?'index.html':pathname.slice(1);
  if(!/^(index\.html|newsletter\.html|newsletter-v10-assets\/[^?]+|assets\/[^?]+|data\/[^?]+)$/.test(relative))throw new Error();
  const full=path.resolve(root,relative);
  if(!full.startsWith(root+path.sep))throw new Error();
  let data=await readFile(full);
  res.writeHead(200,{'Content-Type':types[path.extname(full)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  res.end(data);
 }catch{res.writeHead(404);res.end('Not found');}
}).listen(4259,'127.0.0.1',()=>console.log('Local preview: http://127.0.0.1:4259/?test=nanumsquare-v59'));
