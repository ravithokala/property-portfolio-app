/* Starts the app: Google sign-in, the API adapter and the shell-only service worker. */
import { CONFIG } from './config.js';
import { PortfolioApi } from './api.js';
import { init, googleToken, showPrompt, signOutOfGoogle } from './auth.js';
const root=globalThis;
// GitHub Pages cannot send frame-ancestors, so the app refuses to run inside another page
// (no taps can be tricked through a hidden frame).
let framed=false;try{framed=root.top!==root.self;}catch(_){framed=true;}
if(framed){root.addEventListener('DOMContentLoaded',()=>{const main=root.document.getElementById('main');
  if(main){main.textContent='This app cannot be shown inside another page. Open it directly.';main.setAttribute('aria-busy','false');}});}
else start();
function start() {
  const config=CONFIG||{};
  const configured=/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(config.apiUrl||'') &&
    /^[A-Za-z0-9._-]+\.apps\.googleusercontent\.com$/.test(config.clientId||'');
  const api=configured?PortfolioApi.create(config):null;
  let signInProblem=null, afterSignIn=null, listening=false, confirmDone=null;

  // Google's button and prompt are ../app-kit's (auth.js, the same in all three apps). This app listens for
  // one credential at a time and goes on listening after each, so the button still works if the screen is
  // not drawn again; Google's own prompt is shown each time the button is drawn, as before.
  function listen() {
    if(listening)return;
    listening=true;
    googleToken({prompt:false}).then(token=>{listening=false;listen();return onCredential({credential:token});});
  }
  // Draws Google's button in host; false (with the reason shown in host) if Google sign-in did not load.
  async function showGoogle(host,text,missing) {
    try{await init(config.clientId,host,text);}catch(_){host.textContent=missing;return false;}
    listen();showPrompt();
    return true;
  }
  // The Google ID token goes straight to the server and is never stored.
  async function onCredential(response) {
    // A credential asked for by "confirm it's you" (uploads) confirms this session instead of signing in.
    if(confirmDone){const done=confirmDone;confirmDone=null;done(await api.confirmSignIn(response&&response.credential));return;}
    const result=await api.signIn(response&&response.credential);
    // A token the server could not verify is shown as a sign-in problem, not a silent retry.
    signInProblem=result.ok?null:{code:result.error.code==='UNAUTHENTICATED'?'SIGN_IN_FAILED':result.error.code,reason:result.error.reason};
    if(afterSignIn)afterSignIn();
  }
  const adapter={
    version:root.PortfolioVersion,
    async load(kind,_scenario,options) {
      if(!api)return {ok:false,schema_version:1,error:{code:'NOT_CONFIGURED'}};
      // Show a refused sign-in once (e.g. an account that is not allowlisted), then offer sign-in again.
      if(signInProblem){const error=signInProblem;signInProblem=null;return {ok:false,schema_version:1,error};}
      return api.load(kind,options);
    },
    // The last answer saved on this device: shown at once, then refreshed (and all there is when offline).
    cached:()=>api&&!signInProblem?api.lastAnswer():null,
    dropCached:()=>{if(api)api.forgetAnswer();},
    save:async(action,payload)=>api?api.write(action,payload):{ok:false,schema_version:1,error:{code:'NOT_CONFIGURED'}},
    newRequestId:()=>root.crypto.randomUUID(),
    signOut:async()=>{if(api)await api.signOut();signOutOfGoogle();},
    uploadDocument:async payload=>api?api.uploadDocument(payload):{ok:false,error:{code:'NOT_CONFIGURED'}},
    // Shows Google's button in host; done(result) once the server has confirmed the account.
    async renderConfirm(host,done) {
      if(!api){done({ok:false,error:{code:'NOT_CONFIGURED'}});return;}
      // Set first: the credential may arrive as soon as the button is drawn.
      confirmDone=done;
      if(!await showGoogle(host,'continue_with','Google sign-in did not load. Check the connection and try again.'))confirmDone=null;
    },
    openDocument:async(tab,id,field)=>api?api.openDocument(tab,id,field):{ok:false,error:{code:'NOT_CONFIGURED'}},
    checkHealth:async()=>api?api.health():{ok:false,error:{code:'NOT_CONFIGURED'}},
    signOutEverywhere:async()=>{const result=api?await api.signOutEverywhere():{ok:false,error:{code:'NOT_CONFIGURED'}};if(result.ok)signOutOfGoogle();return result;},
    async renderSignIn(host,done) {
      afterSignIn=done;
      await showGoogle(host,'signin_with','Google sign-in did not load. Check the connection and reload.');
    }
  };
  if(!api)delete adapter.signOut;
  // A home-screen app is resumed, not reloaded, so it could keep showing an old version. When the
  // app comes back into view or ↻ is tapped, a newer published version.js reloads the page. The URL
  // names the version being loaded (no device storage), so a stale copy cannot reload in a loop.
  let checkedAt=0;
  async function checkForUpdate(force) {
    const running=root.PortfolioVersion,doc=root.document;
    if(typeof running!=='string'||running==='development'||typeof root.fetch!=='function')return false;
    if(!force&&Date.now()-checkedAt<60000)return false;
    checkedAt=Date.now();
    // Never throw away a half-filled form.
    if(doc&&typeof doc.querySelector==='function'&&doc.querySelector('main form'))return false;
    let latest=null;
    // A unique query so neither the browser nor GitHub's cache (up to 10 minutes) answers with an old copy.
    // Given up on after 10 seconds: with no internet behind the connection the request would hang.
    const stop=typeof root.AbortController==='function'?new root.AbortController():null,timer=stop?root.setTimeout(()=>stop.abort(),10000):null;
    try{const response=await root.fetch('version.js?t='+Date.now(),{cache:'no-store',credentials:'omit',signal:stop?stop.signal:undefined});
      const match=/PortfolioVersion='([^'\n]{1,80})'/.exec(await response.text());latest=match&&match[1];}catch(_){return false;}
    finally{if(timer)root.clearTimeout(timer);}
    if(!latest||latest===running)return false;
    const marker='?v='+encodeURIComponent(latest);
    // Reloaded for this release already: never loop.
    if(root.location.search===marker)return false;
    // With a service worker, reload only once the new release's worker is in charge: a reload answered by
    // the old worker would only show the old copy again. The saved copy is never deleted from here.
    let registration=null;
    try{registration=await root.navigator.serviceWorker.getRegistration();}catch(_){/* no worker: plain reload */}
    if(registration){
      try{await registration.update();}catch(_){return false;}
      const next=registration.installing||registration.waiting;
      if(next){
        const ready=next.state==='activated'||await new Promise(resolve=>{const timer=root.setTimeout(()=>resolve(false),30000);
          next.addEventListener('statechange',()=>{if(next.state==='activated'||next.state==='redundant'){root.clearTimeout(timer);resolve(next.state==='activated');}});});
        if(!ready)return false;
      } else {
        // No new worker in sight: reload only if the worker already in charge is the new release.
        const commit=(/· ([0-9a-f]{7,40})$/.exec(latest)||[])[1],version=registration.active?await workerVersion(registration.active):null;
        if(!commit||!version||!version.includes('-'+commit+'-'))return false;
      }
    }
    root.location.replace(root.location.pathname+marker+root.location.hash);
    return true;
  }
  // Asks a service worker which release it serves (null if it does not answer within 2 seconds).
  function workerVersion(worker) {
    return new Promise(resolve=>{
      try{const channel=new root.MessageChannel(),timer=root.setTimeout(()=>resolve(null),2000);
        channel.port1.onmessage=event=>{root.clearTimeout(timer);resolve(event.data&&typeof event.data.version==='string'?event.data.version:null);};
        worker.postMessage({type:'version'},[channel.port2]);}
      catch(_){resolve(null);}
    });
  }
  adapter.checkForUpdate=checkForUpdate;
  root.addEventListener('DOMContentLoaded',()=>{
    root.PortfolioUi.mount(root.document,adapter);
    const doc=root.document;
    // The app opens from its cached release, so check for a newer one straight away too.
    checkForUpdate(false);
    if(doc&&typeof doc.addEventListener==='function')doc.addEventListener('visibilitychange',()=>{if(doc.visibilityState==='visible')checkForUpdate(false);});
    const refresh=doc&&typeof doc.getElementById==='function'?doc.getElementById('refresh'):null;
    if(refresh)refresh.addEventListener('click',()=>checkForUpdate(true));
    if('serviceWorker' in root.navigator)root.navigator.serviceWorker.register('sw.js').catch(()=>{/* the app works without it */});
  });
}
