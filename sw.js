/* Caches the app shell only (ROADMAP PWA-D1). Portfolio data is never cached: requests to
   other origins (the API, Google sign-in) and anything but GET go straight to the network. */
const VERSION='shell-1e9779f-c4eed2c52c52';
const SHELL=['./','index.html','styles.css','config.js','version.js','ui.js','api.js','app.js',
  'manifest.webmanifest','icons/icon.svg','icons/icon-192.png','icons/apple-touch-icon.png'];

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(VERSION).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting()));
});

self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys()
    .then(keys=>Promise.all(keys.filter(key=>key!==VERSION).map(key=>caches.delete(key))))
    .then(()=>self.clients.claim()));
});

// Network first, so a new version shows straight away; the cache covers going offline.
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||url.origin!==self.location.origin)return;
  event.respondWith(fetch(event.request,{cache:'no-cache'})
    .then(response=>{
      if(response.ok){const copy=response.clone();caches.open(VERSION).then(cache=>cache.put(event.request,copy));}
      return response;
    })
    .catch(()=>caches.match(event.request).then(hit=>hit||Response.error())));
});
