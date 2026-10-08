/* Talks to the thin Apps Script API (ROADMAP PWA-D1). Kept on this device: the app session key and,
   so the portfolio can be viewed offline (RT's decision, 2026-10-02), the last complete answer. Both
   are removed on sign-out or when the session ends.
   The talking itself is ../app-kit's (calls.js, the same file as the other two apps' api.js): one protocol
   for all three (a request is { session, action, payload } and, for a save, request_id; a refusal lists
   errors), the waits, the one retry of a save, and forgetting a session the server has ended. This file is
   what the screens use: this app's actions, its saved answer, and its answers as the screens read them.
   A module (2026-10-02): app.js imports it. */
import { SESSION_KEY, session } from './auth.js';
import { call, startSession, confirmAccount, onSessionEnded, endsAccess, signOut, signOutEverywhere } from './calls.js';
import { copyTooOld } from './freshness.js';
const root=globalThis;
// The session key is kept by ../app-kit's auth.js (the same in all three apps), under this app's own name
// (config.js: other apps on the same github.io origin use their own keys). Only a 64-hex key counts.
const read=session;
// The last 'all' answer, for opening instantly and viewing offline. Only with a session and for at most
// 30 days (../app-kit's rule, freshness.js: the same in all three apps). It survives app updates (an update while offline must not take the data away); the screen
// drops it only if it cannot be drawn.
const DATA_KEY='property-portfolio.last';
const forgetAnswer=()=>{try{root.localStorage.removeItem(DATA_KEY);}catch(_){/* nothing stored */}};
// An expired, revoked or no-longer-allowed session: calls.js drops the key from this device; the saved answer goes with it.
onSessionEnded(forgetAnswer);
const remember=answer=>{
  try{const copy={...answer};delete copy.timing;
    root.localStorage.setItem(DATA_KEY,JSON.stringify({saved_at:Date.now(),version:root.PortfolioVersion,answer:copy}));}
  catch(_){/* storage full or blocked: no offline copy */}
};
const recall=()=>{
  try{
    const raw=root.localStorage.getItem(DATA_KEY);if(!raw)return null;
    const stored=JSON.parse(raw),answer=stored&&stored.answer;
    if(read()&&typeof stored.saved_at==='number'&&!copyTooOld(stored.saved_at,Date.now())&&Date.now()>=stored.saved_at&&
      answer&&answer.ok===true&&answer.schema_version===1&&
      answer.data&&typeof answer.data==='object'&&answer.permissions&&typeof answer.observed_at==='string')return answer;
    root.localStorage.removeItem(DATA_KEY);
  }catch(_){/* unreadable: treated as none */}
  return null;
};
const failure=code=>({ok:false,schema_version:1,error:{code}});
// Requests that only read wait 45 seconds and are tried once more (calls.js; config.js lists them): connected but with no
// internet (mobile data used up) a request never fails, it hangs, and the saved copy is on screen meanwhile.
// The system check reads the whole workbook and builds every screen: one try, a minute.
const HEALTH_WAIT_MS=60000;
const VIEWS=['all','home','attention','portfolio','company_compliance','maintenance','compliance'];
const WRITES=['company_compliance.create','company_compliance.update','maintenance.create','maintenance.update','property.update','mortgage.update','tenancy.update','compliance.update','compliance.renew','compliance.activate','mortgage.remortgage','tenancy.end','tenancy.new'];

// An answer as the screens read it. A refusal travels as a list (../app-kit's protocol): the refusal itself
// first (its code and, for some, `reason`: a short check name), then a validation refusal's issues. The
// screens read one error: { code, reason, issues }. Two codes are the shared entry point's own words.
function forScreens(result) {
  if(result.ok)return result;
  const first=result.errors[0]||{};
  let code=typeof first.code==='string'?first.code:'SERVER_UNAVAILABLE';
  if(code==='FORBIDDEN')code='ACCESS_DENIED';
  // A failure inside the server: one fixed word, or the one configuration code it may name.
  else if(code==='INTERNAL')code=/^[A-Z_]{3,40}$/.test(first.message||'')?first.message:'SERVER_UNAVAILABLE';
  const error={code};
  if(/^[A-Za-z_-]{1,60}$/.test(first.reason||''))error.reason=first.reason;
  const issues=result.errors.slice(1).map(issue=>issue&&issue.message).filter(text=>typeof text==='string');
  if(issues.length)error.issues=issues;
  return {ok:false,schema_version:1,error};
}
// Whatever goes wrong on the way (no connection, a busy server, no answer in time, an answer that is not this
// API's) is reported as OFFLINE: calls.js throws, or the answer has no ok or no errors to read.
async function sent(request) {
  try{
    const result=await request();
    if(!result||typeof result!=='object'||typeof result.ok!=='boolean'||(!result.ok&&!Array.isArray(result.errors)))return failure('OFFLINE');
    return forScreens(result);
  }catch(_){return failure('OFFLINE');}
}

