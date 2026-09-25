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
    async function post(body) {
      const controller=typeof root.AbortController==='function'?new root.AbortController():null;
      const timer=controller?root.setTimeout(()=>controller.abort(),90000):null;
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
        if(!['home','attention','portfolio','company_compliance'].includes(kind))return failure('BAD_REQUEST');
        const session=read();
        if(!session)return failure('UNAUTHENTICATED');
        let result;
        try{result=await post({action:kind,session});}catch(_){return failure('OFFLINE');}
        // An expired, revoked or no-longer-allowed session is dropped from this device.
        if(!result.ok&&result.error&&['UNAUTHENTICATED','ACCESS_DENIED'].includes(result.error.code))forget();
        return result;
      },
      // PWA.4 writes. payload carries request_id (one per form submission), so a retry never writes twice.
      async write(action,payload) {
        if(!['company_compliance.create','company_compliance.update'].includes(action))return failure('BAD_REQUEST');
        const session=read();
        if(!session)return failure('UNAUTHENTICATED');
        let result;
        try{result=await post({...payload,action,session});}catch(_){return failure('OFFLINE');}
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
