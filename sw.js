const CACHE="myai-shell-v8";
const ASSETS=["./","./index.html","./style.css?v=8","./documents.js?v=8","./app.js?v=8","./manifest.webmanifest","./icon.svg","./apple-touch-icon.png","./icon-192.png","./icon-512.png","./vendor/pdf.mjs","./vendor/pdf.worker.mjs","./vendor/mammoth.browser.min.js","./vendor/jsQR.js","./vendor/xlsx.full.min.js"];
self.addEventListener("install",e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener("activate",e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith("myai-shell-")&&k!==CACHE).map(k=>caches.delete(k))))
  .then(()=>self.clients.claim())
  .then(()=>self.clients.matchAll({type:"window"})).then(clients=>clients.forEach(client=>client.postMessage({type:"MYAI_UPDATED"})))));
self.addEventListener("fetch",e=>{
  const u=new URL(e.request.url);
  if(e.request.method!=="GET" || u.origin!==location.origin) return;
  // Only cache the public application shell. Setup links contain a private
  // encrypted envelope in the fragment; never cache arbitrary navigations.
  if(e.request.mode==="navigate"){
    e.respondWith(fetch(e.request).catch(()=>caches.match(new URL("./index.html",self.registration.scope).href)));
    return;
  }
  if(!ASSETS.some(asset=>new URL(asset,self.registration.scope).href===u.href))return;
  e.respondWith(caches.match(e.request).then(cached=>cached||fetch(e.request).then(r=>{
    if(r.ok){const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));}return r;
  }).catch(()=>cached)));
});
