/* Matan Kindergarten learner dashboard.
   Signs in with Supabase, then reads and saves real data. Settings are in config.js. */
const CFG=window.MATAN_CONFIG;
const sb=supabase.createClient(CFG.SUPABASE_URL,CFG.SUPABASE_KEY);

const AREAS=[
 {k:0,n:"Language",full:"Language Activities",c:"--c1"},
 {k:1,n:"Maths",full:"Mathematical Activities",c:"--c2"},
 {k:2,n:"Environment",full:"Environmental Activities",c:"--c3"},
 {k:3,n:"Creative",full:"Creative Activities",c:"--c4"},
 {k:4,n:"Christian RE",full:"Christian Religious Education",c:"--c5"}];
const REC=[
 "Add a daily picture-book read-aloud and five minutes of one-to-one talk about the pictures.",
 "Use hands-on counting with real objects (bottle tops, stones) and simple sorting games.",
 "Take short nature walks with a naming game for plants, animals and weather.",
 "Plan daily fine-motor play: threading, clay, pattern drawing, plus a movement break.",
 "Add short story and song time, and let the child share and take part."];
const G=["No attempt","Needs full help","Needs a lot of help","Needs some help","Mostly on their own","Confident and on their own"];
const GL={NA:"Not assessed: no task was given",DA:"Did not attend"};
const GR=[0,1,2,3,4,5,"NA","DA"];
const SUP={R0:"No extra support needed now",R1:"Repeat through guided practice",R2:"Individual demonstration and feedback",R3:"Small-group activity or peer modelling",R4:"Use pictures, objects, songs or movement",R5:"Re-teach, then reassess on an agreed date"};
const COL=["#e4572e","#2e86ab","#3f9d5a","#c98a00","#8a5cc2","#d1477a"];

/* ---------- state ---------- */
let ME=null,L=[],Q={PP1:[[],[],[],[],[]],PP2:[[],[],[],[],[]]},TERMS=[],TERMID={},CUR="",CURID=0,NOQ={},TD=null;
let CLASSID={},CLASSIDS={},TEACH={},AREAID=[],AREAIDX={},COMP={},STAFF={},AGR=[];
const S={view:"loading",sel:null,cls:"All",q:"",sess:null,rev:null,rg:undefined,rr:"",err:"",ba:0,saving:false,wq:null,eq:null,af:null,tdLoading:false};

/* ---------- small helpers ---------- */
const num=v=>typeof v==="number";
const avg=a=>a.reduce((x,y)=>x+y,0)/a.length;
const f1=n=>n.toFixed(1);
const $=id=>document.getElementById(id);
const esc=t=>String(t).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const gv=v=>(v==="NA"||v==="DA")?v:+v;
const sv=v=>/^[0-5]$/.test(v)?+v:v;
const initials=n=>n.split(" ").map(w=>w[0]).join("").slice(0,2);
const fmtDate=t=>new Date(t).toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"});
const addDays=n=>{const d=new Date();d.setDate(d.getDate()+n);return d.toLocaleDateString("en-CA")};
const todayStr=()=>new Date().toLocaleDateString("en-CA");
const rr=()=>{const y=scrollY;render();scrollTo(0,y)};
const byId=id=>L.find(l=>l.id===id);
const myRole=()=>ME.role==="head"?"director":"teacher";
const has=l=>l.scores.length>0;
const last=l=>l.scores[l.scores.length-1], first=l=>l.scores[0];
const done=l=>l.cur.every(v=>v!==null);
const prog=l=>l.cur.filter(v=>v!==null).length;
const QA=(c,a)=>Q[c][a].filter(q=>q.ok!==false);
const qtext=(q,v)=>v==="B"&&q.b?q.b:q.a;
const live=(l,r)=>!l.log.some(y=>y.rev===r.id);
const mineSaved=(l,a)=>l.log.some(r=>r.t===CUR&&r.a===a&&r.role===myRole()&&live(l,r));
const fail=e=>{console.error(e);S.err=(e&&e.message)||String(e);render()};

async function run(p){const {data,error}=await p;if(error)throw error;return data}
async function fetchAll(table,cols,order){
  let out=[],i=0;
  for(;;){const d=await run(sb.from(table).select(cols).order(order).range(i,i+999));out=out.concat(d);if(d.length<1000)return out;i+=1000}
}

/* ---------- loading data ---------- */
async function loadQuestions(){
  const [co,va]=await Promise.all([
    fetchAll("competencies","id,code,class_id,area_id,strand,sub_strand,description,curriculum_ref,source,created_by","id"),
    fetchAll("question_variants","id,competency_id,variant,shown,prompt,source,status,created_by","created_at")]);
  Q={PP1:[[],[],[],[],[]],PP2:[[],[],[],[],[]]};NOQ={PP1:[[],[],[],[],[]],PP2:[[],[],[],[],[]]};
  co.forEach(c=>{
    const cls=CLASSID[c.class_id],ai=AREAIDX[c.area_id];
    COMP[c.id]={code:c.code,a:ai,st:c.strand||""};
    if(!Q[cls]||ai===undefined)return;
    const mine=va.filter(v=>v.competency_id===c.id&&v.status!=="rejected"),A=mine.find(v=>v.variant==="A"),B=mine.find(v=>v.variant==="B");
    if(!A){if(c.source==="curriculum")NOQ[cls][ai].push({id:c.id,c:c.code,st:c.strand||"",sub:c.sub_strand||"",l:c.description,ref:c.curriculum_ref||""});return}
    const ref=c.curriculum_ref||"";
    Q[cls][ai].push({id:c.id,c:c.code,st:c.strand||"",sub:c.sub_strand||"",s:A.shown||"💬",a:A.prompt,b:B?B.prompt:undefined,l:c.description,ref,
      src:A.source==="teacher"?"Teacher":(/^Sample/.test(ref)?"Curriculum (sample)":/^KICD 2024/.test(ref)?"Curriculum (KICD 2024)":"Curriculum (adapted)"),
      ok:A.status==="approved",va:A.id,vb:B?B.id:null,by:A.created_by});
  });
}
async function loadScores(only){
  const cols="learner_id,term_id,area_id,score";
  const rows=only?await run(sb.from("area_scores").select(cols).eq("learner_id",only)):await fetchAll("area_scores",cols,"learner_id");
  (only?[byId(only)]:L).forEach(l=>{l.scores=[];l.labels=[];l.cur=[null,null,null,null,null]});
  const by={};
  rows.forEach(r=>{const ai=AREAIDX[r.area_id];if(ai===undefined)return;const k=r.learner_id+"|"+r.term_id;
    (by[k]=by[k]||{l:r.learner_id,t:r.term_id,v:[null,null,null,null,null]}).v[ai]=r.score});
  Object.values(by).sort((a,b)=>a.t-b.t).forEach(x=>{
    const l=byId(x.l);if(!l)return;
    if(TERMID[x.t]===CUR)l.cur=x.v;
    if(x.v.every(v=>v!==null)){l.scores.push(x.v);l.labels.push(TERMID[x.t])}});
}
async function loadRecords(l){
  const [rows,notes,msgs,acts]=await Promise.all([
    run(sb.from("assessment_records").select("id,public_id,term_id,competency_id,variant_id,rater_id,rater_role,score,support_code,comment,revision_of,entered_at").eq("learner_id",l.id).order("entered_at").range(0,999)),
    run(sb.from("teacher_notes").select("body,created_at,staff(name)").eq("learner_id",l.id).order("created_at")),
    run(sb.from("parent_messages").select("id,channel,language,sent_at,staff(name)").eq("learner_id",l.id).order("sent_at",{ascending:false}).limit(10)),
    run(sb.from("follow_up_actions").select("id,action,owner_id,due_date,status,area_id,completed_at").eq("learner_id",l.id).order("due_date"))]);
  l.log=rows.map(r=>{const c=COMP[r.competency_id]||{};
    return {id:r.id,pid:r.public_id,tid:r.term_id,t:TERMID[r.term_id],cid:r.competency_id,vid:r.variant_id,a:c.a,c:c.code||"—",st:c.st||"",
      role:r.rater_role,rater:r.rater_id,score:sv(r.score),sc:r.support_code,cm:r.comment||"",rev:r.revision_of,by:STAFF[r.rater_id]||"",ts:fmtDate(r.entered_at)}});
  l.notes=notes.map(n=>({d:fmtDate(n.created_at),x:n.body,by:n.staff?n.staff.name:""}));
  l.msgs=msgs.map(m=>({id:m.id,ch:m.channel,lang:m.language,at:fmtDate(m.sent_at),by:m.staff?m.staff.name:""}));
  l.actions=acts.map(a=>({id:a.id,action:a.action,owner_id:a.owner_id,owner:STAFF[a.owner_id]||"",due:a.due_date,dueFmt:fmtDate(a.due_date+"T00:00:00"),
    status:a.status,area:a.area_id!==null&&AREAIDX[a.area_id]!==undefined?AREAIDX[a.area_id]:null,doneFmt:a.completed_at?fmtDate(a.completed_at):""}));
  await loadInsight(l);
  l.loaded=true;
}
async function loadInsight(l){
  const rows=await run(sb.from("ai_insights").select("id,content,model,generated_at,reviewed_by").eq("learner_id",l.id).order("generated_at",{ascending:false}).limit(1));
  l.ai=rows.length?{id:rows[0].id,content:rows[0].content,model:rows[0].model,at:fmtDate(rows[0].generated_at),by:rows[0].reviewed_by?STAFF[rows[0].reviewed_by]||"a staff member":""}:null;
}
async function loadAll(){
  const [cl,tm,ar,st,lr,gu]=await Promise.all([
    run(sb.from("classes").select("id,name,teacher_id")),
    run(sb.from("terms").select("id,label").order("id")),
    run(sb.from("learning_areas").select("id,name").order("id")),
    run(sb.from("staff").select("id,name,role")),
    run(sb.from("learners").select("id,full_name,class_id,birth_year,joined_on").eq("active",true).order("full_name")),
    run(sb.from("guardians").select("learner_id,name,phone"))]);
  CLASSID={};CLASSIDS={};TEACH={};
  cl.forEach(c=>{CLASSID[c.id]=c.name;CLASSIDS[c.name]=c.id});
  STAFF=Object.fromEntries(st.map(s=>[s.id,s.name]));
  cl.forEach(c=>{TEACH[c.name]=(c.teacher_id&&STAFF[c.teacher_id])||"Not assigned"});
  TERMS=tm.map(t=>t.label);TERMID=Object.fromEntries(tm.map(t=>[t.id,t.label]));
  CUR=TERMS[TERMS.length-1]||"";CURID=tm.length?tm[tm.length-1].id:0;
  AREAIDX={};AREAID=[];
  ar.forEach(a=>{const i=AREAS.findIndex(x=>x.full===a.name);if(i>=0){AREAIDX[a.id]=i;AREAID[i]=a.id}});
  await loadQuestions();
  L=lr.map((r,i)=>({id:r.id,n:i,name:r.full_name,cls:CLASSID[r.class_id],age:r.birth_year?new Date().getFullYear()-r.birth_year:null,
    joined:r.joined_on?new Date(r.joined_on).toLocaleDateString("en-GB",{month:"short",year:"numeric"}):"",att:null,guardian:"",phone:"",
    scores:[],labels:[],cur:[null,null,null,null,null],log:[],notes:[],loaded:false}));
  gu.forEach(g=>{const l=byId(g.learner_id);if(l&&!l.guardian){l.guardian=g.name;l.phone=g.phone||""}});
  await loadScores();
  AGR=await fetchAll("rater_agreement","learner_id,term_id,competency_id,gap","learner_id");
  const att=await fetchAll("attendance","learner_id,present","learner_id"),cnt={};
  att.forEach(a=>{const c=cnt[a.learner_id]=cnt[a.learner_id]||{p:0,n:0};c.n++;if(a.present)c.p++});
  L.forEach(l=>{const c=cnt[l.id];l.att=c?Math.round(100*c.p/c.n):null});
}

