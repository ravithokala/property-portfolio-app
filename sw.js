/* Caches the app shell only (ROADMAP PWA-D1). Portfolio data is never cached: requests to
   other origins (the API, Google sign-in) and anything but GET go straight to the network.
   A release opens from its own cache, filled completely when this worker installs, so the app does
   not wait for GitHub on every open. Only the release check (version.js with a query) goes to the network:
   it is how app.js notices a new release, which installs a new worker and cache before the page reloads. */
const VERSION='shell-af0914c-4e8daf8bbe40';
const SHELL=['./','index.html','styles.css','config.js','version.js','ui.js','api.js','app.js',
  'manifest.webmanifest','icons/icon.svg','icons/icon-192.png','icons/apple-touch-icon.png'];

// Fills this release's cache. Every file comes from GitHub, never from the browser's own cache (which may
// hold the previous release for up to 10 minutes); if version.js is not this release's own, the cache is
// dropped again so files from two releases are never mixed.
function fill(){
  return caches.open(VERSION)
    .then(cache=>cache.addAll(SHELL.map(url=>new Request(url,{cache:'reload'}))).then(()=>cache.match('version.js')))
    .then(async response=>{
      const commit=/^shell-([0-9a-f]{7,40})-[0-9a-f]{12}$/.exec(VERSION);
      if(commit&&!(response&&(await response.text()).includes('· '+commit[1]+"'"))){
        await caches.delete(VERSION);throw Error('stale release files');
      }
    });
}
// If the saved copy is ever missing or incomplete (the browser or anything else cleared it), it is filled
// again in the background, so the app can still open without a connection next time.
let repairing=null;
function repair(){
  if(!repairing)repairing=caches.open(VERSION).then(cache=>cache.keys())
    .then(keys=>keys.length>=SHELL.length?null:fill()).catch(()=>{/* tried again on the next miss */}).then(()=>{repairing=null;});
  return repairing;
}

self.addEventListener('install',event=>{
  event.waitUntil(fill().then(()=>self.skipWaiting()));
});

// The page asks which release this worker serves before it reloads for a new one.
self.addEventListener('message',event=>{
  if(event.data&&event.data.type==='version'&&event.ports&&event.ports[0])event.ports[0].postMessage({version:VERSION});
});

// Only this app's own earlier releases are removed. The other apps on this origin (the family calendar,
// household admin) keep their saved copies in the same cache storage, under other names: until 2026-10-02
// every release here deleted them, and those apps could not open without a connection until next opened online.
const OWN_CACHE=/^shell-(development|[0-9a-f]{7,40}-[0-9a-f]{12})$/;
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys()
    .then(keys=>Promise.all(keys.filter(key=>key!==VERSION&&OWN_CACHE.test(key)).map(key=>caches.delete(key))))
    .then(()=>self.clients.claim()));
});

self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||url.origin!==self.location.origin)return;
  // Unstamped development copies: network first, the cache only when offline.
  if(VERSION.endsWith('-development')){
    event.respondWith(fetch(event.request,{cache:'no-store'}).catch(()=>caches.match(event.request).then(hit=>hit||Response.error())));
    return;
  }
  // The release check (version.js with a query) is the one thing that must come from the network.
  if(/\/version\.js$/.test(url.pathname)&&url.search){
    event.respondWith(fetch(event.request,{cache:'no-store'}).catch(()=>Response.error()));
    return;
  }
  // Everything the page itself loads, its own version.js included, comes from this release's saved copy, so
  // the app starts with no connection and also when connected with no internet behind it (mobile data used
  // up), where a network request would hang rather than fail. The site's "Vary" header is ignored (the files
  // are the same for everyone), and the page matches whatever its query (a reload marker such as ?v=).
  event.respondWith(caches.open(VERSION)
    .then(cache=>cache.match(event.request,{ignoreSearch:event.request.mode==='navigate',ignoreVary:true}))
    .then(hit=>{
      if(hit)return hit;
      event.waitUntil(repair());
      return fetch(event.request);
    }));
});
