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
    // Apps Script can be slow to start, but a request never waits more than 90 seconds.
    async function post(body,timeoutMs=90000) {
      const controller=typeof root.AbortController==='function'?new root.AbortController():null;
      const timer=controller?root.setTimeout(()=>controller.abort(),timeoutMs):null;
      let response;
      try {
        response=await root.fetch(config.apiUrl,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},
          body:JSON.stringify(body),redirect:'follow',credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',
          signal:controller?controller.signal:undefined});
      } finally {if(timer)root.clearTimeout(timer);}
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
        const answer=failure(result.error&&typeof result.error.code==='string'?result.error.code:'UNAUTHENTICATED');
        // A short server check name (e.g. "audience"), kept only to show as a reference.
        if(result.error&&/^[a-z-]{1,40}$/.test(result.error.reason||''))answer.error.reason=result.error.reason;
        return answer;
      },
      async load(kind) {
        if(!['all','home','attention','portfolio','company_compliance','maintenance','compliance'].includes(kind))return failure('BAD_REQUEST');
        const session=read();
        if(!session)return failure('UNAUTHENTICATED');
        let result;const started=Date.now();
        try{result=await post({action:kind,session});}catch(_){return failure('OFFLINE');}
        // Latency line: the whole round trip, and the server's own time when it reports it.
        const ms=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0?Math.round(value):null;
        result.timing={total_ms:Date.now()-started,server_ms:ms(result.server_ms),sheets_ms:ms(result.sheets_ms)};
        delete result.server_ms;delete result.sheets_ms;
        // An expired, revoked or no-longer-allowed session is dropped from this device.
        if(!result.ok&&result.error&&['UNAUTHENTICATED','ACCESS_DENIED'].includes(result.error.code))forget();
        return result;
      },
      // PWA.4/PWA.5B writes. payload carries request_id (one per form submission), so a retry never writes twice.
      async write(action,payload) {
        if(!['company_compliance.create','company_compliance.update','maintenance.create','maintenance.update','property.update','mortgage.update','tenancy.update','compliance.update','compliance.renew','mortgage.remortgage','tenancy.end','tenancy.new'].includes(action))return failure('BAD_REQUEST');
        const session=read();
        if(!session)return failure('UNAUTHENTICATED');
        let result;
        try{result=await post({...payload,action,session});}catch(_){return failure('OFFLINE');}
        if(!result.ok&&result.error&&['UNAUTHENTICATED','ACCESS_DENIED'].includes(result.error.code))forget();
        return result;
      },
      // PWA.9B: attach a file to a record (up to 10 MB; slow connections get three minutes).
      async uploadDocument(payload) {
        const session=read();
        if(!session)return failure('UNAUTHENTICATED');
        let result;
        try{result=await post({...payload,action:'document.upload',session},180000);}catch(_){return failure('OFFLINE');}
        if(!result.ok&&result.error&&['UNAUTHENTICATED','ACCESS_DENIED'].includes(result.error.code))forget();
        return result;
      },
      // PWA.9B: confirms the Google account on this device before an upload (the token goes straight to the server).
      async confirmSignIn(idToken) {
        const session=read();
        if(!session)return failure('UNAUTHENTICATED');
        try{return await post({action:'auth.confirm',session,id_token:idToken});}catch(_){return failure('OFFLINE');}
      },
      // PWA.9A: a Drive link for a record's document (both users).
      async openDocument(tab,id,field) {
        const session=read();
        if(!session)return failure('UNAUTHENTICATED');
        let result;
        try{result=await post({action:'document.open',session,tab,id,field});}catch(_){return failure('OFFLINE');}
        if(!result.ok&&result.error&&['UNAUTHENTICATED','ACCESS_DENIED'].includes(result.error.code))forget();
        return result;
      },
      // Ends every session of this account (e.g. a lost phone), then this device's key.
      async signOutEverywhere() {
        const session=read();
        if(!session)return failure('UNAUTHENTICATED');
        let result;
        try{result=await post({action:'auth.end_all',session});}catch(_){return failure('OFFLINE');}
        if(result.ok||(result.error&&result.error.code==='UNAUTHENTICATED'))forget();
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
