/* Starts the app: Google sign-in, the API adapter and the shell-only service worker. */
import { CONFIG } from './config.js';
import { PortfolioApi } from './api.js';
import { init, googleToken, showPrompt, signOutOfGoogle } from './auth.js';
import { watchForUpdates } from './update.js';
import { inFrame, FRAMED_MESSAGE } from './guard.js';
const root=globalThis;
// GitHub Pages cannot send frame-ancestors, so the app refuses to run inside another page
// (no taps can be tricked through a hidden frame). The check and its wording are ../app-kit's (guard.js).
if(inFrame()){root.addEventListener('DOMContentLoaded',()=>{const main=root.document.getElementById('main');
  if(main){main.textContent=FRAMED_MESSAGE;main.setAttribute('aria-busy','false');}});}
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
  // A home-screen app is resumed, not reloaded, so it could keep showing an old version. When the app
  // opens, comes back into view or ↻ is tapped, a newer published version.js reloads the page into it, once
  // the new release's service worker is in charge; never over a half-filled form, never in a loop. The check
  // is ../app-kit's (update.js): this app's own design, now the same file in all three apps.
  let checkNow=null;
  adapter.checkForUpdate=force=>checkNow?checkNow(force):Promise.resolve(false);
  root.addEventListener('DOMContentLoaded',()=>{
    root.PortfolioUi.mount(root.document,adapter);
    const doc=root.document;
    // Starts watching, and checks straight away: the app opens from its cached release.
    checkNow=watchForUpdates({running:root.PortfolioVersion,
      busy:()=>Boolean(doc&&typeof doc.querySelector==='function'&&doc.querySelector('main form'))});
    const refresh=doc&&typeof doc.getElementById==='function'?doc.getElementById('refresh'):null;
    if(refresh)refresh.addEventListener('click',()=>checkNow(true));
    if('serviceWorker' in root.navigator)root.navigator.serviceWorker.register('sw.js').catch(()=>{/* the app works without it */});
  });
}
