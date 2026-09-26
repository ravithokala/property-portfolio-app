/* Caches the app shell only (ROADMAP PWA-D1). Portfolio data is never cached: requests to
   other origins (the API, Google sign-in) and anything but GET go straight to the network.
   A release opens from its own cache, filled completely when this worker installs, so the app does
   not wait for GitHub on every open. version.js always goes to the network: it is how app.js
   notices a new release, which installs a new worker and cache before the page reloads onto it. */
const VERSION='shell-45ab00d-868df43a72d4';
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

self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||url.origin!==self.location.origin)return;
  // Unstamped development copies and version.js: network first, the cache only when offline.
  if(VERSION.endsWith('-development')||/\/version\.js$/.test(url.pathname)){
    event.respondWith(fetch(event.request,{cache:'no-store'}).catch(()=>caches.match(event.request).then(hit=>hit||Response.error())));
    return;
  }
  // A release: this release's cached copy (a reload marker such as ?v= is ignored for the page itself).
  event.respondWith(caches.open(VERSION)
    .then(cache=>cache.match(event.request,{ignoreSearch:event.request.mode==='navigate'}))
    .then(hit=>hit||fetch(event.request)));
});
