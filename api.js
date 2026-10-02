/* Talks to the thin Apps Script API (ROADMAP PWA-D1). Kept on this device: the app session key and,
   so the portfolio can be viewed offline (RT's decision, 2026-10-02), the last complete answer. Both
   are removed on sign-out or when the session ends. */
(function (root) {
  'use strict';
  // Named for this app: other apps on the same github.io origin use their own keys.
  const SESSION_KEY='property-portfolio.session';
  const read=()=>{try{const key=root.localStorage.getItem(SESSION_KEY);return /^[0-9a-f]{64}$/.test(key||'')?key:null;}catch(_){return null;}};
  const save=key=>{try{root.localStorage.setItem(SESSION_KEY,key);}catch(_){/* storage blocked: sign in again next time */}};
  // The last 'all' answer, for opening instantly and viewing offline. Only with a session, only from this
  // app version (an older shape is never drawn by newer code), and for at most 30 days.
  const DATA_KEY='property-portfolio.last',DATA_MAX_AGE_MS=30*24*60*60*1000;
  const forget=()=>{for(const key of [SESSION_KEY,DATA_KEY]){try{root.localStorage.removeItem(key);}catch(_){/* nothing stored */}}};
  const remember=answer=>{
    try{const copy={...answer};delete copy.timing;
      root.localStorage.setItem(DATA_KEY,JSON.stringify({saved_at:Date.now(),version:root.PortfolioVersion,answer:copy}));}
    catch(_){/* storage full or blocked: no offline copy */}
  };
  const recall=()=>{
    try{
      const raw=root.localStorage.getItem(DATA_KEY);if(!raw)return null;
      const stored=JSON.parse(raw),answer=stored&&stored.answer;
      if(read()&&typeof stored.saved_at==='number'&&Date.now()-stored.saved_at<=DATA_MAX_AGE_MS&&Date.now()>=stored.saved_at&&
        stored.version===root.PortfolioVersion&&answer&&answer.ok===true&&answer.schema_version===1&&
        answer.data&&typeof answer.data==='object'&&answer.permissions&&typeof answer.observed_at==='string')return answer;
      root.localStorage.removeItem(DATA_KEY);
    }catch(_){/* unreadable: treated as none */}
    return null;
  };
  const failure=code=>({ok:false,schema_version:1,error:{code}});
  // Well over the slowest normal answer (a first open after the server has been idle).
  const READ_WAIT_MS=20000;

  function create(config) {
    // A plain-text POST needs no CORS pre-flight, which Apps Script cannot answer.
    // Apps Script can be slow to start, but a request never waits more than 90 seconds.
    // Connected but with no internet (mobile data used up) a request never fails, it hangs. Requests that
    // only read give up after READ_WAIT_MS, so the saved copy is shown as offline instead of "Updating…" for
    // a minute and a half. Saves keep the long wait: the server may still finish one.
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
      // The last complete answer saved on this device, or null.
      lastAnswer:()=>recall(),
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
      // fresh: ↻ asks the server to read the workbook again instead of its cached read.
      async load(kind,options={}) {
        if(!['all','home','attention','portfolio','company_compliance','maintenance','compliance'].includes(kind))return failure('BAD_REQUEST');
        const session=read();
        if(!session)return failure('UNAUTHENTICATED');
        let result;const started=Date.now();
        try{result=await post(options.fresh===true?{action:kind,session,fresh:true}:{action:kind,session},READ_WAIT_MS);}catch(_){return failure('OFFLINE');}
        // Latency line: the whole round trip, and the server's own time when it reports it.
        const ms=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0?Math.round(value):null;
        result.timing={total_ms:Date.now()-started,server_ms:ms(result.server_ms),sheets_ms:ms(result.sheets_ms),cached:result.cached===true};
        delete result.server_ms;delete result.sheets_ms;delete result.cached;
        // An expired, revoked or no-longer-allowed session is dropped from this device, with the saved answer.
        if(!result.ok&&result.error&&['UNAUTHENTICATED','ACCESS_DENIED'].includes(result.error.code))forget();
        if(result.ok===true&&kind==='all')remember(result);
        return result;
      },
      // PWA.4/PWA.5B writes. payload carries request_id (one per form submission), so a retry never writes twice.
      async write(action,payload) {
        if(!['company_compliance.create','company_compliance.update','maintenance.create','maintenance.update','property.update','mortgage.update','tenancy.update','compliance.update','compliance.renew','compliance.activate','mortgage.remortgage','tenancy.end','tenancy.new'].includes(action))return failure('BAD_REQUEST');
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
        try{result=await post({action:'document.open',session,tab,id,field},READ_WAIT_MS);}catch(_){return failure('OFFLINE');}
        if(!result.ok&&result.error&&['UNAUTHENTICATED','ACCESS_DENIED'].includes(result.error.code))forget();
        return result;
      },
      // System check on More (editor only, read-only on the server).
      async health() {
        const session=read();
        if(!session)return failure('UNAUTHENTICATED');
        let result;
        try{result=await post({action:'health',session},60000);}catch(_){return failure('OFFLINE');}
        delete result.server_ms;delete result.sheets_ms;
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
  root.PortfolioApi={create,SESSION_KEY,DATA_KEY,READ_WAIT_MS};
})(globalThis);
