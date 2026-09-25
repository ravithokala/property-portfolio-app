/* Browser-only presentation, shared by the app and the offline preview. No transport,
   persistence, finance or deadline rules: it draws what the server's canonical projections return. */
(function (root) {
  'use strict';
  const pages=['home','attention','properties','finance','more','company'];
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
  // Which server answer each screen draws; More only needs permissions from any answer.
  const dataKinds={home:'home',attention:'attention',properties:'portfolio',finance:'portfolio',more:null,company:'company_compliance'};
  const words=value=>typeof value==='string'&&value?value.charAt(0).toUpperCase()+value.slice(1).replace(/-/g,' '):'Not recorded';
  // Company compliance form fields, in display order (dates as YYYY-MM-DD text).
  const ccFields=[['type','Type','select'],['status','Status','select'],['due_date','Due date','date'],['period_start','Period start','date'],
    ['period_end','Period end','date'],['action_date','Action date','date'],['completed_date','Completed date','date'],
    ['reference','Reference','text'],['managed_by','Managed by','text'],['document','Document','text'],['notes','Notes','textarea']];
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
      // Fixed server codes (never data) so a problem can be diagnosed from a screenshot.
      const reason=response&&response.error&&response.error.reason;
      const reference=[code(response),reason].filter(x=>typeof x==='string'&&/^[A-Za-z_-]{1,60}$/.test(x)).join(' · ');
      if(reference)add(box.el,'p','Reference: '+reference,'subtext');
      const actions=add(box.el,'div',undefined,'actions');
      if(code(response)!=='NOT_CONFIGURED')button(actions,'Try again','data-retry');
      if(code(response)==='ACCESS_DENIED'&&options.canSignOut)button(actions,'Use another account','data-signout');
      return;
    }
    const recorded=value=>typeof value==='string'&&value?value:'Not recorded';
    const metricList=(parent,entries)=>{const dl=add(parent,'dl',undefined,'metrics');for(const [label,value] of entries){const m=add(dl,'div');add(m,'dt',label);add(m,'dd',value);}return dl;};
    const levelBadge=(parent,attention)=>attention.count?badge(parent,attention.level):add(parent,'span','Nothing to review','badge neutral');
    if(page==='properties'){
      const items=response.data.properties;
      heading('Properties','Each property with its current tenancy and mortgage.');
      const grid=add(main,'div',undefined,'grid');
      if(!items.length)empty(card(grid,'Properties').el,'No properties are recorded.');
      for(const item of items){
        const box=card(grid,item.property_id);levelBadge(box.head,item.attention.total);
        add(box.el,'p',recorded(item.address),'subtext');
        metricList(box.el,[['Status',recorded(item.status)],['Current value',gbp(item.current_value)],
          ['Tenancy',recorded(item.tenancy.tenancy_id)],['Rent per month',gbp(item.tenancy.monthly_rent)],
          ['Mortgage',recorded(item.mortgage.mortgage_id)],['Mortgage balance',gbp(item.mortgage.current_balance)],
          ['Fixed until',item.mortgage.fixed_until?date(item.mortgage.fixed_until):'Not recorded'],['LTV',percent(item.finance.ltv)]]);
        add(box.el,'p','To review: '+item.attention.compliance.count+' compliance · '+item.attention.maintenance.count+' maintenance','note');
      }
      return;
    }
    if(page==='finance'){
      const t=response.data.totals;
      heading('Finance','Contractual figures before operating expenses.');
      const grid=add(main,'div',undefined,'grid');
      const total=card(grid,'Portfolio finance','attention-card');
      metricList(total.el,[['Current property value',gbp(t.total_current_property_value)],['Mortgage exposure',gbp(t.total_current_mortgage_balance)],
        ['Portfolio LTV',percent(t.portfolio_ltv)],['Rent per month',gbp(t.total_monthly_contractual_rent)],
        ['Mortgage payments per month',gbp(t.total_monthly_mortgage_cost)],['Cashflow per month',gbp(t.monthly_cashflow_before_operating_expenses)],
        ['Rent per year',gbp(t.total_annual_contractual_rent)],['Cashflow per year',gbp(t.annual_cashflow_before_operating_expenses)]]);
      add(total.el,'p','Cashflow is rent minus mortgage payments, before operating expenses — not profit.','note');
      if(!t.complete)add(total.el,'p','Incomplete finance data. Unknown values are not treated as zero.','note');
      for(const item of response.data.properties){
        const box=card(grid,item.property_id);
        metricList(box.el,[['Rent per month',gbp(item.tenancy.monthly_rent)],['Mortgage payment per month',gbp(item.mortgage.monthly_payment)],
          ['Cashflow per month',gbp(item.finance.monthly_cashflow_before_operating_expenses)],['LTV',percent(item.finance.ltv)],
          ['Principal repaid',gbp(item.finance.principal_repaid_total)],['Principal repaid %',percent(item.finance.principal_repaid_pct)]]);
      }
      return;
    }
    if(page==='company'){
      const d=response.data,canWrite=response.permissions.can_write===true,form=options.form;
      if(form&&canWrite){
        const r=form.record||{},values=form.values||{};
        heading(form.mode==='create'?'Add record':'Edit '+r.company_compliance_id,'Saved straight to the CompanyCompliance tab of your workbook.');
        const box=card(main,form.mode==='create'?'New company compliance record':'Company compliance record');
        if(form.issues&&form.issues.length){const alert=add(box.el,'div',undefined,'note');alert.setAttribute('role','alert');
          add(alert,'p','Please fix:');const ul=add(alert,'ul');for(const issue of form.issues)add(ul,'li',issue);}
        if(form.message){const m=add(box.el,'p',form.message,'note');m.setAttribute('role','alert');}
        const f=add(box.el,'form',undefined,'cc-form');f.setAttribute('data-cc-form','true');
        for(const [name,label,kind] of ccFields){
          const wrap=add(f,'label',undefined,'field');add(wrap,'span',label);
          const current=Object.hasOwn(values,name)?values[name]:(r[name]||(name==='status'&&form.mode==='create'?'pending':''));
          let control;
          if(kind==='select'){control=add(wrap,'select');
            const choices=(d.choices[name]||[]).slice();if(name==='type'&&!current)choices.unshift('');
            for(const choice of choices){const o=add(control,'option',choice?words(choice):'Choose…');o.value=choice;if(choice===current)o.selected=true;}}
          else if(kind==='textarea'){control=add(wrap,'textarea');control.rows=3;}
          else {control=add(wrap,'input');control.type=kind==='date'?'date':'text';}
          control.name=name;control.setAttribute('name',name);control.value=current;
        }
        const actions=add(f,'div',undefined,'actions');
        const save=add(actions,'button',form.saving?'Saving…':'Save','button');save.type='submit';save.disabled=form.saving===true;save.setAttribute('data-mutation','company-compliance-'+form.mode);
        button(actions,'Cancel','data-cc-cancel');
        return;
      }
      heading('Company compliance','Filings and other company obligations.');
      const top=add(main,'div',undefined,'actions');
      if(canWrite)button(top,'Add record','data-cc-add').setAttribute('data-mutation','company-compliance-create');
      const back=add(top,'a','Back to More','button');back.href='#more';
      const grid=add(main,'div',undefined,'grid');
      if(!d.records.length)empty(card(grid,'Records').el,'No company compliance records yet.');
      for(const r of d.records){
        const box=card(grid,words(r.type));add(box.head,'span',words(r.status),'badge neutral');
        metricList(box.el,[['Record',r.company_compliance_id],['Due',r.due_date?date(r.due_date):'Not recorded'],
          ['Period',r.period_start||r.period_end?(r.period_start?date(r.period_start):'?')+' – '+(r.period_end?date(r.period_end):'?'):'Not recorded'],
          ['Completed',r.completed_date?date(r.completed_date):'Not recorded'],['Reference',recorded(r.reference)],['Managed by',recorded(r.managed_by)]]);
        if(r.notes)add(box.el,'p',r.notes,'note');
        if(canWrite){const edit=button(box.el,'Edit','data-cc-edit');edit.setAttribute('data-cc-edit',r.company_compliance_id);edit.setAttribute('data-mutation','company-compliance-update');}
      }
      return;
    }
    if(page==='more'){
      heading('More','Account and app details.');
      const box=card(main,'More','placeholder');add(box.el,'span','⌂','symbol').setAttribute('aria-hidden','true');
      const company=add(box.el,'a',response.permissions.can_write===true?'Company compliance · view and edit':'Company compliance · view','button');company.href='#company';
      const actions=add(box.el,'div',undefined,'actions');
      if(options.canSignOut)button(actions,'Sign out','data-signout');
      const back=add(actions,'a','Back to Home','button');back.href='#home';
      if(typeof options.version==='string')add(box.el,'p','Version '+options.version,'version');
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
    const responses={};let loading=true,generation=0,form=null;
    const page=()=>pages.includes(root.location.hash.slice(1))?root.location.hash.slice(1):'home';
    const options={canSignOut:typeof adapter.signOut==='function',version:adapter.version,form:null};
    const latest=()=>responses.home||responses.attention||responses.portfolio||responses.company_compliance||null;
    // More only needs permissions; every other screen needs its own kind of answer.
    function current(){const kind=dataKinds[page()],any=latest();
      if(!kind)return any;
      return responses[kind]||(any&&!any.ok?any:null);}
    function paint(){
      const response=current(),any=latest();
      doc.getElementById('access').textContent=any&&any.ok?(any.permissions.can_write?'Editor':'View only'):(select?'Preview':'Signed out');
      doc.getElementById('freshness').textContent=response&&response.ok?observed(response.observed_at):'No live connection';
      const tab=page()==='company'?'more':page();
      for(const link of doc.querySelectorAll('[data-page]')){if(link.getAttribute('data-page')===tab)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');}
      options.form=form;
      render(doc,main,response,page(),loading,options);
      wireCompany(response);
      const retry=main.querySelector('[data-retry]');if(retry)retry.addEventListener('click',reload);
      const out=main.querySelector('[data-signout]');if(out)out.addEventListener('click',signOut);
      const host=main.querySelector('[data-signin]');if(host&&adapter.renderSignIn)adapter.renderSignIn(host,reload);
    }
    async function load(){const now=++generation,kind=dataKinds[page()]||'home';loading=true;paint();
      let next;
      try{next=await adapter.load(kind,select?select.value:undefined);}
      catch(_){next={ok:false,error:{code:'OFFLINE'}};}
      if(now!==generation)return;
      // A sign-in problem applies to every screen, so earlier answers are dropped.
      if(!next||next.ok!==true)for(const key of Object.keys(responses))delete responses[key];
      responses[kind]=next;loading=false;paint();
    }
    // Company compliance add/edit. One request_id per opened form, reused on retry, so an uncertain
    // save that is sent again never writes twice.
    function wireCompany(response){
      if(page()!=='company'||!response||!response.ok||typeof adapter.save!=='function')return;
      const open=(mode,record)=>{form={mode,record,values:{},request_id:adapter.newRequestId(),issues:[],message:''};paint();main.focus();root.scrollTo(0,0);};
      const add=main.querySelector('[data-cc-add]');if(add)add.addEventListener('click',()=>open('create',null));
      for(const edit of main.querySelectorAll('[data-cc-edit]'))edit.addEventListener('click',()=>
        open('update',response.data.records.find(r=>r.company_compliance_id===edit.getAttribute('data-cc-edit'))));
      const cancel=main.querySelector('[data-cc-cancel]');if(cancel)cancel.addEventListener('click',()=>{form=null;paint();});
      const element=main.querySelector('[data-cc-form]');
      if(element)element.addEventListener('submit',async event=>{
        event.preventDefault();if(!form||form.saving)return;
        const values={};for(const field of element.querySelectorAll('[name]'))values[field.getAttribute('name')]=String(field.value||'');
        const current=form;current.values=values;current.saving=true;current.issues=[];current.message='';paint();
        const payload={request_id:current.request_id,fields:values};
        if(current.mode==='update'){payload.company_compliance_id=current.record.company_compliance_id;payload.expected_version=current.record.version;}
        let result;
        try{result=await adapter.save('company_compliance.'+current.mode,payload);}catch(_){result={ok:false,error:{code:'OFFLINE'}};}
        if(form!==current)return;
        current.saving=false;
        if(result&&result.ok){form=null;reload();return;}
        const code=result&&result.error&&result.error.code;
        if(code==='VALIDATION_FAILED')current.issues=(result.error.issues||[]).filter(x=>typeof x==='string').slice(0,10);
        else current.message=code==='STALE'?'This record changed since you opened it. Cancel and open it again.':
          code==='BUSY'?'Another save is in progress. Try again in a moment.':
          code==='OFFLINE'?'Not saved yet: the portfolio could not be reached. Try again; it will not be saved twice.':
          code==='WRITE_FORBIDDEN'?'This account can view but not edit.':
          'Not saved. Reference: '+(typeof code==='string'&&/^[A-Z_]{1,40}$/.test(code)?code:'UNKNOWN');
        paint();
      });
    }
    function reload(){for(const key of Object.keys(responses))delete responses[key];return load();}
    async function signOut(){try{await adapter.signOut();}catch(_){}return reload();}
    if(select)select.addEventListener('change',reload);
    root.addEventListener('hashchange',()=>{
      form=null;
      const any=latest();
      const kind=dataKinds[page()];
      if(!loading&&kind&&!responses[kind]&&any&&any.ok)load();else paint();
      main.focus();root.scrollTo(0,0);
    });
    load();
  }
  root.PortfolioUi={gbp,percent,date,observed,render,mount,pages};
})(globalThis);