function create() {
  return {
    hasSession:()=>read()!==null,
    // The last complete answer saved on this device, or null.
    lastAnswer:()=>recall(),
    // Removes the saved answer only (the session stays): used when it cannot be drawn.
    forgetAnswer,
    // Exchanges a Google ID token (kept in memory only) for this device's app session.
    async signIn(idToken) {
      const result=await sent(()=>startSession(idToken));
      // The role and expiry the server sends are not needed here: every answer says what this account may do.
      return result.ok?{ok:true}:result;
    },
    // fresh: ↻ asks the server to read the workbook again instead of its cached read.
    async load(kind,options={}) {
      if(!VIEWS.includes(kind))return failure('BAD_REQUEST');
      if(!read())return failure('UNAUTHENTICATED');
      const started=Date.now();
      const result=await sent(()=>call(kind,options.fresh===true?{fresh:true}:{}));
      if(result.error&&result.error.code==='OFFLINE')return result;
      // Latency line: the whole round trip, and the server's own time when it reports it.
      const ms=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0?Math.round(value):null;
      result.timing={total_ms:Date.now()-started,server_ms:ms(result.server_ms),sheets_ms:ms(result.sheets_ms),cached:result.cached===true};
      delete result.server_ms;delete result.sheets_ms;delete result.setup_ms;delete result.cached;
      if(result.ok===true&&kind==='all')remember(result);
      return result;
    },
    // PWA.4/PWA.5B writes. payload carries request_id (one per form submission), so a retry never writes twice:
    // a save that gets no answer is sent once more with the same id (calls.js; it may have arrived and only its
    // answer been lost), and the server applies one id once. Not when this device has no connection at all.
    // 20 s + 68 s (config.js) keeps the whole wait within the 90 seconds a save always had.
    async write(action,payload) {
      if(!WRITES.includes(action))return failure('BAD_REQUEST');
      if(!read())return failure('UNAUTHENTICATED');
      const {request_id:requestId,...fields}=payload;
      return sent(()=>call(action,fields,{requestId}));
    },
    // PWA.9B: attach a file to a record (up to 10 MB; slow connections get three minutes, one try).
    async uploadDocument(payload) {
      if(!read())return failure('UNAUTHENTICATED');
      const {request_id:requestId,...fields}=payload;
      return sent(()=>call('document.upload',fields,{requestId}));
    },
    // PWA.9B: confirms the Google account on this device before an upload (the token goes straight to the server).
    async confirmSignIn(idToken) {
      if(!read())return failure('UNAUTHENTICATED');
      return sent(()=>confirmAccount(idToken));
    },
    // PWA.9A: a Drive link for a record's document (both users).
    async openDocument(tab,id,field) {
      if(!read())return failure('UNAUTHENTICATED');
      return sent(()=>call('document.open',{tab,id,field}));
    },
    // System check on More (editor only, read-only on the server).
    async health() {
      if(!read())return failure('UNAUTHENTICATED');
      const result=await sent(()=>call('health',{},{timeoutMs:HEALTH_WAIT_MS}));
      delete result.server_ms;delete result.sheets_ms;delete result.setup_ms;
      return result;
    },
    // Ends every session of this account (e.g. a lost phone), then this device's key and saved answer.
    async signOutEverywhere() {
      if(!read())return failure('UNAUTHENTICATED');
      const result=await sent(signOutEverywhere);
      if(result.ok||(result.error&&result.error.code==='UNAUTHENTICATED'))forgetAnswer();
      return result;
    },
    async signOut() {
      forgetAnswer();
      await signOut();
    }
  };
}
// ../app-kit's rule, in the screens' words: only an ended session or a refused account (the kit's FORBIDDEN,
// ACCESS_DENIED here) clears what is on screen; any other failed refresh keeps the saved copy.
const screenEndsAccess=code=>endsAccess(code==='ACCESS_DENIED'?'FORBIDDEN':code);
const PortfolioApi={create,SESSION_KEY,DATA_KEY,endsAccess:screenEndsAccess};
export { PortfolioApi };
