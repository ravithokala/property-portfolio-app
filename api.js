/* Talks to the thin Apps Script API (ROADMAP PWA-D1). The only thing kept on this device is
   the app session key; portfolio answers stay in memory. */
(function (root) {
  'use strict';
  // Named for this app: other apps on the same github.io origin use their own keys.
  const SESSION_KEY='property-portfolio.session';
  const read=()=>{try{const key=root.localStorage.getItem(SESSION_KEY);return /^[0-9a-f]{64}$/.test(key||'')?key:null;}catch(_){return null;}};
  const save=key=>{try{root.localStorage.setItem(SESSION_KEY,key);}catch(_){/* storage blocked: sign in again next time */}};
  const forget=()=>{try{root.localStorage.removeItem(SESSION_KEY);}catch(_){/* nothing stored */}};
  const failure=code=>({ok:false,schema_version:1,error:{code}});

  function create(config) {
    // A plain-text POST needs no CORS pre-flight, which Apps Script cannot answer.
    async function post(body) {
      const response=await root.fetch(config.apiUrl,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},
        body:JSON.stringify(body),redirect:'follow',credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer'});
      if(!response.ok)throw Error('HTTP '+response.status);
      const result=await response.json();
      if(!result||typeof result!=='object'||typeof result.ok!=='boolean')throw Error('Unexpected answer');
      return result;
    }
    return {
      hasSession:()=>read()!==null,
      // Exchanges a Google ID token (kept in memory only) for this device's app session.
      async signIn(idToken) {
        let result;
        try{result=await post({action:'auth.start',id_token:idToken});}catch(_){return failure('OFFLINE');}
        if(result.ok&&result.data&&/^[0-9a-f]{64}$/.test(result.data.session)){save(result.data.session);return {ok:true};}
        return failure(result.error&&typeof result.error.code==='string'?result.error.code:'UNAUTHENTICATED');
      },
      async load(kind) {
        if(kind!=='home'&&kind!=='attention')return failure('BAD_REQUEST');
        const session=read();
        if(!session)return failure('UNAUTHENTICATED');
        let result;
        try{result=await post({action:kind,session});}catch(_){return failure('OFFLINE');}
        // An expired, revoked or no-longer-allowed session is dropped from this device.
        if(!result.ok&&result.error&&['UNAUTHENTICATED','ACCESS_DENIED'].includes(result.error.code))forget();
        return result;
      },
      async signOut() {
        const session=read();forget();
        if(session)await post({action:'auth.end',session}).catch(()=>{/* offline: the key is gone here anyway */});
      }
    };
  }
  root.PortfolioApi={create,SESSION_KEY};
})(globalThis);
