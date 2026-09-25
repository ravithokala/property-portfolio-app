/* Browser-only presentation, shared by the app and the offline preview. No transport,
   persistence, finance or deadline rules: it draws what the server's canonical projections return. */
(function (root) {
  'use strict';
  const pages=['home','attention','properties','finance','more'];
  const labels={overdue:'Overdue',urgent:'Urgent',warning:'Warning',neutral:'Information'};
  // Plain-language messages for the codes a person can act on; everything else is generic.
  const problems={
    ACCESS_DENIED:'This Google account does not have access to the portfolio.',
    NOT_CONFIGURED:'This app is not connected to the portfolio yet.',
    SIGN_IN_FAILED:'Google sign-in could not be verified by the portfolio server. Try again; if it keeps happening, the server setup needs checking.',
    AUTH_CONFIGURATION_INVALID:'The portfolio server’s sign-in settings are incomplete, so no one can sign in yet.',
    OFFLINE:'The portfolio could not be reached. Check the connection and try again.'
  };
  const known=value=>typeof value==='number'&&Number.isFinite(value);
  const gbp=value=>known(value)?new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP',maximumFractionDigits:2}).format(value):'Not available';
  const percent=value=>known(value)?new Intl.NumberFormat('en-GB',{maximumFractionDigits:2}).format(value)+'%':'Not available';
  const dataPage=page=>page==='attention'?'attention':'home';
  function date(value) {
    if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return 'Not recorded';
    const parsed=new Date(value+'T12:00:00.000Z');
    if(!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==value)return 'Not recorded';
    return new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(parsed);
  }
  function observed(value) {
    if(typeof value!=='string'||!Number.isFinite(Date.parse(value)))return 'Observation time unavailable';
    return 'Observed '+new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'Europe/London'}).format(new Date(value));
  }
  const code=response=>response&&response.error&&typeof response.error.code==='string'?response.error.code:null;
  // options: {canSignOut, version}. page 'attention' expects the full Attention response.
  function render(doc,main,response,page='home',loading=false,options={}) {
    main.replaceChildren();main.setAttribute('aria-busy',loading?'true':'false');
    const make=(tag,text,className)=>{const el=doc.createElement(tag);if(text!==undefined)el.textContent=String(text);if(className)el.className=className;return el;};
    const add=(parent,tag,text,cls)=>{const el=make(tag,text,cls);parent.appendChild(el);return el;};
    const heading=(title,subtitle)=>{const intro=add(main,'div',undefined,'intro');add(intro,'p','Your portfolio, at a glance','eyebrow');add(intro,'h1',title);add(intro,'p',subtitle);};
    const card=(parent,title,cls='')=>{const el=add(parent,'section',undefined,'card '+cls);el.setAttribute('aria-label',title);const head=add(el,'div',undefined,'card-head');add(head,'h2',title);return {el,head};};
    const badge=(parent,level)=>add(parent,'span',labels[level]||labels.neutral,'badge '+(Object.hasOwn(labels,level)?level:'neutral'));
    const empty=(parent,text)=>add(parent,'p',text,'empty');
    const list=parent=>add(parent,'ul',undefined,'list');
    const button=(parent,text,attribute)=>{const el=add(parent,'button',text,'button');el.type='button';el.setAttribute(attribute,'true');return el;};
    if(loading){
      heading('Getting your overview','Loading your portfolio.');
      const box=card(main,'Loading portfolio');const status=add(box.el,'p','Loading…','loading-text');status.setAttribute('role','status');
      for(let i=0;i<4;i++)add(box.el,'div',undefined,'skeleton'+(i%2?' short':'')).setAttribute('aria-hidden','true');
      return;
    }
    if(code(response)==='UNAUTHENTICATED'){
      heading('Sign in','Use the Google account that has access to the portfolio.');
      const box=card(main,'Sign in','placeholder');
      add(box.el,'p','Your portfolio is private. Sign in once on this device; it stays signed in for 30 days of use.');
      add(box.el,'div',undefined,'signin-host').setAttribute('data-signin','true');
      return;
    }
    if(!response||response.ok!==true){
      const problem=problems[code(response)];
      heading('Your overview is unavailable','No changes have been made.');
      const box=card(main,'Unable to show portfolio','placeholder');box.el.setAttribute('role','alert');
      add(box.el,'p',problem||'We couldn’t safely display the portfolio. Try again in a moment.');
      const reason=response&&response.error&&response.error.reason;
      if(typeof reason==='string'&&/^[a-z-]{1,40}$/.test(reason))add(box.el,'p','Reference: '+reason,'subtext');
      const actions=add(box.el,'div',undefined,'actions');
      if(code(response)!=='NOT_CONFIGURED')button(actions,'Try again','data-retry');
      if(code(response)==='ACCESS_DENIED'&&options.canSignOut)button(actions,'Use another account','data-signout');
      return;
    }
    if(!['home','attention'].includes(page)){
      const names={properties:'Properties',finance:'Finance',more:'More'};
      heading(names[page]||'Home','A focused workspace for your portfolio.');
      const box=card(main,page==='more'?'More':'Coming in a later slice','placeholder');add(box.el,'span','⌂','symbol').setAttribute('aria-hidden','true');
      if(page!=='more')add(box.el,'p',(names[page]||'This section')+' will use the same canonical portfolio data.');
      if(page==='more'&&response.permissions.can_write===true){
        const future=add(box.el,'button','Company compliance · Add / edit coming later','button');future.type='button';future.disabled=true;future.setAttribute('data-mutation','future-company-compliance');
        add(box.el,'p','Editing is not available yet.','subtext');
      }
      const actions=add(box.el,'div',undefined,'actions');
      if(page==='more'&&options.canSignOut)button(actions,'Sign out','data-signout');
      const back=add(actions,'a','Back to Home','button');back.href='#home';
      if(page==='more'&&typeof options.version==='string')add(box.el,'p','Version '+options.version,'version');
      return;
    }
    const full=page==='attention',data=response.data,attentionData=full?data:data.attention;
    heading(full?'Attention':'What needs attention?',full?'Everything that currently needs a look.':'A clear view of the work ahead.');
    const grid=add(main,'div',undefined,'grid');
    const attention=card(grid,full?'All attention items':'Attention today','attention-card');
    if(!full){const link=add(attention.head,'a','View all →');link.href='#attention';}
    const summary=add(attention.el,'div',undefined,'summary');add(summary,'span',attentionData.counts.total,'attention-number');add(summary,'span','items to review','attention-label');
    const chips=add(attention.el,'div',undefined,'chips');
    for(const level of ['overdue','urgent','warning','neutral'])if(attentionData.counts[level]){
      add(chips,'span',attentionData.counts[level]+' '+labels[level].toLowerCase(),'badge '+level);
    }
    if(!attentionData.items.length)empty(attention.el,'No items currently need attention.');
    const actions=list(attention.el);
    for(const item of attentionData.items){
      const row=add(actions,'li'),top=add(row,'div',undefined,'item-top');badge(top,item.level);
      add(top,'span',item.property+' · '+item.category,'item-scope');add(row,'p',item.action,'item-action');
      if(full&&item.relevant_date)add(row,'p','Date '+date(item.relevant_date),'subtext');
    }
    if(full)return;
    const maintenance=card(grid,'Open maintenance');
    add(maintenance.el,'p',data.maintenance.follow_up_count+' follow-ups','subtext');
    if(!data.maintenance.items.length)empty(maintenance.el,'No maintenance follow-ups to show.');
    const repairs=list(maintenance.el);
    for(const item of data.maintenance.items){const row=add(repairs,'li'),top=add(row,'div',undefined,'item-top');badge(top,item.level);add(top,'span',item.property_id,'item-scope');add(row,'p',item.reason,'item-action');if(item.target_date)add(row,'p','Target '+date(item.target_date),'subtext');}
    const upcoming=card(grid,'Upcoming dates');
    if(!data.upcoming_dates.length)empty(upcoming.el,'No upcoming actionable dates are recorded.');
    const dates=list(upcoming.el);
    for(const item of data.upcoming_dates){const row=add(dates,'li',undefined,'date-row'),text=add(row,'div');add(text,'h3',item.type);add(text,'p',item.property_id||'Company','subtext');const time=add(row,'time',date(item.date));time.setAttribute('datetime',item.date);}
    const portfolio=card(grid,'Portfolio snapshot'),metrics=add(portfolio.el,'dl',undefined,'metrics'),p=data.portfolio;
    for(const [label,value]of [['Properties',p.property_count],['Current property value',gbp(p.total_current_property_value)],['Mortgage exposure',gbp(p.total_current_mortgage_balance)],['Portfolio LTV',percent(p.portfolio_ltv)]]){
      const metric=add(metrics,'div');add(metric,'dt',label);add(metric,'dd',value);
    }
    if(!p.complete)add(portfolio.el,'p','Incomplete finance data. Unknown values are not treated as zero.','note');
    const regulatory=card(grid,'Regulatory monitoring');
    if(!data.regulatory.available){add(regulatory.el,'p','Monitoring summary is unavailable. Other portfolio sections are still shown.','note');}
    else {
      if(!data.regulatory.sources.length)empty(regulatory.el,'No regulatory sources in this summary.');
      const sources=list(regulatory.el);
      for(const source of data.regulatory.sources){const row=add(sources,'li');add(row,'h3',source.title);add(row,'p','Last checked: '+date(source.last_checked?source.last_checked.slice(0,10):null),'subtext');add(row,'p',source.monitoring_due?'Monitoring check due':'Monitoring check not currently due','subtext');}
    }
  }
  // adapter: {load(kind, scenario) -> Promise<response>, signOut?(), renderSignIn?(host, done), version?}
  // Responses live in memory only; nothing is written to device storage here.
  function mount(doc,adapter) {
    const main=doc.getElementById('main'),select=doc.getElementById('scenario');
    const responses={};let loading=true,generation=0;
    const page=()=>pages.includes(root.location.hash.slice(1))?root.location.hash.slice(1):'home';
    const options={canSignOut:typeof adapter.signOut==='function',version:adapter.version};
    const latest=()=>responses.home||responses.attention||null;
    // Placeholder screens only need permissions; Home and Attention need their own answer.
    function current(){const p=page(),any=latest();
      if(!['home','attention'].includes(p))return any;
      return responses[p]||(any&&!any.ok?any:null);}
    function paint(){
      const response=current(),any=latest();
      doc.getElementById('access').textContent=any&&any.ok?(any.permissions.can_write?'Editor':'View only'):(select?'Preview':'Signed out');
      doc.getElementById('freshness').textContent=response&&response.ok?observed(response.observed_at):'No live connection';
      for(const link of doc.querySelectorAll('[data-page]')){if(link.getAttribute('data-page')===page())link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');}
      render(doc,main,response,page(),loading,options);
      const retry=main.querySelector('[data-retry]');if(retry)retry.addEventListener('click',reload);
      const out=main.querySelector('[data-signout]');if(out)out.addEventListener('click',signOut);
      const host=main.querySelector('[data-signin]');if(host&&adapter.renderSignIn)adapter.renderSignIn(host,reload);
    }
    async function load(){const now=++generation,kind=dataPage(page());loading=true;paint();
      let next;
      try{next=await adapter.load(kind,select?select.value:undefined);}
      catch(_){next={ok:false,error:{code:'OFFLINE'}};}
      if(now!==generation)return;
      // A sign-in problem applies to every screen, so earlier answers are dropped.
      if(!next||next.ok!==true)for(const key of Object.keys(responses))delete responses[key];
      responses[kind]=next;loading=false;paint();
    }
    function reload(){for(const key of Object.keys(responses))delete responses[key];return load();}
    async function signOut(){try{await adapter.signOut();}catch(_){}return reload();}
    if(select)select.addEventListener('change',reload);
    root.addEventListener('hashchange',()=>{
      const any=latest();
      if(!loading&&['home','attention'].includes(page())&&!responses[page()]&&any&&any.ok)load();else paint();
      main.focus();root.scrollTo(0,0);
    });
    load();
  }
  root.PortfolioUi={gbp,percent,date,observed,render,mount,pages};
})(globalThis);
