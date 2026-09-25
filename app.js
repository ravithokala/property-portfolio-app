/* Starts the app: Google sign-in, the API adapter and the shell-only service worker. */
(function (root) {
  'use strict';
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
    signInProblem=result.ok?null:result.error.code==='UNAUTHENTICATED'?'SIGN_IN_FAILED':result.error.code;
    if(afterSignIn)afterSignIn();
  }
  const adapter={
    version:root.PortfolioVersion,
    async load(kind) {
      if(!api)return {ok:false,schema_version:1,error:{code:'NOT_CONFIGURED'}};
      // Show a refused sign-in once (e.g. an account that is not allowlisted), then offer sign-in again.
      if(signInProblem){const code=signInProblem;signInProblem=null;return {ok:false,schema_version:1,error:{code}};}
      return api.load(kind);
    },
    signOut:async()=>{if(api)await api.signOut();const id=gis();if(id)id.disableAutoSelect();},
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
  root.addEventListener('DOMContentLoaded',()=>{
    root.PortfolioUi.mount(root.document,adapter);
    if('serviceWorker' in root.navigator)root.navigator.serviceWorker.register('sw.js').catch(()=>{/* the app works without it */});
  });
})(globalThis);
