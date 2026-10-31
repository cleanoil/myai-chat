const CACHE="myai-shell-v3";
const ASSETS=["./","./index.html","./style.css","./app.js?v=3","./manifest.webmanifest","./icon.svg","./apple-touch-icon.png","./icon-192.png","./icon-512.png"];
self.addEventListener("install",e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener("activate",e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith("myai-shell-")&&k!==CACHE).map(k=>caches.delete(k))))
  .then(()=>self.clients.claim())
  .then(()=>self.clients.matchAll({type:"window"})).then(clients=>clients.forEach(client=>client.postMessage({type:"MYAI_UPDATED"})))));
self.addEventListener("fetch",e=>{
  const u=new URL(e.request.url);
  if(e.request.method!=="GET" || u.origin!==location.origin) return;
  e.respondWith(caches.match(e.request).then(cached=>cached||fetch(e.request).then(r=>{
    const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));return r;
  }).catch(()=>cached)));
});