/* ---------- sign in ---------- */
async function boot(){
  try{
    const {data}=await sb.auth.getSession();
    if(data&&data.session)await enter(data.session.user);else{S.view="login";render()}
  }catch(e){S.view="login";S.err=e.message;render()}
}
async function enter(user){
  S.view="loading";render();
  const st=await run(sb.from("staff").select("id,name,role").eq("id",user.id).maybeSingle());
  if(!st){await sb.auth.signOut();ME=null;S.view="login";S.err="This login is not set up as Matan staff yet.";render();return}
  ME=st;S.err="";
  await loadAll();
  S.view="list";render();
}
async function doLogin(){
  const {data,error}=await sb.auth.signInWithPassword({email:$("em").value.trim(),password:$("pw").value});
  if(error){S.err=error.message;render();return}
  try{await enter(data.user)}catch(e){S.view="login";fail(e)}
}
function loginView(){
  return `<div class="panel" style="max-width:420px;margin:30px auto"><h2>Sign in</h2><p class="muted">Matan staff only.</p>
  ${S.err?`<div class="note watch">${esc(S.err)}</div>`:""}
  <p><label class="muted">Email<br><input type="search" id="em" autocomplete="username" style="width:100%"></label></p>
  <p><label class="muted">Password<br><input type="password" id="pw" autocomplete="current-password" style="width:100%"></label></p>
  <button class="primary" id="signin" style="margin-top:0">Sign in</button></div>`;
}

/* ---------- display helpers ---------- */
function av(l,size){return `<div class="av" aria-hidden="true" style="width:${size}px;height:${size}px;background:${COL[l.n%COL.length]};font-size:${size/2.8}px">${initials(l.name)}</div>`}
function cell(v){return `<span class="cell s${Math.round(v)}">${Number.isInteger(v)?v:f1(v)}</span>`}
function support(l){return has(l)&&(avg(last(l))<2.5||avg(last(l))-avg(first(l))<=-0.4||(l.att!==null&&l.att<80))}
function arrow(l){if(!has(l))return "";const d=avg(last(l))-avg(first(l));return d>=0.4?"↑":d<=-0.4?"↓":"→"}

