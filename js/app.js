const {SUPABASE_URL,SUPABASE_ANON_KEY}=window.WGAP_CONFIG;
const sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY);
const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

async function me(){
  const {data:{session}}=await sb.auth.getSession();
  if(!session)return null;
  const {data}=await sb.from('profiles').select('*').eq('id',session.user.id).single();
  return data;
}
async function logout(){await sb.auth.signOut();location.href='index.html'}
function toast(msg,bad){
  let t=$('#toast');if(!t){t=document.createElement('div');t.id='toast';document.body.appendChild(t)}
  t.className=bad?'bad show':'show';t.textContent=msg;clearTimeout(t._h);t._h=setTimeout(()=>t.className='',5000);
}
function topbar(p,extra=''){
  return `<header class="topbar"><div class="brand"><span class="mark">W</span><div><b>Women's Growth Finance Ghana</b><small>Women's Growth Access Programme</small></div></div>
  <div class="who">${extra}<span>${esc(p.full_name)}</span><button class="btn ghost sm" onclick="logout()">Sign out</button></div></header>`;
}

/* ---------- form rendering ---------- */
function sub(id,label,forId,when,type){
  return `<input class="sub" hidden disabled data-for="${forId}" data-when="${when}" name="${id}" type="${type||'text'}" placeholder="${esc(label)}" aria-label="${esc(label)}">`;
}
function fieldHTML(f){
  const req=f.optional?'':'required';let c='';
  const num=f.n!==''&&f.n!=null?`<span class="qn">${f.n}</span>`:'<span class="qn dot"></span>';
  if(f.type==='choice'){
    c='<div class="chips">'+f.options.map(o=>`<label class="chip"><input type="radio" name="${f.id}" value="${esc(o)}" ${req}><span>${esc(o)}</span></label>`).join('')+'</div>';
    if(f.other)c+=sub(f.id+'_other','Please specify',f.id,'Other');
    if(f.follow)c+=sub(f.follow.id,f.follow.label,f.id,f.follow.when,f.follow.type);
  }else if(f.type==='select')c=`<select name="${f.id}" ${req}><option value="">Select…</option>${f.options.map(o=>`<option>${esc(o)}</option>`).join('')}</select>`;
  else if(f.type==='textarea')c=`<textarea name="${f.id}" rows="4" ${req}></textarea>`;
  else if(f.type==='group')c='<div class="grp">'+f.group.map(g=>`<label class="mini"><span>${g.label}</span><input type="number" name="${g.id}" min="${g.min??0}" ${g.max?`max="${g.max}"`:''} ${g.calc?'readonly tabindex="-1"':''} required></label>`).join('')+'</div>';
  else if(f.type==='agree')return `<div class="q full"><label class="agree"><input type="checkbox" name="${f.id}" required><span>${f.label}</span></label></div>`;
  else c=`<input type="${f.type}" name="${f.id}" ${f.min?`min="${f.min}"`:''} ${f.max?`max="${f.max}"`:''} ${f.type==='tel'?'pattern="^(\\+?233|0)\\d{9}$" title="e.g. 0244123456" inputmode="tel"':''} ${req}>`;
  return `<div class="q ${f.full?'full':''}"><div class="qh">${num}<label>${f.label}${f.optional?' <em>optional</em>':''}</label></div>${c}</div>`;
}
function buildForm(form,prefill={}){
  form.innerHTML=WGAP_FORM.map((s,i)=>`<section class="step" data-i="${i}" hidden><div class="stephead"><span class="badge">${s.key}</span><div><h2>${s.title}</h2><p>${s.hint}</p></div></div>
    ${s.intro?`<blockquote class="decl">${s.intro}</blockquote>`:''}<div class="qgrid">${s.fields.map(fieldHTML).join('')}</div></section>`).join('');
  Object.entries(prefill).forEach(([k,v])=>{const el=form.elements[k];if(el)el.value=v});
  const sync=()=>$$('.sub',form).forEach(s=>{const r=form.querySelector(`input[name="${s.dataset.for}"]:checked`);const on=!!r&&r.value===s.dataset.when;s.hidden=!on;s.disabled=!on;s.required=on});
  form.addEventListener('change',sync);
  form.addEventListener('input',()=>{const t=form.elements;if(t.empTotal)t.empTotal.value=(+t.empPaid.value||0)+(+t.empUnpaid.value||0)});
  sync();
}
function collect(form){
  const d={};new FormData(form).forEach((v,k)=>d[k]=typeof v==='string'?v.trim():v);
  d.declAgree=!!form.elements.declAgree.checked;return d;
}

