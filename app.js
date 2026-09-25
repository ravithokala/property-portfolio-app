/* Starts the app: Google sign-in, the API adapter and the shell-only service worker. */
(function (root) {
  'use strict';
  // GitHub Pages cannot send frame-ancestors, so the app refuses to run inside another page
  // (no taps can be tricked through a hidden frame).
  let framed=false;try{framed=root.top!==root.self;}catch(_){framed=true;}
  if(framed){root.addEventListener('DOMContentLoaded',()=>{const main=root.document.getElementById('main');
    if(main){main.textContent='This app cannot be shown inside another page. Open it directly.';main.setAttribute('aria-busy','false');}});return;}
  const config=root.PortfolioConfig||{};
  const configured=/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(config.apiUrl||'') &&
    /^[A-Za-z0-9._-]+\.apps\.googleusercontent\.com$/.test(config.clientId||'');
  const api=configured?root.PortfolioApi.create(config):null;
  let signInProblem=null, afterSignIn=null, gisReady=false;
  const gis=()=>root.google&&root.google.accounts&&root.google.accounts.id;

  async function waitForGis() {
    for(let i=0;i<100&&!gis();i++)await new Promise(resolve=>root.setTimeout(resolve,100));
    return Boolean(gis());
  }
  // The Google ID token goes straight to the server and is never stored.
  async function onCredential(response) {
    const result=await api.signIn(response&&response.credential);
    // A token the server could not verify is shown as a sign-in problem, not a silent retry.
    signInProblem=result.ok?null:{code:result.error.code==='UNAUTHENTICATED'?'SIGN_IN_FAILED':result.error.code,reason:result.error.reason};
    if(afterSignIn)afterSignIn();
  }
  const adapter={
    version:root.PortfolioVersion,
    async load(kind) {
      if(!api)return {ok:false,schema_version:1,error:{code:'NOT_CONFIGURED'}};
      // Show a refused sign-in once (e.g. an account that is not allowlisted), then offer sign-in again.
      if(signInProblem){const error=signInProblem;signInProblem=null;return {ok:false,schema_version:1,error};}
      return api.load(kind);
    },
    save:async(action,payload)=>api?api.write(action,payload):{ok:false,schema_version:1,error:{code:'NOT_CONFIGURED'}},
    newRequestId:()=>root.crypto.randomUUID(),
    signOut:async()=>{if(api)await api.signOut();const id=gis();if(id)id.disableAutoSelect();},
    openDocument:async(tab,id,field)=>api?api.openDocument(tab,id,field):{ok:false,error:{code:'NOT_CONFIGURED'}},
    signOutEverywhere:async()=>{const result=api?await api.signOutEverywhere():{ok:false,error:{code:'NOT_CONFIGURED'}};const id=gis();if(id&&result.ok)id.disableAutoSelect();return result;},
    async renderSignIn(host,done) {
      afterSignIn=done;
      if(!await waitForGis()){host.textContent='Google sign-in did not load. Check the connection and reload.';return;}
      if(!gisReady){
        gis().initialize({client_id:config.clientId,callback:onCredential,auto_select:true,use_fedcm_for_prompt:true,cancel_on_tap_outside:false});
        gisReady=true;
      }
      gis().renderButton(host,{theme:'outline',size:'large',text:'signin_with',shape:'pill'});
      gis().prompt();
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
    try{const response=await root.fetch('version.js',{cache:'no-store',credentials:'omit'});
      const match=/PortfolioVersion='([^'\n]{1,80})'/.exec(await response.text());latest=match&&match[1];}catch(_){return false;}
    if(!latest||latest===running)return false;
    const marker='?v='+encodeURIComponent(latest);
    if(root.location.search===marker)return false;
    try{const registration=await root.navigator.serviceWorker.getRegistration();if(registration)await registration.update();}catch(_){/* reload anyway */}
    root.location.replace(root.location.pathname+marker+root.location.hash);
    return true;
  }
  adapter.checkForUpdate=checkForUpdate;
  root.addEventListener('DOMContentLoaded',()=>{
    root.PortfolioUi.mount(root.document,adapter);
    const doc=root.document;
    if(doc&&typeof doc.addEventListener==='function')doc.addEventListener('visibilitychange',()=>{if(doc.visibilityState==='visible')checkForUpdate(false);});
    const refresh=doc&&typeof doc.getElementById==='function'?doc.getElementById('refresh'):null;
    if(refresh)refresh.addEventListener('click',()=>checkForUpdate(true));
    if('serviceWorker' in root.navigator)root.navigator.serviceWorker.register('sw.js').catch(()=>{/* the app works without it */});
  });
})(globalThis);
