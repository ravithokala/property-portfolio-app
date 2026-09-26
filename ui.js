/* Browser-only presentation, shared by the app and the offline preview. No transport,
   persistence, finance or deadline rules: it draws what the server's canonical projections return. */
(function (root) {
  'use strict';
  const pages=['home','attention','properties','finance','more','company','maintenance','compliance','property'];
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
  const gbpShort=value=>known(value)?new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP',notation:'compact',maximumFractionDigits:1}).format(value):'Not available';
  const gbp=value=>known(value)?new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP',maximumFractionDigits:2}).format(value):'Not available';
  const percent=value=>known(value)?new Intl.NumberFormat('en-GB',{maximumFractionDigits:2}).format(value)+'%':'Not available';
  // Which server answer each screen draws; More only needs permissions from any answer.
  const dataKinds={home:'home',attention:'attention',properties:'portfolio',finance:'portfolio',more:'more',company:'company_compliance',maintenance:'maintenance',compliance:'compliance',property:'property'};
  // Acronyms stay upper case (EPC, EICR, CO); other values read as words.
  const acronyms={epc:'EPC',eicr:'EICR',co:'CO'};
  const words=value=>typeof value==='string'&&value?(acronyms[value]||value.charAt(0).toUpperCase()+value.slice(1).replace(/-/g,' ')):'Not recorded';
  // Company compliance form fields, in display order (dates as YYYY-MM-DD text).
  // Days from the server's canonical assessment only; the browser never works out deadlines.
  const dayText=days=>typeof days!=='number'?'':days<0?(-days)+(days===-1?' day':' days')+' overdue':days===0?'today':'in '+days+(days===1?' day':' days');
  // Expiry wording from the server's day count.
  const expiryText=days=>typeof days!=='number'?'':days<0?'expired '+(-days)+(days===-1?' day':' days')+' ago':days===0?'expires today':'in '+days+(days===1?' day':' days');
  const yesNo=value=>value===true?'Yes':value===false?'No':'Not recorded';
  // Cost is stored as text or a number; show money only when it is a plain amount.
  const costText=value=>/^\d+(\.\d{1,2})?$/.test(value)?gbp(Number(value)):value;
  // Maintenance form fields: exactly the server's editable fields (pwaMaintenanceFields_), in display order.
  const mntFields=[['property_id','Property','select'],['maintenance_type','Type','select'],['category','Category','select'],
    ['description','Description','textarea'],['priority','Priority','select'],['status','Status','select'],['reported_date','Reported date','date'],
    ['reported_by','Reported by','select'],['target_date','Target date','date'],['next_due_date','Next due date','date'],
    ['completed_date','Completed date','date'],['managed_by','Managed by','select'],['contractor','Contractor','text'],
    ['cost','Cost (£)','money'],['resolution','Resolution','textarea'],['previous_related_record','Previous related job ID','text']];
  // Quick actions show only what they change; the rest of the record is sent unchanged.
  const mntQuick={complete:['completed_date','cost','resolution'],done:['completed_date','next_due_date','cost']};
  // PWA.7 quick updates: exactly the server's editable fields (pwaPropertyFields_, pwaMortgageFields_).
  const valueFields=[['current_value','Current value (£)','money'],['current_value_date','Valuation date','date'],['valuation_source','Source (e.g. Zoopla, surveyor)','text']];
  const mortgageFields=[['current_balance','Current balance (£)','money'],['balance_date','Balance date','date'],['monthly_payment','Monthly payment (£)','money'],
    ['interest_rate','Interest rate (%)','rate'],['fixed_until','Fixed until','date']];
  const rentFields=[['monthly_rent','Rent per month (£)','money'],['current_rent_effective_date','New rent takes effect','date'],
    ['last_rent_increase_date','Last rent increase','date'],['next_rent_review_date','Next rent review','date']];
  const renewalFields=[['renewal_status','Renewal status','select']];
  // PWA.8C/8D forms: exactly the server's fields (pwaRemortgageFields_, pwaNewTenancyFields_).
  const remortgageFields=[['switch_type','Change','select'],['lender','Lender','text'],['start_date','Start date','date'],
    ['monthly_payment','Monthly payment (£)','money'],['mortgage_type','Mortgage type','select'],['rate_type','Rate type','select'],
    ['interest_rate','Interest rate (%)','rate'],['fixed_until','Fixed until','date'],['end_date','Mortgage end date','date'],
    ['original_balance','Amount borrowed (£)','money'],['product_fee','Product fee (£)','money']];
  const newTenancyFields=[['start_date','Start date','date'],['monthly_rent','Rent per month (£)','money'],['next_rent_review_date','Next rent review','date'],
    ['rent_due_day','Rent due day (1–31)','number'],['managed_by','Managed by','select'],['agent','Agent','text'],['deposit_amount','Deposit (£)','money'],
    ['deposit_scheme','Deposit scheme','text'],['deposit_reference','Deposit reference','text'],['deposit_protected_date','Deposit protected','date'],
    ['right_to_rent_status','Right to rent','select'],['right_to_rent_check_date','Right to rent checked','date']];
  // PWA.8B Renew: the boxes each certificate type uses (every renewal field is still sent; unused ones blank).
  const renewAll=['certificate_reference','co_alarms_checked','cost','effective_date','energy_rating','energy_score','expiry_date',
    'inspection_date','potential_energy_rating','potential_energy_score','provider','smoke_alarms_checked','verified'];
  function renewFieldsFor(type){
    const provider={'gas-safety':'Engineer','eicr':'Electrician','epc':'Assessor','insurance':'Insurer'}[type]||'Provider';
    const fields=[['expiry_date',type==='insurance'?'Renewal date':'New expiry date','date']];
    if(type!=='insurance')fields.push(['inspection_date','Inspection / issue date','date']);
    if(['insurance','other'].includes(type))fields.push(['effective_date','Start date','date']);
    fields.push(['provider',provider,'text']);
    if(type!=='alarms')fields.push(['certificate_reference',type==='insurance'?'Policy number':'Certificate number','text']);
    fields.push(['cost',type==='insurance'?'Premium (£)':'Cost (£)','money']);
    if(type==='epc')fields.push(['energy_rating','Energy rating','select'],['energy_score','Energy score','number'],
      ['potential_energy_rating','Potential rating','select'],['potential_energy_score','Potential score','number']);
    if(type==='alarms')fields.push(['smoke_alarms_checked','Smoke alarms checked','checkbox']);
    if(['gas-safety','alarms'].includes(type))fields.push(['co_alarms_checked','CO alarms checked','checkbox']);
    fields.push(['verified','I have checked this certificate','checkbox']);
    return fields;
  }
  const mntTitles={create:'Add job',update:'Edit job',complete:'Mark completed',done:'Mark done'};
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
  // Top-bar time: today's time, or the date if older.
  function updatedAt(value) {
    if(typeof value!=='string'||!Number.isFinite(Date.parse(value)))return '';
    const at=new Date(value),day=d=>new Intl.DateTimeFormat('en-GB',{dateStyle:'short',timeZone:'Europe/London'}).format(d);
    return day(at)===day(new Date())?new Intl.DateTimeFormat('en-GB',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/London'}).format(at):
      new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',timeZone:'Europe/London'}).format(at);
  }
  // "Updated 17:07 · 4.2 s · server 2.1 s (sheets 1.4 s)": where a slow load spends its time.
  function timingText(response){
    const t=response&&response.timing;
    if(!t||typeof t.total_ms!=='number')return '';
    const s=value=>(value/1000).toFixed(1)+' s';
    return ['Updated '+updatedAt(response.observed_at),s(t.total_ms),
      typeof t.server_ms==='number'?'server '+s(t.server_ms)+(typeof t.sheets_ms==='number'?' (sheets '+s(t.sheets_ms)+')':''):''].filter(Boolean).join(' · ');
  }
  const titles={home:'Home',attention:'Attention',properties:'Properties',finance:'Finance',more:'More',company:'Company compliance',maintenance:'Maintenance',compliance:'Compliance',property:'Property'};
  const code=response=>response&&response.error&&typeof response.error.code==='string'?response.error.code:null;
  // options: {canSignOut, version}. page 'attention' expects the full Attention response.
  function render(doc,main,response,page='home',loading=false,options={}) {
    main.replaceChildren();main.setAttribute('aria-busy',loading?'true':'false');
    const make=(tag,text,className)=>{const el=doc.createElement(tag);if(text!==undefined)el.textContent=String(text);if(className)el.className=className;return el;};
    const add=(parent,tag,text,cls)=>{const el=make(tag,text,cls);parent.appendChild(el);return el;};
    // The screen name is in the top bar; each screen keeps a heading for screen readers only.
    const heading=title=>{add(main,'h1',title,'sr-only');};
    const card=(parent,title,cls='')=>{const el=add(parent,'section',undefined,'card '+cls);el.setAttribute('aria-label',title);const head=add(el,'div',undefined,'card-head');add(head,'h2',title);return {el,head};};
    const badge=(parent,level)=>add(parent,'span',labels[level]||labels.neutral,'badge '+(Object.hasOwn(labels,level)?level:'neutral'));
    const empty=(parent,text)=>add(parent,'p',text,'empty');
    const list=parent=>add(parent,'ul',undefined,'list');
    const button=(parent,text,attribute)=>{const el=add(parent,'button',text,'button');el.type='button';el.setAttribute(attribute,'true');return el;};
    if(loading){
      // A quiet outline of the page (counters, then cards) while the first answer arrives.
      heading('Loading your portfolio');
      add(main,'p',options.slow?'Still loading: the portfolio server can take a little longer when it has been idle.':'Loading your portfolio…',
        options.slow?'loading-text':'sr-only').setAttribute('role','status');
      const counters=add(main,'div',undefined,'counters');counters.setAttribute('aria-hidden','true');
      for(let i=0;i<4;i++)add(counters,'div',undefined,'counter skeleton-block');
      const grid=add(main,'div',undefined,'grid');grid.setAttribute('aria-hidden','true');
      for(let c=0;c<2;c++){const box=add(grid,'div',undefined,'card');add(box,'div',undefined,'skeleton title');
        for(let i=0;i<3;i++)add(box,'div',undefined,'skeleton'+(i%2?' short':''));}
      return;
    }
    if(code(response)==='UNAUTHENTICATED'){
      heading('Sign in');
      const box=card(main,'Sign in','placeholder');
      add(box.el,'p','Your portfolio is private. Sign in once on this device; it stays signed in for 30 days of use.');
      add(box.el,'div',undefined,'signin-host').setAttribute('data-signin','true');
      return;
    }
    if(!response||response.ok!==true){
      const problem=problems[code(response)];
      heading('Your overview is unavailable');
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
    // One property filter shared by the list screens; the choice lives in memory only.
    const propertyFilter=(parent,properties,filter)=>{
      if(properties.length<2)return;
      const wrap=add(parent,'label',undefined,'field filter');add(wrap,'span','Property');
      const select=add(wrap,'select');select.setAttribute('data-property-filter','true');
      for(const id of ['',...properties]){const o=add(select,'option',id||'All properties');o.value=id;if(id===filter)o.selected=true;}
      select.value=filter;
    };
    const when=value=>value?date(value):'Not recorded';
    // PWA.9B attach form: one file, uploaded to the record's folder; may first ask to confirm with Google.
    const attaching=options.form;
    if(attaching&&attaching.kind==='attach'&&response.permissions&&response.permissions.can_write===true){
      heading('Attach document');
      const box=card(main,'Attach '+attaching.label);
      add(box.el,'p',attaching.id,'subtext');
      if(attaching.hasCurrent)add(box.el,'p','This replaces the link to the current document. The old file stays in Google Drive.','note');
      if(attaching.message){const note=add(box.el,'p',attaching.message,'note');note.setAttribute('role','alert');}
      if(attaching.needsConfirm){add(box.el,'p','For uploads, confirm it’s you with Google (needed once every 12 hours on this device).','note');
        add(box.el,'div',undefined,'signin-host').setAttribute('data-confirm-host','true');}
      const f=add(box.el,'form',undefined,'cc-form');f.setAttribute('data-attach-form','true');
      const wrap=add(f,'label',undefined,'field');add(wrap,'span','Photo or PDF (up to 10 MB)');
      const input=add(wrap,'input');input.type='file';input.setAttribute('accept','application/pdf,image/jpeg,image/png,image/heic,image/heif,.heic,.heif');
      input.name='file';input.setAttribute('name','file');
      const actions=add(f,'div',undefined,'actions');
      const save=add(actions,'button',attaching.saving?'Uploading…':'Upload','button');save.type='submit';save.disabled=attaching.saving===true;save.setAttribute('data-mutation','document-attach');
      button(actions,'Cancel','data-attach-cancel');
      return;
    }
    // PWA.7 quick edits (value, mortgage, rent, renewal): one form; the fields travel with it.
    const quick=options.form;
    if(quick&&quick.quick&&response.permissions&&response.permissions.can_write===true){
      heading(quick.title);
      const box=card(main,quick.title);
      if(quick.subtitle)add(box.el,'p',quick.subtitle,'subtext');
      if(quick.issues&&quick.issues.length){const alert=add(box.el,'div',undefined,'note');alert.setAttribute('role','alert');
        add(alert,'p','Please fix:');const ul=add(alert,'ul');for(const issue of quick.issues)add(ul,'li',issue);}
      if(quick.message){const note=add(box.el,'p',quick.message,'note');note.setAttribute('role','alert');}
      const f=add(box.el,'form',undefined,'cc-form');f.setAttribute('data-quick-form','true');
      for(const [name,label,kind] of quick.fields){
        const wrap=add(f,'label',undefined,'field');add(wrap,'span',label);
        const current=typeof quick.values[name]==='string'?quick.values[name]:'';
        let control;
        if(kind==='select'){control=add(wrap,'select');
          const choices=(quick.choices[name]||[]).slice();
          if(current&&!choices.includes(current))choices.unshift(current);
          if(!current)choices.unshift('');
          for(const choice of choices){const o=add(control,'option',choice?words(choice):'Not recorded');o.value=choice;if(choice===current)o.selected=true;}}
        else if(kind==='checkbox'){wrap.className='field check';control=add(wrap,'input');control.type='checkbox';control.checked=current==='true';}
        else {control=add(wrap,'input');control.type=kind==='date'?'date':'text';if(kind==='money'||kind==='rate')control.setAttribute('inputmode','decimal');
          if(kind==='number')control.setAttribute('inputmode','numeric');}
        control.name=name;control.setAttribute('name',name);if(kind!=='checkbox')control.value=current;
      }
      const actions=add(f,'div',undefined,'actions');
      const save=add(actions,'button',quick.saving?'Saving…':'Save','button');save.type='submit';save.disabled=quick.saving===true;save.setAttribute('data-mutation',quick.kind+'-update');
      button(actions,'Cancel','data-quick-cancel');
      return;
    }
    // PWA.9A: opens a record's document in Google Drive (both users); shown only when a document is recorded.
    const docButton=(parent,label,tab,id,field,value)=>{if(typeof value!=='string'||!value)return;
      const el=button(parent,label,'data-open-doc');el.className='button small';
      el.setAttribute('data-doc-tab',tab);el.setAttribute('data-doc-id',id);el.setAttribute('data-doc-field',field);};
    // PWA.9B: attach a file to a record's document field (PRIMARY only).
    const attachButton=(parent,label,tab,id,field,version,current)=>{if(!(response.permissions&&response.permissions.can_write===true)||!version)return;
      const el=button(parent,label,'data-attach');el.className='button small';el.setAttribute('data-mutation','document-attach');
      for(const [k,v] of [['tab',tab],['id',id],['field',field],['version',version],['label',label.replace(/^Attach /,'')],['has',current?'yes':'']])el.setAttribute('data-attach-'+k,v);};
    // A small button that opens a quick edit (PRIMARY only).
    const quickButton=(parent,text,kind,id)=>{if(response.permissions&&response.permissions.can_write===true){
      const el=button(parent,text,'data-quick');el.setAttribute('data-quick',kind);if(id)el.setAttribute('data-quick-id',id);el.className='button small';el.setAttribute('data-mutation',kind+'-update');}};
    const metricList=(parent,entries)=>{const dl=add(parent,'dl',undefined,'metrics');for(const [label,value] of entries){const m=add(dl,'div');add(m,'dt',label);add(m,'dd',value);}return dl;};
    const levelBadge=(parent,attention)=>attention.count?badge(parent,attention.level):add(parent,'span','Nothing to review','badge neutral');
    if(page==='properties'){
      // A compact summary per property; tapping one opens its page.
      const items=response.data.properties;
      heading('Properties');
      const grid=add(main,'div',undefined,'grid');
      if(!items.length)empty(card(grid,'Properties').el,'No properties are recorded.');
      for(const item of items){
        const link=add(grid,'a',undefined,'card link-card');link.href='#property/'+encodeURIComponent(item.property_id);
        const head=add(link,'div',undefined,'card-head');add(head,'h2',item.property_id);levelBadge(head,item.attention.total);
        add(link,'p',recorded(item.address),'subtext');
        add(link,'p',[gbp(item.current_value),'LTV '+percent(item.finance.ltv),'Rent '+gbp(item.tenancy.monthly_rent)+'/m'].join(' · '),'item-action');
        add(link,'span','›','chevron').setAttribute('aria-hidden','true');
      }
      return;
    }
    if(page==='property'){
      const d=response.data,item=d.portfolio.properties.find(p=>p.property_id===options.propertyId);
      const canWrite=response.permissions.can_write===true,form=options.form;
      if(!item){heading('Property');const box=card(main,'Property not found','placeholder');add(box.el,'p','This property is not in the portfolio.');const back=add(box.el,'a','Back to Properties','button');back.href='#properties';return;}
      const details=item.details||{},t=details.tenancy,m=details.mortgage;
      heading(item.property_id);
      const grid=add(main,'div',undefined,'grid');
      const alertLine=(parent,alertValue,label)=>{if(alertValue){const line=add(parent,'div',undefined,'item-top');badge(line,alertValue.level);add(line,'span',label+' '+dayText(alertValue.days),'item-scope');}};
      // Value and money summary.
      const value=card(grid,'Value','attention-card');levelBadge(value.head,item.attention.total);
      add(value.el,'p',recorded(item.address)+(item.status?' · '+words(item.status):''),'subtext');
      metricList(value.el,[['Current value',gbp(item.current_value)],['Valued',when(item.current_value_date)],['Source',recorded(item.valuation_source)],
        ['LTV',percent(item.finance.ltv)],['Rent per month',gbp(item.tenancy.monthly_rent)],['Mortgage payment (interest) per month',gbp(item.mortgage.monthly_payment)],
        ['Cashflow per month',gbp(item.finance.monthly_cashflow_before_operating_expenses)],['Principal repaid',gbp(item.finance.principal_repaid_total)]]).className='metrics compact';
      {const row=add(value.el,'div',undefined,'actions start');quickButton(row,'Update value','value');}
      // Mortgage.
      const mortgage=card(grid,'Mortgage');if(m)add(mortgage.head,'span',m.mortgage_id,'item-scope');
      if(m){
        alertLine(mortgage.el,m.fixed_until_alert,'Fixed rate ends');
        metricList(mortgage.el,[['Lender',recorded(m.lender)],['Type',m.mortgage_type?words(m.mortgage_type):'Not recorded'],
          ['Rate',known(m.interest_rate)?percent(m.interest_rate)+(m.rate_type?' · '+words(m.rate_type):''):'Not available'],['Fixed until',when(m.fixed_until)],
          ['Current balance',gbp(m.current_balance)],['Balance date',when(m.balance_date)],['Payment per month',gbp(m.monthly_payment)],
          ['Original balance',gbp(m.original_balance)],['Start',when(m.start_date)],['End',when(m.end_date)],['Product fee',gbp(m.product_fee)]]).className='metrics compact';
        const row=add(mortgage.el,'div',undefined,'actions start');quickButton(row,'Update mortgage','mortgage');quickButton(row,'Remortgage','remortgage');
      } else empty(mortgage.el,'No current mortgage.');
      if(details.previous_mortgages&&details.previous_mortgages.length){const ul=list(mortgage.el);
        for(const r of details.previous_mortgages)add(ul,'li','Earlier: '+r.mortgage_id+(r.lender?' · '+r.lender:'')+' · '+words(r.status)+' · '+[r.start_date,r.end_date].map(when).join(' – '),'subtext');}
      // Tenancy.
      const tenancy=card(grid,'Tenancy');if(t)add(tenancy.head,'span',t.tenancy_id,'item-scope');
      if(t){
        alertLine(tenancy.el,t.rent_review,'Rent review');
        metricList(tenancy.el,[['Status',words(t.status)],['Rent per month',gbp(t.monthly_rent)],['Start',when(t.start_date)],['End',when(t.end_date)],
          ['Rent due day',known(t.rent_due_day)?String(t.rent_due_day):'Not recorded'],['Next rent review',when(t.next_rent_review_date)],
          ['Last rent increase',when(t.last_rent_increase_date)],['Managed by',t.managed_by?words(t.managed_by):'Not recorded'],
          ['Deposit',gbp(t.deposit_amount)],['Deposit scheme',recorded(t.deposit_scheme)],['Deposit protected',when(t.deposit_protected_date)],
          ['Deposit reference',recorded(t.deposit_reference)],['Right to rent',t.right_to_rent_status?words(t.right_to_rent_status):'Not recorded'],
          ['Right to rent checked',when(t.right_to_rent_check_date)]]).className='metrics compact';
        {const docs=add(tenancy.el,'div',undefined,'actions start');docButton(docs,'Tenancy agreement','Tenancies',t.tenancy_id,'tenancy_document',t.tenancy_document);
          docButton(docs,'Deposit certificate','Tenancies',t.tenancy_id,'deposit_document',t.deposit_document);
          docButton(docs,'Right to rent evidence','Tenancies',t.tenancy_id,'right_to_rent_evidence_location',t.right_to_rent_evidence_location);
          attachButton(docs,'Attach tenancy agreement','Tenancies',t.tenancy_id,'tenancy_document',t.version,t.tenancy_document);
          attachButton(docs,'Attach deposit certificate','Tenancies',t.tenancy_id,'deposit_document',t.version,t.deposit_document);
          attachButton(docs,'Attach right to rent evidence','Tenancies',t.tenancy_id,'right_to_rent_evidence_location',t.version,t.right_to_rent_evidence_location);}
        const row=add(tenancy.el,'div',undefined,'actions start');quickButton(row,'Update rent','rent');
        if(['current','pending'].includes(t.status))quickButton(row,'End tenancy','end-tenancy');
        quickButton(row,'New tenancy','new-tenancy');
      } else {empty(tenancy.el,'No current tenancy.');const row=add(tenancy.el,'div',undefined,'actions start');quickButton(row,'New tenancy','new-tenancy');}
      if(details.previous_tenancies&&details.previous_tenancies.length){const ul=list(tenancy.el);
        for(const r of details.previous_tenancies)add(ul,'li','Earlier: '+r.tenancy_id+' · '+words(r.status)+' · '+[r.start_date,r.end_date].map(when).join(' – '),'subtext');}
      // This property's compliance and maintenance, linking to the full lists filtered to it.
      const mine=records=>records.filter(r=>r.property_id===item.property_id);
      const compliance=card(grid,'Compliance');
      {const link=add(compliance.head,'a','All');link.href='#compliance';link.setAttribute('data-filter-property',item.property_id);}
      const certs=[...mine(d.compliance.groups.due),...mine(d.compliance.groups.current)];
      if(!certs.length)empty(compliance.el,'No current certificates recorded.');
      {const ul=list(compliance.el);for(const r of certs){const li=add(ul,'li'),top=add(li,'div',undefined,'item-top');
        if(r.level)badge(top,r.level);else add(top,'span',words(r.status),'badge neutral');add(top,'span',words(r.compliance_type),'item-scope');
        add(li,'p',r.expiry_date?'Expiry '+date(r.expiry_date)+(r.days_to_expiry!==null?' · '+expiryText(r.days_to_expiry):''):'No expiry date recorded','subtext');
        if(r.renewal_status)add(li,'p','Renewal '+words(r.renewal_status).toLowerCase(),'subtext');
        {const docs=add(li,'div',undefined,'actions start');docButton(docs,'Open certificate','Compliance',r.compliance_id,'document',r.document);
          attachButton(docs,'Attach certificate','Compliance',r.compliance_id,'document',r.version,r.document);}
        {const row=add(li,'div',undefined,'actions start');if(['current','pending'].includes(r.status))quickButton(row,'Renew','renew',r.compliance_id);
          quickButton(row,'Renewal status','renewal',r.compliance_id);}}}
      const repairs=card(grid,'Maintenance');
      {const link=add(repairs.head,'a','All');link.href='#maintenance';link.setAttribute('data-filter-property',item.property_id);}
      const jobs=[...mine(d.maintenance.groups.open),...mine(d.maintenance.groups.recurring)];
      if(!jobs.length)empty(repairs.el,'No open or recurring maintenance.');
      {const ul=list(repairs.el);for(const r of jobs){const li=add(ul,'li'),top=add(li,'div',undefined,'item-top');
        if(r.level)badge(top,r.level);else add(top,'span',words(r.status),'badge neutral');add(top,'span',r.category?words(r.category):words(r.maintenance_type),'item-scope');
        add(li,'p',r.description||'No description','item-action');
        const due=r.group==='recurring'?(r.next_due_date?'Next due '+date(r.next_due_date):'Next due date missing'):(r.target_date?'Target '+date(r.target_date):'');
        if(due)add(li,'p',due+(r.days!==null?' · '+dayText(r.days):''),'subtext');}}
      const back=add(main,'a','Back to Properties','button back-link');back.href='#properties';
      return;
    }
    if(page==='finance'){
      const t=response.data.totals;
      heading('Finance');
      const grid=add(main,'div',undefined,'grid');
      const total=card(grid,'Portfolio finance','attention-card');
      metricList(total.el,[['Current property value',gbp(t.total_current_property_value)],['Mortgage exposure',gbp(t.total_current_mortgage_balance)],
        ['Portfolio LTV',percent(t.portfolio_ltv)],['Rent per month',gbp(t.total_monthly_contractual_rent)],
        ['Mortgage payments (interest) per month',gbp(t.total_monthly_mortgage_cost)],['Cashflow per month',gbp(t.monthly_cashflow_before_operating_expenses)],
        ['Rent per year',gbp(t.total_annual_contractual_rent)],['Mortgage payments (interest) per year',gbp(t.total_annual_mortgage_cost)],
        ['Cashflow per year',gbp(t.annual_cashflow_before_operating_expenses)]]);
      add(total.el,'p','Cashflow is rent minus mortgage payments, before operating expenses — not profit.','note');
      if(!t.complete)add(total.el,'p','Incomplete finance data. Unknown values are not treated as zero.','note');
      for(const item of response.data.properties){
        const box=card(grid,item.property_id);
        metricList(box.el,[['Rent per month',gbp(item.tenancy.monthly_rent)],['Mortgage payment (interest) per month',gbp(item.mortgage.monthly_payment)],
          ['Cashflow per month',gbp(item.finance.monthly_cashflow_before_operating_expenses)],['LTV',percent(item.finance.ltv)],
          ['Principal repaid',gbp(item.finance.principal_repaid_total)],['Principal repaid %',percent(item.finance.principal_repaid_pct)]]);
      }
      return;
    }
    if(page==='company'){
      const d=response.data,canWrite=response.permissions.can_write===true,form=options.form;
      if(form&&canWrite){
        const r=form.record||{},values=form.values||{};
        heading(form.mode==='create'?'Add record':'Edit '+r.company_compliance_id);
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
      heading('Company compliance');
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
        {const docs=add(box.el,'div',undefined,'actions start');docButton(docs,'Open document','CompanyCompliance',r.company_compliance_id,'document',r.document);
          attachButton(docs,'Attach document','CompanyCompliance',r.company_compliance_id,'document',r.version,r.document);}
        if(canWrite){const edit=button(box.el,'Edit','data-cc-edit');edit.setAttribute('data-cc-edit',r.company_compliance_id);edit.setAttribute('data-mutation','company-compliance-update');}
      }
      return;
    }
    if(page==='maintenance'){
      const d=response.data,filter=d.properties.includes(options.propertyFilter)?options.propertyFilter:'';
      const canWrite=response.permissions.can_write===true,form=options.form;
      if(form&&canWrite&&form.kind==='maintenance'){
        const r=form.record||{},values=form.values||{};
        heading(mntTitles[form.mode]);
        const box=card(main,mntTitles[form.mode]);
        if(form.mode!=='create')add(box.el,'p',[r.property_id,r.description||words(r.category),r.maintenance_id].filter(Boolean).join(' · '),'subtext');
        if(form.issues&&form.issues.length){const alert=add(box.el,'div',undefined,'note');alert.setAttribute('role','alert');
          add(alert,'p','Please fix:');const ul=add(alert,'ul');for(const issue of form.issues)add(ul,'li',issue);}
        if(form.message){const m=add(box.el,'p',form.message,'note');m.setAttribute('role','alert');}
        const f=add(box.el,'form',undefined,'cc-form');f.setAttribute('data-mnt-form','true');
        const shown=mntQuick[form.mode]||mntFields.map(x=>x[0]);
        for(const [name,label,kind] of shown.map(field=>mntFields.find(x=>x[0]===field))){
          const wrap=add(f,'label',undefined,'field');add(wrap,'span',label);
          const current=typeof values[name]==='string'?values[name]:'';
          let control;
          if(kind==='select'){control=add(wrap,'select');
            const choices=(name==='property_id'?d.properties:d.choices[name]||[]).slice();
            // Keep an existing value that is not in the list, so an edit never changes it silently.
            if(current&&!choices.includes(current))choices.unshift(current);
            if(!current||['category','reported_by','managed_by'].includes(name))choices.unshift('');
            for(const choice of choices){const o=add(control,'option',choice?(name==='property_id'?choice:words(choice)):'Not recorded');o.value=choice;if(choice===current)o.selected=true;}}
          else if(kind==='textarea'){control=add(wrap,'textarea');control.rows=3;}
          else {control=add(wrap,'input');control.type=kind==='date'?'date':'text';if(kind==='money')control.setAttribute('inputmode','decimal');}
          control.name=name;control.setAttribute('name',name);control.value=current;
        }
        const actions=add(f,'div',undefined,'actions');
        const save=add(actions,'button',form.saving?'Saving…':'Save','button');save.type='submit';save.disabled=form.saving===true;save.setAttribute('data-mutation','maintenance-'+form.mode);
        button(actions,'Cancel','data-mnt-cancel');
        return;
      }
      heading('Maintenance');
      const toolbar=add(main,'div',undefined,'toolbar');
      propertyFilter(toolbar,d.properties,filter);
      if(canWrite)button(toolbar,'Add job','data-mnt-add').setAttribute('data-mutation','maintenance-create');
      const pick=records=>filter?records.filter(r=>r.property_id===filter):records;
      const item=(parent,r)=>{
        const row=add(parent,'li'),top=add(row,'div',undefined,'item-top');
        if(r.level)badge(top,r.level);else add(top,'span',words(r.status),'badge neutral');
        add(top,'span',[r.property_id,r.category?words(r.category):words(r.maintenance_type)].join(' · '),'item-scope');
        add(row,'p',r.description||(r.category?words(r.category):'No description'),'item-action');
        const when=[];
        if(r.group==='recurring'){
          when.push(r.missing_next_due_date?'Next due date missing':r.next_due_date?'Next due '+date(r.next_due_date):'No next due date');
          if(r.days!==null)when.push(dayText(r.days));
          if(r.completed_date)when.push('Last done '+date(r.completed_date));
        } else if(r.group==='open'){
          if(r.level)when.push(words(r.status));
          if(r.priority&&r.priority!=='normal')when.push(words(r.priority)+' priority');
          if(r.target_date)when.push('Target '+date(r.target_date)+(r.days!==null?' · '+dayText(r.days):''));
        } else when.push(r.status==='completed'?(r.completed_date?'Completed '+date(r.completed_date):'Completed'):words(r.status));
        if(when.length)add(row,'p',when.join(' · '),'subtext');
        const who=[r.contractor,r.cost?costText(r.cost):'',r.maintenance_id].filter(Boolean);
        add(row,'p',who.join(' · '),'subtext');
        if(r.resolution)add(row,'p','Resolution: '+r.resolution,'subtext');
        {const docs=add(row,'div',undefined,'actions start');docButton(docs,'Open invoice','Maintenance',r.maintenance_id,'invoice_document',r.invoice_document);
          docButton(docs,'Open supporting document','Maintenance',r.maintenance_id,'supporting_document',r.supporting_document);
          attachButton(docs,'Attach invoice','Maintenance',r.maintenance_id,'invoice_document',r.version,r.invoice_document);
          attachButton(docs,'Attach supporting document','Maintenance',r.maintenance_id,'supporting_document',r.version,r.supporting_document);}
        if(canWrite){
          const actions=add(row,'div',undefined,'actions start');
          const act=(text,attribute,mode)=>{const el=button(actions,text,attribute);el.setAttribute(attribute,r.maintenance_id);el.setAttribute('data-mutation','maintenance-'+mode);el.className='button small';};
          if(r.group==='open')act('Mark completed','data-mnt-complete','complete');
          if(r.group==='recurring')act('Mark done','data-mnt-done','done');
          act('Edit','data-mnt-edit','update');
        }
      };
      const grid=add(main,'div',undefined,'grid');
      const section=(name,title,records,closed)=>{
        const box=card(grid,title);add(box.head,'span',String(records.length),'item-scope');
        if(!records.length){empty(box.el,name==='open'?'No open maintenance.':name==='recurring'?'No recurring maintenance.':'No closed maintenance.');return;}
        let parent=box.el;
        if(closed){parent=add(box.el,'details');add(parent,'summary','Show '+records.length+' closed');}
        const ul=list(parent);for(const r of records)item(ul,r);
      };
      section('open','Open',pick(d.groups.open));
      section('recurring','Recurring',pick(d.groups.recurring));
      section('closed','Closed',pick(d.groups.closed),true);
      return;
    }
    if(page==='compliance'){
      const d=response.data,filter=d.properties.includes(options.propertyFilter)?options.propertyFilter:'';
      heading('Compliance');
      const toolbar=add(main,'div',undefined,'toolbar');propertyFilter(toolbar,d.properties,filter);
      const pick=records=>filter?records.filter(r=>r.property_id===filter):records;
      const item=(parent,r)=>{
        const row=add(parent,'li'),top=add(row,'div',undefined,'item-top');
        if(r.level)badge(top,r.level);else add(top,'span',words(r.status),'badge neutral');
        add(top,'span',[r.property_id,words(r.compliance_type)].join(' · '),'item-scope');
        add(row,'p',r.expiry_date?'Expiry '+date(r.expiry_date)+(r.group!=='history'&&r.days_to_expiry!==null?' · '+expiryText(r.days_to_expiry):''):'No expiry date recorded','item-action');
        const facts=[];
        if(r.renewal_status)facts.push('Renewal '+words(r.renewal_status).toLowerCase());
        if(r.energy_rating)facts.push('EPC '+r.energy_rating+(r.energy_score?' ('+r.energy_score+')':''));
        if(r.issue_date||r.inspection_date)facts.push((r.inspection_date?'Inspected ':'Issued ')+date(r.inspection_date||r.issue_date));
        if(facts.length)add(row,'p',facts.join(' · '),'subtext');
        const who=[r.provider,r.certificate_reference,r.cost?costText(r.cost):'',r.compliance_id].filter(Boolean);
        add(row,'p',who.join(' · '),'subtext');
        const alarms=[r.smoke_alarms_checked===true?'Smoke alarms checked':'',r.co_alarms_checked===true?'CO alarms checked':''].filter(Boolean);
        if(alarms.length)add(row,'p',alarms.join(' · '),'subtext');
        {const docs=add(row,'div',undefined,'actions start');docButton(docs,'Open certificate','Compliance',r.compliance_id,'document',r.document);
          if(r.group!=='history')attachButton(docs,'Attach certificate','Compliance',r.compliance_id,'document',r.version,r.document);}
        if(r.group!=='history'){const actions=add(row,'div',undefined,'actions start');
          if(['current','pending'].includes(r.status))quickButton(actions,'Renew','renew',r.compliance_id);
          quickButton(actions,'Renewal status','renewal',r.compliance_id);}
      };
      const grid=add(main,'div',undefined,'grid');
      const section=(name,title,records,closed)=>{
        const box=card(grid,title);add(box.head,'span',String(records.length),'item-scope');
        if(!records.length){empty(box.el,name==='due'?'Nothing needs renewing in the next 90 days.':name==='current'?'No other current certificates.':'No earlier certificates.');return;}
        let parent=box.el;
        if(closed){parent=add(box.el,'details');add(parent,'summary','Show '+records.length+' earlier');}
        const ul=list(parent);for(const r of records)item(ul,r);
      };
      section('due','Needs renewal',pick(d.groups.due));
      section('current','Current',pick(d.groups.current));
      section('history','Earlier',pick(d.groups.history),true);
      return;
    }
    if(page==='more'){
      heading('More');
      const d=response.data||{},rank={overdue:0,urgent:1,warning:2};
      const worst=levels=>levels.filter(l=>Object.hasOwn(rank,l)).sort((a,b)=>rank[a]-rank[b])[0]||null;
      const plural=(n,one,many)=>n+' '+(n===1?one:many);
      // One tappable row: icon, name, status line, severity badge (when something needs attention), chevron.
      const row=(list,href,icon,title,status,level)=>{
        const a=add(list,'a',undefined,'menu-row');a.href=href;
        add(a,'span',icon,'menu-icon').setAttribute('aria-hidden','true');
        const text=add(a,'span',undefined,'menu-text');add(text,'span',title,'menu-title');if(status)add(text,'span',status,'menu-status');
        if(level)badge(a,level);
        add(a,'span','›','menu-chevron').setAttribute('aria-hidden','true');
      };
      const lists=add(main,'section',undefined,'card menu');lists.setAttribute('aria-label','Portfolio lists');
      add(lists,'h2','Portfolio','menu-heading');
      const c=d.compliance&&d.compliance.groups,m=d.maintenance&&d.maintenance.groups,cc=d.company_compliance&&d.company_compliance.records;
      row(lists,'#compliance','✓','Compliance',c?(c.due.length?plural(c.due.length,'needs renewal','need renewal')+' · ':'')+plural(c.current.length,'current','current'):'',
        c?worst(c.due.map(r=>r.level)):null);
      row(lists,'#maintenance','⚒','Maintenance',m?plural(m.open.length,'open job','open jobs')+' · '+plural(m.recurring.length,'recurring','recurring'):'',
        m?worst(m.open.concat(m.recurring).map(r=>r.level)):null);
      const pending=cc?cc.filter(r=>r.status==='pending').length:0;
      row(lists,'#company','◧','Company compliance',cc?(pending?plural(pending,'pending','pending'):'Nothing pending'):'',
        worst(((d.attention&&d.attention.items)||[]).filter(i=>i.category==='Company compliance').map(i=>i.level)));
      const account=add(main,'section',undefined,'card menu');account.setAttribute('aria-label','Account');
      add(account,'h2','Account','menu-heading');
      const who=add(account,'div',undefined,'menu-row static');
      add(who,'span',response.permissions&&response.permissions.can_write?'✎':'◎','menu-icon').setAttribute('aria-hidden','true');
      const whoText=add(who,'span',undefined,'menu-text');
      add(whoText,'span',response.permissions&&response.permissions.can_write?'Editor':'View only','menu-title');
      add(whoText,'span',response.permissions&&response.permissions.can_write?'You can add and edit records':'You can view everything; editing is off','menu-status');
      if(options.canSignOut){const out=button(account,'Sign out','data-signout');out.className='menu-row menu-button';}
      if(options.canSignOutEverywhere){const all=button(account,'Sign out all devices','data-signout-all');all.className='menu-row menu-button danger';}
      // System check (editor only): the server's read-only checks, one line each.
      if(options.canCheckHealth&&response.permissions&&response.permissions.can_write){
        const system=add(main,'section',undefined,'card menu');system.setAttribute('aria-label','System');
        add(system,'h2','System','menu-heading');
        const h=options.health||{},r=h.result,checks=r&&r.ok&&r.data&&Array.isArray(r.data.checks)?r.data.checks:null;
        const failed=checks?checks.filter(c=>!c.ok).length:0;
        const status=h.running?'Checking… this can take up to a minute':checks?(failed?failed+' of '+checks.length+' checks failed':'All '+checks.length+' checks passed'+
          (typeof r.data.ms==='number'?' · '+(r.data.ms/1000).toFixed(1)+' s':'')):r?'Could not run the check. Reference: '+(code(r)&&/^[A-Z_]{1,40}$/.test(code(r))?code(r):'UNKNOWN'):
          'Checks the workbook, documents folder, Google sign-in and sessions';
        const run=add(system,'button',undefined,'menu-row');run.type='button';run.setAttribute('data-health','true');if(h.running)run.disabled=true;
        add(run,'span','⚙','menu-icon').setAttribute('aria-hidden','true');
        const text=add(run,'span',undefined,'menu-text');add(text,'span',checks?'Run the system check again':'Run system check','menu-title');
        add(text,'span',status,'menu-status').setAttribute('role','status');
        if(checks)for(const c of checks){
          const line=add(system,'div',undefined,'menu-row static');
          add(line,'span',c.ok?'✓':'✕','menu-icon '+(c.ok?'ok':'fail')).setAttribute('aria-label',c.ok?'Passed':'Failed');
          const t=add(line,'span',undefined,'menu-text');add(t,'span',String(c.name),'menu-title');add(t,'span',String(c.detail),'menu-status');
        }
      }
      if(typeof options.version==='string')add(main,'p','Version '+options.version,'version');
      return;
    }
    const full=page==='attention',data=response.data,attentionData=full?data:data.attention;
    heading(full?'Attention':'What needs attention?');
    // Severity counters first: the whole picture in one row.
    const counters=add(main,'div',undefined,'counters');counters.setAttribute('aria-label','Attention by severity');
    for(const level of ['overdue','urgent','warning','neutral']){
      const count=attentionData.counts[level]||0,c=add(counters,'div',undefined,'counter '+(count?level:'zero'));
      add(c,'span',count,'counter-number');add(c,'span',level==='neutral'?'Info':labels[level],'counter-label');
    }
    const grid=add(main,'div',undefined,'grid');
    const attention=card(grid,full?'All attention items':'Needs attention','attention-card');
    if(!full&&attentionData.counts.total){const link=add(attention.head,'a','All '+attentionData.counts.total);link.href='#attention';}
    if(!attentionData.items.length)empty(attention.el,'No items currently need attention.');
    const actions=list(attention.el);
    for(const item of attentionData.items){
      const row=add(actions,'li');
      // Older answers without structured text keep the original layout.
      if(typeof item.title!=='string'){
        const top=add(row,'div',undefined,'item-top');badge(top,item.level);
        add(top,'span',item.property+' · '+item.category,'item-scope');add(row,'p',item.action,'item-action');
        if(full&&item.relevant_date)add(row,'p','Date '+date(item.relevant_date),'subtext');
        continue;
      }
      // Title, then where · what · when; the countdown pill carries the severity colour.
      row.className='attn-item';
      const link=add(row,'a',undefined,'attn');
      link.href=item.property==='Company'?'#company':'#property/'+encodeURIComponent(item.property);
      const text=add(link,'span',undefined,'attn-text');
      add(text,'span',item.title_code?words(item.title):item.title,'attn-title');
      const when=[item.note,item.date?date(item.date):''].filter(Boolean).join(' ');
      add(text,'span',[item.property,when].filter(Boolean).join(' · '),'attn-sub');
      const level=Object.hasOwn(labels,item.level)?item.level:'neutral';
      if(typeof item.days==='number'){const pill=add(link,'span',undefined,'attn-pill '+level);
        add(pill,'span',labels[level]+': ','sr-only');add(pill,'span',dayText(item.days));}
      else if(level!=='neutral')add(link,'span',labels[level],'attn-pill '+level);
      add(link,'span','›','menu-chevron').setAttribute('aria-hidden','true');
    }
    if(full)return;
    const maintenance=card(grid,'Open maintenance');
    {const link=add(maintenance.head,'a','All');link.href='#maintenance';}
    add(maintenance.el,'p',data.maintenance.follow_up_count+' follow-ups','subtext');
    if(!data.maintenance.items.length)empty(maintenance.el,'No maintenance follow-ups to show.');
    const repairs=list(maintenance.el);
    for(const item of data.maintenance.items){const row=add(repairs,'li'),top=add(row,'div',undefined,'item-top');badge(top,item.level);add(top,'span',item.property_id,'item-scope');add(row,'p',item.reason,'item-action');if(item.target_date)add(row,'p','Target '+date(item.target_date),'subtext');}
    const upcoming=card(grid,'Upcoming dates');
    if(!data.upcoming_dates.length)empty(upcoming.el,'No upcoming actionable dates are recorded.');
    const dates=list(upcoming.el);
    for(const item of data.upcoming_dates){const row=add(dates,'li',undefined,'date-row'),text=add(row,'div');add(text,'h3',item.type);add(text,'p',item.property_id||'Company','subtext');const time=add(row,'time',date(item.date));time.setAttribute('datetime',item.date);}
    const portfolio=card(grid,'Portfolio snapshot'),p=data.portfolio;
    add(portfolio.head,'span',p.property_count+(p.property_count===1?' property':' properties'),'item-scope');
    const metrics=add(portfolio.el,'dl',undefined,'metrics three');
    // Rounded on Home; Properties and Finance show exact amounts.
    for(const [label,value]of [['Value',gbpShort(p.total_current_property_value)],['Mortgage',gbpShort(p.total_current_mortgage_balance)],['LTV',percent(p.portfolio_ltv)]]){
      const metric=add(metrics,'div');add(metric,'dt',label);add(metric,'dd',value);
    }
    if(!p.complete)add(portfolio.el,'p','Incomplete finance data. Unknown values are not treated as zero.','note');
    // Shown only when the server provides it (it is optional and currently unavailable).
    if(data.regulatory.available){
      const regulatory=card(grid,'Regulatory monitoring');
      if(!data.regulatory.sources.length)empty(regulatory.el,'No regulatory sources in this summary.');
      const sources=list(regulatory.el);
      for(const source of data.regulatory.sources){const row=add(sources,'li');add(row,'h3',source.title);add(row,'p','Last checked: '+date(source.last_checked?source.last_checked.slice(0,10):null),'subtext');add(row,'p',source.monitoring_due?'Monitoring check due':'Monitoring check not currently due','subtext');}
    }
  }
  // adapter: {load(kind, scenario) -> Promise<response>, signOut?(), renderSignIn?(host, done), version?}
  // Responses live in memory only; nothing is written to device storage here.
  function mount(doc,adapter) {
    const main=doc.getElementById('main'),select=doc.getElementById('scenario');
    // One 'all' answer serves every screen (memory only). problem holds a failed answer instead.
    let all=null,problem=null,loading=true,refreshing=false,stale=false,loadedAt=0,generation=0,form=null,propertyFilter='',slow=false,slowTimer=null;
    const REFRESH_AFTER_MS=5*60*1000;
    // '#property/<property_id>' opens one property's page; other hashes name a screen.
    const route=()=>{const hash=root.location.hash.slice(1),match=/^property\/(.+)$/.exec(hash);
      if(match){let id;try{id=decodeURIComponent(match[1]);}catch(_){id='';}return {page:'property',propertyId:id};}
      return {page:pages.includes(hash)&&hash!=='property'?hash:'home',propertyId:null};};
    const page=()=>route().page;
    const options={canSignOut:typeof adapter.signOut==='function',canSignOutEverywhere:typeof adapter.signOutEverywhere==='function',
      canCheckHealth:typeof adapter.checkHealth==='function',version:adapter.version,form:null,propertyFilter:''};
    // The last System check on More (memory only): null, {running:true} or {result}.
    let health=null;
    // Each screen's answer is the matching part of 'all', in the shape its own action returns.
    function current(){
      if(problem)return problem;
      if(!all)return null;
      const kind=dataKinds[page()]||'home';
      // A property page draws from several parts of the one answer.
      // More shows a status line for each list, from the same answer.
      if(kind==='more')return {...all,warnings:[],data:{compliance:all.data.compliance,maintenance:all.data.maintenance,
        company_compliance:all.data.company_compliance,attention:all.data.attention}};
      if(kind==='property')return {...all,warnings:[],data:{portfolio:all.data.portfolio,compliance:all.data.compliance,maintenance:all.data.maintenance}};
      return {...all,warnings:kind==='home'?all.warnings:[],data:all.data[kind]};
    }
    function paint(){
      const response=current();
      // Signed out only once the server says so; nothing while the first answer is on its way.
      doc.getElementById('access').textContent=all?(all.permissions.can_write?'Editor':'View only'):select?'Preview':
        code(problem)==='UNAUTHENTICATED'?'Signed out':'';
      doc.getElementById('freshness').textContent=refreshing?'Updating…':all&&!loading?(stale?'Offline · ':'')+updatedAt(all.observed_at):'';
      const timing=doc.getElementById('timing');if(timing)timing.textContent=all?timingText(all):'';
      const title=doc.getElementById('screen-title');
      if(title)title.textContent=form?(form.kind==='attach'?'Attach':form.quick?form.shortTitle||form.title:form.kind==='maintenance'?mntTitles[form.mode]:
        form.mode==='create'?'Add record':'Edit record'):page()==='property'?route().propertyId:titles[page()]||'Home';
      const refresh=doc.getElementById('refresh');
      if(refresh){refresh.disabled=loading||refreshing;refresh.setAttribute('aria-busy',loading||refreshing?'true':'false');}
      const tab=['company','maintenance','compliance'].includes(page())?'more':page()==='property'?'properties':page();
      for(const link of doc.querySelectorAll('[data-page]')){if(link.getAttribute('data-page')===tab)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');}
      options.form=form;options.propertyFilter=propertyFilter;options.slow=slow;options.propertyId=route().propertyId;options.health=health;
      render(doc,main,response,page(),loading,options);
      wireCompany(response);
      wireMaintenance(response);
      wireQuick(response);
      // "All" links on a property page open the full list filtered to that property.
      for(const link of main.querySelectorAll('[data-filter-property]'))link.addEventListener('click',()=>{propertyFilter=link.getAttribute('data-filter-property');});
      const filter=main.querySelector('[data-property-filter]');
      if(filter)filter.addEventListener('change',()=>{propertyFilter=String(filter.value||'');paint();});
      const retry=main.querySelector('[data-retry]');if(retry)retry.addEventListener('click',reload);
      const out=main.querySelector('[data-signout]');if(out)out.addEventListener('click',signOut);
      wireDocuments();
      wireAttach();
      const everywhere=main.querySelector('[data-signout-all]');if(everywhere)everywhere.addEventListener('click',signOutEverywhere);
      const healthButton=main.querySelector('[data-health]');if(healthButton)healthButton.addEventListener('click',checkHealth);
      const host=main.querySelector('[data-signin]');if(host&&adapter.renderSignIn)adapter.renderSignIn(host,reload);
    }
    // With data already shown, a refresh keeps it on screen and only the header says "Updating…".
    async function load(){const now=++generation;
      if(all)refreshing=true;else loading=true;
      // A first load that takes a while says so (the server can be slow to wake up).
      slow=false;if(slowTimer)root.clearTimeout(slowTimer);
      if(!all&&typeof root.setTimeout==='function')slowTimer=root.setTimeout(()=>{if(now===generation&&loading){slow=true;paint();}},8000);
      paint();
      let next;
      try{next=await adapter.load('all',select?select.value:undefined);}
      catch(_){next={ok:false,error:{code:'OFFLINE'}};}
      if(now!==generation)return;
      loading=false;refreshing=false;loadedAt=Date.now();slow=false;if(slowTimer)root.clearTimeout(slowTimer);
      if(next&&next.ok===true){all=next;problem=null;stale=false;}
      // Offline during a refresh keeps the last answer; any other problem (e.g. signed out) clears it.
      else if(all&&next&&next.error&&next.error.code==='OFFLINE')stale=true;
      else {all=null;problem=next||{ok:false,error:{code:'OFFLINE'}};}
      paint();
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
        const current=form;current.values=values;
        const payload={request_id:current.request_id,fields:values};
        if(current.mode==='update'){payload.company_compliance_id=current.record.company_compliance_id;payload.expected_version=current.record.version;}
        send(current,'company_compliance.'+current.mode,payload);
      });
    }
    // Maintenance add/edit and the two quick actions. The form holds every editable field; a quick
    // action shows only its own fields and sends the rest of the record unchanged.
    function wireMaintenance(response){
      if(page()!=='maintenance'||!response||!response.ok||typeof adapter.save!=='function')return;
      const records=[...response.data.groups.open,...response.data.groups.recurring,...response.data.groups.closed];
      const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
      const open=(mode,record)=>{
        const values={};for(const [name] of mntFields)values[name]=record?String(record[name]||''):'';
        if(mode==='create')Object.assign(values,{property_id:response.data.properties.includes(propertyFilter)?propertyFilter:(response.data.properties[0]||''),
          maintenance_type:'reactive',priority:'normal',status:'reported',reported_date:today});
        if(mode==='complete'||mode==='done')values.completed_date=today;
        if(mode==='done')values.next_due_date='';
        form={kind:'maintenance',mode,record,values,request_id:adapter.newRequestId(),issues:[],message:''};paint();main.focus();root.scrollTo(0,0);
      };
      const addButton=main.querySelector('[data-mnt-add]');if(addButton)addButton.addEventListener('click',()=>open('create',null));
      for(const [attribute,mode] of [['data-mnt-edit','update'],['data-mnt-complete','complete'],['data-mnt-done','done']])
        for(const el of main.querySelectorAll('['+attribute+']'))el.addEventListener('click',()=>open(mode,records.find(r=>r.maintenance_id===el.getAttribute(attribute))));
      const cancel=main.querySelector('[data-mnt-cancel]');if(cancel)cancel.addEventListener('click',()=>{form=null;paint();});
      const element=main.querySelector('[data-mnt-form]');
      if(element)element.addEventListener('submit',event=>{
        event.preventDefault();if(!form||form.saving)return;
        const current=form,values={...current.values};
        for(const field of element.querySelectorAll('[name]'))values[field.getAttribute('name')]=String(field.value||'');
        if(current.mode==='complete')values.status='completed';
        current.values=values;
        const payload={request_id:current.request_id,fields:values};
        if(current.mode!=='create'){payload.maintenance_id=current.record.maintenance_id;payload.expected_version=current.record.version;}
        send(current,current.mode==='create'?'maintenance.create':'maintenance.update',payload);
      });
    }
    // PWA.7 quick edits on the property page and the Compliance list (existing rows only).
    function wireQuick(response){
      if(!['property','compliance'].includes(page())||!response||!response.ok||typeof adapter.save!=='function')return;
      const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
      const str=value=>value===null||value===undefined?'':String(value);
      const complianceData=page()==='property'?response.data.compliance:response.data;
      const item=page()==='property'?response.data.portfolio.properties.find(p=>p.property_id===route().propertyId):null;
      const specs={
        value:()=>({title:'Update value',subtitle:item.property_id+' · '+(item.address||''),fields:valueFields,action:'property.update',idField:'property_id',
          record:{id:item.property_id,version:item.version},
          values:{current_value:str(item.current_value),current_value_date:today,valuation_source:str(item.valuation_source)}}),
        mortgage:()=>{const m=item.details.mortgage;return {title:'Update mortgage',subtitle:item.property_id+' · '+[m.lender,m.mortgage_id].filter(Boolean).join(' · '),
          fields:mortgageFields,action:'mortgage.update',idField:'mortgage_id',record:{id:m.mortgage_id,version:m.version},
          values:{current_balance:str(m.current_balance),balance_date:today,monthly_payment:str(m.monthly_payment),interest_rate:str(m.interest_rate),fixed_until:str(m.fixed_until)}};},
        rent:()=>{const t=item.details.tenancy;return {title:'Update rent',subtitle:item.property_id+' · '+t.tenancy_id,fields:rentFields,action:'tenancy.update',idField:'tenancy_id',
          record:{id:t.tenancy_id,version:t.version},values:{monthly_rent:str(t.monthly_rent),current_rent_effective_date:str(t.current_rent_effective_date),
            last_rent_increase_date:str(t.last_rent_increase_date),next_rent_review_date:str(t.next_rent_review_date)}};},
        remortgage:()=>{const m=item.details.mortgage;return {title:'Remortgage',subtitle:item.property_id+' · replaces '+[m.lender,m.mortgage_id].filter(Boolean).join(' · '),
          fields:remortgageFields,choices:response.data.portfolio.choices,action:'mortgage.remortgage',idField:'mortgage_id',record:{id:m.mortgage_id,version:m.version},
          values:{switch_type:'same-lender',lender:str(m.lender),start_date:today,monthly_payment:'',mortgage_type:str(m.mortgage_type),rate_type:str(m.rate_type),
            interest_rate:'',fixed_until:'',end_date:str(m.end_date),original_balance:'',product_fee:''}};},
        'end-tenancy':()=>{const t=item.details.tenancy;return {title:'End tenancy',subtitle:item.property_id+' · '+t.tenancy_id,fields:[['end_date','End date','date']],
          action:'tenancy.end',idField:'tenancy_id',record:{id:t.tenancy_id,version:t.version},values:{end_date:today}};},
        'new-tenancy':()=>{const t=item.details.tenancy;return {title:'New tenancy',subtitle:item.property_id+(t?' · replaces '+t.tenancy_id:''),
          fields:newTenancyFields,choices:response.data.portfolio.choices,action:'tenancy.new',idField:'property_id',record:{id:item.property_id,version:item.version},
          values:{start_date:today,monthly_rent:t?str(t.monthly_rent):'',next_rent_review_date:'',rent_due_day:t?str(t.rent_due_day):'',managed_by:t?str(t.managed_by):'',
            agent:t?str(t.agent):'',deposit_amount:'',deposit_scheme:'',deposit_reference:'',deposit_protected_date:'',right_to_rent_status:'',right_to_rent_check_date:''}};},
        renew:id=>{const r=[...complianceData.groups.due,...complianceData.groups.current].find(x=>x.compliance_id===id);
          const values=Object.fromEntries(renewAll.map(f=>[f,'']));
          Object.assign(values,{provider:str(r.provider),potential_energy_rating:str(r.potential_energy_rating),potential_energy_score:str(r.potential_energy_score)});
          return {title:'Renew certificate',shortTitle:'Renew',subtitle:[r.property_id,words(r.compliance_type),r.expiry_date?'expires '+date(r.expiry_date):''].filter(Boolean).join(' · '),
            fields:renewFieldsFor(r.compliance_type),choices:complianceData.choices,action:'compliance.renew',idField:'compliance_id',
            record:{id:r.compliance_id,version:r.version},values};},
        renewal:id=>{const r=[...complianceData.groups.due,...complianceData.groups.current,...complianceData.groups.history].find(x=>x.compliance_id===id);
          return {title:'Renewal status',subtitle:[r.property_id,words(r.compliance_type),r.expiry_date?'expiry '+date(r.expiry_date):''].filter(Boolean).join(' · '),
            fields:renewalFields,choices:complianceData.choices,action:'compliance.update',idField:'compliance_id',record:{id:r.compliance_id,version:r.version},
            values:{renewal_status:str(r.renewal_status)}};}
      };
      for(const el of main.querySelectorAll('[data-quick]'))el.addEventListener('click',()=>{
        const spec=specs[el.getAttribute('data-quick')](el.getAttribute('data-quick-id'));
        form={quick:true,kind:el.getAttribute('data-quick'),mode:'update',choices:{},...spec,request_id:adapter.newRequestId(),issues:[],message:''};
        paint();main.focus();root.scrollTo(0,0);
      });
      const cancel=main.querySelector('[data-quick-cancel]');if(cancel)cancel.addEventListener('click',()=>{form=null;paint();});
      const element=main.querySelector('[data-quick-form]');
      if(element)element.addEventListener('submit',event=>{
        event.preventDefault();if(!form||form.saving)return;
        const current=form,values={...current.values};
        for(const field of element.querySelectorAll('[name]'))values[field.getAttribute('name')]=field.type==='checkbox'?(field.checked?'true':'false'):String(field.value||'');
        current.values=values;
        send(current,current.action,{request_id:current.request_id,fields:values,expected_version:current.record.version,[current.idField]:current.record.id});
      });
    }
    // PWA.9A: the window opens on the tap itself (so phones do not block it) and is sent to the Drive link
    // once the server has resolved it; a problem is shown on the button instead.
    const documentProblems={NO_DOCUMENT:'No document recorded',DOCUMENT_MISSING:'Document not found in Drive',
      DOCUMENT_AMBIGUOUS:'More than one file matches',DOCUMENT_REFERENCE_UNSUPPORTED:'Document reference needs fixing in the sheet',
      DOCUMENTS_NOT_CONFIGURED:'Documents folder not set up',OFFLINE:'Could not reach the portfolio'};
    function wireDocuments(){
      if(typeof adapter.openDocument!=='function')return;
      for(const el of main.querySelectorAll('[data-open-doc]'))el.addEventListener('click',async()=>{
        const label=el.textContent,win=typeof root.open==='function'?root.open('about:blank','_blank'):null;
        el.disabled=true;el.textContent='Opening…';
        let result;
        try{result=await adapter.openDocument(el.getAttribute('data-doc-tab'),el.getAttribute('data-doc-id'),el.getAttribute('data-doc-field'));}
        catch(_){result={ok:false,error:{code:'OFFLINE'}};}
        el.disabled=false;
        if(result&&result.ok&&typeof result.data.url==='string'&&/^https:\/\/(drive|docs)\.google\.com\//.test(result.data.url)){
          el.textContent=label;
          if(win){try{win.opener=null;}catch(_){}win.location.href=result.data.url;}else root.location.href=result.data.url;
          return;
        }
        if(win)try{win.close();}catch(_){}
        const code=result&&result.error&&result.error.code;
        el.textContent=documentProblems[code]||'Could not open ('+(typeof code==='string'&&/^[A-Z_]{1,40}$/.test(code)?code:'UNKNOWN')+')';
      });
    }
    // PWA.9B: pick a file, check it here (type, 10 MB), send it; if the server asks, confirm with Google first
    // and then send the same request again (same request id, so it is never saved twice).
    const attachProblems={FILE_TOO_LARGE:'The file is larger than 10 MB.',FILE_TYPE_MISMATCH:'That file is not a PDF, JPEG, PNG or HEIC image.',
      DOCUMENTS_NOT_CONFIGURED:'The Documents folder is not set up for the app.',DOCUMENT_FOLDER_AMBIGUOUS:'Two folders match; tidy the Documents folder first.',
      DOCUMENT_SAVE_FAILED:'Google Drive did not save the file. Try again.',STALE:'This record changed since you opened it. Cancel and open it again.',
      OFFLINE:'Not saved yet: the portfolio could not be reached. Try again; it will not be saved twice.',SIGN_IN_MISMATCH:'Confirm with the same Google account you signed in with.',
      BUSY:'Another save is in progress. Try again in a moment.'};
    const fileTypes={pdf:'application/pdf',jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',heic:'image/heic',heif:'image/heif'};
    function wireAttach(){
      if(typeof adapter.uploadDocument!=='function')return;
      for(const el of main.querySelectorAll('[data-attach]'))el.addEventListener('click',()=>{
        const get=k=>el.getAttribute('data-attach-'+k);
        form={kind:'attach',tab:get('tab'),id:get('id'),field:get('field'),version:get('version'),label:get('label'),hasCurrent:get('has')==='yes',
          request_id:adapter.newRequestId(),message:'',needsConfirm:false};paint();main.focus();root.scrollTo(0,0);
      });
      const cancel=main.querySelector('[data-attach-cancel]');if(cancel)cancel.addEventListener('click',()=>{form=null;paint();});
      const host=main.querySelector('[data-confirm-host]');
      if(host&&form&&form.kind==='attach'&&typeof adapter.renderConfirm==='function'){const current=form;adapter.renderConfirm(host,result=>{
        if(form!==current)return;
        if(result&&result.ok){current.needsConfirm=false;upload(current);}
        else {current.message=attachProblems[result&&result.error&&result.error.code]||'Google did not confirm the account. Try again.';paint();}
      });}
      const element=main.querySelector('[data-attach-form]');
      if(element)element.addEventListener('submit',async event=>{
        event.preventDefault();if(!form||form.saving)return;
        const current=form,input=element.querySelector('[name]'),picked=input&&input.files&&input.files[0];
        if(!picked&&!current.file){current.message='Choose a photo or PDF first.';paint();return;}
        if(picked){
          const ext=String(picked.name||'').split('.').pop().toLowerCase(),type=fileTypes[ext]||(Object.values(fileTypes).includes(picked.type)?picked.type:'');
          if(!type){current.message=attachProblems.FILE_TYPE_MISMATCH;paint();return;}
          if(picked.size>10*1024*1024){current.message=attachProblems.FILE_TOO_LARGE;paint();return;}
          try{current.file={type,data:await readBase64(picked)};}catch(_){current.message='The file could not be read. Try again.';paint();return;}
        }
        upload(current);
      });
    }
    function readBase64(file){return new Promise((resolve,reject)=>{const reader=new root.FileReader();
      reader.onload=()=>resolve(String(reader.result).replace(/^data:[^,]*,/,''));reader.onerror=()=>reject(reader.error);reader.readAsDataURL(file);});}
    async function upload(current){
      current.saving=true;current.message='';paint();
      let result;
      try{result=await adapter.uploadDocument({request_id:current.request_id,tab:current.tab,id:current.id,field:current.field,
        expected_version:current.version,file:current.file});}catch(_){result={ok:false,error:{code:'OFFLINE'}};}
      if(form!==current)return;
      current.saving=false;
      if(result&&result.ok){form=null;reload();return;}
      const code=result&&result.error&&result.error.code;
      if(code==='REAUTH_REQUIRED'){current.needsConfirm=true;paint();return;}
      current.message=attachProblems[code]||'Not saved. Reference: '+(typeof code==='string'&&/^[A-Z_]{1,40}$/.test(code)?code:'UNKNOWN');
      paint();
    }
    // One save attempt for an open form; the form keeps its request_id, so a retry never writes twice.
    async function send(current,action,payload){
      current.saving=true;current.issues=[];current.message='';paint();
      let result;
      try{result=await adapter.save(action,payload);}catch(_){result={ok:false,error:{code:'OFFLINE'}};}
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
    }
    async function checkHealth(){
      if(health&&health.running)return;
      const current=health={running:true};paint();
      let result;
      try{result=await adapter.checkHealth();}catch(_){result={ok:false,error:{code:'OFFLINE'}};}
      if(health!==current)return;
      health={result};paint();
    }
    function reload(){return load();}
    function reset(){all=null;problem=null;health=null;return load();}
    async function signOut(){try{await adapter.signOut();}catch(_){}return reset();}
    // Every device signed in with this account signs out (a lost phone); asks first.
    async function signOutEverywhere(){
      if(typeof root.confirm==='function'&&!root.confirm('Sign out on every device, including this one?'))return;
      try{await adapter.signOutEverywhere();}catch(_){}return reset();
    }
    if(select)select.addEventListener('change',reset);
    const refreshButton=doc.getElementById('refresh');
    if(refreshButton)refreshButton.addEventListener('click',()=>{if(!loading&&!refreshing)load();});
    // Coming back to the app after a while refreshes in the background.
    if(typeof doc.addEventListener==='function')doc.addEventListener('visibilitychange',()=>{
      if(doc.visibilityState==='visible'&&!loading&&!refreshing&&Date.now()-loadedAt>REFRESH_AFTER_MS)load();});
    root.addEventListener('hashchange',()=>{
      form=null;
      paint();
      main.focus();root.scrollTo(0,0);
    });
    load();
  }
  root.PortfolioUi={gbp,gbpShort,percent,date,observed,updatedAt,timingText,render,mount,pages,maintenanceFields:mntFields.map(x=>x[0])};
})(globalThis);