/* ---------- answers (admin view, print, applicant copy) ---------- */
function valOf(f,d){
  if(f.type==='group')return f.group.map(g=>`${g.label}: ${d[g.id]??'—'}`).join('  |  ');
  if(f.type==='agree')return d[f.id]?'Agreed':'—';
  let v=d[f.id];if(v==null||v==='')return '—';
  if(f.other&&v===f.options.at(-1)&&d[f.id+'_other'])v+=': '+d[f.id+'_other'];
  if(f.follow&&v===f.follow.when&&d[f.follow.id])v+=` (${d[f.follow.id]})`;
  return v;
}
function answersHTML(d,skipD=false){
  return WGAP_FORM.filter(s=>!(skipD&&s.key==='D')).map(s=>`<h3><span>${s.key}</span>${s.title}</h3><table class="ans">${s.fields.map(f=>
    `<tr><td class="n">${f.n}</td><td class="l">${f.label}</td><td class="v">${esc(valOf(f,d))}</td></tr>`).join('')}</table>`).join('');
}
function sheetHTML(a){
  const d=a.data,dt=new Date(a.created_at).toLocaleDateString('en-GB');
  const line='<span class="fill"></span>';
  return `<section class="sheet"><div class="sh-head"><div><b>Women's Growth Finance Ghana (WGFG)</b><br>Women's Growth Access Programme</div><div class="ref">Ref: ${esc(a.ref_no)}</div></div>
  <h1>ANNEX A: LOAN APPLICATION FORM</h1><p class="sub">Women's Growth Access Programme | Women's Growth Finance Ghana — Ablekuma Central</p>
  ${answersHTML(d,true)}
  <h3><span>D</span>Declaration and Signature</h3><p class="declp">${WGAP_FORM[3].intro}</p>
  <table class="ans"><tr><td class="l">Applicant's full name</td><td class="v">${esc(d.signName)}</td></tr><tr><td class="l">Signature</td><td class="v"><i>${esc(d.signName)}</i> (electronically submitted)</td></tr>
  <tr><td class="l">Date</td><td class="v">${dt}</td></tr><tr><td class="l">Witness (optional)</td><td class="v">${esc(d.witnessName||'—')}</td></tr></table>
  <div class="official"><h3>For official use only</h3>
  <p>Received: ${line} By: ${line} Application No: WGAP/AC/${line}</p>
  <p>ID verified: ☐ Yes ☐ No &nbsp; Address verified: ☐ Yes ☐ No &nbsp; Field check: ☐ Yes ☐ No</p>
  <p>Recommendation: ☐ Approve ☐ Reject ☐ More info &nbsp; Amount: GHS ${line} Tenure: ${line}</p>
  <p>Lead Officer decision: ☐ Approved ☐ Rejected &nbsp; Amount: GHS ${line} Date: ${line}</p>
  <p>Disbursement: ${line} ☐ MoMo ☐ Cash &nbsp; Ref: ${line}</p></div></section>`;
}
function printApps(list){
  let p=$('#print');if(!p){p=document.createElement('div');p.id='print';document.body.appendChild(p)}
  p.innerHTML=list.map(sheetHTML).join('');window.print();
}
