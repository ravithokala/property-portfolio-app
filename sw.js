/* Caches the app shell only (ROADMAP PWA-D1). Portfolio data is never cached: requests to
   other origins (the API, Google sign-in) and anything but GET go straight to the network.
   A release opens from its own cache, filled completely when this worker installs, so the app does
   not wait for GitHub on every open. Only the release check (version.js with a query) goes to the network:
   it is how app.js notices a new release, which installs a new worker and cache before the page reloads.
   Only this top part is this app's own. The logic below the marker line is ../app-kit's (scripts/kit.json):
   this app's design, now shared with the family calendar and household admin. Never edit it here.
   VERSION is replaced at publish; LEGACY matches the names this app's caches had before they were named by its path. */
const VERSION='shell-afa3ad3-967a4b1624c0';
const SHELL=['./','index.html','styles.css','config.js','version.js','ui.js','api.js','auth.js','request.js','calls.js','update.js','guard.js','freshness.js','checks.js','app.js',
  'manifest.webmanifest','icons/icon.svg','icons/icon-192.png','icons/apple-touch-icon.png'];
const LEGACY=/^shell-(development|[0-9a-f]{7,40}-[0-9a-f]{12})$/;

// ---- Below this line: app-kit/pwa/sw-core.js. GENERATED: change it in ../app-kit, then run "node ../app-kit/sync.js" in this app. ----

// The service worker's logic, the same in every app. Each app's pwa/sw.js starts with its own
// VERSION, SHELL (the files to save) and LEGACY, then this, below the marker line.
//
// A release opens from its own saved copy, filled completely when this worker installs, so the app
// starts at once: with no connection, and also when connected with no internet behind it (mobile
// data used up), where a request would hang rather than fail. It does not wait for the site on
// every open. Only the release check (version.js with a query) goes to the network: it is how the
// page notices a newer release, which installs a new worker and a new saved copy before the page
// reloads (pwa/update.js, or the app's own code). The data is never saved here.
// The design is the Property Portfolio's (2026-09), used by all three apps since 2026-10-02.

/**
 * The worker's global scope. Typed loosely: the DOM and WebWorker type libraries cannot be combined.
 * @type {any}
 */
const sw = self;

/**
 * This app's saved copy. The apps share one origin (github.io), and so one cache storage: each
 * app's copy is named by its own path ("/household-admin-app/shell-0a1b2c3-0123456789ab"), and an
 * app only ever deletes its own. LEGACY (the app's own, in its header) matches the names this app
 * used before copies were named by path.
 */
const APP = new URL('./', sw.location.href).pathname;
const CACHE = `${APP}${VERSION}`;
/**
 * A published release: publishing stamps VERSION with the commit and a hash of every file, so any
 * change is a new release. Anything else is an unpublished copy (the marker publishing replaces).
 */
const RELEASE = /^shell-([0-9a-f]{7,40})-[0-9a-f]{12}$/.exec(VERSION);

/**
 * Fills this release's saved copy. Every file comes from the site itself, never the browser's own
 * copy (which may hold the previous release for ten minutes). If version.js is not this release's
 * own, the copy is dropped again, so files from two releases are never mixed.
 */
function fill() {
  return caches.open(CACHE)
    .then((cache) => cache.addAll(SHELL.map((url) => new Request(url, { cache: 'reload' }))).then(() => cache.match('version.js')))
    .then(async (response) => {
      if (RELEASE && !(response && (await response.text()).includes(`· ${RELEASE[1]}'`))) {
        await caches.delete(CACHE);
        throw new Error('stale release files');
      }
    });
}

/**
 * If the saved copy is ever missing or incomplete (the browser or anything else cleared it), it is
 * filled again in the background, so the app can still open without a connection next time.
 * @type {Promise<void>|null}
 */
let repairing = null;
function repair() {
  if (!repairing) {
    repairing = caches.open(CACHE).then((cache) => cache.keys())
      .then((keys) => (keys.length >= SHELL.length ? null : fill()))
      .catch(() => { /* tried again on the next miss */ })
      .then(() => { repairing = null; });
  }
  return repairing;
}

sw.addEventListener('install', (/** @type {any} */ event) => {
  event.waitUntil(fill().then(() => sw.skipWaiting()));
});

// The page asks which release this worker serves before it reloads for a new one.
sw.addEventListener('message', (/** @type {any} */ event) => {
  if (event.data && event.data.type === 'version' && event.ports && event.ports[0]) event.ports[0].postMessage({ version: VERSION });
});

// Only this app's own earlier copies are removed; the other apps' stay.
sw.addEventListener('activate', (/** @type {any} */ event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && (k.startsWith(APP) || LEGACY.test(k))).map((k) => caches.delete(k))))
    .then(() => sw.clients.claim()));
});

sw.addEventListener('fetch', (/** @type {any} */ event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== sw.location.origin) return;
  // An unpublished copy: the network first, the saved copy only with no connection.
  if (!RELEASE) {
    event.respondWith(fetch(event.request, { cache: 'no-store' })
      .catch(() => caches.open(CACHE).then((cache) => cache.match(event.request, { ignoreVary: true })).then((hit) => hit || Response.error())));
    return;
  }
  // The release check (version.js with a query) is the one thing that must come from the network.
  if (/\/version\.js$/.test(url.pathname) && url.search) {
    event.respondWith(fetch(event.request, { cache: 'no-store' }).catch(() => Response.error()));
    return;
  }
  // Everything the page itself loads, its own version.js included, comes from this release's saved
  // copy. The site's "Vary" header is ignored (the files are the same for everyone), and the page
  // matches whatever its query (a reload marker such as ?v=).
  event.respondWith(caches.open(CACHE)
    .then((cache) => cache.match(event.request, { ignoreSearch: event.request.mode === 'navigate', ignoreVary: true }))
    .then((hit) => {
      if (hit) return hit;
      event.waitUntil(repair());
      return fetch(event.request);
    }));
});