function insights(l){
  if(!has(l))return [{t:"tip",x:"No full term has been assessed yet. Suggestions appear once all five areas are scored for a term."}];
  const out=[],s=l.scores,c=s[s.length-1],p=s[s.length-2];
  if(p)AREAS.forEach(a=>{if(c[a.k]-p[a.k]<=-1)out.push({t:"watch",x:`${a.full} dropped from ${p[a.k]} to ${c[a.k]} since the last assessment. ${REC[a.k]}`})});
  const tr=avg(c)-avg(first(l));
  if(tr>=0.6)out.push({t:"good",x:`Overall average is up ${f1(tr)} since ${l.labels[0]}. Keep the current approach going.`});
  if(tr<=-0.4)out.push({t:"watch",x:`Overall average is down ${f1(-tr)} since ${l.labels[0]}. Talk with the guardian and review recent changes.`});
  AREAS.filter(a=>c[a.k]<=2&&!out.some(o=>o.x.startsWith(a.full))).slice(0,2).forEach(a=>out.push({t:"tip",x:`${a.full} is at ${c[a.k]}. ${REC[a.k]}`}));
  const sup={};
  l.log.filter(r=>r.t===CUR&&r.sc!=="R0"&&live(l,r)).forEach(r=>{const k=AREAS[r.a].full;(sup[k]=sup[k]||new Set()).add(SUP[r.sc])});
  Object.entries(sup).forEach(([k,v])=>out.push({t:"tip",x:`Support noted in ${k}: ${[...v].join("; ")}.`}));
  const best=AREAS.reduce((m,a)=>c[a.k]>c[m.k]?a:m,AREAS[0]);
  out.push({t:"good",x:`Strongest area: ${best.full} (${c[best.k]}). Use it to build confidence in other areas.`});
  if(l.att!==null&&l.att<85)out.push({t:"watch",x:`Attendance is ${l.att}%. Missed days may be affecting progress.`});
  return out;
}
function chart(l){
  const W=560,H=220,pl=34,pr=34,pt=14,pb=30,n=l.scores.length;
  const x=i=>pl+(n===1?(W-pl-pr)/2:i*(W-pl-pr)/(n-1)),y=v=>pt+(5-v)*(H-pt-pb)/5;
  let g="";
  for(let v=0;v<=5;v++)g+=`<line x1="${pl}" x2="${W-pr}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="${pl-8}" y="${y(v)+4}" text-anchor="end" font-size="11" fill="var(--muted)">${v}</text>`;
  l.labels.forEach((t,i)=>g+=`<text x="${x(i)}" y="${H-8}" text-anchor="middle" font-size="11" fill="var(--muted)">${t}</text>`);
  AREAS.forEach(a=>g+=`<polyline points="${l.scores.map((s,i)=>`${x(i)},${y(s[a.k])}`).join(" ")}" fill="none" stroke="var(${a.c})" stroke-width="2" opacity=".75"/>`);
  g+=`<polyline points="${l.scores.map((s,i)=>`${x(i)},${y(avg(s))}`).join(" ")}" fill="none" stroke="var(--ink)" stroke-width="4" stroke-dasharray="1 7" stroke-linecap="round"/>`;
  l.scores.forEach((s,i)=>g+=`<circle cx="${x(i)}" cy="${y(avg(s))}" r="4" fill="var(--ink)"/>`);
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Scores over time for ${esc(l.name)}">${g}</svg>
  <div class="legend">${AREAS.map(a=>`<span><i style="background:var(${a.c})"></i>${a.n}</span>`).join("")}<span><i style="background:var(--ink);border-radius:50%"></i>Average</span></div>`;
}

/* ---------- learners list ---------- */
function listView(){
  return `<div class="tools"><input type="search" id="q" placeholder="Search learners" aria-label="Search learners" value="${esc(S.q)}">
  ${["All","PP1","PP2"].map(c=>`<button class="chip" data-c="${c}" aria-pressed="${S.cls===c}">${c==="All"?"All classes":c}</button>`).join("")}
  <span class="muted" id="count"></span></div><div class="grid" id="grid"></div>`;
}
function fillGrid(){
  const q=S.q.toLowerCase(),rows=L.filter(l=>(S.cls==="All"||l.cls===S.cls)&&l.name.toLowerCase().includes(q));
  $("count").textContent=`${rows.length} learner${rows.length===1?"":"s"}`;
  $("grid").innerHTML=rows.length?rows.map(l=>`<button class="card" data-i="${l.id}">${av(l,64)}<div><b>${esc(l.name)}</b><span>${l.cls}${l.age!==null?" · age "+l.age:""}</span><div style="margin-top:4px">${has(l)?`${cell(avg(last(l)))} ${arrow(l)} ${support(l)?'<span class="tag warn">Check in</span>':''}`:'<span class="tag">No scores yet</span>'}</div></div></button>`).join(""):`<p class="muted">${L.length?"No learners match. Clear the search or choose All classes.":"No learners have been added yet."}</p>`;
  $("grid").querySelectorAll(".card").forEach(b=>b.onclick=()=>{S.sel=b.dataset.i;S.view="profile";S.err="";render()});
}

/* ---------- learner profile ---------- */
// Kenyan numbers: 0712 345 678, +254 712 345 678 and 254712345678 all become 254712345678 for WhatsApp.
function waNumber(phone){
  let d=String(phone||"").replace(/[^\d+]/g,"").replace(/^\+/,"");
  if(/^0\d{9}$/.test(d))d="254"+d.slice(1);
  return /^\d{9,15}$/.test(d)?d:"";
}
// Turns the AI insights into a WhatsApp message for the guardian. WhatsApp opens with the message
// filled in, and the staff member checks it and presses send there.
function parentText(l,c){
  const p=c.parent||{},first=(l.guardian||"").split(" ")[0],fn=l.name.split(" ")[0];
  const bullets=a=>(a||[]).map(x=>"• "+x).join("\n");
  const part=(title,a)=>a&&a.length?`*${title}*\n${bullets(a)}\n\n`:"";
  return `Hello${first?" "+first:""},\n\nHere is a short update on how ${fn} is doing at Matan Kindergarten.\n\n${p.summary||""}\n\n`
    +part("What is going well",p.strengths)
    +(p.support?`*How we are helping*\n${p.support}\n\n`:"")
    +part("Things you can try at home",p.ideas)
    +`Please talk to me if you have any questions.\n\nWarm regards,\n${ME.name}\nMatan Kindergarten`;
}
function aiList(a){return Array.isArray(a)&&a.length?`<ul style="margin:4px 0 10px">${a.map(x=>`<li>${esc(typeof x==="string"?x:(x.area?x.area+": ":"")+(x.activity||""))}</li>`).join("")}</ul>`:""}
function aiSugg(a){
  return Array.isArray(a)&&a.length?`<ul style="margin:4px 0 10px">${a.map((x,i)=>`<li>${esc(typeof x==="string"?x:(x.area?x.area+": ":"")+(x.activity||""))} <button class="ghost" data-sugact="${i}" style="padding:1px 8px;font-size:.75rem">Add as action</button></li>`).join("")}</ul>`:"";
}
function actPanel(l){
  const fn=l.name.split(" ")[0],today=todayStr(),open=(l.actions||[]).filter(a=>a.status==="open"),done=(l.actions||[]).filter(a=>a.status==="done").slice(-5).reverse();
  const af=S.af&&S.af.id===l.id?S.af:{text:"",area:""};
  return `<div class="panel" id="actpanel"><h2>Follow-up actions</h2>
  <p class="muted">What will be done for ${esc(fn)}, who will do it, and by when. Add one from an AI suggestion above, or write your own.</p>
  ${open.length?`<div class="scroll"><table><thead><tr><th>Action</th><th>Area</th><th>Owner</th><th>Due</th><th></th></tr></thead><tbody>${open.map(a=>`<tr><td>${esc(a.action)}</td><td>${a.area!==null?AREAS[a.area].n:"Any"}</td><td>${esc(a.owner)}</td><td>${a.due<today?'<span class="tag warn">Overdue</span> ':""}${esc(a.dueFmt)}</td><td>${a.owner_id===ME.id||ME.role==="head"?`<button class="ghost" data-done="${a.id}" style="padding:2px 10px;font-size:.8rem">Mark done</button>`:""}</td></tr>`).join("")}</tbody></table></div>`:'<p class="muted">No open actions.</p>'}
  <div class="row2" style="margin-top:10px">
   <label class="muted" style="flex:2;min-width:220px">New action<br><input type="search" id="actt" style="width:100%" value="${esc(af.text)}" placeholder="For example: count to 10 with bottle tops at home"></label>
   <label class="muted">Area<br><select id="acta"><option value="">Any area</option>${AREAS.map(a=>`<option value="${a.k}" ${String(af.area)===String(a.k)?"selected":""}>${a.n}</option>`).join("")}</select></label>
   <label class="muted">Owner<br><select id="acto">${Object.entries(STAFF).map(([id,n])=>`<option value="${id}" ${id===ME.id?"selected":""}>${esc(n)}</option>`).join("")}</select></label>
   <label class="muted">Due<br><input type="date" id="actd" value="${addDays(7)}"></label></div>
  <button class="primary" id="actadd" style="margin-top:8px">Add action</button>
  ${done.length?`<p class="muted" style="margin:12px 0 4px"><b>Recently done</b></p>${done.map(a=>`<div class="nt"><span class="muted">${esc(a.action)} · ${esc(a.owner)} · done ${esc(a.doneFmt)}</span></div>`).join("")}`:""}</div>`;
}
function aiPanel(l){
  const busy=S.aiBusy===l.id,a=l.ai,c=a&&a.content||{};
  const wan=waNumber(l.phone),sent=(l.msgs||[]).find(m=>m.ch==="whatsapp"),hasParent=!!(c.parent&&c.parent.summary);
  return `<div class="panel"><h2>AI insights</h2>
  <p class="muted">Press the button to ask Gemini for a short read on this child’s trends. It sends only the first name, class, age, attendance, scores and teacher comments. Please keep surnames and phone numbers out of comments. These are ideas for the teacher to check, not a diagnosis.</p>
  <button class="ghost" id="genai" ${busy||!has(l)?"disabled":""}>${busy?"Generating…":a?"Generate again":"Generate insights"}</button>${has(l)?"":' <span class="muted">Needs at least one completed term.</span>'}
  ${a?`<div style="margin-top:12px"><p class="muted" style="margin:0 0 6px">Generated ${esc(a.at)} · ${esc(a.model)}${a.by?` · read by ${esc(a.by)}`:""}</p>
   <p style="margin:0 0 8px">${esc(c.summary||"")}</p>
   ${c.strengths&&c.strengths.length?`<b>Strengths</b>${aiList(c.strengths)}`:""}
   ${c.watch&&c.watch.length?`<b>Things to watch</b>${aiList(c.watch)}`:""}
   ${c.suggestions&&c.suggestions.length?`<b>Suggestions</b>${aiSugg(c.suggestions)}`:""}
   <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px">
    ${a.by?"":`<button class="ghost" id="airead">Mark as read</button>`}
    <button class="primary" id="aiwa" style="margin-top:0" ${wan&&hasParent?"":"disabled"}>Send to parent via WhatsApp</button></div>
   <p class="muted" style="margin:6px 0 0">${!hasParent?"There is no parent version of this insight yet. Press Generate again to prepare one.":wan?`Opens WhatsApp with a gentler version for ${esc(l.guardian||"the guardian")} (${esc(l.phone)}). Check it, then press send in WhatsApp.`:"There is no usable phone number for this guardian, so it cannot be sent by WhatsApp."}</p>
   ${sent?`<p class="muted" style="margin:6px 0 0">Last sent to the parent via WhatsApp on ${esc(sent.at)}${sent.by?" by "+esc(sent.by):""}.</p>`:""}</div>`:""}</div>`;
}
function recPanel(l){
  if(!l.log.length)return "";
  const me=myRole(),groups={};
  l.log.forEach(r=>{const k=r.t+"|"+r.cid;(groups[k]=groups[k]||{rows:[],t:r.t,cid:r.cid,a:r.a}).rows.push(r)});
  let h=`<div class="panel"><h2>Assessment records</h2><p class="muted">Every score is saved as its own record and records are never changed. A correction is added as a new record that points to the one it replaces. You can only correct your own scores, and only this term’s.</p>`;
  if(S.rev){const r=l.log.find(x=>x.id===S.rev);
    h+=`<div class="note tip"><b>Correct your score for ${esc(r.c)}</b> (currently ${r.score})<div class="pick" id="rg" style="margin:8px 0">${GR.map(x=>`<button class="${num(x)?"":"sm"}" data-v="${x}" aria-pressed="${S.rg===x}">${x}</button>`).join("")}</div>
    <input type="search" id="rrs" size="34" placeholder="Reason for the correction" aria-label="Reason for the correction" value="${esc(S.rr)}"> <button class="ghost" id="rsave">Save correction</button> <button class="ghost" id="rcancel">Cancel</button> <span class="muted" id="rmsg"></span></div>`}
  h+=`<div class="scroll"><table style="min-width:780px"><thead><tr><th>Record</th><th>Area</th><th>Competency</th><th>Teacher</th><th>Director</th><th>Gap</th><th>Support</th><th>Comment</th><th></th></tr></thead><tbody>`;
  Object.values(groups).reverse().slice(0,40).forEach(g=>{
    const t=g.rows.find(r=>r.role==="teacher"&&live(l,r)),d=g.rows.find(r=>r.role==="director"&&live(l,r)),mine=g.rows.find(r=>r.role===me&&live(l,r));
    const any=mine||t||d||g.rows[0],gap=t&&d&&num(t.score)&&num(d.score)?Math.abs(t.score-d.score):"";
    const old=g.rows.length-[t,d].filter(Boolean).length;
    h+=`<tr><td><b>${esc(any.pid)}</b><br><span class="muted">${esc(g.t)} · ${esc(any.ts)}</span></td><td>${AREAS[g.a]?AREAS[g.a].n:""}</td><td>${esc(any.c)}${any.st?`<br><span class="muted">${esc(any.st)}</span>`:""}</td>
      <td>${t?t.score:""}</td><td>${d?d.score:""}</td><td>${gap}</td><td title="${esc(SUP[any.sc]||"")}">${any.sc}</td>
      <td>${esc(any.cm)}${old?`<br><span class="muted">${old} earlier version${old===1?"":"s"} kept</span>`:""}</td>
      <td>${g.t===CUR&&mine?`<button class="ghost" data-rev="${mine.id}" style="padding:2px 10px;font-size:.8rem">Correct mine</button>`:""}</td></tr>`});
  return h+`</tbody></table></div><p class="muted">Showing the latest 40 questions.</p></div>`;
}
function profileView(){
  const l=byId(S.sel);
  if(!l)return `<p class="muted">Learner not found.</p>`;
  if(!l.loaded)return `<button class="ghost" id="back" style="margin-bottom:12px">Back to learners</button><p class="muted">Loading…</p>`;
  const c=has(l)?last(l):null;
  return `<button class="ghost" id="back" style="margin-bottom:12px">Back to learners</button>
  <div class="panel top">
   <div style="text-align:center">${av(l,120)}</div>
   <div style="flex:1;min-width:240px"><h2 style="font-size:1.7rem">${esc(l.name)}</h2>
   <dl class="facts"><div><dt>Class</dt><dd>${l.cls}</dd></div><div><dt>Class teacher</dt><dd>${esc(TEACH[l.cls]||"")}</dd></div><div><dt>Age</dt><dd>${l.age!==null?l.age+" years":"—"}</dd></div><div><dt>Joined</dt><dd>${l.joined||"—"}</dd></div>
   <div><dt>Attendance</dt><dd>${l.att!==null?l.att+"%":"Not recorded"}</dd></div><div><dt>Guardian</dt><dd>${esc(l.guardian||"—")}</dd></div><div><dt>Guardian phone</dt><dd>${esc(l.phone||"—")}</dd></div><div><dt>Average score</dt><dd>${c?f1(avg(c))+" out of 5":"—"}</dd></div></dl>
   ${[0,1,2,3,4].every(a=>mineSaved(l,a))?`<span class="tag ok">${CUR} done</span>`:`<button class="primary" id="go" style="margin-top:8px">${[0,1,2,3,4].some(a=>mineSaved(l,a))?"Continue":"Start"} ${CUR} assessment</button>`}</div></div>
  ${c?`<div class="panel"><h2>Latest scores</h2><p class="muted">${l.labels[l.labels.length-1]}</p>
  <div class="towers">${AREAS.map(a=>`<div class="tower">${[1,2,3,4,5].map(i=>`<div class="blk" style="${i<=c[a.k]?`background:var(${a.c})`:''}"></div>`).join("")}<small>${a.n}</small><b>${c[a.k]}</b></div>`).join("")}</div></div>
  <div class="panel"><h2>Progress over time</h2>${chart(l)}
  <div class="scroll" style="margin-top:12px"><table><thead><tr><th>Term</th>${AREAS.map(a=>`<th>${a.n}</th>`).join("")}<th>Avg</th></tr></thead><tbody>${l.scores.map((s,i)=>`<tr><td>${l.labels[i]}</td>${s.map(v=>`<td>${cell(v)}</td>`).join("")}<td>${f1(avg(s))}</td></tr>`).join("")}</tbody></table></div></div>`:`<div class="panel"><p class="muted" style="margin:0">No completed term yet, so there are no scores or chart to show.</p></div>`}
  <div class="panel"><h2>Trends and suggestions</h2>${insights(l).map(o=>`<div class="note ${o.t}">${o.x}</div>`).join("")}
   <p class="muted">These suggestions come from simple rules for now. An AI model will write more personal ones once it is connected.</p></div>
  ${aiPanel(l)}
  ${actPanel(l)}
  ${recPanel(l)}
  <div class="panel"><h2>Teacher notes</h2>${l.notes.length?l.notes.map(n=>`<div class="nt"><span class="muted">${n.d}${n.by?" · "+esc(n.by):""}</span><br>${esc(n.x)}</div>`).join(""):'<p class="muted">No notes yet. Add the first one below.</p>'}
  <p><textarea id="nt" rows="2" cols="44" placeholder="What did you notice today?" aria-label="New note"></textarea></p><button class="ghost" id="addnote">Add note</button></div>`;
}
function bindProfile(){
  const l=byId(S.sel);if(!l)return;
  $("back").onclick=()=>{S.view="list";S.rev=null;render()};
  if(!l.loaded)return;
  const go=$("go");if(go)go.onclick=()=>begin(l.id);
  const gi=$("genai");if(gi)gi.onclick=async()=>{
    if(S.saving)return;S.saving=true;S.aiBusy=l.id;S.err="";rr();
    try{
      const {data}=await sb.auth.getSession();
      const r=await fetch(CFG.API_URL+"/api/learners/"+l.id+"/insights",{method:"POST",headers:{Authorization:"Bearer "+data.session.access_token}});
      const j=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(j.error||"The insights service did not answer. Is it running?");
      await loadInsight(l);
    }catch(e){S.err=e.name==="TypeError"?"Could not reach the insights service. Check that it is running and that API_URL in config.js is right.":e.message}
    finally{S.saving=false;S.aiBusy=null;rr()}};
  const wa=$("aiwa");if(wa)wa.onclick=async()=>{
    const to=waNumber(l.phone);if(!to||!l.ai||!(l.ai.content&&l.ai.content.parent))return;
    const text=parentText(l,l.ai.content||{});
    window.open("https://wa.me/"+to+"?text="+encodeURIComponent(text),"_blank","noopener");
    try{
      const tid=Object.keys(TERMID).find(k=>TERMID[k]===l.labels[l.labels.length-1]);
      await run(sb.from("parent_messages").insert({learner_id:l.id,term_id:tid?+tid:null,staff_id:ME.id,channel:"whatsapp",language:"en",body:text}));
      await loadRecords(l);rr();
    }catch(e){fail(e)}};
  document.querySelectorAll("[data-sugact]").forEach(b=>b.onclick=()=>{
    const x=((l.ai&&l.ai.content&&l.ai.content.suggestions)||[])[+b.dataset.sugact];if(!x)return;
    const txt=typeof x==="string"?x:x.activity||"",ar0=typeof x==="string"?"":x.area||"";
    const ai=AREAS.findIndex(a=>a.full===ar0||a.n===ar0||(ar0&&ar0.startsWith(a.n)));
    S.af={id:l.id,text:txt,area:ai>=0?String(ai):""};rr();
    const el=$("actpanel");if(el)el.scrollIntoView({block:"start"})});
  const aa=$("actadd");if(aa)aa.onclick=async()=>{
    const text=$("actt").value.trim(),due=$("actd").value,owner=$("acto").value,area=$("acta").value;
    if(!text||!due){S.err="Write the action and choose a due date.";render();return}
    if(S.saving)return;S.saving=true;
    try{await run(sb.from("follow_up_actions").insert({learner_id:l.id,area_id:area===""?null:AREAID[+area],action:text,owner_id:owner,due_date:due,created_by:ME.id}));
      S.af=null;S.err="";await loadRecords(l);rr()}catch(e){fail(e)}finally{S.saving=false}};
  document.querySelectorAll("[data-done]").forEach(b=>b.onclick=async()=>{
    try{await run(sb.from("follow_up_actions").update({status:"done",completed_at:new Date().toISOString(),completed_by:ME.id}).eq("id",b.dataset.done));await loadRecords(l);rr()}catch(e){fail(e)}});
  const ar=$("airead");if(ar)ar.onclick=async()=>{
    try{await run(sb.from("ai_insights").update({reviewed_by:ME.id}).eq("id",l.ai.id));await loadInsight(l);rr()}catch(e){fail(e)}};
  $("addnote").onclick=async()=>{const t=$("nt").value.trim();if(!t)return;
    try{await run(sb.from("teacher_notes").insert({learner_id:l.id,staff_id:ME.id,body:t}));l.notes.push({d:fmtDate(new Date()),x:t,by:ME.name});rr()}catch(e){fail(e)}};
  document.querySelectorAll("[data-rev]").forEach(b=>b.onclick=()=>{S.rev=b.dataset.rev;S.rg=undefined;S.rr="";rr()});
  document.querySelectorAll("#rg button").forEach(b=>b.onclick=()=>{S.rg=gv(b.dataset.v);rr()});
  const ri=$("rrs");if(ri)ri.oninput=()=>{S.rr=ri.value};
  const rc=$("rcancel");if(rc)rc.onclick=()=>{S.rev=null;rr()};
  const rs=$("rsave");if(rs)rs.onclick=async()=>{
    if(S.rg===undefined||!S.rr.trim()){$("rmsg").textContent="Choose the new score and give a reason.";return}
    if(S.saving)return;S.saving=true;
    try{
      const r=l.log.find(x=>x.id===S.rev);
      await run(sb.from("assessment_records").insert({learner_id:l.id,term_id:r.tid,competency_id:r.cid,variant_id:r.vid,rater_id:ME.id,rater_role:r.role,
        score:String(S.rg),support_code:r.sc,comment:S.rr.trim(),revision_of:r.id}));
      S.rev=null;S.rg=undefined;S.rr="";
      await loadScores(l.id);await loadRecords(l);rr();
    }catch(e){fail(e)}finally{S.saving=false}};
}

/* ---------- assessment queue ---------- */
function queueView(){
  const c=S.cls==="PP2"?"PP2":"PP1";
  return `<p class="muted" style="margin-top:0">${CUR}. Call a learner, then assess them one area at a time. The bar shows how many areas the teacher has scored.</p>
  <div class="tools">${["PP1","PP2"].map(x=>`<button class="chip" data-c="${x}" aria-pressed="${c===x}">${x} · ${esc(TEACH[x]||"")}</button>`).join("")}</div>
  <div class="grid">${L.filter(l=>l.cls===c).map(l=>`<button class="card" data-i="${l.id}">${av(l,56)}<div style="flex:1"><b>${esc(l.name)}</b><span>${done(l)?"Assessed":prog(l)?`${prog(l)} of 5 areas`:"Not started"}</span><div class="bar"><i style="width:${prog(l)*20}%"></i></div></div></button>`).join("")||'<p class="muted">No learners in this class yet.</p>'}</div>`;
}
async function begin(id){
  const l=byId(id);
  try{if(!l.loaded)await loadRecords(l)}catch(e){return fail(e)}
  const a=[0,1,2,3,4].find(i=>!mineSaved(l,i)),m=()=>[[],[],[],[],[]];
  if(a===undefined){S.sel=id;S.view="profile";render();return}
  S.sess={id,area:a,qi:0,g:m(),n:m(),sc:m(),v:m(),present:false,finished:false,msg:""};S.view="assess";S.err="";render();
}

/* ---------- live assessment ---------- */
function assessView(){
  const s=S.sess,l=byId(s.id),A=s.area,qs=QA(l.cls,A),fn=l.name.split(" ")[0],who=ME.role==="head"?"Director":"Teacher";
  const nextL=L.find(x=>x.cls===l.cls&&x.id!==l.id&&!done(x));
  const tabs=`<div class="tabs" role="tablist">${AREAS.map(a=>`<button class="tab" role="tab" data-a="${a.k}" aria-selected="${a.k===A}">${mineSaved(l,a.k)?"✓ ":""}${a.n}</button>`).join("")}</div>`;
  const head=`<div class="who"><div style="display:flex;gap:12px;align-items:center">${av(l,56)}<div><h2>Now assessing: ${esc(l.name)}</h2><span class="muted">${l.cls} · ${esc(TEACH[l.cls]||"")} · ${CUR} · scoring as ${who}</span></div></div><button class="ghost" id="toq">Back to class list</button></div>`;
  if(s.finished)return `<div class="panel"><div class="who"><div style="display:flex;gap:12px;align-items:center">${av(l,56)}<h2>${esc(l.name)} is done</h2></div></div>
   <p>All five areas are saved for ${esc(fn)} for ${CUR}.</p>
   <button class="primary" id="toprof">Open profile</button> ${nextL?`<button class="ghost" id="nextl">Call next: ${esc(nextL.name)}</button>`:""} <button class="ghost" id="toq">Back to class list</button></div>`;
  if(!qs.length)return head+tabs+`<div class="panel"><p class="muted" style="margin:0">There are no approved questions for ${AREAS[A].full} in ${l.cls} yet. Add some in the Question bank, or pick another area.</p></div>`;
  const q=qs[s.qi],g=s.g[A],v=s.v[A][s.qi]||"A",txt=qtext(q,v),saved=mineSaved(l,A),n=qs.length;
  if(s.present)return `<div class="stage present"><div class="big">${q.s}</div>${q.st?"":`<p class="ask">${esc(txt)}</p>`}</div><button class="ghost" id="exitp">Back to grading</button>`;
  const idx=qs.map((_,i)=>i),graded=idx.filter(i=>g[i]!==undefined),missing=idx.filter(i=>g[i]===undefined),tn=graded.map(i=>g[i]).filter(num);
  const score=tn.length?Math.round(avg(tn)):null,sts={};
  qs.forEach((x,i)=>{if(x.st&&num(g[i]))(sts[x.st]=sts[x.st]||[]).push(g[i])});
  return head+tabs+`
  <div class="stage"><p class="muted" style="margin:0 0 8px">${AREAS[A].full} · Question ${s.qi+1} of ${n} · ${q.src}</p>
   ${q.st?`<p class="muted" style="margin:0 0 8px"><b>${esc(q.c)}</b> · ${esc(q.st)}${q.sub?" · "+esc(q.sub):""}${q.ref?" · "+esc(q.ref):""}</p>`:""}
   <div class="big">${q.s}</div><p class="ask">${esc(txt)}</p>
   ${q.b?`<p style="margin:14px 0 0"><button class="chip" data-var="A" aria-pressed="${v==="A"}">Question A</button> <button class="chip" data-var="B" aria-pressed="${v==="B"}">Question B</button></p>`:""}
   <p style="margin-top:14px"><button class="ghost" id="present">Show full screen to learner</button></p></div>
  <div class="panel"><p style="margin-top:0"><b>Look for:</b> ${esc(q.l)}</p>
   <p class="muted" style="margin:0 0 6px"><b>${who} score</b>. Your score is saved under your own login. The ${ME.role==="head"?"teacher":"director"} scores separately.</p>
   <div class="pick" role="group" aria-label="${who} score">${GR.map(x=>`<button class="${num(x)?"":"sm"}" data-v="${x}" aria-pressed="${g[s.qi]===x}">${x}</button>`).join("")}</div>
   <p class="rub muted">${g[s.qi]===undefined?"Choose a score from 0 to 5, or NA or DA.":num(g[s.qi])?`${g[s.qi]}: ${G[g[s.qi]]}`:`${g[s.qi]}: ${GL[g[s.qi]]}`}</p>
   <div class="row2"><label class="muted">Support to give<br><select id="sc">${Object.keys(SUP).map(k=>`<option value="${k}" ${(s.sc[A][s.qi]||"R0")===k?"selected":""}>${k} · ${SUP[k]}</option>`).join("")}</select></label>
   <label class="muted" style="flex:1;min-width:220px">Comment (optional)<br><textarea id="qn" rows="2" style="width:100%" placeholder="What did you notice? For example, mixed up 5 and 6.">${esc(s.n[A][s.qi]||"")}</textarea></label></div>
   <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px"><button class="ghost" id="prevq" ${s.qi===0?"disabled":""}>Previous question</button><button class="ghost" id="nextq" ${s.qi===n-1?"disabled":""}>Next question</button></div></div>
  <div class="panel">${saved?`<p style="margin:0"><b>${AREAS[A].full}</b> is saved${ME.role==="head"?"":(l.cur[A]!==null?" as "+cell(l.cur[A]):"")}. Pick another area above.</p>`
   :`<p style="margin-top:0"><b>${AREAS[A].full}</b>: you have scored ${graded.length} of ${n} questions.${score!==null&&ME.role!=="head"?` The area score so far is ${cell(score)} <span class="muted">(average of your numeric scores, leaving out NA and DA)</span>.`:""}</p>
     ${Object.keys(sts).length&&ME.role!=="head"?`<p class="muted" style="margin:0 0 6px">By strand: ${Object.entries(sts).map(([k,x])=>`${k} ${f1(avg(x))}`).join(" · ")}</p>`:""}
     ${s.msg?`<div class="note watch">${esc(s.msg)}</div>`:""}
     <p class="muted" style="margin:0 0 6px">Every question needs a score, or NA if you did not ask it. When you press the button, your scores for this area are saved and cannot be changed, only corrected later.</p>
     <button class="primary" id="done" style="margin-top:0">Done assessing ${AREAS[A].n}</button>`}</div>`;
}
async function finishArea(l,s,A){
  const qs=QA(l.cls,A);
  const rows=qs.map((q,i)=>({learner_id:l.id,term_id:CURID,competency_id:q.id,variant_id:(s.v[A][i]==="B"&&q.vb)?q.vb:q.va,rater_id:ME.id,rater_role:myRole(),
    score:String(s.g[A][i]),support_code:s.sc[A][i]||"R0",comment:(s.n[A][i]||"").trim()||null}));
  await run(sb.from("assessment_records").insert(rows));
  await loadScores(l.id);await loadRecords(l);
  const next=[0,1,2,3,4].find(i=>!mineSaved(l,i));
  if(next===undefined)s.finished=true;else{s.area=next;s.qi=0;s.msg=""}
}
function bindAssess(){
  const s=S.sess,l=byId(s.id),A=s.area;
  const on=(id,f)=>{const e=$(id);if(e)e.onclick=f};
  on("toq",()=>{S.view="queue";S.sess=null;render()});
  on("toprof",()=>{S.sel=l.id;S.view="profile";S.sess=null;render()});
  on("nextl",()=>{const n=L.find(x=>x.cls===l.cls&&x.id!==l.id&&!done(x));begin(n.id)});
  on("present",()=>{s.present=true;render()});on("exitp",()=>{s.present=false;render()});
  on("prevq",()=>{s.qi--;rr()});on("nextq",()=>{s.qi++;rr()});
  const qn=$("qn");if(qn)qn.oninput=()=>{s.n[A][s.qi]=qn.value};
  const sc=$("sc");if(sc)sc.onchange=()=>{s.sc[A][s.qi]=sc.value};
  document.querySelectorAll(".tab").forEach(b=>b.onclick=()=>{s.area=+b.dataset.a;s.qi=0;s.msg="";rr()});
  document.querySelectorAll("[data-var]").forEach(b=>b.onclick=()=>{s.v[A][s.qi]=b.dataset.var;rr()});
  document.querySelectorAll(".pick button").forEach(b=>b.onclick=()=>{s.g[A][s.qi]=gv(b.dataset.v);s.msg="";rr()});
  on("done",async()=>{
    const qs=QA(l.cls,A),missing=qs.map((_,i)=>i).filter(i=>s.g[A][i]===undefined);
    if(missing.length){s.qi=missing[0];s.msg=`Question ${missing[0]+1} still needs a score${missing.length>1?` (and ${missing.length-1} more)`:""}. Choose a score, or NA if you did not ask it.`;rr();return}
    if(ME.role!=="head"&&!qs.some((_,i)=>num(s.g[A][i]))){s.msg="Every question is NA or DA, so there is no score to save. Score at least one question from 0 to 5.";rr();return}
    if(S.saving)return;S.saving=true;
    try{await finishArea(l,s,A);rr()}catch(e){fail(e)}finally{S.saving=false}
  });
}

/* ---------- question bank ---------- */
function bankView(){
  const c=S.cls==="PP2"?"PP2":"PP1",ba=S.ba||0,qs=Q[c][ba],noq=NOQ[c][ba],head=ME.role==="head";
  const btn=(attr,label)=>`<button class="ghost" ${attr} style="padding:2px 10px;font-size:.8rem">${label}</button>`;
  return `<p class="muted" style="margin-top:0">Questions come from the KICD 2024 curriculum and from teachers. Imported questions start as drafts: the director edits and approves them before they are used in assessments. Outcomes with no question yet are listed under the questions.</p>
  <div class="tools">${["PP1","PP2"].map(x=>`<button class="chip" data-c="${x}" aria-pressed="${c===x}">${x}</button>`).join("")}</div>
  <div class="tabs">${AREAS.map(a=>`<button class="tab" data-a="${a.k}" aria-selected="${a.k===ba}">${a.n}</button>`).join("")}</div>
  <div class="panel"><h2>${AREAS[ba].full} · ${c}</h2>${qs.length?qs.map(q=>`<div class="nt"><span class="tag ${q.src==="Teacher"?"ok":""}">${q.src}</span> <b>${esc(q.c)}</b>${q.st?" · "+esc(q.st):""}${q.sub?" · "+esc(q.sub):""}<br>
   ${head&&S.eq===q.id?`<textarea id="eqt" rows="2" style="width:100%">${esc(q.a)}</textarea><div style="margin-top:4px"><button class="primary" id="eqsave" style="margin:0 6px 0 0;padding:6px 14px">Save question</button>${btn('id="eqcancel"',"Cancel")}</div>`:`<b>${esc(q.s)}</b> A: ${esc(q.a)}${q.b?`<br>B: ${esc(q.b)}`:""}`}<br><span class="muted">Look for: ${esc(q.l)}${q.ref?" · "+esc(q.ref):""}</span>
   ${q.ok===false?` <span class="tag warn">Waiting for director approval</span>`:""}${q.ok===false&&head?` ${btn(`data-ap="${q.id}"`,"Approve")} ${btn(`data-eq="${q.id}"`,"Edit")} ${btn(`data-rj="${q.id}"`,"Reject")}`:""}${q.src==="Teacher"&&q.ok===false&&q.by===ME.id?` ${btn(`data-del="${q.id}"`,"Remove")}`:""}</div>`).join(""):'<p class="muted">No questions here yet.</p>'}</div>
  <details class="panel" ${S.wq?"open":""}><summary><b>${noq.length} outcome${noq.length===1?"":"s"} without a question</b></summary>
   ${noq.length?noq.map(o=>`<div class="nt"><b>${esc(o.c)}</b>${o.st?" · "+esc(o.st):""}${o.sub?" · "+esc(o.sub):""}<br><span class="muted">${esc(o.l)}</span><br>
    ${S.wq===o.id?`<textarea id="wqt" rows="2" style="width:100%" placeholder="What you ask the child, or the task you give"></textarea><div style="margin-top:4px"><button class="primary" id="wqsave" style="margin:0 6px 0 0;padding:6px 14px">Save question</button>${btn('id="wqcancel"',"Cancel")}</div>`:btn(`data-wq="${o.id}"`,"Write a question")}</div>`).join(""):'<p class="muted">Every outcome in this area has a question.</p>'}</details>
  <div class="panel"><h2>Add a question</h2>
  <p><label class="muted">Shown on screen (word, number or emoji)<br><input type="search" id="bs" size="30"></label></p>
  <p><label class="muted">Question A: what you ask the child<br><input type="search" id="bq" size="44"></label></p>
  <p><label class="muted">Question B (optional alternative)<br><input type="search" id="bb" size="44"></label></p>
  <p><label class="muted">What a good answer looks like<br><input type="search" id="bl" size="44"></label></p>
  <p><label class="muted">Strand (optional, for example Listening)<br><input type="search" id="bt" size="24"></label></p>
  <button class="primary" id="addq" style="margin-top:0">Add question</button> <span class="muted" id="bmsg"></span></div>`;
}
function bindBank(){
  const c=S.cls==="PP2"?"PP2":"PP1",ba=S.ba||0,reload=async()=>{await loadQuestions();render()};
  document.querySelectorAll(".chip").forEach(b=>b.onclick=()=>{S.cls=b.dataset.c;S.eq=null;S.wq=null;render()});
  document.querySelectorAll(".tab").forEach(b=>b.onclick=()=>{S.ba=+b.dataset.a;S.eq=null;S.wq=null;render()});
  document.querySelectorAll("[data-del]").forEach(b=>b.onclick=async()=>{
    try{await run(sb.from("question_variants").delete().eq("competency_id",+b.dataset.del));await run(sb.from("competencies").delete().eq("id",+b.dataset.del));await reload()}catch(e){fail(e)}});
  document.querySelectorAll("[data-ap]").forEach(b=>b.onclick=async()=>{
    try{await run(sb.from("question_variants").update({status:"approved",approved_by:ME.id}).eq("competency_id",+b.dataset.ap).eq("status","pending"));await reload()}catch(e){fail(e)}});
  document.querySelectorAll("[data-rj]").forEach(b=>b.onclick=async()=>{
    try{await run(sb.from("question_variants").update({status:"rejected"}).eq("competency_id",+b.dataset.rj).eq("status","pending"));await reload()}catch(e){fail(e)}});
  document.querySelectorAll("[data-eq]").forEach(b=>b.onclick=()=>{S.eq=+b.dataset.eq;render()});
  const ec=$("eqcancel");if(ec)ec.onclick=()=>{S.eq=null;render()};
  const es=$("eqsave");if(es)es.onclick=async()=>{
    const q=Q[c][ba].find(x=>x.id===S.eq),t=$("eqt").value.trim();if(!q||!t)return;
    try{await run(sb.from("question_variants").update({prompt:t}).eq("id",q.va));S.eq=null;await reload()}catch(e){fail(e)}};
  document.querySelectorAll("[data-wq]").forEach(b=>b.onclick=()=>{S.wq=+b.dataset.wq;render()});
  const wc=$("wqcancel");if(wc)wc.onclick=()=>{S.wq=null;render()};
  const ws=$("wqsave");if(ws)ws.onclick=async()=>{
    const t=$("wqt").value.trim();if(!t||S.saving)return;S.saving=true;
    try{await run(sb.from("question_variants").insert({competency_id:S.wq,variant:"A",shown:"💬",prompt:t,source:"teacher",status:ME.role==="head"?"approved":"pending",created_by:ME.id}));S.wq=null;await reload()}
    catch(e){fail(e)}finally{S.saving=false}};
  $("addq").onclick=async()=>{
    const v=id=>$(id).value.trim(),a=v("bq");
    if(!a){$("bmsg").textContent="Enter what you ask the child.";return}
    if(S.saving)return;S.saving=true;
    try{
      const head=ME.role==="head",code="TQ"+Date.now().toString(36).toUpperCase();
      const comp=await run(sb.from("competencies").insert({code,class_id:CLASSIDS[c],area_id:AREAID[ba],strand:v("bt")||null,description:v("bl")||"Use your own judgement.",source:"teacher",created_by:ME.id}).select("id").single());
      const base={competency_id:comp.id,shown:v("bs")||"💬",source:"teacher",status:head?"approved":"pending",created_by:ME.id};
      const vs=[{...base,variant:"A",prompt:a}];
      if(v("bb"))vs.push({...base,variant:"B",prompt:v("bb")});
      await run(sb.from("question_variants").insert(vs));
      await reload();
    }catch(e){fail(e)}finally{S.saving=false}};
}

/* ---------- teaching insights ---------- */
const keyOf=r=>r.learner_id+"|"+r.term_id+"|"+r.competency_id;
async function loadTeachData(){
  const [agr,rev,acts]=await Promise.all([
    fetchAll("rater_agreement","learner_id,term_id,competency_id,teacher_score,director_score,gap","learner_id"),
    fetchAll("score_reviews","learner_id,term_id,competency_id,reason,reviewed_at","learner_id"),
    fetchAll("follow_up_actions","id,learner_id,action,owner_id,due_date,status","due_date")]);
  AGR=agr;TD={agr,rev,acts};
}
function teachView(){
  if(!TD)return `<p class="muted">Loading…</p>`;
  const reviewed=new Set(TD.rev.map(keyOf)),cur=TD.agr.filter(r=>r.term_id===CURID);
  const todo=cur.filter(r=>r.gap>=2&&!reviewed.has(keyOf(r))),overdue=TD.acts.filter(a=>a.status==="open"&&a.due_date<todayStr());
  TD.todo=todo;
  const who=id=>{const l=byId(id);return l?l.name:"—"};
  let h=`<div class="stats">
   <div class="stat"><b>${L.length}</b><span>Active learners</span></div>
   <div class="stat"><b>${L.filter(done).length} of ${L.length}</b><span>Assessed by the teacher in ${esc(CUR)}</span></div>
   <div class="stat"><b>${cur.length}</b><span>Questions scored by teacher and director in ${esc(CUR)}</span></div>
   <div class="stat"><b>${todo.length}</b><span>Scores to discuss</span></div>
   <div class="stat"><b>${overdue.length}</b><span>Overdue follow-up actions</span></div></div>
  <div class="panel"><h2>Scores to discuss</h2><p class="muted">The teacher and director scored the same question 2 or more points apart in ${esc(CUR)}. Talk it over and record what was agreed. If a score needs correcting, do that on the child’s profile.</p>
  ${todo.length?`<div class="scroll"><table style="min-width:780px"><thead><tr><th>Learner</th><th>Question</th><th>Teacher</th><th>Director</th><th>Gap</th><th>What was agreed</th><th></th></tr></thead><tbody>${todo.map((r,i)=>{const c=COMP[r.competency_id]||{};
    return `<tr><td><b>${esc(who(r.learner_id))}</b></td><td>${esc(c.code||"")}<br><span class="muted">${c.a!==undefined?AREAS[c.a].n:""}</span></td><td>${r.teacher_score}</td><td>${r.director_score}</td><td>${r.gap}</td>
    <td>${ME.role==="head"?`<input type="search" id="rvr${i}" placeholder="Reason or agreement" style="width:100%;min-width:180px">`:'<span class="muted">The director records this</span>'}</td>
    <td>${ME.role==="head"?`<button class="ghost" data-rv="${i}" style="padding:2px 10px;font-size:.8rem">Record</button>`:""}</td></tr>`}).join("")}</tbody></table></div>`:'<p class="muted">Nothing to discuss right now.</p>'}</div>`;
  h+=`<div class="panel"><h2>Overdue follow-up actions</h2>${overdue.length?`<div class="scroll"><table><thead><tr><th>Learner</th><th>Action</th><th>Owner</th><th>Was due</th><th></th></tr></thead><tbody>${overdue.map(a=>`<tr><td>${esc(who(a.learner_id))}</td><td>${esc(a.action)}</td><td>${esc(STAFF[a.owner_id]||"")}</td><td>${esc(fmtDate(a.due_date+"T00:00:00"))}</td><td><button class="ghost" data-open="${a.learner_id}" style="padding:2px 10px;font-size:.8rem">Open</button></td></tr>`).join("")}</tbody></table></div>`:'<p class="muted">None. Every open action is on time.</p>'}</div>`;
  if(TD.rev.length)h+=`<div class="panel"><h2>Recently discussed</h2>${[...TD.rev].sort((a,b)=>b.reviewed_at.localeCompare(a.reviewed_at)).slice(0,5).map(r=>`<div class="nt"><span class="muted">${esc(fmtDate(r.reviewed_at))} · ${esc(who(r.learner_id))} · ${esc((COMP[r.competency_id]||{}).code||"")}</span><br>${esc(r.reason)}</div>`).join("")}</div>`;
  h+=`<div class="panel"><h2>Teaching insights</h2><p class="muted">Average score change per learning area, from each learner’s first completed term to their latest. Use this to coach and share what works, not to rank teachers.</p>
  <div class="scroll"><table><thead><tr><th>Class</th><th>Teacher</th>${AREAS.map(a=>`<th>${a.n}</th>`).join("")}</tr></thead><tbody>`;
  ["PP1","PP2"].forEach(c=>{const g=L.filter(l=>l.cls===c&&l.scores.length>1);
    h+=`<tr><td><b>${c}</b> (${L.filter(l=>l.cls===c).length})</td><td>${esc(TEACH[c]||"")}</td>${AREAS.map(a=>{
      if(!g.length)return "<td>—</td>";
      const d=avg(g.map(l=>last(l)[a.k]))-avg(g.map(l=>first(l)[a.k]));
      return `<td><b style="color:var(${d>0.05?'--good':d<-0.05?'--warn':'--muted'})">${d>0?'+':''}${f1(d)}</b></td>`}).join("")}</tr>`});
  h+=`</tbody></table></div><div class="note tip">Each class is small, so one child can swing these numbers. Compare several terms before drawing conclusions about teaching.</div></div>
  <div class="panel"><h2>Teacher and director agreement</h2><p class="muted">How closely the teacher and the director score the same child on the same question. This shows how consistently the two judge, not how well a class is doing.</p>
  <div class="scroll"><table><thead><tr><th>Class</th><th>Teacher</th><th>Questions scored by both</th><th>Average gap</th><th>Within 1 point</th></tr></thead><tbody>`;
  ["PP1","PP2"].forEach(c=>{const ids=new Set(L.filter(l=>l.cls===c).map(l=>l.id)),gaps=AGR.filter(r=>ids.has(r.learner_id)).map(r=>r.gap);
    h+=`<tr><td><b>${c}</b></td><td>${esc(TEACH[c]||"")}</td><td>${gaps.length}</td><td>${gaps.length?f1(avg(gaps)):"—"}</td><td>${gaps.length?Math.round(100*gaps.filter(x=>x<=1).length/gaps.length)+"%":"—"}</td></tr>`});
  return h+`</tbody></table></div><div class="note tip">A big or steady gap is a prompt to meet and agree what each score means, for example by scoring a few children together.</div></div>`;
}
function bindTeach(){
  document.querySelectorAll("[data-rv]").forEach(b=>b.onclick=async()=>{
    const r=TD.todo[+b.dataset.rv],reason=($("rvr"+b.dataset.rv).value||"").trim();
    if(!reason){S.err="Write what was agreed before recording the review.";render();return}
    if(S.saving)return;S.saving=true;
    try{await run(sb.from("score_reviews").insert({learner_id:r.learner_id,term_id:r.term_id,competency_id:r.competency_id,reason,reviewed_by:ME.id}));S.err="";await loadTeachData();render()}
    catch(e){fail(e)}finally{S.saving=false}});
  document.querySelectorAll("[data-open]").forEach(b=>b.onclick=()=>{S.sel=b.dataset.open;S.view="profile";S.err="";render()});
}

/* ---------- page ---------- */
function render(){
  const m=$("main");
  $("me").innerHTML=ME&&S.view!=="login"?`<span class="muted">Signed in as ${esc(ME.name)} · ${ME.role==="head"?"Director":"Teacher"}</span> <button class="ghost" id="signout">Sign out</button>`:"";
  const so=$("signout");if(so)so.onclick=async()=>{await sb.auth.signOut();ME=null;L=[];S.view="login";S.err="";S.sess=null;render()};
  if(S.view==="loading"){$("nav").innerHTML="";m.innerHTML=`<p class="muted">Loading…</p>`;return}
  if(S.view==="login"||!ME){
    $("nav").innerHTML="";m.innerHTML=loginView();
    $("signin").onclick=doLogin;$("pw").onkeydown=e=>{if(e.key==="Enter")doLogin()};return}
  const pend=ME.role==="head"?Object.values(Q).flat(2).filter(q=>q.ok===false).length:0;
  const tabs=[["list","Learners"],["queue","Assessment"],["bank","Question bank"+(pend?` (${pend} to approve)`:"")]].concat(ME.role==="head"?[["teach","Teaching insights"]]:[]);
  const cur=S.view==="profile"?"list":S.view==="assess"?"queue":S.view;
  $("nav").innerHTML=tabs.map(t=>`<button data-t="${t[0]}" ${cur===t[0]?'aria-current="page"':''}>${t[1]}</button>`).join("");
  $("nav").querySelectorAll("button").forEach(b=>b.onclick=()=>{S.view=b.dataset.t;S.err="";S.sess=null;S.eq=null;S.wq=null;if(b.dataset.t==="teach")TD=null;render()});
  const err=S.err?`<div class="note watch" role="alert">${esc(S.err)} <button class="ghost" id="dismiss" style="padding:2px 10px;font-size:.8rem">Dismiss</button></div>`:"";
  m.innerHTML=err+(S.view==="list"?listView():S.view==="profile"?profileView():S.view==="queue"?queueView():S.view==="assess"?assessView():S.view==="bank"?bankView():teachView());
  const dm=$("dismiss");if(dm)dm.onclick=()=>{S.err="";render()};
  if(S.view==="list"){fillGrid();$("q").oninput=e=>{S.q=e.target.value;fillGrid()};m.querySelectorAll(".chip").forEach(b=>b.onclick=()=>{S.cls=b.dataset.c;render()})}
  if(S.view==="queue"){m.querySelectorAll(".chip").forEach(b=>b.onclick=()=>{S.cls=b.dataset.c;render()});m.querySelectorAll(".card").forEach(b=>b.onclick=()=>begin(b.dataset.i))}
  if(S.view==="assess")bindAssess();
  if(S.view==="bank")bindBank();
  if(S.view==="teach"){bindTeach();if(!TD&&!S.tdLoading){S.tdLoading=true;loadTeachData().then(()=>{S.tdLoading=false;render()}).catch(e=>{S.tdLoading=false;fail(e)})}}
  if(S.view==="profile"){
    const l=byId(S.sel);
    if(l&&!l.loaded&&!S.loadingProfile){S.loadingProfile=true;loadRecords(l).then(()=>{S.loadingProfile=false;render()}).catch(e=>{S.loadingProfile=false;fail(e)})}
    bindProfile();
  }
}
boot();

