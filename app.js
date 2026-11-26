/* Matan Kindergarten learner dashboard.
   Signs in with Supabase, then reads and saves real data. Settings are in config.js. */
const CFG=window.MATAN_CONFIG;
// The school's details for printed report cards. config.js can override any of them with SCHOOL: {...}.
const SCH=Object.assign({name:"Matan Premier Kindergarten",motto:"Where Mastery Begins",address:"Kiamumbi, Quito Street · QS 54, off Kamiti Road, Nairobi",
  phone:"0712 000 805 · 0721 605 578",email:"matanpremierschools@gmail.com",web:"matanpremierschools.co.ke",logo:"logo.jpg"},CFG.SCHOOL||{});
// Demo mode (address ends in ?demo): demo.js supplies made-up children and a stand-in database, so nothing real is read or saved.
const DEMO=window.MATAN_DEMO||null;
const sb=DEMO?DEMO.client:supabase.createClient(CFG.SUPABASE_URL,CFG.SUPABASE_KEY);

const AREAS=[
 {k:0,n:"Language",full:"Language Activities",c:"--c1"},
 {k:1,n:"Maths",full:"Mathematical Activities",c:"--c2"},
 {k:2,n:"Environment",full:"Environmental Activities",c:"--c3"},
 {k:3,n:"Creative",full:"Creative Activities",c:"--c4"},
 {k:4,n:"Christian RE",full:"Christian Religious Education",c:"--c5"}];
const AREAS_PG=[
 {k:0,n:"Language",full:"Language and Early Literacy",c:"--c1"},
 {k:1,n:"Maths",full:"Early Mathematical Activities",c:"--c2"},
 {k:2,n:"Environment",full:"Environmental Exploration",c:"--c3"},
 {k:3,n:"Creative and physical",full:"Creative and Physical Activities",c:"--c4"},
 {k:4,n:"Personal and social",full:"Personal, Social and Values Education",c:"--c5"}];
const CLASSES=["PG","PP1","PP2"];
const AR=c=>c==="PG"?AREAS_PG:AREAS;
const emptyQ=()=>Object.fromEntries(CLASSES.map(c=>[c,[[],[],[],[],[]]]));
// KICD levels, from a 0 to 5 score (a single score or an average).
const kicd=v=>(v===null||v===undefined||isNaN(v))?null:v>=4.5?{c:"EE",t:"Exceeds Expectations"}:v>=2.5?{c:"ME",t:"Meets Expectations"}:v>=1.5?{c:"AE",t:"Approaches Expectations"}:{c:"BE",t:"Below Expectations"};
const ROLEN={head:"Director",senior:"Senior teacher",teacher:"Teacher"};
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
/* support plans and goals */
const PATH={regular:"Regular curriculum",regular_adapted:"Regular curriculum, with adaptations",specialised_foundation:"Specialised curriculum: Foundation level",specialised_intermediate:"Specialised curriculum: Intermediate level"};
const NEEDT={visual:"Visual impairment",hearing:"Hearing impairment",physical:"Physical impairment",intellectual:"Intellectual disability",speech_language:"Speech and language",other:"Other"};
const ACCS=["Large print","Pre-Braille or Braille materials","Kenyan Sign Language","Seat near the front","Extra time","Picture or object cues","Short, one-step instructions","Movement breaks","Assistive device in use"];
const DOMAINS=["Language","Maths","Environment","Creative","Christian RE","Communication and social skills","Daily living skills","Sensory-motor skills","Orientation and mobility","Pre-numeracy and pre-literacy"];
const GSTAT={active:"Active",achieved:"Achieved",paused:"Paused",dropped:"Dropped"};
const STALE_DAYS=14;
let SUP_OK=true,AI_OK=false,TIER_OK=false,MONTH_OK=false,TEACHID={};

/* ---------- display settings, saved on this device ---------- */
const PREF={size:0,hc:false};
try{Object.assign(PREF,JSON.parse(localStorage.getItem("matan_pref")||"{}"))}catch(e){}
PREF.size=Math.min(3,Math.max(0,+PREF.size||0));
function applyPrefs(){
  const d=document.documentElement,up=document.getElementById("pf-up"),dn=document.getElementById("pf-down"),hc=document.getElementById("pf-hc");
  d.style.fontSize=[100,115,130,150][PREF.size]+"%";
  if(PREF.hc)d.setAttribute("data-contrast","high");else d.removeAttribute("data-contrast");
  if(up)up.disabled=PREF.size>=3;if(dn)dn.disabled=PREF.size<=0;if(hc)hc.setAttribute("aria-pressed",String(!!PREF.hc));
}
function setPref(k,v){PREF[k]=v;try{localStorage.setItem("matan_pref",JSON.stringify(PREF))}catch(e){}applyPrefs()}

/* ---------- state ---------- */
let ME=null,L=[],Q={},TERMS=[],TERMID={},CUR="",CURID=0,NOQ={},TD=null;
let CLASSID={},CLASSIDS={},TEACH={},AREAID=[],AREAIDC={PG:[],PP1:[],PP2:[]},STAFFROWS=[],ATX_OK=false,AREAIDX={},COMP={},STAFF={},AGR=[];
const S={view:"loading",sel:null,cls:"All",q:"",sess:null,rev:null,rg:undefined,rr:"",err:"",ba:0,saving:false,wq:null,eq:null,af:null,tdLoading:false,leave:null,atLoading:false,lcls:"All",lsp:false,ltier:"",batch:null,xq:{},aiBusy:null,spedit:null,gadd:false,gci:null,gcl:undefined,gcn:"",focusTab:undefined};

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
const isHead=()=>!!ME&&ME.role==="head",isSenior=()=>!!ME&&ME.role==="senior",isAdmin=()=>isHead()||isSenior();
const AID=(c,i)=>AREAIDC[c]?AREAIDC[c][i]:undefined;
const classList=()=>CLASSES.filter(c=>CLASSIDS[c]);
// A teacher sees only their own class. The director and the senior teacher see every class.
const visCls=()=>isAdmin()?classList():classList().filter(c=>TEACHID[c]===ME.id);
const pickCls=c=>{const v=visCls();return v.includes(c)?c:(v[0]||"PP1")};
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
// TOUCH_OK: migration 9 adds a touch or spoken version of each question for blind learners.
let TOUCH_OK=false;
async function loadQuestions(){
  const vcols="id,competency_id,variant,shown,prompt,source,status,created_by";
  const [co,va]=await Promise.all([
    fetchAll("competencies","id,code,class_id,area_id,strand,sub_strand,description,curriculum_ref,source,created_by","id"),
    fetchAll("question_variants",vcols+",touch,touch_status","created_at").then(r=>{TOUCH_OK=true;return r},()=>{TOUCH_OK=false;return fetchAll("question_variants",vcols,"created_at")})]);
  Q=emptyQ();NOQ=emptyQ();
  co.forEach(c=>{
    const cls=CLASSID[c.class_id],ai=AREAIDX[c.area_id];
    COMP[c.id]={code:c.code,a:ai,st:c.strand||""};
    if(!Q[cls]||ai===undefined)return;
    const mine=va.filter(v=>v.competency_id===c.id&&v.status!=="rejected"),A=mine.find(v=>v.variant==="A"),B=mine.find(v=>v.variant==="B");
    if(!A){if(c.source==="curriculum")NOQ[cls][ai].push({id:c.id,c:c.code,st:c.strand||"",sub:c.sub_strand||"",l:c.description,ref:c.curriculum_ref||""});return}
    const ref=c.curriculum_ref||"";
    Q[cls][ai].push({id:c.id,c:c.code,st:c.strand||"",sub:c.sub_strand||"",s:A.shown||"💬",a:A.prompt,b:B?B.prompt:undefined,l:c.description,ref,
      src:A.source==="teacher"?"Teacher":(/^Sample/.test(ref)?"Curriculum (sample)":/^KICD 2024/.test(ref)?"Curriculum (KICD 2024)":"Curriculum (adapted)"),
      ok:A.status==="approved",va:A.id,vb:B?B.id:null,by:A.created_by,
      t:A.touch&&A.touch_status==="approved"?A.touch:"",tp:A.touch&&A.touch_status!=="approved"?A.touch:""});
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
    run(sb.from("assessment_records").select("id,public_id,term_id,competency_id,variant_id,rater_id,rater_role,score,support_code,comment,revision_of,entered_at"+(SUP_OK?",adapted":"")).eq("learner_id",l.id).order("entered_at").range(0,999)),
    run(sb.from("teacher_notes").select("body,created_at,staff(name)").eq("learner_id",l.id).order("created_at")),
    run(sb.from("parent_messages").select("id,channel,language,sent_at,staff(name)").eq("learner_id",l.id).order("sent_at",{ascending:false}).limit(10)),
    run(sb.from("follow_up_actions").select("id,action,owner_id,due_date,status,area_id,completed_at"+(SUP_OK?",goal_id":"")).eq("learner_id",l.id).order("due_date"))]);
  l.log=rows.map(r=>{const c=COMP[r.competency_id]||{};
    return {id:r.id,pid:r.public_id,tid:r.term_id,t:TERMID[r.term_id],cid:r.competency_id,vid:r.variant_id,a:c.a,c:c.code||"—",st:c.st||"",
      role:r.rater_role,rater:r.rater_id,score:sv(r.score),sc:r.support_code,cm:r.comment||"",adapted:!!r.adapted,rev:r.revision_of,by:STAFF[r.rater_id]||"",ts:fmtDate(r.entered_at)}});
  l.notes=notes.map(n=>({d:fmtDate(n.created_at),x:n.body,by:n.staff?n.staff.name:""}));
  l.msgs=msgs.map(m=>({id:m.id,ch:m.channel,lang:m.language,at:fmtDate(m.sent_at),by:m.staff?m.staff.name:""}));
  l.actions=acts.map(a=>({id:a.id,action:a.action,owner_id:a.owner_id,owner:STAFF[a.owner_id]||"",due:a.due_date,dueFmt:fmtDate(a.due_date+"T00:00:00"),
    status:a.status,goal:a.goal_id||null,area:a.area_id!==null&&AREAIDX[a.area_id]!==undefined?AREAIDX[a.area_id]:null,doneFmt:a.completed_at?fmtDate(a.completed_at):""}));
  await loadInsight(l);
  await loadSupport(l);
  l.loaded=true;
}
async function loadInsight(l){
  const rows=await run(sb.from("ai_insights").select("id,content,model,generated_at,reviewed_by").eq("learner_id",l.id).order("generated_at",{ascending:false}).limit(1));
  l.ai=rows.length?{id:rows[0].id,content:rows[0].content,model:rows[0].model,at:fmtDate(rows[0].generated_at),by:rows[0].reviewed_by?STAFF[rows[0].reviewed_by]||"a staff member":""}:null;
}
// Support features need migration-4. Check for it first, so the app still loads if it has not been run.
async function probeSupport(){
  try{await run(sb.from("learner_goals").select("id").limit(1));await run(sb.from("assessment_records").select("adapted").limit(1));SUP_OK=true}
  catch(e){SUP_OK=false}
  AI_OK=false;
  try{await run(sb.from("attendance").select("late,reason").limit(1));await run(sb.from("staff_attendance").select("id").limit(1));ATX_OK=true}catch(e){ATX_OK=false}
  if(SUP_OK){try{await run(sb.from("learner_questions").select("id").limit(1));await run(sb.from("learner_goals").select("source").limit(1));AI_OK=true}catch(e){}}
  TIER_OK=false;MONTH_OK=false;
  if(AI_OK){try{await run(sb.from("learner_tiers").select("learner_id").limit(1));await run(sb.from("learner_reports").select("learner_id").limit(1));await run(sb.from("learner_questions").select("month,sub_strand").limit(1));await run(sb.from("learner_goals").select("month").limit(1));TIER_OK=true;MONTH_OK=true}catch(e){}}
}
async function loadAll(){
  await probeSupport();await probeStage3();
  const [cl,tm,ar,st,lr,gu]=await Promise.all([
    run(sb.from("classes").select("id,name,teacher_id")),
    run(sb.from("terms").select("id,label").order("id")),
    run(sb.from("learning_areas").select("id,name").order("id")),
    run(sb.from("staff").select("id,name,role"+(ATX_OK?",phone":""))),
    run(sb.from("learners").select("id,full_name,class_id,birth_year,joined_on").eq("active",true).order("full_name")),
    run(sb.from("guardians").select("learner_id,name,phone"))]);
  CLASSID={};CLASSIDS={};TEACH={};TEACHID={};
  cl.forEach(c=>{CLASSID[c.id]=c.name;CLASSIDS[c.name]=c.id});
  STAFF=Object.fromEntries(st.map(s=>[s.id,s.name]));STAFFROWS=st;
  cl.forEach(c=>{TEACH[c.name]=(c.teacher_id&&STAFF[c.teacher_id])||"Not assigned";TEACHID[c.name]=c.teacher_id});
  TERMS=tm.map(t=>t.label);TERMID=Object.fromEntries(tm.map(t=>[t.id,t.label]));
  CUR=TERMS[TERMS.length-1]||"";CURID=tm.length?tm[tm.length-1].id:0;
  AREAIDX={};AREAID=[];AREAIDC={PG:[],PP1:[],PP2:[]};
  ar.forEach(a=>{let i=AREAS.findIndex(x=>x.full===a.name),pg=false;if(i<0){i=AREAS_PG.findIndex(x=>x.full===a.name);pg=i>=0}
    if(i>=0){AREAIDX[a.id]=i;if(pg)AREAIDC.PG[i]=a.id;else{AREAID[i]=a.id;AREAIDC.PP1[i]=a.id;AREAIDC.PP2[i]=a.id}}});
  if(Object.keys(AREAIDX).length<5)S.err="The learning area names in the database are out of date, so some scores and questions will not show. Run migration-3.sql in Supabase, then refresh this page.";
  await loadQuestions();
  L=lr.map((r,i)=>({id:r.id,n:i,name:r.full_name,cls:CLASSID[r.class_id],age:r.birth_year?new Date().getFullYear()-r.birth_year:null,
    joined:r.joined_on?new Date(r.joined_on).toLocaleDateString("en-GB",{month:"short",year:"numeric"}):"",att:null,guardian:"",phone:"",
    scores:[],labels:[],cur:[null,null,null,null,null],log:[],notes:[],loaded:false}));
  if(!isAdmin())L=L.filter(l=>TEACHID[l.cls]===ME.id);
  gu.forEach(g=>{const l=byId(g.learner_id);if(l&&!l.guardian){l.guardian=g.name;l.phone=g.phone||""}});
  await loadScores();
  AGR=await fetchAll("rater_agreement","learner_id,term_id,competency_id,gap","learner_id");
  await loadAttendance();
  await loadSupportAll();
}
async function loadAttendance(){
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
  S.view=isAdmin()?"home":"list";OV.loaded=false;render();
  setTimeout(autoMonthly,4000);  // monthly plans start by themselves (see autoMonthly)
}
async function doLogin(){
  const {data,error}=await sb.auth.signInWithPassword({email:$("em").value.trim(),password:$("pw").value});
  if(error){S.err=error.message;render();return}
  try{await enter(data.user)}catch(e){S.view="login";fail(e)}
}
function loginView(){
  return `<div class="panel" style="max-width:420px;margin:30px auto"><h2>Sign in</h2><p class="muted">Matan staff only.</p>
  ${S.err?`<div class="note watch">${esc(S.err)}</div>`:""}
  <p><label class="muted">Email<br><input type="email" id="em" autocomplete="username" style="width:100%"></label></p>
  <p><label class="muted">Password<br><input type="password" id="pw" autocomplete="current-password" style="width:100%"></label></p>
  <button class="primary" id="signin" style="margin-top:0">Sign in</button>
  <p class="muted" style="margin:14px 0 0">Showing the app to someone? <a href="?demo">Open the demo</a>. It uses made-up children only.</p></div>`;
}

/* ---------- display helpers ---------- */
function av(l,size){return `<div class="av" aria-hidden="true" style="width:${size}px;height:${size}px;background:${COL[l.n%COL.length]};font-size:${size/2.8}px">${initials(l.name)}</div>`}
function cell(v){return `<span class="cell s${Math.round(v)}">${Number.isInteger(v)?v:f1(v)}</span>`}
function support(l){if(SUP_OK&&specialised(l))return (l.goals||[]).some(g=>g.st&&(g.st.overdue||g.st.fell));return has(l)&&(avg(last(l))<2.5||avg(last(l))-avg(first(l))<=-0.4||(l.att!==null&&l.att<80))}
function arrow(l){if(!has(l))return "";const d=avg(last(l))-avg(first(l));return d>=0.4?"↑":d<=-0.4?"↓":"→"}

function insights(l){
  if(!has(l))return [{t:"tip",x:"No full term has been assessed yet. Suggestions appear once all five areas are scored for a term."}];
  const out=[],s=l.scores,c=s[s.length-1],p=s[s.length-2];
  if(p)AR(l.cls).forEach(a=>{if(c[a.k]-p[a.k]<=-1)out.push({t:"watch",x:`${a.full} dropped from ${p[a.k]} to ${c[a.k]} since the last assessment. ${REC[a.k]}`})});
  const tr=avg(c)-avg(first(l));
  if(tr>=0.6)out.push({t:"good",x:`Overall average is up ${f1(tr)} since ${l.labels[0]}. Keep the current approach going.`});
  if(tr<=-0.4)out.push({t:"watch",x:`Overall average is down ${f1(-tr)} since ${l.labels[0]}. Talk with the guardian and review recent changes.`});
  AR(l.cls).filter(a=>c[a.k]<=2&&!out.some(o=>o.x.startsWith(a.full))).slice(0,2).forEach(a=>out.push({t:"tip",x:`${a.full} is at ${c[a.k]}. ${REC[a.k]}`}));
  const sup={};
  l.log.filter(r=>r.t===CUR&&r.sc!=="R0"&&live(l,r)).forEach(r=>{const k=AR(l.cls)[r.a].full;(sup[k]=sup[k]||new Set()).add(SUP[r.sc])});
  Object.entries(sup).forEach(([k,v])=>out.push({t:"tip",x:`Support noted in ${k}: ${[...v].join("; ")}.`}));
  const best=AR(l.cls).reduce((m,a)=>c[a.k]>c[m.k]?a:m,AR(l.cls)[0]);
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
  AR(l.cls).forEach(a=>g+=`<polyline points="${l.scores.map((s,i)=>`${x(i)},${y(s[a.k])}`).join(" ")}" fill="none" stroke="var(${a.c})" stroke-width="2" opacity=".75"/>`);
  g+=`<polyline points="${l.scores.map((s,i)=>`${x(i)},${y(avg(s))}`).join(" ")}" fill="none" stroke="var(--ink)" stroke-width="4" stroke-dasharray="1 7" stroke-linecap="round"/>`;
  l.scores.forEach((s,i)=>g+=`<circle cx="${x(i)}" cy="${y(avg(s))}" r="4" fill="var(--ink)"/>`);
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Scores over time for ${esc(l.name)}">${g}</svg>
  <div class="legend">${AR(l.cls).map(a=>`<span><i style="background:var(${a.c})"></i>${a.n}</span>`).join("")}<span><i style="background:var(--ink);border-radius:50%"></i>Average</span></div>`;
}

/* ---------- support plans and goals ---------- */
// The director and the learner's class teacher can change support plans and goals. Every other staff member can read them.
const canEdit=l=>isAdmin()||!!(TEACHID[l.cls]&&TEACHID[l.cls]===ME.id);
const specialised=l=>!!(l.pathway&&l.pathway.indexOf("specialised")===0);
const daysSince=t=>Math.floor((Date.now()-new Date(t).getTime())/864e5);
// A goal needs attention when it is past its target date, or has had no check-in for STALE_DAYS days.
function goalState(g){
  if(g.status!=="active")return {overdue:false,late:false,fell:false};
  const p=g.prog||[],lp=p[p.length-1],ref=lp?lp.entered_at:g.created_at;
  const late=!!(g.target_date&&g.target_date<todayStr());
  return {late,overdue:late||daysSince(ref)>=STALE_DAYS,fell:p.length>1&&p[p.length-1].level<p[p.length-2].level};
}
const goalTag=(l,id)=>{const g=(l.goals||[]).find(x=>x.id===id);return g?`<br><span class="muted">Goal: ${esc(g.goal)}</span>`:""};
const clearSupport=()=>L.forEach(l=>{l.pathway=null;l.hasPlan=false;l.goals=[];l.pend=0;l.tier=null;l.aic=false;l.mdone=false;l.report=""});
// Light load for the whole school (list flags and teaching insights). If the migration has not been run yet,
// the support features switch themselves off and the rest of the app works as before.
async function loadSupportAll(){
  try{
    const [pr,gl,pg]=await Promise.all([
      fetchAll("learner_support_profiles","learner_id,pathway","learner_id"),
      fetchAll("learner_goals","id,learner_id,domain,goal,baseline,target,target_date,status,achieved_on,created_at"+(AI_OK?",source,rationale":""),"created_at"),
      fetchAll("goal_progress","goal_id,level,note,entered_at","entered_at")]);
    const pq=AI_OK?await fetchAll("learner_questions","learner_id,status"+(MONTH_OK?",month":""),"created_at"):[];
    SUP_OK=true;clearSupport();
    const by={};pg.forEach(p=>(by[p.goal_id]=by[p.goal_id]||[]).push(p));
    pr.forEach(p=>{const l=byId(p.learner_id);if(l){l.hasPlan=true;l.pathway=p.pathway}});
    gl.forEach(g=>{const l=byId(g.learner_id);if(!l)return;g.prog=by[g.id]||[];g.st=goalState(g);l.goals.push(g);if(g.status==="proposed")l.pend++});
    pq.forEach(q=>{const l=byId(q.learner_id);if(!l)return;if(q.status==="proposed")l.pend++;if(MONTH_OK&&q.month===monthFirst()&&(q.status==="proposed"||q.status==="approved"))l.mdone=true});
    if(AI_OK){const cs=await fetchAll("learner_consents","learner_id,kind,withdrawn_on","learner_id");cs.forEach(c=>{const l=byId(c.learner_id);if(l&&c.kind==="gemini"&&!c.withdrawn_on)l.aic=true})}
    if(TIER_OK){const tr=await fetchAll("learner_tiers","learner_id,declared,suggested_tier,suggestion_reason,confirmed_tier,confirmed_at","learner_id");
      tr.forEach(t=>{const l=byId(t.learner_id);if(l)l.tier={declared:t.declared,suggested:t.suggested_tier,reason:t.suggestion_reason||"",confirmed:t.confirmed_tier,at:t.confirmed_at}})}
  }catch(e){SUP_OK=false;console.warn("Support tables are not available yet:",e&&e.message);clearSupport()}
}
// Full load for one learner's profile.
async function loadSupport(l){
  if(!SUP_OK)return;
  try{
    const [pf,nd,ac,ht,cs,gl]=await Promise.all([
      run(sb.from("learner_support_profiles").select("pathway,communication_notes,what_works,what_to_avoid,next_review").eq("learner_id",l.id).maybeSingle()),
      run(sb.from("learner_needs").select("id,need_type,detail,source,recorded_on").eq("learner_id",l.id).eq("active",true).order("recorded_on")),
      run(sb.from("learner_accommodations").select("id,accommodation,applies_to").eq("learner_id",l.id).eq("active",true).order("accommodation")),
      run(sb.from("learner_health_notes").select("note").eq("learner_id",l.id).maybeSingle()),
      run(sb.from("learner_consents").select("id,kind,granted_by,granted_on,withdrawn_on").eq("learner_id",l.id).order("granted_on")),
      run(sb.from("learner_goals").select("id,learner_id,domain,goal,baseline,target,target_date,status,achieved_on,created_at"+(AI_OK?",source,rationale":"")).eq("learner_id",l.id).order("created_at"))]);
    const pg=gl.length?await run(sb.from("goal_progress").select("id,goal_id,level,note,rater_id,entered_at").in("goal_id",gl.map(g=>g.id)).order("entered_at")):[];
    gl.forEach(g=>{g.prog=pg.filter(p=>p.goal_id===g.id);g.st=goalState(g)});
    let qs=[],qr=[];
    if(AI_OK){
      qs=await run(sb.from("learner_questions").select("id,term_id,area_index,shown,prompt,look_for,reason,adapted_for,status,created_at"+(MONTH_OK?",month,sub_strand":"")).eq("learner_id",l.id).in("status",["proposed","approved"]).order("created_at"));
      qr=qs.length?await run(sb.from("learner_question_records").select("id,question_id,term_id,score,comment,entered_at").in("question_id",qs.map(q=>q.id)).order("entered_at")):[];
    }
    l.aiq=qs;l.aiqr=qr;l.pend=gl.filter(g=>g.status==="proposed").length+qs.filter(q=>q.status==="proposed").length;
    l.goals=gl;l.hasPlan=!!pf;l.pathway=pf?pf.pathway:null;
    l.sup={profile:pf,needs:nd,acc:ac,health:ht?ht.note:"",consents:cs};
    if(TIER_OK){
      const [tr,rp]=await Promise.all([run(sb.from("learner_tiers").select("declared,suggested_tier,suggestion_reason,confirmed_tier,confirmed_at").eq("learner_id",l.id).maybeSingle()),canEdit(l)?run(sb.from("learner_reports").select("report").eq("learner_id",l.id).maybeSingle()):Promise.resolve(null)]);
      l.tier=tr?{declared:tr.declared,suggested:tr.suggested_tier,reason:tr.suggestion_reason||"",confirmed:tr.confirmed_tier,at:tr.confirmed_at}:null;l.report=rp?(rp.report||""):"";
    }
  }catch(e){console.error(e);l.sup=null}
}

function supportForm(l){
  const fn=esc(l.name.split(" ")[0]),sp=l.sup,p=sp.profile||{pathway:"regular_adapted"};
  const cons=sp.consents.find(c=>c.kind==="support_needs"&&!c.withdrawn_on);
  return `<div class="panel" id="sppanel"><h2>${sp.profile?"Edit":"Add"} support plan for ${fn}</h2>
  ${!sp.profile&&!cons?`<div class="note tip"><label class="acc"><input type="checkbox" id="sp_consent"> The guardian has signed the consent form for recording ${fn}’s support needs.</label>
   <p style="margin:8px 0 0"><label class="muted">Guardian name on the form<br><input type="text" id="sp_gname" value="${esc(l.guardian||"")}"></label></p></div>`:""}
  <p><label class="muted">Pathway<br><select id="sp_path">${Object.entries(PATH).map(([k,v])=>`<option value="${k}" ${p.pathway===k?"selected":""}>${v}</option>`).join("")}</select></label></p>
  <p><label class="muted">How ${fn} communicates<br><textarea id="sp_comm" rows="2" style="width:100%">${esc(p.communication_notes||"")}</textarea></label></p>
  <p><label class="muted">What works<br><textarea id="sp_works" rows="2" style="width:100%">${esc(p.what_works||"")}</textarea></label></p>
  <p><label class="muted">What to avoid<br><textarea id="sp_avoid" rows="2" style="width:100%">${esc(p.what_to_avoid||"")}</textarea></label></p>
  <p><label class="muted">Next review date<br><input type="date" id="sp_review" value="${esc(p.next_review||"")}"></label></p>
  <p><label class="muted">Health and safety note (only the director and class teacher can see this)<br><textarea id="sp_health" rows="2" style="width:100%">${esc(sp.health||"")}</textarea></label></p>
  <p class="muted" style="margin:0 0 6px">Needs and accommodations are added after the plan is saved.</p>
  <button class="primary" id="sp_save" style="margin-top:0">Save plan</button> <button class="ghost" id="sp_cancel">Cancel</button></div>`;
}
function supportPanel(l){
  if(!SUP_OK)return `<div class="panel"><h2>Support plan</h2><div class="note watch">Support plans are not set up in the database yet. Run <code>sql/migration-4-support-plans.sql</code> in Supabase, then refresh this page.</div></div>`;
  const fn=esc(l.name.split(" ")[0]),sp=l.sup,can=canEdit(l);
  if(!sp)return `<div class="panel"><h2>Support plan</h2><p class="muted">Support details could not be loaded. Refresh the page to try again.</p></div>`;
  const p=sp.profile;
  if(S.spedit===l.id&&can)return supportForm(l);
  if(!p)return `<div class="panel"><h2>Support plan</h2><p class="muted">${fn} has no support plan yet. Add one if ${fn} has a disability or needs adapted support.</p>${can?`<button class="primary" id="spstart" style="margin-top:0">Add support plan</button>`:'<p class="muted">The director or class teacher can add one.</p>'}</div>`;
  const cons=sp.consents.find(c=>c.kind==="support_needs"&&!c.withdrawn_on);
  const accOn=sp.acc.map(a=>a.accommodation),accAll=ACCS.concat(accOn.filter(a=>!ACCS.includes(a)));
  const txt=(t,v)=>v?`<p style="margin:6px 0"><b>${t}</b><br>${esc(v)}</p>`:"";
  const h3=t=>`<h3 style="font-size:1.05rem;margin:14px 0 4px">${t}</h3>`;
  return `<div class="panel" id="sppanel"><div class="who"><h2>Support plan</h2>${can?`<button class="ghost" id="spedit">Edit plan</button>`:""}</div>
  <dl class="facts"><div><dt>Pathway</dt><dd>${esc(PATH[p.pathway]||p.pathway)}</dd></div>
   <div><dt>Next review</dt><dd>${p.next_review?esc(fmtDate(p.next_review+"T00:00:00"))+(p.next_review<todayStr()?' <span class="tag warn">Overdue</span>':""):"Not set"}</dd></div>
   <div><dt>Guardian consent</dt><dd>${cons?"Signed "+esc(fmtDate(cons.granted_on+"T00:00:00")):'<span class="tag warn">Not recorded</span>'}</dd></div></dl>
  ${h3("Needs")}
  ${sp.needs.length?`<ul style="margin:0;padding-left:20px">${sp.needs.map(n=>`<li><b>${esc(NEEDT[n.need_type]||n.need_type)}</b>${n.detail?": "+esc(n.detail):""}${n.source?` <span class="muted">(${esc(n.source)})</span>`:""}${can?` <button class="ghost" data-ndrm="${n.id}" style="padding:0 8px;font-size:.78rem" aria-label="Remove ${esc(NEEDT[n.need_type]||n.need_type)}">Remove</button>`:""}</li>`).join("")}</ul>`:'<p class="muted" style="margin:0">No needs recorded yet.</p>'}
  ${can?`<div class="row2" style="margin-top:8px"><label class="muted">Type<br><select id="nd_type">${Object.entries(NEEDT).map(([k,v])=>`<option value="${k}">${v}</option>`).join("")}</select></label>
   <label class="muted" style="flex:1;min-width:160px">Detail<br><input type="text" id="nd_detail" style="width:100%"></label>
   <label class="muted" style="flex:1;min-width:160px">Source (for example assessment centre report)<br><input type="text" id="nd_src" style="width:100%"></label></div>
   <button class="ghost" id="nd_add" style="margin-top:6px">Add need</button>`:""}
  ${h3("Accommodations")}
  ${can?`<div class="accs">${accAll.map(a=>`<label class="acc"><input type="checkbox" data-acc="${esc(a)}" ${accOn.includes(a)?"checked":""}> ${esc(a)}</label>`).join("")}</div>
   <div class="row2" style="margin-top:6px"><label class="muted">Other<br><input type="text" id="ac_other"></label><button class="ghost" id="ac_add" style="align-self:flex-end">Add</button></div>`
   :(accOn.length?`<p style="margin:0">${accOn.map(a=>`<span class="tag">${esc(a)}</span>`).join(" ")}</p>`:'<p class="muted" style="margin:0">None recorded.</p>')}
  ${h3("Day to day")}
  ${txt("How "+fn+" communicates",p.communication_notes)}${txt("What works",p.what_works)}${txt("What to avoid",p.what_to_avoid)}
  ${!p.communication_notes&&!p.what_works&&!p.what_to_avoid?'<p class="muted" style="margin:0">Nothing written yet. Use Edit plan to add it.</p>':""}
  ${can&&sp.health?`<div class="note watch"><b>Health and safety note</b> (director and class teacher only)<br>${esc(sp.health)}</div>`:""}</div>`;
}
const checkinForm=g=>`<div class="note tip" style="margin-top:8px"><b>Check-in</b> <span class="muted">How independent is the child on this goal today?</span>
 <div class="pick" id="glv" role="group" aria-label="Level from 0 to 5" style="margin:8px 0">${[0,1,2,3,4,5].map(x=>`<button data-gl="${x}" aria-pressed="${S.gcl===x}">${x}</button>`).join("")}</div>
 <p class="rub muted">${S.gcl===undefined?"Choose a level from 0 to 5.":S.gcl+": "+G[S.gcl]}</p>
 <label class="muted">Note (optional)<br><input type="text" id="gcn" style="width:100%" value="${esc(S.gcn)}"></label>
 <div style="margin-top:8px"><button class="primary" id="gcsave" style="margin:0 6px 0 0">Save check-in</button><button class="ghost" id="gccancel">Cancel</button></div></div>`;
const goalForm=l=>`<div class="note tip" style="margin-top:8px"><b>New goal</b>
 <div class="row2" style="margin-top:6px"><label class="muted">Area<br><select id="g_dom">${DOMAINS.map(d=>`<option>${esc(d)}</option>`).join("")}</select></label>
 <label class="muted" style="flex:2;min-width:220px">Goal<br><input type="text" id="g_goal" style="width:100%" placeholder="For example: points to and names 3 colours"></label></div>
 <div class="row2" style="margin-top:6px"><label class="muted" style="flex:1;min-width:160px">Starting point<br><input type="text" id="g_base" style="width:100%"></label>
 <label class="muted" style="flex:1;min-width:160px">Aim<br><input type="text" id="g_target" style="width:100%"></label>
 <label class="muted">Target date<br><input type="date" id="g_date" value="${addDays(90)}"></label></div>
 <div style="margin-top:8px"><button class="primary" id="g_save" style="margin:0 6px 0 0">Save goal</button><button class="ghost" id="g_cancel">Cancel</button></div></div>`;
function goalsPanel(l){
  if(!SUP_OK||!l.sup)return "";
  const fn=esc(l.name.split(" ")[0]),can=canEdit(l)&&!!l.sup.profile,gs=l.goals||[],act=gs.filter(g=>g.status==="active"),oth=gs.filter(g=>["achieved","paused","dropped"].includes(g.status));
  const card=g=>{
    const p=g.prog||[],lp=p[p.length-1],st=g.st||{};
    return `<div class="goal"><div class="who" style="margin-bottom:4px"><div><span class="tag">${esc(g.domain)}</span> <b>${esc(g.goal)}</b></div>
     <span>${g.status!=="active"?`<span class="tag ${g.status==="achieved"?"ok":""}">${GSTAT[g.status]}</span>`:""}${st.overdue?` <span class="tag warn">${st.late?"Past target date":"Check-in due"}</span>`:""}${st.fell?' <span class="tag warn">Level fell</span>':""}</span></div>
     ${g.baseline||g.target||g.target_date?`<p class="muted" style="margin:0 0 4px">${g.baseline?"Starting point: "+esc(g.baseline)+". ":""}${g.target?"Aim: "+esc(g.target)+". ":""}${g.target_date?"Target date: "+esc(fmtDate(g.target_date+"T00:00:00"))+".":""}</p>`:""}
     <div class="bar" role="img" aria-label="${lp?"Latest level "+lp.level+" out of 5":"No check-in yet"}"><i style="width:${lp?lp.level*20:0}%"></i></div>
     <p class="muted" style="margin:4px 0 0">${lp?`Level ${lp.level}: ${esc(G[lp.level])} · ${esc(fmtDate(lp.entered_at))}${lp.note?" · "+esc(lp.note):""}`:"No check-in yet."}</p>
     ${p.length>1?`<details style="margin-top:4px"><summary class="muted">Earlier check-ins (${p.length-1})</summary>${p.slice(0,-1).reverse().map(x=>`<div class="nt"><span class="muted">${esc(fmtDate(x.entered_at))} · level ${x.level}${x.note?" · "+esc(x.note):""}${x.rater_id&&STAFF[x.rater_id]?" · "+esc(STAFF[x.rater_id]):""}</span></div>`).join("")}</details>`:""}
     ${can?(S.gci===g.id?checkinForm(g):`<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">${g.status==="active"?`<button class="ghost" data-gci="${g.id}">Add check-in</button><button class="ghost" data-gs="achieved" data-g="${g.id}">Mark achieved</button><button class="ghost" data-gs="paused" data-g="${g.id}">Pause</button><button class="ghost" data-gs="dropped" data-g="${g.id}">Drop</button>`:`<button class="ghost" data-gs="active" data-g="${g.id}">Make active again</button>`}</div>`):""}</div>`;
  };
  return `<div class="panel" id="goalspanel"><h2>Goals</h2><p class="muted">What we are working towards with ${fn}. Check in at least every ${STALE_DAYS} days. Levels use the same 0 to 5 words as assessments.</p>
  ${act.length?act.map(card).join(""):'<p class="muted">No active goals yet.</p>'}
  ${oth.length?`<details><summary class="muted">Other goals (${oth.length})</summary>${oth.map(card).join("")}</details>`:""}
  ${!l.sup.profile?`<p class="muted">${canEdit(l)?"Add a support plan first. It records the guardian’s consent, and then goals can be added.":"Goals can be added once there is a support plan."}</p>`:can?(S.gadd?goalForm(l):'<button class="ghost" id="gadd" style="margin-top:8px">Add a goal</button>'):""}</div>`;
}
// Shown at the top of the assessment screen so the teacher sees how this child is supported.
const needsOf=l=>((l.sup&&l.sup.needs)||[]).map(n=>n.need_type);
const SIGHTQ=/\bread\b|\bsee\b|\bthis\b|\bthese\b|\bwhich\b|animal|look at|looks like|point to|show me|colou?r|shape|picture|draw|write|trace|match|copy|spell|letter|word\b|count the|how many|pattern|sort|arrange/i;
const sightWarn=(l,t)=>isBlind(l)&&(SIGHTQ.test(t||"")||/\bthis\b|\bthese\b/.test(t||""))?`<div class="note watch" role="note" style="margin:10px 0 0"><b>This question depends on sight.</b> ${esc(l.name.split(" ")[0])} cannot read print or look at pictures. Say it aloud, use Braille or raised letters, or real objects to touch. If that is not possible, score it NA.</div>`:"";
const isBlind=l=>needsOf(l).includes("visual")||!!(l.report&&NEEDRX.visual.test(l.report));
// Stricter than SIGHTQ: questions a blind child cannot do as written (print, pictures, colour, "this" on the screen).
const NEEDSIGHT=/\bread\b|\bsee\b|look at|looks like|point to|show me|picture|colou?r|\bdraw|\bwrite|trace|\bcopy|\bthis\b|\bthese\b|on the screen/i;
const needsSight=q=>NEEDSIGHT.test(q.a||"");
// What to ask: the approved touch version for a blind learner, otherwise question A or B.
const askText=(l,q,v)=>isBlind(l)&&q.t?q.t:qtext(q,v);
// A blind learner gets NA ahead of time on a sight question with no touch version. The teacher can still change it.
const preNA=(l,qs,g,au)=>{if(isBlind(l))qs.forEach((q,i)=>{if(!q.t&&needsSight(q)&&g[i]===undefined){g[i]="NA";au[i]=1}})};
const blindNote=(l,q,g,au,i)=>{if(!isBlind(l))return "";const fn=esc(l.name.split(" ")[0]);
  if(q.t)return `<div class="note good" role="note" style="margin:10px 0 0"><b>Touch version for ${fn}.</b> This is the approved version for blind learners. Use real objects ${fn} can hold, and accept spoken or touch answers.</div>`;
  if(au[i]&&g[i]==="NA")return `<div class="note watch" role="note" style="margin:10px 0 0"><b>Scored NA automatically.</b> This question needs sight and has no touch version yet, so it does not count against ${fn}. If you adapted it, for example with real objects, choose a score instead.${isAdmin()&&TOUCH_OK?" You can add a touch version in the Question bank.":""}</div>`;
  return sightWarn(l,q.a)};
const isSpecial=l=>{const t=l.tier&&l.tier.confirmed;return !!(l.hasPlan||(t&&t!=="A"))};
// Tells the assessor how this child's disability changes the session, and whether individual questions exist yet.
function indivBanner(l,A){
  if(!SUP_OK||!l.sup||!isSpecial(l))return "";
  const fn=esc(l.name.split(" ")[0]),t=l.tier&&l.tier.confirmed,needs=needsOf(l);
  const n=(l.aiq||[]).filter(q=>q.status==="approved"&&q.area_index===A&&(!MONTH_OK||!q.month||q.month===monthFirst())).length;
  let h="";
  if(isBlind(l))h+=`<div class="note watch" role="note"><b>${fn} has a visual need.</b> Do not show the pictures. Read each question aloud, use real objects ${fn} can touch, and accept spoken or touch answers. Tick “Task was adapted for this child” and choose a support level.</div>`;
  if(!needs.length&&suggestedNeeds(l).length)h+=`<div class="note watch" role="note"><b>${fn}’s doctor’s report mentions ${suggestedNeeds(l).map(k=>NEEDLBL[k]).join(", ")}, but no support need is recorded yet.</b> Open ${fn}’s profile and press “Record … need” so the questions and pictures adapt.</div>`;
  else if(!needs.length&&t&&t!=="A")h+=`<div class="note tip" role="note">No support need is recorded for ${fn} yet (for example Visual or Hearing). The AI adapts questions from the recorded needs, not from the doctor’s report, so add the need in the Support plan first.</div>`;
  if(!n)h+=`<div class="note tip" role="note">There are no approved individual questions for ${fn} in this area yet, so only the common questions show. <button class="ghost" id="goplan" style="margin-left:6px">Open ${fn}’s profile to make them</button></div>`;
  return h;
}
function accBanner(l){
  if(!SUP_OK||!l.sup||!l.sup.profile)return "";
  const fn=esc(l.name.split(" ")[0]),p=l.sup.profile,acc=l.sup.acc.map(a=>esc(a.accommodation));
  if(!acc.length&&!p.what_works&&!p.what_to_avoid&&!p.communication_notes)return "";
  return `<div class="note tip" role="note"><b>Support plan for ${fn}</b>${acc.length?`<br>Uses: ${acc.join(", ")}.`:""}${p.communication_notes?`<br>Communicates: ${esc(p.communication_notes)}`:""}${p.what_works?`<br>What works: ${esc(p.what_works)}`:""}${p.what_to_avoid?`<br>Avoid: ${esc(p.what_to_avoid)}`:""}</div>`;
}
function bindSupport(l){
  const on=(id,f)=>{const e=$(id);if(e)e.onclick=f};
  const guard=async f=>{if(S.saving)return;S.saving=true;try{await f()}catch(e){fail(e)}finally{S.saving=false}};
  const stamp=()=>new Date().toISOString();
  on("spstart",()=>{S.spedit=l.id;rr()});on("spedit",()=>{S.spedit=l.id;rr()});on("sp_cancel",()=>{S.spedit=null;rr()});
  on("sp_save",()=>guard(async()=>{
    const sp=l.sup,v=id=>$(id).value.trim()||null;
    const prof={pathway:$("sp_path").value,communication_notes:v("sp_comm"),what_works:v("sp_works"),what_to_avoid:v("sp_avoid"),next_review:$("sp_review").value||null};
    if(!sp.profile){
      if(!sp.consents.some(c=>c.kind==="support_needs"&&!c.withdrawn_on)){
        const c=$("sp_consent");
        if(!c||!c.checked){S.err="Tick the box to confirm the guardian has signed the consent form.";render();return}
        await run(sb.from("learner_consents").insert({learner_id:l.id,kind:"support_needs",granted_by:v("sp_gname")||l.guardian||null,recorded_by:ME.id}));
      }
      await run(sb.from("learner_support_profiles").insert({learner_id:l.id,...prof,created_by:ME.id,updated_by:ME.id}));
      if(S.pendNeeds&&S.pendNeeds.id===l.id){await addNeeds(l,S.pendNeeds.keys);S.pendNeeds=null}
    }else await run(sb.from("learner_support_profiles").update({...prof,updated_by:ME.id,updated_at:stamp()}).eq("learner_id",l.id));
    const h=$("sp_health").value.trim();
    if(h||sp.health)await run(sb.from("learner_health_notes").upsert({learner_id:l.id,note:h||null,updated_by:ME.id,updated_at:stamp()},{onConflict:"learner_id"}));
    S.spedit=null;S.err="";await loadSupport(l);rr();
  }));
  on("nd_add",()=>guard(async()=>{
    await run(sb.from("learner_needs").insert({learner_id:l.id,need_type:$("nd_type").value,detail:$("nd_detail").value.trim()||null,source:$("nd_src").value.trim()||null,created_by:ME.id}));
    await loadSupport(l);rr()}));
  document.querySelectorAll("[data-ndrm]").forEach(b=>b.onclick=()=>guard(async()=>{
    await run(sb.from("learner_needs").update({active:false}).eq("id",b.dataset.ndrm));await loadSupport(l);rr()}));
  const setAcc=async(name,on)=>{
    if(on)await run(sb.from("learner_accommodations").upsert({learner_id:l.id,accommodation:name,applies_to:"both",active:true,created_by:ME.id},{onConflict:"learner_id,accommodation"}));
    else await run(sb.from("learner_accommodations").update({active:false}).eq("learner_id",l.id).eq("accommodation",name));
    await loadSupport(l);rr()};
  document.querySelectorAll("[data-acc]").forEach(cb=>cb.onchange=()=>guard(()=>setAcc(cb.dataset.acc,cb.checked)));
  on("ac_add",()=>guard(async()=>{const n=$("ac_other").value.trim();if(n)await setAcc(n,true)}));
  on("gadd",()=>{S.gadd=true;rr()});on("g_cancel",()=>{S.gadd=false;rr()});
  on("g_save",()=>guard(async()=>{
    const goal=$("g_goal").value.trim();
    if(!goal){S.err="Write the goal first.";render();return}
    await run(sb.from("learner_goals").insert({learner_id:l.id,domain:$("g_dom").value,goal,baseline:$("g_base").value.trim()||null,target:$("g_target").value.trim()||null,target_date:$("g_date").value||null,term_id:CURID||null,created_by:ME.id}));
    S.gadd=false;S.err="";await loadSupport(l);rr()}));
  document.querySelectorAll("[data-gci]").forEach(b=>b.onclick=()=>{S.gci=b.dataset.gci;S.gcl=undefined;S.gcn="";rr()});
  document.querySelectorAll("#glv button").forEach(b=>b.onclick=()=>{S.gcl=+b.dataset.gl;rr()});
  const gn=$("gcn");if(gn)gn.oninput=()=>{S.gcn=gn.value};
  on("gccancel",()=>{S.gci=null;rr()});
  on("gcsave",()=>guard(async()=>{
    if(S.gcl===undefined){S.err="Choose a level from 0 to 5.";render();return}
    await run(sb.from("goal_progress").insert({goal_id:S.gci,level:S.gcl,note:(S.gcn||"").trim()||null,rater_id:ME.id}));
    S.gci=null;S.gcl=undefined;S.gcn="";S.err="";await loadSupport(l);rr()}));
  document.querySelectorAll("[data-gs]").forEach(b=>b.onclick=()=>guard(async()=>{
    const s=b.dataset.gs;
    await run(sb.from("learner_goals").update({status:s,achieved_on:s==="achieved"?todayStr():null}).eq("id",b.dataset.g));
    await loadSupport(l);rr()}));
}
// Arrow keys move between tabs, and focus stays on the tab after the page redraws.
function bindTabs(){
  document.querySelectorAll('[role="tablist"]').forEach(tl=>tl.onkeydown=e=>{
    if(e.key!=="ArrowRight"&&e.key!=="ArrowLeft")return;
    const tabs=[...tl.querySelectorAll('[role="tab"]')],i=tabs.indexOf(document.activeElement);if(i<0)return;
    e.preventDefault();const n=tabs[(i+(e.key==="ArrowRight"?1:tabs.length-1))%tabs.length];S.focusTab=n.dataset.a;n.click();
  });
  if(S.focusTab!==undefined){const t=document.querySelector('.tab[data-a="'+S.focusTab+'"]');if(t)t.focus();S.focusTab=undefined}
}
function supStats(){
  const all=L.flatMap(l=>(l.goals||[]).map(g=>({l,g}))),due=all.filter(x=>x.g.st&&x.g.st.overdue);
  const won=all.filter(x=>x.g.status==="achieved"&&x.g.achieved_on&&daysSince(x.g.achieved_on+"T00:00:00")<=90);
  return `<div class="stat"><b>${L.filter(l=>l.hasPlan).length}</b><span>Learners with a support plan</span></div><div class="stat"><b>${due.length}</b><span>Goals needing a check-in</span></div><div class="stat"><b>${won.length}</b><span>Goals achieved in the last 90 days</span></div>${AI_OK?`<div class="stat"><b>${L.reduce((n,l)=>n+(l.pend||0),0)}</b><span>AI suggestions waiting for approval</span></div>`:""}`;
}
function goalDuePanel(){
  const due=L.flatMap(l=>(l.goals||[]).filter(g=>g.st&&g.st.overdue).map(g=>({l,g})));
  return `<div class="panel"><h2>Goals needing a check-in</h2><p class="muted">Active goals with no check-in for ${STALE_DAYS} days, or past their target date.</p>${due.length?`<div class="scroll"><table><thead><tr><th>Learner</th><th>Goal</th><th>Why</th><th></th></tr></thead><tbody>${due.map(x=>`<tr><td>${esc(x.l.name)}</td><td>${esc(x.g.domain)}: ${esc(x.g.goal)}</td><td>${x.g.st.late?"Past target date":"No check-in for "+STALE_DAYS+" days"}</td><td><button class="ghost" data-open="${x.l.id}" style="padding:2px 10px;font-size:.8rem">Open</button></td></tr>`).join("")}</tbody></table></div>`:'<p class="muted">None. Every active goal has a recent check-in.</p>'}</div>`;
}


/* ---------- support tiers (A, B, C) and the doctor's report ---------- */
// A: no disability. B: some disability, usual curriculum with adaptations. C: severe disability, specialised curriculum.
// The AI suggests a tier from the report. The director or a senior teacher confirms it.
const TIERN={A:"Tier A · No disability",B:"Tier B · Some disability, usual curriculum with adaptations",C:"Tier C · Severe disability, specialised curriculum"};
const TIERMARK={A:"●",B:"▲",C:"■"};
const TIERPATH={A:"regular",B:"regular_adapted",C:"specialised_foundation"};
const DECL={none:"No disability",some:"Some disability",severe:"Severe disability"};
const monthStr=()=>todayStr().slice(0,7),monthFirst=()=>monthStr()+"-01";
const monthName=()=>new Date(monthFirst()+"T00:00:00").toLocaleDateString("en-GB",{month:"long",year:"numeric"});
const tierSet=l=>!!(l.tier&&l.tier.confirmed);
const tierTag=l=>!TIER_OK?"":tierSet(l)?`<span class="tag ${l.tier.confirmed==="A"?"":"ok"}">${TIERMARK[l.tier.confirmed]} Tier ${l.tier.confirmed}</span> `:`<span class="tag warn">Tier ${l.tier&&l.tier.suggested?l.tier.suggested+" suggested":"not set"}</span> `;
// For planning, a suggested tier is used until someone confirms it. A teacher still approves every question and goal.
const tierForPlan=l=>l.tier?(l.tier.confirmed||l.tier.suggested||null):null;
// Remove the child's and guardian's names and any phone numbers from the report before it leaves the app.
function redact(text,l){
  let t=String(text||"");
  const words=[...(l.name||"").split(/\s+/),...(l.guardian||"").split(/\s+/)].filter(w=>w.length>=3);
  words.forEach(w=>{t=t.replace(new RegExp("\\b"+w.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")+"\\b","gi"),"[name]")});
  return t.replace(/(\+?\d[\d\s().-]{7,}\d)/g,"[number]");
}
async function requestTier(l,report){
  const {data}=await sb.auth.getSession();
  const decl=(l.tier&&l.tier.declared)||"none";
  const r=await fetch((CFG.API_URL||"")+"/api/ai-tier",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+data.session.access_token},body:JSON.stringify({learner_id:l.id,class:l.cls,age:l.age,declared:decl,report:redact(report,l)})});
  let j={};try{j=await r.json()}catch(e){}
  if(!r.ok)throw new Error(j.error||("The AI service did not answer ("+r.status+"). Check that api/ai-tier.js is deployed on Vercel."));
  const why=[j.reason,j.need_types&&j.need_types.length?"Possible needs: "+j.need_types.map(n=>NEEDLBL[n]||n).join(", ")+".":"",j.unclear?"Unclear: "+j.unclear:""].filter(Boolean).join(" ");
  await run(sb.from("learner_tiers").upsert({learner_id:l.id,declared:decl,suggested_tier:j.tier,suggestion_reason:why,suggested_at:new Date().toISOString()},{onConflict:"learner_id"}));
  return j;
}
async function confirmTier(l,tier){
  await run(sb.from("learner_tiers").upsert({learner_id:l.id,declared:(l.tier&&l.tier.declared)||"none",confirmed_tier:tier,confirmed_by:ME.id,confirmed_at:new Date().toISOString()},{onConflict:"learner_id"}));
  // Keep the support plan's pathway in step with the tier. A plan already on the intermediate level stays there for tier C.
  if(l.hasPlan){const cur=l.pathway;const want=TIERPATH[tier];if(!(tier==="C"&&cur==="specialised_intermediate")&&cur!==want)await run(sb.from("learner_support_profiles").update({pathway:want,updated_by:ME.id}).eq("learner_id",l.id))}
}
function tierPanel(l){
  if(!TIER_OK||!l.sup)return "";
  const fn=esc(l.name.split(" ")[0]),can=canEdit(l),adm=isAdmin(),t=l.tier||{},ok=hasAIConsent(l),busy=S.aiBusy==="t"+l.id;
  const cur=t.confirmed,rep=l.report||"";
  return `<div class="panel" id="tierpanel"><h2>Support tier</h2>
  <p style="margin:0 0 8px">${cur?`<b>${TIERMARK[cur]} ${esc(TIERN[cur])}</b> <span class="muted">${t.at?"Confirmed "+esc(fmtDate(t.at)):""}</span>`:`<span class="tag warn">Not confirmed yet</span> <span class="muted">Until a tier is confirmed, ${fn} is planned for with the suggested tier if there is one.</span>`}</p>
  <div class="row2"><label class="muted">On the admission form<br><select id="t_decl" ${can?"":"disabled"}>${Object.entries(DECL).map(([k,v])=>`<option value="${k}" ${(t.declared||"none")===k?"selected":""}>${v}</option>`).join("")}</select></label>
   ${can?`<button class="ghost" id="t_decl_save" style="align-self:flex-end">Save</button>`:""}</div>
  ${t.suggested?`<div class="note tip" style="margin-top:12px"><b>${TIERMARK[t.suggested]} Suggested by the AI: Tier ${t.suggested}</b><br>${esc(t.reason||"")}<br><span class="muted">The AI only suggests. A person decides.</span></div>`:""}
  ${adm?`<div class="row2" style="margin-top:10px"><label class="muted">Confirm tier<br><select id="t_pick">${["A","B","C"].map(x=>`<option value="${x}" ${(cur||t.suggested||"A")===x?"selected":""}>${esc(TIERN[x])}</option>`).join("")}</select></label>
   <button class="primary" id="t_confirm" style="margin-top:0;align-self:flex-end">${cur?"Change tier":"Confirm tier"}</button></div>`:`<p class="muted" style="margin:10px 0 0">The director or a senior teacher confirms the tier.</p>`}
  ${can?`<h3 style="margin:16px 0 4px;font-size:1.05rem">Doctor’s report</h3>
   <p class="muted" style="margin:0 0 6px">Type or paste the main findings. Only the director, senior teacher and class teacher can read it. Do not paste scans or photos.</p>
   <textarea id="t_report" rows="6" style="width:100%" aria-label="Doctor’s report">${esc(rep)}</textarea>
   <p style="margin:6px 0 0"><button class="ghost" id="t_report_save">Save report</button>
   ${!ok?`</p><div class="note tip"><label><input type="checkbox" id="ai_consent2"> The guardian has signed the consent form for AI planning</label><br><button class="ghost" id="ai_consent2_save" style="margin-top:6px">Record consent</button></div>`
    :` <button class="primary" id="t_ai" style="margin-top:0" ${busy?"disabled":""}>${busy?"Reading the report…":"Suggest a tier with AI"}</button> <span class="muted" role="status">${busy?"This can take up to half a minute.":""}</span></p>
    <p class="muted" style="margin:6px 0 0">When you press the button, the report text goes to Gemini with the class and age. ${fn}’s name, the guardian’s name and any phone numbers are removed first.</p>`}`:""}</div>`;
}
function bindTier(l){
  if(!TIER_OK||!l.sup)return;
  const on=(id,f)=>{const e=$(id);if(e)e.onclick=f};
  const guard=async f=>{if(S.saving)return;S.saving=true;try{await f()}catch(e){S.aiBusy=null;fail(e)}finally{S.saving=false}};
  const reload=async()=>{await loadSupportAll();await loadSupport(l);rr()};
  document.querySelectorAll("[data-addneed]").forEach(b=>b.onclick=()=>guard(async()=>{await addNeeds(l,[b.dataset.addneed]);S.err="";await reload()}));
  on("mn_go",()=>{const k=$("mn_sel").value;if(!l.sup||!l.sup.profile){S.pendNeeds={id:l.id,keys:[k]};S.spedit=l.id;rr();return}guard(async()=>{await addNeeds(l,[k]);S.err="";await reload()})});
  on("needs_plan",()=>{S.pendNeeds={id:l.id,keys:suggestedNeeds(l)};S.spedit=l.id;rr()});
  on("t_decl_save",()=>guard(async()=>{const d=$("t_decl").value;await run(sb.from("learner_tiers").upsert({learner_id:l.id,declared:d},{onConflict:"learner_id"}));await reload()}));
  on("t_report_save",()=>guard(async()=>{const r=$("t_report").value.trim();await run(sb.from("learner_reports").upsert({learner_id:l.id,report:r,updated_by:ME.id,updated_at:new Date().toISOString()},{onConflict:"learner_id"}));S.err="";await reload()}));
  on("t_confirm",()=>guard(async()=>{await confirmTier(l,$("t_pick").value);S.err="";await reload()}));
  on("ai_consent2_save",()=>guard(async()=>{
    const c=$("ai_consent2");if(!c||!c.checked){S.err="Tick the box to confirm the guardian has signed the consent form.";render();return}
    await run(sb.from("learner_consents").insert({learner_id:l.id,kind:"gemini",granted_by:l.guardian||null,recorded_by:ME.id}));S.err="";await reload()}));
  on("t_ai",()=>guard(async()=>{
    const rep=$("t_report").value.trim();
    if(rep.length<20){S.err="Type or paste the doctor's report first.";render();return}
    await run(sb.from("learner_reports").upsert({learner_id:l.id,report:rep,updated_by:ME.id,updated_at:new Date().toISOString()},{onConflict:"learner_id"}));
    S.aiBusy="t"+l.id;S.err="";rr();
    try{await requestTier(l,rep)}finally{S.aiBusy=null}
    await reload()}));
}

/* ---------- monthly plans ---------- */
// Once a month the AI makes each child's goals and individual test again. Nothing is used until it is approved.
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const monthTodo=()=>L.filter(l=>visCls().includes(l.cls)&&l.aic&&!l.mdone);
function monthlyPanel(){
  if(!SUP_OK||!AI_OK||!MONTH_OK)return "";
  const mine=L.filter(l=>visCls().includes(l.cls)),withC=mine.filter(l=>l.aic),done=withC.filter(l=>l.mdone),todo=monthTodo(),b=S.batch;
  if(!mine.length)return "";
  return `<div class="panel" id="monthly"><h2>${esc(monthName())} · monthly goals and tests</h2>
  <p class="muted" style="margin-top:0">Every month the AI makes each child's goals and individual test again. This starts by itself a few seconds after a teacher or the director signs in, and you can also start it here. It uses their latest scores and, for children with a support plan, their needs. A teacher approves before anything is used. Only children whose guardian signed the AI consent are included.</p>
  <p style="margin:0 0 8px"><b>${done.length} of ${withC.length}</b> children with AI consent have this month's plan${mine.length>withC.length?` <span class="muted">· ${mine.length-withC.length} without consent</span>`:""}.</p>
  ${b&&b.running?`<div class="bar" aria-hidden="true"><i style="width:${Math.round(100*b.n/Math.max(1,b.t))}%"></i></div><p class="muted" role="status">Making plans… ${b.n} of ${b.t}</p>`
   :`${todo.length?`<button class="primary" id="m_run" style="margin-top:0">Make plans for ${todo.length} child${todo.length===1?"":"ren"}</button> <span class="muted">Takes about ${Math.max(1,Math.ceil(todo.length*6/60))} minute${todo.length>6?"s":""}. You can keep working while it runs.</span>`:`<span class="tag ok">All plans for ${esc(monthName())} are made</span>`}`}
  ${b&&b.msg?`<p class="muted" role="status" style="margin:8px 0 0">${esc(b.msg)}</p>`:""}</div>`;
}
// Automatic: a few seconds after a staff member signs in, any of this month's missing plans for their classes are made
// in the background (the director's and senior teacher's run covers every class). A small box in the corner shows progress.
// The button on the Learners page does the same thing by hand.
async function hasMonthPlan(l){
  const r=await run(sb.from("learner_questions").select("id").eq("learner_id",l.id).eq("month",monthFirst()).in("status",["proposed","approved"]).limit(1));
  return r.length>0;
}
function autoMonthly(){
  if(!ME||S.autoOff||!SUP_OK||!AI_OK||!MONTH_OK||(S.batch&&S.batch.running))return;
  if(monthTodo().length)runMonthly(true);
}
// Show progress without redrawing the page under someone who is working.
function monthShow(){
  const b=S.batch;
  if(!b||!b.auto){render();return}
  const mp=$("monthly");if(mp){mp.outerHTML=monthlyPanel();const mr=$("m_run");if(mr)mr.onclick=()=>runMonthly(false)}
  let p=$("autoplan");
  if(!p){p=document.createElement("div");p.id="autoplan";p.className="autoplan noprint";p.setAttribute("role","status");document.body.appendChild(p)}
  p.innerHTML=b.running?`<b>${esc(monthName())} plans</b><br>Making plans… ${b.n} of ${b.t}<div class="bar" aria-hidden="true"><i style="width:${Math.round(100*b.n/Math.max(1,b.t))}%"></i></div><button class="ghost" id="ap_stop">Stop</button>`
    :`<b>${esc(monthName())} plans</b><br>${esc(b.msg)}<br><button class="ghost" id="ap_ok">OK</button>`;
  const st=$("ap_stop");if(st)st.onclick=()=>{b.stop=true;S.autoOff=true;st.disabled=true;st.textContent="Stopping…"};
  const ok=$("ap_ok");if(ok)ok.onclick=()=>{p.remove();S.batch=null;if(S.view==="list"||S.view==="home")rr()};
}
async function runMonthly(auto){
  if(S.batch&&S.batch.running)return;
  const todo=monthTodo();if(!todo.length)return;
  const b=S.batch={running:true,auto:!!auto,n:0,t:todo.length,fail:0,made:0,msg:"",stop:false};monthShow();
  try{
    for(const l of todo){
      if(b.stop||!ME)break;
      try{
        if(await hasMonthPlan(l))l.mdone=true;   // someone else already made it, for example on another computer
        else{await loadSupport(l);await requestAI(l);l.mdone=true;b.made++}
      }catch(e){b.fail++;b.last=e&&e.message}
      b.n++;monthShow();
      if(b.fail>=3&&b.fail===b.n)break;   // the first three all failed: something is wrong, stop
      await sleep(700);
    }
    if(ME)await loadSupportAll();
  }catch(e){b.fail++;b.last=e&&e.message}
  finally{
    b.running=false;
    const left=monthTodo().length;
    b.msg=(b.made?`${b.made} plan${b.made===1?"":"s"} made. Open each child on the Learners page to review and approve. `:"")
      +(b.fail?`${b.fail} failed. ${b.last||""} `:"")
      +(left?`${left} still to do: ${b.stop?"stopped. They start again next time you sign in, or":"they are tried again next time you sign in, or"} use the button on the Learners page.`:b.made?"":"All plans for this month are made.");
    if(!ME){S.batch=null;const p=$("autoplan");if(p)p.remove();return}
    if(b.auto){monthShow();const typing=document.activeElement&&/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);if((S.view==="list"||S.view==="home")&&!typing)rr()}
    else render();
  }
}
// Small AI batches, so Gemini answers inside Vercel's time limit.
const AIBATCH=5;
// Drafts questions for curriculum outcomes that have none. They wait for approval in the question bank.
async function draftBank(c,ba){
  const items=NOQ[c][ba].slice(0,AIBATCH).map(o=>({id:o.id,strand:o.st,sub_strand:o.sub||o.c,outcome:o.l}));
  if(!items.length)return 0;
  const {data}=await sb.auth.getSession();
  const r=await fetch((CFG.API_URL||"")+"/api/ai-bank",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+data.session.access_token},body:JSON.stringify({class:c,area:AR(c)[ba].full,items})});
  let j={};try{j=await r.json()}catch(e){}
  if(!r.ok)throw new Error(j.error||("The AI service did not answer ("+r.status+"). Check that api/ai-bank.js is deployed on Vercel."));
  await run(sb.from("question_variants").insert(j.questions.map(q=>({competency_id:q.id,variant:"A",shown:q.shown,prompt:q.prompt,source:"curriculum",status:"pending",created_by:ME.id,
    ...(TOUCH_OK?{touch:q.touch||null,touch_status:"pending"}:{})}))));
  return j.questions.length;
}
// Sight questions that still need a touch version. Only the question text goes to the AI, never a child's details.
const noTouch=(c,ba)=>Q[c][ba].filter(q=>needsSight(q)&&!q.t&&!q.tp);
async function draftTouch(c,ba){
  const items=noTouch(c,ba).slice(0,AIBATCH).map(q=>({id:q.id,prompt:q.a,look_for:q.l}));
  if(!items.length)return 0;
  const {data}=await sb.auth.getSession();
  const r=await fetch((CFG.API_URL||"")+"/api/ai-bank",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+data.session.access_token},body:JSON.stringify({mode:"touch",class:c,area:AR(c)[ba].full,items})});
  let j={};try{j=await r.json()}catch(e){}
  if(!r.ok)throw new Error(j.error||("The AI service did not answer ("+r.status+"). Check that api/ai-bank.js is deployed on Vercel."));
  const va={};Q[c][ba].forEach(q=>va[q.id]=q.va);
  await Promise.all((j.touch||[]).filter(x=>va[x.id]).map(x=>run(sb.from("question_variants").update({touch:x.touch,touch_status:"pending"}).eq("id",va[x.id]))));
  return (j.touch||[]).length;
}


/* ---------- AI plan: suggested goals and individual questions ---------- */
const hasAIConsent=l=>!!(l.sup&&l.sup.consents.some(c=>c.kind==="gemini"&&!c.withdrawn_on));
const NEEDLBL={visual:"Visual",hearing:"Hearing",physical:"Physical",intellectual:"Intellectual",speech_language:"Speech and language",other:"Other"};
const lastRec=(l,q)=>(l.aiqr||[]).filter(r=>r.question_id===q.id).pop();
// Only these fields leave the app: no name, no notes, no health note, no guardian details.
function aiPayload(l){
  const sp=l.sup||{},p=sp.profile,cur=l.cur||[];
  return {class:l.cls,age:l.age,new_learner:!l.scores.length,pathway:p?p.pathway:(l.pathway||null),
    need_types:uniq((sp.needs||[]).map(n=>n.need_type).concat(suggestedNeeds(l))),accommodations:uniq((sp.acc||[]).map(a=>a.accommodation).concat(suggestedNeeds(l).flatMap(k=>NEEDACC[k]||[]))),
    terms:l.scores.map((v,i)=>({term:l.labels[i],scores:Object.fromEntries(AREAS.map(a=>[a.full,v[a.k]]))})),
    this_term:cur.some(v=>v!==null)?Object.fromEntries(AREAS.map(a=>[a.full,cur[a.k]])):null,
    current_goals:(l.goals||[]).filter(g=>g.status==="active").map(g=>({domain:g.domain,goal:g.goal,latest_level:g.prog&&g.prog.length?g.prog[g.prog.length-1].level:null})),
    question_results:(l.aiq||[]).filter(q=>q.status==="approved").map(q=>{const r=lastRec(l,q);return r?{area_index:q.area_index,prompt:q.prompt,latest_score:r.score}:null}).filter(Boolean),
    existing_questions:(l.aiq||[]).filter(q=>q.status!=="rejected").map(q=>q.prompt),
    tier:tierForPlan(l),month:monthStr(),curriculum:curriculumFor(l)};
}
// The curriculum sub-strands for this class (this term for Playgroup), so questions follow what is being taught.
// The sub-strands the AI should work from. When the curriculum table is loaded (migration-8) it comes from the KICD designs:
// up to 3 recently taught sub-strands (to assess) plus the next 3 not yet taught (to set goals for), per learning area.
// Otherwise it falls back to the sub-strands found in the question bank.
function curriculumFor(l){
  const tn=(/Term\s*(\d)/.exec(CUR)||[])[1],out=[];
  if(COV_OK&&CIDONE&&CI.some(i=>i.cls===l.cls)){
    for(let a=0;a<5;a++){
      const it=ciFor(l.cls,a),taught=it.filter(i=>COVR[i.id]),
        recent=taught.slice().sort((x,y)=>(COVR[y.id].term_id===CURID)-(COVR[x.id].term_id===CURID)||String(COVR[y.id].taught_on).localeCompare(String(COVR[x.id].taught_on))).slice(0,3),
        left=it.filter(i=>!COVR[i.id]),next=(l.cls==="PG"&&tn?left.filter(i=>String(i.term)===tn).concat(left.filter(i=>String(i.term)!==tn)):left).slice(0,3);
      recent.forEach(i=>out.push({area:a,code:i.code,strand:i.strand||"",sub_strand:i.name,taught:true,this_term:COVR[i.id].term_id===CURID}));
      next.forEach(i=>out.push({area:a,code:i.code,strand:i.strand||"",sub_strand:i.name,taught:false,this_term:false}));
    }
    return out.slice(0,30);
  }
  const seen=new Set();
  for(let a=0;a<5;a++){
    const items=[...((Q[l.cls]||[])[a]||[]),...((NOQ[l.cls]||[])[a]||[])];let n=0;
    for(const q of items){
      if(l.cls==="PG"&&tn&&!String(q.l||"").startsWith("Term "+tn))continue;
      const sub=q.sub||q.st;if(!sub||seen.has(a+"|"+sub))continue;seen.add(a+"|"+sub);
      out.push({area:a,strand:q.st||"",sub_strand:sub});if(++n>=5)break}}
  return out.slice(0,30);
}
async function ensureCurr(){if(COV_OK&&!CIDONE){try{await loadCurr()}catch(e){console.warn("Curriculum not loaded:",e&&e.message)}}}
// Asks the AI service for suggestions and saves them as drafts for the teacher to approve.
async function requestAI(l){
  await ensureCurr();
  try{await loadSupport(l)}catch(e){}  // so the doctor’s report and recorded needs are up to date, even for a child just added
  const {data}=await sb.auth.getSession();
  const r=await fetch((CFG.API_URL||"")+"/api/ai-plan",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+data.session.access_token},body:JSON.stringify({learner_id:l.id,payload:aiPayload(l)})});
  let j={};try{j=await r.json()}catch(e){}
  if(!r.ok)throw new Error(j.error||("The AI service did not answer ("+r.status+"). Check that api/ai-plan.js is deployed on Vercel."));
  await run(sb.from("learner_goals").update({status:"rejected"}).eq("learner_id",l.id).eq("status","proposed").eq("source","ai"));
  await run(sb.from("learner_questions").update({status:"rejected"}).eq("learner_id",l.id).eq("status","proposed"));
  if(j.goals&&j.goals.length)await run(sb.from("learner_goals").insert(j.goals.map(g=>({learner_id:l.id,domain:g.domain,goal:g.goal,baseline:g.baseline||null,target:g.target||null,target_date:addDays(7*g.weeks),
    status:"proposed",source:"ai",rationale:g.reason||null,term_id:CURID||null,created_by:ME.id,...(MONTH_OK?{month:monthFirst()}:{})}))));
  if(j.questions&&j.questions.length)await run(sb.from("learner_questions").insert(j.questions.map(q=>({learner_id:l.id,term_id:CURID||null,area_index:q.area,shown:q.shown,prompt:q.prompt,
    look_for:q.look_for||null,reason:q.reason||null,adapted_for:q.adapted_for||null,status:"proposed",source:"ai",created_by:ME.id,...(MONTH_OK?{month:monthFirst(),sub_strand:q.sub_strand||null}:{})}))));
  return {goals:(j.goals||[]).length,questions:(j.questions||[]).length};
}
function planPanel(l){
  if(!SUP_OK||!AI_OK||!l.sup)return "";
  const fn=esc(l.name.split(" ")[0]),can=canEdit(l),ok=hasAIConsent(l),busy=S.aiBusy===l.id;
  const pg=(l.goals||[]).filter(g=>g.status==="proposed"),pq=(l.aiq||[]).filter(q=>q.status==="proposed"),aq=(l.aiq||[]).filter(q=>q.status==="approved"&&(!MONTH_OK||!q.month||q.month===monthFirst()));
  const areaTag=q=>`<span class="tag">${esc(AR(l.cls)[q.area_index].n)}</span>${q.sub_strand?` <span class="muted">${esc(q.sub_strand)}</span>`:""}`;
  return `<div class="panel" id="aipanel"><h2>Goals and questions for ${fn} (AI)${MONTH_OK?" · "+esc(monthName()):""}</h2>
  <p class="muted">The AI looks at ${fn}’s scores over time, support needs and earlier answers, then suggests goals and extra questions that suit ${fn}. Only the class, age, scores, types of need and accommodations are sent. The name, notes, health note and guardian details are never sent. Nothing is used until a teacher approves it.</p>
  ${suggestedNeeds(l).length?`<div class="note watch" role="note">The doctor’s report mentions <b>${suggestedNeeds(l).map(k=>esc(NEEDLBL[k])).join(", ")}</b>, which is not recorded in the Support plan yet. The AI is told about it anyway, so these questions are planned for it. Please record it above as well.</div>`:""}
  ${!ok?(can?`<div class="note tip"><label><input type="checkbox" id="ai_consent"> The guardian has signed the consent form for AI planning</label><br><button class="ghost" id="ai_consent_save" style="margin-top:6px">Record consent</button></div>`:`<p class="muted">The class teacher or director must record the guardian’s consent first.</p>`)
   :(can?`<button class="primary" id="ai_run" style="margin-top:0" ${busy?"disabled":""}>${busy?"Working on it…":(MONTH_OK?`Make ${monthName()} goals and questions`:(pg.length||pq.length||aq.length?"Suggest new goals and questions":"Suggest goals and questions"))}</button> <span class="muted" role="status">${busy?"This can take up to half a minute.":""}</span>`:"")}
  ${pg.length?`<h3 style="margin:14px 0 4px;font-size:1.05rem">Goals to review</h3>${pg.map(g=>`<div class="goal"><span class="tag">${esc(g.domain)}</span> <span class="tag warn">Waiting for approval</span>
    <label class="muted" style="display:block;margin-top:6px">Goal<textarea rows="2" data-pgt="${g.id}" style="width:100%" ${can?"":"readonly"}>${esc(g.goal)}</textarea></label>
    <p class="muted" style="margin:4px 0">${g.baseline?"Starting point: "+esc(g.baseline)+". ":""}${g.target?"Aim: "+esc(g.target)+". ":""}${g.target_date?"By "+esc(fmtDate(g.target_date+"T00:00:00"))+".":""}${g.rationale?"<br>Why: "+esc(g.rationale):""}</p>
    ${can?`<button class="ghost" data-pgok="${g.id}">Approve goal</button> <button class="ghost" data-pgno="${g.id}">Reject</button>`:""}</div>`).join("")}`:""}
  ${pq.length?`<h3 style="margin:14px 0 4px;font-size:1.05rem">Questions to review</h3>${pq.map(q=>`<div class="goal">${areaTag(q)} ${q.adapted_for?`<span class="tag">Adapted: ${esc(NEEDLBL[q.adapted_for]||q.adapted_for)}</span> `:""}<span class="tag warn">Waiting for approval</span>
    <label class="muted" style="display:block;margin-top:6px">What to ask or do ${esc(q.shown||"")}<textarea rows="2" data-pqt="${q.id}" style="width:100%" ${can?"":"readonly"}>${esc(q.prompt)}</textarea></label>
    <p class="muted" style="margin:4px 0">${q.look_for?"Look for: "+esc(q.look_for)+"<br>":""}${q.reason?"Why for "+fn+": "+esc(q.reason):""}</p>
    ${can?`<button class="ghost" data-pqok="${q.id}">Approve question</button> <button class="ghost" data-pqno="${q.id}">Reject</button>`:""}</div>`).join("")}`:""}
  ${aq.length?`<h3 style="margin:14px 0 4px;font-size:1.05rem">Questions chosen for ${fn}</h3><p class="muted" style="margin-top:0">These appear in the assessment, after the common questions. They are not part of the area scores.</p>
   ${aq.map(q=>{const r=lastRec(l,q);return `<div class="nt">${areaTag(q)} ${esc(q.shown||"")} ${esc(q.prompt)} <span class="muted">${r?"· last: "+esc(r.score)+" ("+esc(fmtDate(r.entered_at))+")":"· not asked yet"}</span> ${can?`<button class="ghost" data-pqre="${q.id}">Retire</button>`:""}</div>`}).join("")}`:""}
  ${ok&&!pg.length&&!pq.length&&!aq.length?`<p class="muted">No suggestions yet.</p>`:""}</div>`;
}
function bindPlan(l){
  if(!AI_OK||!l.sup)return;
  const on=(id,f)=>{const e=$(id);if(e)e.onclick=f};
  const guard=async f=>{if(S.saving)return;S.saving=true;try{await f()}catch(e){S.aiBusy=null;fail(e)}finally{S.saving=false}};
  const stamp=()=>new Date().toISOString();
  on("ai_consent_save",()=>guard(async()=>{
    const c=$("ai_consent");if(!c||!c.checked){S.err="Tick the box to confirm the guardian has signed the consent form.";render();return}
    await run(sb.from("learner_consents").insert({learner_id:l.id,kind:"gemini",granted_by:l.guardian||null,recorded_by:ME.id}));
    S.err="";await loadSupport(l);rr()}));
  on("ai_run",()=>guard(async()=>{
    S.aiBusy=l.id;S.err="";rr();
    try{await requestAI(l)}finally{S.aiBusy=null}
    await loadSupport(l);rr();const p=$("aipanel");if(p)p.scrollIntoView({block:"start"})}));
  document.querySelectorAll("[data-pgok]").forEach(b=>b.onclick=()=>guard(async()=>{
    const t=document.querySelector('[data-pgt="'+b.dataset.pgok+'"]').value.trim();if(!t){S.err="A goal cannot be empty.";render();return}
    await run(sb.from("learner_goals").update({goal:t,status:"active",approved_by:ME.id,approved_at:stamp()}).eq("id",b.dataset.pgok));await loadSupport(l);rr()}));
  document.querySelectorAll("[data-pgno]").forEach(b=>b.onclick=()=>guard(async()=>{
    await run(sb.from("learner_goals").update({status:"rejected"}).eq("id",b.dataset.pgno));await loadSupport(l);rr()}));
  document.querySelectorAll("[data-pqok]").forEach(b=>b.onclick=()=>guard(async()=>{
    const t=document.querySelector('[data-pqt="'+b.dataset.pqok+'"]').value.trim();if(!t){S.err="A question cannot be empty.";render();return}
    await run(sb.from("learner_questions").update({prompt:t,status:"approved",approved_by:ME.id,approved_at:stamp()}).eq("id",b.dataset.pqok));await loadSupport(l);rr()}));
  document.querySelectorAll("[data-pqno]").forEach(b=>b.onclick=()=>guard(async()=>{
    await run(sb.from("learner_questions").update({status:"rejected"}).eq("id",b.dataset.pqno));await loadSupport(l);rr()}));
  document.querySelectorAll("[data-pqre]").forEach(b=>b.onclick=()=>guard(async()=>{
    await run(sb.from("learner_questions").update({status:"retired"}).eq("id",b.dataset.pqre));await loadSupport(l);rr()}));
}
// Individual questions shown in the assessment, after the common core questions.
function xqPanel(l,A,s){
  if(!AI_OK||!l.sup)return "";
  const list=(l.aiq||[]).filter(q=>q.status==="approved"&&q.area_index===A&&(!MONTH_OK||!q.month||q.month===monthFirst()));
  if(!list.length)return "";
  const fn=esc(l.name.split(" ")[0]),can=canEdit(l),st=(s.xq=s.xq||{});
  const saved=q=>(l.aiqr||[]).filter(r=>r.question_id===q.id&&r.term_id===CURID).pop();
  const open=list.filter(q=>!saved(q));
  return `<div class="panel" id="xqpanel"><h2>Questions chosen for ${fn}</h2>
  <p class="muted" style="margin-top:0">Chosen for ${fn}’s strengths, gaps and support needs, and approved by a teacher. They add to the common questions above and are not part of the area score.</p>
  ${list.map(q=>{const sv=saved(q),cur=st[q.id]||{};return `<div class="goal"><p style="margin:0">${isBlind(l)?"":esc(q.shown||"")} <b>${esc(q.prompt)}</b></p>
   <p class="muted" style="margin:4px 0">${q.look_for?"Look for: "+esc(q.look_for):""}${q.adapted_for?` · Adapted: ${esc(NEEDLBL[q.adapted_for]||q.adapted_for)}`:""}</p>
   ${sv?`<p class="muted" style="margin:0">Saved: ${esc(sv.score)}${sv.comment?" · "+esc(sv.comment):""}</p>`
    :(can?`<div class="row2"><label class="muted">Score<br><select data-xq="${q.id}"><option value="">Choose a score</option>${GR.map(x=>`<option value="${x}" ${String(cur.v)===String(x)?"selected":""}>${num(x)?x+" · "+G[x]:x+" · "+GL[x]}</option>`).join("")}</select></label>
     <label class="muted" style="flex:1;min-width:200px">Comment (optional)<br><input type="text" data-xqc="${q.id}" style="width:100%" value="${esc(cur.c||"")}"></label></div>`:'<p class="muted" style="margin:0">Only the class teacher or director can score this.</p>')}</div>`}).join("")}
  ${can&&open.length?`<button class="primary" id="xqsave" style="margin-top:0">Save questions for ${fn}</button>`:""}</div>`;
}
function bindXq(l,A,s){
  const st=(s.xq=s.xq||{});
  document.querySelectorAll("[data-xq]").forEach(e=>e.onchange=()=>{(st[e.dataset.xq]=st[e.dataset.xq]||{}).v=e.value});
  document.querySelectorAll("[data-xqc]").forEach(e=>e.oninput=()=>{(st[e.dataset.xqc]=st[e.dataset.xqc]||{}).c=e.value});
  const b=$("xqsave");if(b)b.onclick=async()=>{
    const rows=Object.entries(st).filter(([id,x])=>x.v!==undefined&&x.v!==""&&(l.aiq||[]).some(q=>q.id===id&&q.area_index===A)).map(([id,x])=>({question_id:id,learner_id:l.id,term_id:CURID||null,score:String(gv(x.v)),support_code:"R0",comment:(x.c||"").trim()||null,rater_id:ME.id}));
    if(!rows.length){s.msg="Choose a score for at least one of the questions chosen for "+l.name.split(" ")[0]+".";rr();return}
    if(S.saving)return;S.saving=true;
    try{await run(sb.from("learner_question_records").insert(rows));rows.forEach(r=>delete st[r.question_id]);s.msg="";await loadSupport(l);rr()}catch(e){fail(e)}finally{S.saving=false}};
}
function aiWaitPanel(){
  const w=L.filter(l=>l.pend>0);
  return `<div class="panel"><h2>AI suggestions waiting for approval</h2><p class="muted">Goals and questions the AI suggested that a teacher has not yet approved or rejected.</p>${w.length?`<div class="scroll"><table><thead><tr><th>Learner</th><th>Class</th><th>Waiting</th><th></th></tr></thead><tbody>${w.map(l=>`<tr><td>${esc(l.name)}</td><td>${l.cls}</td><td>${l.pend}</td><td><button class="ghost" data-open="${l.id}">Review</button></td></tr>`).join("")}</tbody></table></div>`:'<p class="muted">Nothing is waiting.</p>'}</div>`;
}

/* ---------- learners list ---------- */
function listView(){
  return `<div class="tools"><input type="text" id="q" placeholder="Search learners" aria-label="Search learners" value="${esc(S.q)}">
  ${["All"].concat(visCls()).map(c=>`<button class="chip" data-c="${c}" aria-pressed="${S.lcls===c}">${c==="All"?"All classes":c}</button>`).join("")}
  ${SUP_OK?`<button class="chip" id="lsp" aria-pressed="${S.lsp}">With a support plan</button>`:""}
  ${TIER_OK?["A","B","C"].map(t=>`<button class="chip" data-tier="${t}" aria-pressed="${S.ltier===t}">${TIERMARK[t]} Tier ${t}</button>`).join(""):""}
  <span class="muted" id="count"></span></div>${monthlyPanel()}<div class="grid" id="grid"></div>`;
}
function fillGrid(){
  const q=S.q.toLowerCase(),rows=L.filter(l=>(S.lcls==="All"||l.cls===S.lcls)&&(!S.lsp||l.hasPlan)&&(!S.ltier||(l.tier&&l.tier.confirmed===S.ltier))&&l.name.toLowerCase().includes(q));
  $("count").textContent=`${rows.length} learner${rows.length===1?"":"s"}`;
  $("grid").innerHTML=rows.length?rows.map(l=>`<button class="card" data-i="${l.id}">${av(l,64)}<div><b>${esc(l.name)}</b><span>${l.cls}${l.age!==null?" · age "+l.age:""}</span><div style="margin-top:4px">${tierTag(l)}${l.hasPlan?'<span class="tag ok">&#9829; Support plan</span> ':""}${l.pend>0&&canEdit(l)?'<span class="tag warn">AI suggestions to review</span> ':""}${has(l)?`${cell(avg(last(l)))} ${arrow(l)} ${support(l)?'<span class="tag warn">Check in</span>':''}`:'<span class="tag">No scores yet</span>'}</div></div></button>`).join(""):`<p class="muted">${L.length?"No learners match. Clear the search or choose All classes.":"No learners have been added yet."}</p>`;
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
  return `Hello${first?" "+first:""},\n\nHere is a short update on how ${fn} is doing at ${SCH.name}.\n\n${p.summary||""}\n\n`
    +part("What is going well",p.strengths)
    +(p.support?`*How we are helping*\n${p.support}\n\n`:"")
    +part("Things you can try at home",p.ideas)
    +`Please talk to me if you have any questions.\n\nWarm regards,\n${ME.name}\n${SCH.name}`;
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
  ${open.length?`<div class="scroll"><table><thead><tr><th>Action</th><th>Area</th><th>Owner</th><th>Due</th><th></th></tr></thead><tbody>${open.map(a=>`<tr><td>${esc(a.action)}${SUP_OK?goalTag(l,a.goal):""}</td><td>${a.area!==null?AREAS[a.area].n:"Any"}</td><td>${esc(a.owner)}</td><td>${a.due<today?'<span class="tag warn">Overdue</span> ':""}${esc(a.dueFmt)}</td><td>${a.owner_id===ME.id||ME.role==="head"?`<button class="ghost" data-done="${a.id}" style="padding:2px 10px;font-size:.8rem">Mark done</button>`:""}</td></tr>`).join("")}</tbody></table></div>`:'<p class="muted">No open actions.</p>'}
  <div class="row2" style="margin-top:10px">
   <label class="muted" style="flex:2;min-width:220px">New action<br><input type="text" id="actt" style="width:100%" value="${esc(af.text)}" placeholder="For example: count to 10 with bottle tops at home"></label>
   <label class="muted">Area<br><select id="acta"><option value="">Any area</option>${AR(l.cls).map(a=>`<option value="${a.k}" ${String(af.area)===String(a.k)?"selected":""}>${a.n}</option>`).join("")}</select></label>
   <label class="muted">Owner<br><select id="acto">${Object.entries(STAFF).map(([id,n])=>`<option value="${id}" ${id===ME.id?"selected":""}>${esc(n)}</option>`).join("")}</select></label>
   <label class="muted">Due<br><input type="date" id="actd" value="${addDays(7)}"></label>
   ${SUP_OK&&(l.goals||[]).some(g=>g.status==="active")?`<label class="muted">For goal<br><select id="actg"><option value="">No goal</option>${l.goals.filter(g=>g.status==="active").map(g=>`<option value="${g.id}">${esc(g.goal)}</option>`).join("")}</select></label>`:""}</div>
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
    <input type="text" id="rrs" size="34" placeholder="Reason for the correction" aria-label="Reason for the correction" value="${esc(S.rr)}"> <button class="ghost" id="rsave">Save correction</button> <button class="ghost" id="rcancel">Cancel</button> <span class="muted" id="rmsg"></span></div>`}
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
function termPanel(l){
  const saved=l.cur.filter(v=>v!==null).length;
  const dir=[0,1,2,3,4].map(a=>l.log.filter(r=>r.t===CUR&&r.a===a&&r.role==="director"&&live(l,r)).length);
  if(!saved&&!dir.some(Boolean))return "";
  return `<div class="panel"><h2>${esc(CUR)} so far</h2>
  <p class="muted" style="margin-top:0">${saved===5?"All five areas are scored by the teacher, so this term is now included in the scores, chart and trends below.":"The scores, chart and trends below only change once the teacher has scored all five areas for the term. The director’s scores are kept as a check and do not change them."}</p>
  <div class="scroll"><table><thead><tr><th></th>${AR(l.cls).map(a=>`<th>${a.n}</th>`).join("")}</tr></thead><tbody>
  <tr><td><b>Teacher</b></td>${l.cur.map(v=>`<td>${v!==null?cell(v):'<span class="muted">not yet</span>'}</td>`).join("")}</tr>
  <tr><td><b>Director</b></td>${dir.map(n=>`<td>${n?`<span class="muted">${n} scored</span>`:'<span class="muted">not yet</span>'}</td>`).join("")}</tr></tbody></table></div></div>`;
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
   ${ME.role==="head"?(S.leave===l.id?`<p class="note watch" style="margin:8px 0">Mark ${esc(l.name)} as having left Matan? They disappear from the lists. Their records are kept. <button class="ghost" id="leaveyes" style="padding:2px 10px;font-size:.8rem">Yes, mark as left</button> <button class="ghost" id="leaveno" style="padding:2px 10px;font-size:.8rem">Cancel</button></p>`:`<button class="ghost" id="leavebtn" style="margin:8px 8px 0 0;padding:4px 12px;font-size:.85rem">Mark as left school</button>`):""}
   ${[0,1,2,3,4].every(a=>mineSaved(l,a))?`<span class="tag ok">${CUR} done</span>`:`<button class="primary" id="go" style="margin-top:8px">${[0,1,2,3,4].some(a=>mineSaved(l,a))?"Continue":"Start"} ${CUR} end-of-term exam</button>`}
   ${CHK_OK&&canEdit(l)?`<button class="ghost" id="gochk" style="margin-top:8px">Small check</button>`:""} ${has(l)?`<button class="ghost" id="gorep" style="margin-top:8px">Report card</button>`:""}</div></div>
  ${termPanel(l)}
  ${c?`<div class="panel"><h2>Latest scores</h2><p class="muted">${l.labels[l.labels.length-1]}</p>
  <div class="towers">${AR(l.cls).map(a=>`<div class="tower">${[1,2,3,4,5].map(i=>`<div class="blk" style="${i<=c[a.k]?`background:var(${a.c})`:''}"></div>`).join("")}<small>${a.n}</small><b>${c[a.k]}</b></div>`).join("")}</div>
  ${(()=>{const k=kicd(avg(c));return k?`<p style="margin:12px 0 0"><b>Overall: ${k.t} (${k.c})</b> <span class="muted">${AR(l.cls).map(a=>{const x=kicd(c[a.k]);return a.n+" "+x.c}).join(" · ")}</span></p>`:""})()}</div>
  <div class="panel"><h2>Progress over time</h2>${chart(l)}
  <div class="scroll" style="margin-top:12px"><table><thead><tr><th>Term</th>${AR(l.cls).map(a=>`<th>${a.n}</th>`).join("")}<th>Avg</th></tr></thead><tbody>${l.scores.map((s,i)=>`<tr><td>${l.labels[i]}</td>${s.map(v=>`<td>${cell(v)}</td>`).join("")}<td>${f1(avg(s))}</td></tr>`).join("")}${l.cur.some(v=>v!==null)&&!l.labels.includes(CUR)?`<tr style="opacity:.75"><td>${esc(CUR)} (in progress)</td>${l.cur.map(v=>`<td>${v!==null?cell(v):"—"}</td>`).join("")}<td>—</td></tr>`:""}</tbody></table></div></div>`:`<div class="panel"><p class="muted" style="margin:0">No completed term yet, so there are no scores or chart to show.</p></div>`}
  <div class="panel"><h2>Trends and suggestions</h2>${insights(l).map(o=>`<div class="note ${o.t}">${o.x}</div>`).join("")}
   <p class="muted">These suggestions come from simple rules for now. An AI model will write more personal ones once it is connected.</p></div>
  ${needsPrompt(l)}
  ${checksPanel(l)}
  ${aiPanel(l)}
  ${tierPanel(l)}
  ${supportPanel(l)}
  ${planPanel(l)}
  ${goalsPanel(l)}
  ${actPanel(l)}
  ${recPanel(l)}
  <div class="panel"><h2>Teacher notes</h2>${l.notes.length?l.notes.map(n=>`<div class="nt"><span class="muted">${n.d}${n.by?" · "+esc(n.by):""}</span><br>${esc(n.x)}</div>`).join(""):'<p class="muted">No notes yet. Add the first one below.</p>'}
  <p><textarea id="nt" rows="2" cols="44" placeholder="What did you notice today?" aria-label="New note"></textarea></p><button class="ghost" id="addnote">Add note</button></div>`;
}
function bindProfile(){
  const l=byId(S.sel);if(!l)return;
  $("back").onclick=()=>{S.view="list";S.rev=null;render()};
  bindSupport(l);bindPlan(l);bindTier(l);
  if(!l.loaded)return;
  const go=$("go");if(go)go.onclick=()=>begin(l.id);
  [["gochk",()=>beginCheck(l.id)],["gochk2",()=>beginCheck(l.id)],["gorep",()=>{S.rcls=l.cls;S.rsel=l.id;S.rterm=null;S.view="rep";render()}]].forEach(([id,f])=>{const e=$(id);if(e)e.onclick=f});
  const lb=$("leavebtn");if(lb)lb.onclick=()=>{S.leave=l.id;rr()};
  const ln=$("leaveno");if(ln)ln.onclick=()=>{S.leave=null;rr()};
  const ly=$("leaveyes");if(ly)ly.onclick=async()=>{
    try{await run(sb.from("learners").update({active:false}).eq("id",l.id));S.leave=null;S.view="list";await loadAll();render()}catch(e){fail(e)}};
  const gi=$("genai");if(gi)gi.onclick=async()=>{
    if(S.saving)return;S.saving=true;S.aiBusy=l.id;S.err="";rr();
    try{
      const {data}=await sb.auth.getSession();
      const r=await fetch(CFG.API_URL+"/api/learners/"+l.id+"/insights",{method:"POST",headers:{Authorization:"Bearer "+data.session.access_token}});
      const j=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(j.error||"The insights service did not answer. Check that api/learners/[id]/insights.js is deployed on Vercel.");
      await loadInsight(l);
    }catch(e){S.err=e.name==="TypeError"?"Could not reach the insights service. Check your internet connection, and that API_URL in config.js is an empty string.":e.message}
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
    const ai=AR(l.cls).findIndex(a=>a.full===ar0||a.n===ar0||(ar0&&ar0.startsWith(a.n)));
    S.af={id:l.id,text:txt,area:ai>=0?String(ai):""};rr();
    const el=$("actpanel");if(el)el.scrollIntoView({block:"start"})});
  const aa=$("actadd");if(aa)aa.onclick=async()=>{
    const text=$("actt").value.trim(),due=$("actd").value,owner=$("acto").value,area=$("acta").value,gsel=$("actg"),gid=gsel?gsel.value:"";
    if(!text||!due){S.err="Write the action and choose a due date.";render();return}
    if(S.saving)return;S.saving=true;
    try{await run(sb.from("follow_up_actions").insert({learner_id:l.id,area_id:area===""?null:AID(l.cls,+area),action:text,owner_id:owner,due_date:due,created_by:ME.id,...(gid?{goal_id:gid}:{})}));
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
  const c=pickCls(S.cls);
  return `<p class="muted" style="margin-top:0">${CUR}. ${S.qmode==="check"&&CHK_OK?"Small check: pick a learner and an area, score a few questions and get a short insight. Small checks never change the graph or trend.":"End-of-term exam: call a learner, then assess them one area at a time. Only the exam feeds the graph, trend and report card."}</p>
  ${CHK_OK?`<div class="tools"><button class="chip" data-qm="exam" aria-pressed="${S.qmode!=="check"}">End-of-term exam</button><button class="chip" data-qm="check" aria-pressed="${S.qmode==="check"}">Small check</button></div>`:""}
  <div class="tools">${visCls().map(x=>`<button class="chip" data-c="${x}" aria-pressed="${c===x}">${x} · ${esc(TEACH[x]||"")}</button>`).join("")}</div>
  <div class="grid">${L.filter(l=>l.cls===c).map(l=>`<button class="card" data-i="${l.id}">${av(l,56)}<div style="flex:1"><b>${esc(l.name)}</b><span>${done(l)?"Assessed":prog(l)?`${prog(l)} of 5 areas`:"Not started"}</span><div class="bar"><i style="width:${prog(l)*20}%"></i></div></div></button>`).join("")||'<p class="muted">No learners in this class yet.</p>'}</div>`;
}
async function begin(id){
  const l=byId(id);
  try{if(!l.loaded)await loadRecords(l);if(SUP_OK&&!l.sup)await loadSupport(l)}catch(e){return fail(e)}
  const a=[0,1,2,3,4].find(i=>!mineSaved(l,i)),m=()=>[[],[],[],[],[]];
  if(a===undefined){S.sel=id;S.view="profile";render();return}
  S.sess={id,area:a,qi:0,ad:m(),g:m(),n:m(),sc:m(),v:m(),present:false,finished:false,msg:""};S.view="assess";S.err="";render();
}

/* ---------- live assessment ---------- */
function assessView(){
  const s=S.sess,l=byId(s.id),A=s.area,qs=QA(l.cls,A),fn=l.name.split(" ")[0],who=ME.role==="head"?"Director":"Teacher";
  const nextL=L.find(x=>x.cls===l.cls&&x.id!==l.id&&!done(x));
  const tabs=`<div class="tabs" role="tablist" aria-label="Learning areas">${AR(l.cls).map(a=>`<button class="tab" role="tab" data-a="${a.k}" aria-selected="${a.k===A}" tabindex="${a.k===A?0:-1}">${mineSaved(l,a.k)?"✓ ":""}${a.n}</button>`).join("")}</div>`;
  const head=`<div class="who"><div style="display:flex;gap:12px;align-items:center">${av(l,56)}<div><h2>Now assessing: ${esc(l.name)}</h2><span class="muted">${l.cls} · ${esc(TEACH[l.cls]||"")} · ${CUR} · scoring as ${who}</span></div></div><button class="ghost" id="toq">Back to class list</button></div>`;
  if(s.finished)return `<div class="panel"><div class="who"><div style="display:flex;gap:12px;align-items:center">${av(l,56)}<h2>${esc(l.name)} is done</h2></div></div>
   <p>All five areas are saved for ${esc(fn)} for ${CUR}.</p>
   <button class="primary" id="toprof">Open profile</button> ${nextL?`<button class="ghost" id="nextl">Call next: ${esc(nextL.name)}</button>`:""} <button class="ghost" id="toq">Back to class list</button></div>`;
  if(!qs.length)return head+tabs+accBanner(l)+indivBanner(l,A)+(isSpecial(l)?xqPanel(l,A,s):"")+`<div class="panel"><p class="muted" style="margin:0">There are no approved questions for ${AR(l.cls)[A].full} in ${l.cls} yet. Add some in the Question bank, or pick another area.</p></div>`+(isSpecial(l)?"":xqPanel(l,A,s));
  const q=qs[s.qi],g=s.g[A],au=((s.au=s.au||{})[A]=s.au[A]||{}),v=s.v[A][s.qi]||"A",txt=askText(l,q,v),saved=mineSaved(l,A),n=qs.length;
  if(!saved)preNA(l,qs,g,au);
  if(s.present)return `<div class="stage present"><div class="big">${q.s}</div>${q.st?"":`<p class="ask">${esc(txt)}</p>${sightWarn(l,txt)}`}</div><button class="ghost" id="exitp">Back to grading</button>`;
  const idx=qs.map((_,i)=>i),graded=idx.filter(i=>g[i]!==undefined),missing=idx.filter(i=>g[i]===undefined),tn=graded.map(i=>g[i]).filter(num);
  const score=tn.length?Math.round(avg(tn)):null,sts={};
  qs.forEach((x,i)=>{if(x.st&&num(g[i]))(sts[x.st]=sts[x.st]||[]).push(g[i])});
  return head+tabs+accBanner(l)+indivBanner(l,A)+(isSpecial(l)?xqPanel(l,A,s):"")+`
  <div class="stage">${isSpecial(l)?`<p class="muted" style="margin:0 0 8px"><b>Common questions</b> (adapt them for ${esc(fn)} as needed)</p>`:""}<p class="muted" style="margin:0 0 8px">${AR(l.cls)[A].full} · Question ${s.qi+1} of ${n} · ${q.src}</p>
   ${q.st?`<p class="muted" style="margin:0 0 8px"><b>${esc(q.c)}</b> · ${esc(q.st)}${q.sub?" · "+esc(q.sub):""}${q.ref?" · "+esc(q.ref):""}</p>`:""}
   ${isBlind(l)&&!s.pic?`<p class="muted" style="margin:0 0 8px"><b>Picture hidden.</b> Read the question aloud and use real objects ${esc(fn)} can touch. <button class="ghost" id="showpic">Show picture</button></p>`:`<div class="big">${q.s}</div>`}<p class="ask">${esc(txt)}</p>${blindNote(l,q,g,au,s.qi)}
   ${q.b&&!(isBlind(l)&&q.t)?`<p style="margin:14px 0 0"><button class="chip" data-var="A" aria-pressed="${v==="A"}">Question A</button> <button class="chip" data-var="B" aria-pressed="${v==="B"}">Question B</button></p>`:""}
   ${isBlind(l)?"":`<p style="margin-top:14px"><button class="ghost" id="present">Show full screen to learner</button></p>`}</div>
  <div class="panel"><p style="margin-top:0"><b>Look for:</b> ${esc(q.l)}</p>
   <p class="muted" style="margin:0 0 6px"><b>${who} score</b>. Your score is saved under your own login. The ${ME.role==="head"?"teacher":"director"} scores separately.</p>
   <div class="pick" role="group" aria-label="${who} score">${GR.map(x=>`<button class="${num(x)?"":"sm"}" data-v="${x}" aria-pressed="${g[s.qi]===x}">${x}</button>`).join("")}</div>
   <p class="rub muted">${g[s.qi]===undefined?"Choose a score from 0 to 5, or NA or DA.":num(g[s.qi])?`${g[s.qi]}: ${G[g[s.qi]]}`:`${g[s.qi]}: ${GL[g[s.qi]]}`}</p>
   ${SUP_OK&&l.hasPlan?`<label class="muted" style="display:block;margin:8px 0"><input type="checkbox" id="adp" ${s.ad[A][s.qi]?"checked":""}> Task was adapted for this child</label>`:""}
   <div class="row2"><label class="muted">Support to give<br><select id="sc">${Object.keys(SUP).map(k=>`<option value="${k}" ${(s.sc[A][s.qi]||"R0")===k?"selected":""}>${k} · ${SUP[k]}</option>`).join("")}</select></label>
   <label class="muted" style="flex:1;min-width:220px">Comment (optional)<br><textarea id="qn" rows="2" style="width:100%" placeholder="What did you notice? For example, mixed up 5 and 6.">${esc(s.n[A][s.qi]||"")}</textarea></label></div>
   <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px"><button class="ghost" id="prevq" ${s.qi===0?"disabled":""}>Previous question</button><button class="ghost" id="nextq" ${s.qi===n-1?"disabled":""}>Next question</button></div></div>
  <div class="panel">${saved?`<p style="margin:0"><b>${AR(l.cls)[A].full}</b> is saved${ME.role==="head"?"":(l.cur[A]!==null?" as "+cell(l.cur[A]):"")}. Pick another area above.</p>`
   :`<p style="margin-top:0"><b>${AR(l.cls)[A].full}</b>: you have scored ${graded.length} of ${n} questions.${score!==null&&ME.role!=="head"?` The area score so far is ${cell(score)} <span class="muted">(average of your numeric scores, leaving out NA and DA)</span>.`:""}</p>
     ${Object.keys(sts).length&&ME.role!=="head"?`<p class="muted" style="margin:0 0 6px">By strand: ${Object.entries(sts).map(([k,x])=>`${k} ${f1(avg(x))}`).join(" · ")}</p>`:""}
     ${s.msg?`<div class="note watch">${esc(s.msg)}</div>`:""}
     <p class="muted" style="margin:0 0 6px">Every question needs a score, or NA if you did not ask it. When you press the button, your scores for this area are saved and cannot be changed, only corrected later.</p>
     <button class="primary" id="done" style="margin-top:0">Done assessing ${AR(l.cls)[A].n}</button>`}</div>`+(isSpecial(l)?"":xqPanel(l,A,s));
}
async function finishArea(l,s,A){
  const qs=QA(l.cls,A);
  const rows=qs.map((q,i)=>({learner_id:l.id,term_id:CURID,competency_id:q.id,variant_id:(s.v[A][i]==="B"&&q.vb)?q.vb:q.va,rater_id:ME.id,rater_role:myRole(),
    score:String(s.g[A][i]),support_code:s.sc[A][i]||"R0",comment:(s.n[A][i]||"").trim()||null,...(SUP_OK?{adapted:!!(s.ad&&s.ad[A][i])}:{})}));
  await run(sb.from("assessment_records").insert(rows));
  await loadScores(l.id);await loadRecords(l);
  const next=[0,1,2,3,4].find(i=>!mineSaved(l,i));
  if(next===undefined)s.finished=true;else{s.area=next;s.qi=0;s.msg=""}
}
function bindAssess(){
  const s=S.sess,l=byId(s.id),A=s.area;
  bindXq(l,A,s);
  const on=(id,f)=>{const e=$(id);if(e)e.onclick=f};
  on("toq",()=>{S.view="queue";S.sess=null;render()});
  on("toprof",()=>{S.sel=l.id;S.view="profile";S.sess=null;render()});
  on("goplan",()=>{S.sel=l.id;S.view="profile";S.sess=null;render()});
  on("nextl",()=>{const n=L.find(x=>x.cls===l.cls&&x.id!==l.id&&!done(x));begin(n.id)});
  on("showpic",()=>{s.pic=true;rr()});on("present",()=>{s.present=true;render()});on("exitp",()=>{s.present=false;render()});
  on("prevq",()=>{s.qi--;rr()});on("nextq",()=>{s.qi++;rr()});
  const qn=$("qn");if(qn)qn.oninput=()=>{s.n[A][s.qi]=qn.value};
  const adp=$("adp");if(adp)adp.onchange=()=>{s.ad[A][s.qi]=adp.checked};
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
const bbtn=(attr,label)=>`<button class="ghost" ${attr} style="padding:2px 10px;font-size:.8rem">${label}</button>`;
// The touch or spoken version for blind learners, under each question in the bank.
function touchLine(q,head){
  if(!TOUCH_OK)return needsSight(q)?`<br><span class="tag warn">Needs sight</span>`:"";
  if(head&&S.et===q.id)return `<br><label class="muted">Touch or spoken version for blind learners<br><textarea id="ett" rows="2" style="width:100%" placeholder="For example: Give the child 3 bottle tops. Ask: How many bottle tops are in your hand?">${esc(q.t||q.tp)}</textarea></label><div style="margin-top:4px"><button class="primary" id="etsave" style="margin:0 6px 0 0;padding:6px 14px">Save touch version</button>${bbtn('id="etcancel"',"Cancel")}</div>`;
  if(q.t)return `<br>✋ <b>Touch:</b> ${esc(q.t)}${head?" "+bbtn(`data-et="${q.id}"`,"Edit touch")+" "+bbtn(`data-trm="${q.id}"`,"Remove touch"):""}`;
  if(q.tp)return `<br>✋ <b>Touch:</b> ${esc(q.tp)} <span class="tag warn">AI draft, waiting for approval</span>${head?" "+bbtn(`data-tap="${q.id}"`,"Approve touch")+" "+bbtn(`data-et="${q.id}"`,"Edit touch")+" "+bbtn(`data-trm="${q.id}"`,"Remove touch"):""}`;
  return needsSight(q)?`<br><span class="tag warn">Needs sight: no touch version</span> <span class="muted">Blind learners get NA here.</span>${head?" "+bbtn(`data-et="${q.id}"`,"Add touch version"):""}`:"";
}
// The page in the curriculum design for a question's sub-strand, when the name matches one in the curriculum list.
const nm=t=>String(t||"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
function subPdf(c,a,sub){if(!PDF_OK||!sub)return "";const i=ciFor(c,a).find(x=>x.pdf_page&&nm(x.name)===nm(sub));return i?" "+pdfBtn(c,i.pdf_page,"p. "+i.pdf_page,"Open the curriculum design at page "+i.pdf_page):""}
function bankView(){
  const c=pickCls(S.cls),ba=S.ba||0,qs=Q[c][ba],noq=NOQ[c][ba],head=isAdmin(),nt=TOUCH_OK?noTouch(c,ba):[];
  const btn=bbtn;
  return `<p class="muted" style="margin-top:0">Questions come from the KICD 2024 curriculum and from teachers. Imported questions start as drafts: the director or senior teacher edits and approves them before they are used in assessments. Outcomes with no question yet are listed under the questions.</p>
  <div class="tools">${visCls().map(x=>`<button class="chip" data-c="${x}" aria-pressed="${c===x}">${x}</button>`).join("")}</div>
  <div class="tabs" role="tablist" aria-label="Learning areas">${AR(c).map(a=>`<button class="tab" role="tab" data-a="${a.k}" aria-selected="${a.k===ba}" tabindex="${a.k===ba?0:-1}">${a.n}</button>`).join("")}</div>
  <div class="panel"><h2>${AR(c)[ba].full} · ${c}</h2>${PDF_OK&&CIDONE?`<p style="margin:0 0 8px">${pdfBtn(c,pdfFirst(c,ba),"📄 Open the "+c+" curriculum design"+(pdfFirst(c,ba)?" at this area":""))}</p>`:""}${qs.length?qs.map(q=>`<div class="nt"><span class="tag ${q.src==="Teacher"?"ok":""}">${q.src}</span> <b>${esc(q.c)}</b>${q.st?" · "+esc(q.st):""}${q.sub?" · "+esc(q.sub):""}${subPdf(c,ba,q.sub)}<br>
   ${head&&S.eq===q.id?`<textarea id="eqt" rows="2" style="width:100%">${esc(q.a)}</textarea><div style="margin-top:4px"><button class="primary" id="eqsave" style="margin:0 6px 0 0;padding:6px 14px">Save question</button>${btn('id="eqcancel"',"Cancel")}</div>`:`<b>${esc(q.s)}</b> A: ${esc(q.a)}${q.b?`<br>B: ${esc(q.b)}`:""}`}<br><span class="muted">Look for: ${esc(q.l)}${q.ref?" · "+esc(q.ref):""}</span>
   ${touchLine(q,head)}
   ${q.ok===false?`<br><span class="tag warn">Question waiting for approval</span>`:""}${q.ok===false&&head?` ${btn(`data-ap="${q.id}"`,"Approve")} ${btn(`data-eq="${q.id}"`,"Edit")} ${btn(`data-rj="${q.id}"`,"Reject")}`:""}${q.src==="Teacher"&&q.ok===false&&q.by===ME.id?` ${btn(`data-del="${q.id}"`,"Remove")}`:""}</div>`).join(""):'<p class="muted">No questions here yet.</p>'}</div>
  ${head&&noq.length?`<p><button class="ghost" id="bk_ai" ${S.aiBusy==="bank"?"disabled":""}>${S.aiBusy==="bank"?"Drafting…":"Draft "+Math.min(AIBATCH,noq.length)+" questions with AI"}</button> <span class="muted">The AI writes from the curriculum text only. Drafts wait for approval below.</span></p>`:""}
  ${head&&nt.length?`<p><button class="ghost" id="bk_touch" ${S.aiBusy==="touch"?"disabled":""}>${S.aiBusy==="touch"?"Drafting…":"Draft "+Math.min(AIBATCH,nt.length)+" touch versions with AI"}</button> <span class="muted">${nt.length} question${nt.length===1?"":"s"} here need${nt.length===1?"s":""} sight. The AI sees the question text only. Drafts wait for approval.</span></p>`:""}
  <details class="panel" ${S.wq?"open":""}><summary><b>${noq.length} outcome${noq.length===1?"":"s"} without a question</b></summary>
   ${noq.length?noq.map(o=>`<div class="nt"><b>${esc(o.c)}</b>${o.st?" · "+esc(o.st):""}${o.sub?" · "+esc(o.sub):""}<br><span class="muted">${esc(o.l)}</span><br>
    ${S.wq===o.id?`<textarea id="wqt" rows="2" style="width:100%" placeholder="What you ask the child, or the task you give"></textarea><div style="margin-top:4px"><button class="primary" id="wqsave" style="margin:0 6px 0 0;padding:6px 14px">Save question</button>${btn('id="wqcancel"',"Cancel")}</div>`:btn(`data-wq="${o.id}"`,"Write a question")}</div>`).join(""):'<p class="muted">Every outcome in this area has a question.</p>'}</details>
  <div class="panel"><h2>Add a question</h2>
  <p><label class="muted">Shown on screen (word, number or emoji)<br><input type="text" id="bs" size="30"></label></p>
  <p><label class="muted">Question A: what you ask the child<br><input type="text" id="bq" size="44"></label></p>
  <p><label class="muted">Question B (optional alternative)<br><input type="text" id="bb" size="44"></label></p>
  <p><label class="muted">What a good answer looks like<br><input type="text" id="bl" size="44"></label></p>
  ${TOUCH_OK?`<p><label class="muted">Touch or spoken version for blind learners (optional)<br><input type="text" id="btv" size="44" placeholder="For example: Give the child 3 bottle tops to count"></label></p>`:""}
  <p><label class="muted">Strand (optional, for example Listening)<br><input type="text" id="bt" size="24"></label></p>
  <button class="primary" id="addq" style="margin-top:0">Add question</button> <span class="muted" id="bmsg" role="status"></span></div>`;
}
function bindBank(){
  const c=pickCls(S.cls),ba=S.ba||0,reload=async()=>{await loadQuestions();render()};
  document.querySelectorAll(".chip").forEach(b=>b.onclick=()=>{S.cls=b.dataset.c;S.eq=null;S.wq=null;S.et=null;render()});
  document.querySelectorAll(".tab").forEach(b=>b.onclick=()=>{S.ba=+b.dataset.a;S.eq=null;S.wq=null;S.et=null;render()});
  document.querySelectorAll("[data-del]").forEach(b=>b.onclick=async()=>{
    try{await run(sb.from("question_variants").delete().eq("competency_id",+b.dataset.del));await run(sb.from("competencies").delete().eq("id",+b.dataset.del));await reload()}catch(e){fail(e)}});
  document.querySelectorAll("[data-ap]").forEach(b=>b.onclick=async()=>{
    try{await run(sb.from("question_variants").update({status:"approved",approved_by:ME.id,...(TOUCH_OK?{touch_status:"approved"}:{})}).eq("competency_id",+b.dataset.ap).eq("status","pending"));await reload()}catch(e){fail(e)}});
  document.querySelectorAll("[data-rj]").forEach(b=>b.onclick=async()=>{
    try{await run(sb.from("question_variants").update({status:"rejected"}).eq("competency_id",+b.dataset.rj).eq("status","pending"));await reload()}catch(e){fail(e)}});
  document.querySelectorAll("[data-eq]").forEach(b=>b.onclick=()=>{S.eq=+b.dataset.eq;render()});
  const ec=$("eqcancel");if(ec)ec.onclick=()=>{S.eq=null;render()};
  const es=$("eqsave");if(es)es.onclick=async()=>{
    const q=Q[c][ba].find(x=>x.id===S.eq),t=$("eqt").value.trim();if(!q||!t)return;
    try{await run(sb.from("question_variants").update({prompt:t}).eq("id",q.va));S.eq=null;await reload()}catch(e){fail(e)}};
  const qva=id=>(Q[c][ba].find(x=>x.id===id)||{}).va;
  document.querySelectorAll("[data-et]").forEach(b=>b.onclick=()=>{S.et=+b.dataset.et;render()});
  const etc=$("etcancel");if(etc)etc.onclick=()=>{S.et=null;render()};
  const ets=$("etsave");if(ets)ets.onclick=async()=>{
    const t=$("ett").value.trim(),va=qva(S.et);if(!va||S.saving)return;S.saving=true;
    try{await run(sb.from("question_variants").update(t?{touch:t,touch_status:"approved"}:{touch:null,touch_status:"pending"}).eq("id",va));S.et=null;await reload()}catch(e){fail(e)}finally{S.saving=false}};
  document.querySelectorAll("[data-tap]").forEach(b=>b.onclick=async()=>{
    try{await run(sb.from("question_variants").update({touch_status:"approved"}).eq("id",qva(+b.dataset.tap)));await reload()}catch(e){fail(e)}});
  document.querySelectorAll("[data-trm]").forEach(b=>b.onclick=async()=>{
    try{await run(sb.from("question_variants").update({touch:null,touch_status:"pending"}).eq("id",qva(+b.dataset.trm)));await reload()}catch(e){fail(e)}});
  const bkt=$("bk_touch");if(bkt)bkt.onclick=async()=>{if(S.saving)return;S.saving=true;S.aiBusy="touch";S.err="";rr();try{await draftTouch(c,ba)}catch(e){S.err=e.message}finally{S.aiBusy=null;S.saving=false}try{await reload()}catch(e){fail(e)}};
  const bkai=$("bk_ai");if(bkai)bkai.onclick=async()=>{if(S.saving)return;S.saving=true;S.aiBusy="bank";S.err="";rr();try{await draftBank(c,ba)}catch(e){S.err=e.message}finally{S.aiBusy=null;S.saving=false}try{await reload()}catch(e){fail(e)}};
  document.querySelectorAll("[data-wq]").forEach(b=>b.onclick=()=>{S.wq=+b.dataset.wq;render()});
  const wc=$("wqcancel");if(wc)wc.onclick=()=>{S.wq=null;render()};
  const ws=$("wqsave");if(ws)ws.onclick=async()=>{
    const t=$("wqt").value.trim();if(!t||S.saving)return;S.saving=true;
    try{await run(sb.from("question_variants").insert({competency_id:S.wq,variant:"A",shown:"💬",prompt:t,source:"teacher",status:isAdmin()?"approved":"pending",created_by:ME.id}));S.wq=null;await reload()}
    catch(e){fail(e)}finally{S.saving=false}};
  $("addq").onclick=async()=>{
    const v=id=>$(id).value.trim(),a=v("bq");
    if(!a){$("bmsg").textContent="Enter what you ask the child.";return}
    if(S.saving)return;S.saving=true;
    try{
      const head=isAdmin(),code="TQ"+Date.now().toString(36).toUpperCase();
      const comp=await run(sb.from("competencies").insert({code,class_id:CLASSIDS[c],area_id:AID(c,ba),strand:v("bt")||null,description:v("bl")||"Use your own judgement.",source:"teacher",created_by:ME.id}).select("id").single());
      const base={competency_id:comp.id,shown:v("bs")||"💬",source:"teacher",status:head?"approved":"pending",created_by:ME.id,...(TOUCH_OK?{touch:null,touch_status:"pending"}:{})};
      const tv=TOUCH_OK?v("btv"):"";
      const vs=[{...base,variant:"A",prompt:a,...(tv?{touch:tv,touch_status:head?"approved":"pending"}:{})}];
      if(v("bb"))vs.push({...base,variant:"B",prompt:v("bb")});
      await run(sb.from("question_variants").insert(vs));
      await reload();
    }catch(e){fail(e)}finally{S.saving=false}};
}

/* ---------- attendance ---------- */
// Learners: present, late or absent (with a reason), plus a 30-day watch list. Teachers: present, late, absent or on leave.
const AT={cls:"",date:"",marks:{},late:{},reason:{},hist:[],loaded:false,msg:""};
const TA={date:"",rows:{},hist:[],loaded:false,msg:""};
const REASONS=["Sick","Family matter","Transport","Weather","Not known","Other"];
const SDAYS=30,STAT={present:"Present",late:"Late",absent:"Absent",leave:"On leave"};
async function loadDay(){
  AT.marks={};AT.late={};AT.reason={};AT.hist=[];AT.loaded=false;
  if(!visCls().includes(AT.cls))AT.cls=visCls()[0]||"PP1";
  const ids=L.filter(l=>l.cls===AT.cls).map(l=>l.id),cols="learner_id,day,present"+(ATX_OK?",late,reason":"");
  if(ids.length){
    const rows=await run(sb.from("attendance").select(cols).gte("day",addDays(-SDAYS)).in("learner_id",ids).order("day").range(0,4999));
    AT.hist=rows;
    rows.filter(r=>r.day===AT.date).forEach(r=>{AT.marks[r.learner_id]=r.present;AT.late[r.learner_id]=!!r.late;AT.reason[r.learner_id]=r.reason||""});
  }
  AT.loaded=true;
}
// For each learner in the class, over the last 30 days: counts and the run of absences up to the latest marked day.
function attSummary(){
  return L.filter(l=>l.cls===AT.cls).map(l=>{
    const rows=AT.hist.filter(r=>r.learner_id===l.id).sort((a,b)=>b.day.localeCompare(a.day));
    const n=rows.length,p=rows.filter(r=>r.present).length,late=rows.filter(r=>r.present&&r.late).length;
    let streak=0;for(const r of rows){if(r.present)break;streak++}
    const pct=n?Math.round(100*p/n):null,flags=[];
    if(streak>=3)flags.push(`Absent ${streak} days in a row`);
    if(pct!==null&&n>=5&&pct<80)flags.push(`Present only ${pct}% of days`);
    if(late>=3)flags.push(`Late ${late} times`);
    return {l,n,p,late,streak,pct,flags}});
}
function attView(){
  if(!AT.date)AT.date=todayStr();
  if(!TA.date)TA.date=AT.date;
  const tab=S.attTab==="staff"?"staff":"learners";
  const tabs=`<div class="tabs" role="tablist" aria-label="Registers"><button class="tab" role="tab" data-atab="learners" aria-selected="${tab==="learners"}" tabindex="${tab==="learners"?0:-1}">Learners</button><button class="tab" role="tab" data-atab="staff" aria-selected="${tab==="staff"}" tabindex="${tab==="staff"?0:-1}">Teachers</button></div>`;
  return tabs+(tab==="staff"?staffAttView():learnerAttView());
}
function learnerAttView(){
  if(!visCls().includes(AT.cls))AT.cls=visCls()[0]||"PP1";
  const rows=L.filter(l=>l.cls===AT.cls),marked=rows.filter(l=>AT.marks[l.id]!==undefined).length;
  const pres=rows.filter(l=>AT.marks[l.id]===true).length,abs=rows.filter(l=>AT.marks[l.id]===false).length,lt=rows.filter(l=>AT.marks[l.id]===true&&AT.late[l.id]).length;
  const sm=AT.loaded?attSummary():[],flagged=sm.filter(x=>x.flags.length);
  const state=id=>AT.marks[id]===undefined?"":AT.marks[id]===false?"a":AT.late[id]?"l":"p";
  const b=(l,v,label)=>`<button class="sm" style="min-width:84px" data-at="${l.id}" data-v="${v}" aria-pressed="${state(l.id)===v}">${label}</button>`;
  return `<p class="muted" style="margin-top:0">Mark who is at school each day. Add a reason when a child is absent. The attendance percentages on the learner pages come from these marks.</p>
  <div class="tools">${visCls().map(c=>`<button class="chip" data-c="${c}" aria-pressed="${AT.cls===c}">${c} · ${esc(TEACH[c]||"")}</button>`).join("")}
   <label class="muted">Date <input type="date" id="atd" value="${AT.date}" max="${todayStr()}"></label></div>
  ${!AT.loaded?'<p class="muted">Loading…</p>':`<div class="panel"><h2>${AT.cls} · ${esc(fmtDate(AT.date+"T00:00:00"))}</h2>
   <p class="muted">${pres} present${lt?` (${lt} late)`:""} · ${abs} absent · ${rows.length-marked} not marked</p>
   <p><button class="ghost" id="atall">Mark everyone present</button></p>
   ${rows.length?rows.map(l=>`<div class="areaRow"><span style="display:flex;gap:10px;align-items:center;min-width:200px">${av(l,36)}<b>${esc(l.name)}</b>${l.att!==null?`<span class="muted">${l.att}% overall</span>`:""}</span>
    <div class="pick">${b(l,"p","Present")}${b(l,"l","Late")}${b(l,"a","Absent")}</div>
    ${state(l.id)==="a"?(ATX_OK?`<label class="muted">Reason <select data-rs="${l.id}"><option value="">Choose</option>${REASONS.map(x=>`<option ${AT.reason[l.id]===x?"selected":""}>${x}</option>`).join("")}</select></label>`:""):""}</div>`).join(""):'<p class="muted">No learners in this class yet.</p>'}
   <button class="primary" id="atsave">Save attendance</button> <span class="toast" role="status">${esc(AT.msg)}</span></div>
  <div class="panel"><h2>Watch list · last ${SDAYS} days</h2>
   ${flagged.length?flagged.map(x=>`<div class="nt"><b>${esc(x.l.name)}</b> <span class="muted">${x.pct!==null?x.pct+"% present":""}</span><br>${x.flags.map(f=>`<span class="tag warn">${esc(f)}</span>`).join(" ")}</div>`).join(""):'<p class="muted" style="margin:0">No learner needs a follow-up call right now.</p>'}
   ${sm.some(x=>x.n)?`<div class="scroll" style="margin-top:10px"><table><thead><tr><th>Learner</th><th>Days marked</th><th>Present</th><th>Late</th><th>Absent</th><th>Rate</th></tr></thead><tbody>${sm.map(x=>`<tr><td>${esc(x.l.name)}</td><td>${x.n}</td><td>${x.p}</td><td>${x.late}</td><td>${x.n-x.p}</td><td>${x.pct!==null?x.pct+"%":"—"}</td></tr>`).join("")}</tbody></table></div>`:""}</div>`}`;
}

/* teachers */
const staffList=()=>STAFFROWS.slice().sort((a,b)=>a.name.localeCompare(b.name));
async function loadStaffDay(){
  TA.rows={};TA.loaded=false;
  const rows=await run(sb.from("staff_attendance").select("staff_id,day,status,time_in,note").gte("day",addDays(-SDAYS)).order("day").range(0,4999));
  TA.hist=rows;rows.filter(r=>r.day===TA.date).forEach(r=>{TA.rows[r.staff_id]={status:r.status,time_in:r.time_in||"",note:r.note||""}});
  TA.loaded=true;
}
function staffAttView(){
  if(!ATX_OK)return `<div class="note watch">Teacher attendance needs migration-6.sql. Run it in Supabase, then refresh this page.</div>`;
  const adm=isAdmin(),list=adm?staffList():staffList().filter(s=>s.id===ME.id);
  const cnt=(id,st)=>TA.hist.filter(r=>r.staff_id===id&&r.status===st).length;
  const cls=id=>CLASSES.filter(c=>TEACHID[c]===id).join(", ");
  const b=(s,v)=>`<button class="sm" style="min-width:84px" data-sa="${s.id}" data-v="${v}" aria-pressed="${(TA.rows[s.id]||{}).status===v}" ${adm?"":"disabled"}>${STAT[v]}</button>`;
  return `<p class="muted" style="margin-top:0">${adm?"Record each teacher's day. A teacher sees only their own record.":"Your own attendance record."}</p>
  <div class="tools"><label class="muted">Date <input type="date" id="sad" value="${TA.date}" max="${todayStr()}"></label></div>
  ${!TA.loaded?'<p class="muted">Loading…</p>':`<div class="panel"><h2>Teachers · ${esc(fmtDate(TA.date+"T00:00:00"))}</h2>
   ${adm?'<p><button class="ghost" id="saall">Mark everyone present</button></p>':""}
   ${list.length?list.map(s=>{const r=TA.rows[s.id]||{};return `<div class="areaRow"><span style="min-width:200px"><b>${esc(s.name)}</b><br><span class="muted">${esc(ROLEN[s.role]||"")}${cls(s.id)?" · "+cls(s.id):""}</span></span>
    <div class="pick">${["present","late","absent","leave"].map(v=>b(s,v)).join("")}</div>
    ${adm&&(r.status==="present"||r.status==="late")?`<label class="muted">Arrived <input type="text" size="6" placeholder="07:45" data-st="${s.id}" value="${esc(r.time_in||"")}"></label>`:""}
    ${adm&&r.status&&r.status!=="present"?`<label class="muted">Note <input type="text" size="18" data-sn="${s.id}" value="${esc(r.note||"")}"></label>`:""}
    ${!adm&&r.status?`<span class="muted">${esc(STAT[r.status])}${r.time_in?" · "+esc(r.time_in):""}${r.note?" · "+esc(r.note):""}</span>`:""}</div>`}).join(""):'<p class="muted">No staff found.</p>'}
   ${adm?`<button class="primary" id="sasave">Save teacher attendance</button> `:""}<span class="toast" role="status">${esc(TA.msg)}</span></div>
  <div class="panel"><h2>Last ${SDAYS} days</h2><div class="scroll"><table><thead><tr><th>Teacher</th><th>Present</th><th>Late</th><th>Absent</th><th>On leave</th><th>Punctuality</th></tr></thead><tbody>
   ${list.map(s=>{const p=cnt(s.id,"present"),l=cnt(s.id,"late"),a=cnt(s.id,"absent"),v=cnt(s.id,"leave"),worry=l>=3||a>=3;
    return `<tr><td>${esc(s.name)}${worry?' <span class="tag warn">Check in</span>':""}</td><td>${p}</td><td>${l}</td><td>${a}</td><td>${v}</td><td>${p+l?Math.round(100*p/(p+l))+"%":"—"}</td></tr>`}).join("")}</tbody></table></div>
   <p class="muted" style="margin:8px 0 0">Punctuality is the share of days at school that were on time. "Check in" appears after three late days or three absent days in the period.</p></div>`}`;
}
function bindAtt(){
  const tab=S.attTab==="staff"?"staff":"learners";
  bindTabs();
  document.querySelectorAll("[data-atab]").forEach(b=>b.onclick=async()=>{S.attTab=b.dataset.atab;S.focusTab=b.dataset.atab;AT.msg="";TA.msg="";render()});
  if(tab==="staff"){
    const d=$("sad");if(d)d.onchange=async e=>{TA.date=e.target.value||todayStr();TA.msg="";try{await loadStaffDay()}catch(er){return fail(er)}render()};
    document.querySelectorAll("[data-sa]").forEach(b=>b.onclick=()=>{const id=b.dataset.sa,r=TA.rows[id]=TA.rows[id]||{time_in:"",note:""};r.status=b.dataset.v;TA.msg="";rr()});
    document.querySelectorAll("[data-st]").forEach(i=>i.onchange=()=>{(TA.rows[i.dataset.st]=TA.rows[i.dataset.st]||{}).time_in=i.value.trim()});
    document.querySelectorAll("[data-sn]").forEach(i=>i.onchange=()=>{(TA.rows[i.dataset.sn]=TA.rows[i.dataset.sn]||{}).note=i.value.trim()});
    const all=$("saall");if(all)all.onclick=()=>{staffList().forEach(s=>{if(!TA.rows[s.id])TA.rows[s.id]={status:"present",time_in:"",note:""}});TA.msg="";rr()};
    const sv=$("sasave");if(sv)sv.onclick=async()=>{
      const rows=Object.entries(TA.rows).filter(([,r])=>r.status).map(([id,r])=>({staff_id:id,day:TA.date,status:r.status,time_in:r.time_in||null,note:r.note||null,marked_by:ME.id}));
      if(!rows.length){S.err="Mark at least one teacher first.";render();return}
      if(S.saving)return;S.saving=true;
      try{await run(sb.from("staff_attendance").upsert(rows,{onConflict:"staff_id,day"}));await loadStaffDay();TA.msg=`Saved for ${rows.length} teacher${rows.length===1?"":"s"}.`;S.err="";rr()}
      catch(e){fail(e)}finally{S.saving=false}};
    return;
  }
  document.querySelectorAll(".chip").forEach(b=>b.onclick=async()=>{AT.cls=b.dataset.c;AT.msg="";try{await loadDay()}catch(e){return fail(e)}render()});
  $("atd").onchange=async e=>{AT.date=e.target.value||todayStr();AT.msg="";try{await loadDay()}catch(er){return fail(er)}render()};
  const all=$("atall");if(all)all.onclick=()=>{L.filter(l=>l.cls===AT.cls).forEach(l=>{AT.marks[l.id]=true;AT.late[l.id]=false});AT.msg="";rr()};
  document.querySelectorAll("[data-at]").forEach(b=>b.onclick=()=>{const id=b.dataset.at,v=b.dataset.v;AT.marks[id]=v!=="a";AT.late[id]=v==="l";if(v!=="a")AT.reason[id]="";AT.msg="";rr()});
  document.querySelectorAll("[data-rs]").forEach(x=>x.onchange=()=>{AT.reason[x.dataset.rs]=x.value});
  const sv=$("atsave");if(sv)sv.onclick=async()=>{
    const rows=L.filter(l=>l.cls===AT.cls&&AT.marks[l.id]!==undefined).map(l=>({learner_id:l.id,day:AT.date,present:AT.marks[l.id],...(ATX_OK?{late:!!AT.late[l.id],reason:AT.marks[l.id]?null:(AT.reason[l.id]||null)}:{})}));
    if(!rows.length){S.err="Mark at least one learner first.";render();return}
    if(S.saving)return;S.saving=true;
    try{await run(sb.from("attendance").upsert(rows,{onConflict:"learner_id,day"}));await loadAttendance();await loadDay();AT.msg=`Saved for ${rows.length} learner${rows.length===1?"":"s"}.`;S.err="";rr()}
    catch(e){fail(e)}finally{S.saving=false}};
}

/* ---------- add learners (director) ---------- */
const AD={ai:false,single:{name:"",cls:"",year:"",joined:"",gname:"",gphone:""},bulk:"",preview:null,msg:""};
function parseBulk(text){
  const have=new Set(L.map(l=>l.name.toLowerCase()+"|"+l.cls)),seen=new Set(),thisYear=new Date().getFullYear(),rows=[];
  text.split(/\r?\n/).map(x=>x.trim()).filter(Boolean).forEach((line,i)=>{
    const [name="",c="",y="",gname="",gphone=""]=line.split(",").map(x=>x.trim()),cls=c.toUpperCase(),r={n:i+1,name,cls,year:y,gname,gphone,status:"ok",msg:"Ready"};
    if(!name){r.status="error";r.msg="Name is missing"}
    else if(!classList().includes(cls)){r.status="error";r.msg="Class must be "+classList().join(", ")}
    else if(y&&!(/^\d{4}$/.test(y)&&+y>=2010&&+y<=thisYear)){r.status="error";r.msg="Birth year should be four digits, like 2021"}
    else if(gphone&&!gname){r.status="error";r.msg="A phone number needs a guardian name"}
    else if(have.has(name.toLowerCase()+"|"+cls)){r.status="dup";r.msg="Already in the system, will be skipped"}
    else if(seen.has(name.toLowerCase()+"|"+cls)){r.status="dup";r.msg="Listed twice, will be skipped"}
    else seen.add(name.toLowerCase()+"|"+cls);
    rows.push(r)});
  return rows;
}
async function addOne(r,joined,ai,tier){
  const lr=await run(sb.from("learners").insert({full_name:r.name,class_id:CLASSIDS[r.cls],birth_year:r.year?+r.year:null,joined_on:joined||todayStr()}).select("id").single());
  if(r.gname)await run(sb.from("guardians").insert({learner_id:lr.id,name:r.gname,phone:r.gphone||null}));
  if(ai)await run(sb.from("learner_consents").insert({learner_id:lr.id,kind:"gemini",granted_by:r.gname||null,recorded_by:ME.id}));
  if(TIER_OK&&tier){
    await run(sb.from("learner_tiers").insert({learner_id:lr.id,declared:tier.declared,...(tier.declared==="none"?{confirmed_tier:"A",confirmed_by:ME.id,confirmed_at:new Date().toISOString()}:{})}));
    if(tier.report&&tier.report.trim())await run(sb.from("learner_reports").insert({learner_id:lr.id,report:tier.report.trim(),updated_by:ME.id}));
  }
  return lr.id;
}
// Starter goals and questions for children who were just added. If it fails, the teacher can press the button on the profile.
async function makeStarter(ids){
  let ok=0;
  for(const id of ids){const l=byId(id);if(!l)continue;try{await requestAI(l);ok++}catch(e){console.warn("Starter plan failed:",e&&e.message)}}
  return ok;
}
function addView(){
  const s=AD.single,pv=AD.preview,okRows=pv?pv.filter(r=>r.status==="ok"):[];
  return `<p class="muted" style="margin-top:0">The director and the senior teacher can add learners. Add one child with the form, or paste a list to add many at once.</p>
  ${AD.msg?`<div class="note good">${esc(AD.msg)}</div>`:""}
  ${SUP_OK&&AI_OK?`<div class="panel"><label><input type="checkbox" id="a_ai" ${AD.ai?"checked":""}> <b>Make starter goals and questions with AI.</b> The guardian has signed the AI consent form.</label>
   <p class="muted" style="margin:4px 0 0">When ticked, the consent is recorded and the AI suggests starter goals and questions for each child added below, using only class and age. A teacher approves them before they are used.</p></div>`:""}
  <div class="panel"><h2>Add one learner</h2>
   <div class="row2">
    <label class="muted" style="flex:2;min-width:200px">Full name<br><input type="text" id="a_name" style="width:100%" value="${esc(s.name)}"></label>
    <label class="muted">Class<br><select id="a_cls">${classList().map(c=>`<option ${(s.cls||"PP1")===c?"selected":""}>${c}</option>`).join("")}</select></label>
    <label class="muted">Birth year<br><input type="text" id="a_year" size="6" placeholder="2021" value="${esc(s.year)}"></label>
    <label class="muted">Joined<br><input type="date" id="a_joined" value="${esc(s.joined||todayStr())}"></label></div>
   <div class="row2" style="margin-top:8px">
    <label class="muted" style="flex:2;min-width:200px">Guardian name<br><input type="text" id="a_gname" style="width:100%" value="${esc(s.gname)}"></label>
    <label class="muted" style="flex:1;min-width:160px">Guardian phone<br><input type="text" id="a_gphone" style="width:100%" placeholder="0712 345 678" value="${esc(s.gphone)}"></label></div>
   ${TIER_OK?`<fieldset style="border:2px solid var(--line);border-radius:10px;margin:12px 0 0;padding:10px 12px"><legend class="muted">Disability and support tier</legend>
    <div class="pick" role="radiogroup" aria-label="Does the child have a disability?">${Object.entries(DECL).map(([k,v])=>`<label style="display:flex;gap:6px;align-items:center;border:2px solid var(--line);border-radius:10px;padding:8px 12px"><input type="radio" name="a_decl" value="${k}" ${(s.decl||"none")===k?"checked":""}> ${v}</label>`).join("")}</div>
    <label class="muted" style="display:block;margin-top:8px">Doctor’s report (type or paste the main findings, needed for some or severe disability)<br><textarea id="a_report" rows="5" style="width:100%">${esc(s.report||"")}</textarea></label>
    <p class="muted" style="margin:6px 0 0">No disability: the child is Tier A straight away. Some or severe: if the AI consent box above is ticked, the AI suggests Tier A, B or C from the report, with the child’s and guardian’s names removed. The director or a senior teacher then confirms the tier. Without the consent, set the tier by hand on the child’s page.</p></fieldset>`:""}
   <button class="primary" id="a_save">Add learner</button></div>
  <div class="panel"><h2>Add many learners</h2>
   <p class="muted">Paste one learner per line, with commas between: full name, class, birth year, guardian name, guardian phone. The class must be PG, PP1 or PP2. The last three can be left empty. Children added this way have no tier yet: open each child to set it. For example:</p>
   <p><code>Amina Wanjiku, PP1, 2021, Grace Wanjiku, 0712 345 678</code></p>
   <textarea id="a_bulk" rows="7" style="width:100%" aria-label="List of learners">${esc(AD.bulk)}</textarea>
   <p><button class="ghost" id="a_prev">Check the list</button></p>
   ${pv?(pv.length?`<div class="scroll"><table style="min-width:620px"><thead><tr><th>#</th><th>Name</th><th>Class</th><th>Birth year</th><th>Guardian</th><th>Phone</th><th>Check</th></tr></thead><tbody>${pv.map(r=>`<tr><td>${r.n}</td><td>${esc(r.name)}</td><td>${esc(r.cls)}</td><td>${esc(r.year)}</td><td>${esc(r.gname)}</td><td>${esc(r.gphone)}</td><td><span class="tag ${r.status==="ok"?"ok":"warn"}">${esc(r.msg)}</span></td></tr>`).join("")}</tbody></table></div>
    <p class="muted">${okRows.length} ready to add · ${pv.length-okRows.length} will be skipped.</p>
    <button class="primary" id="a_imp" ${okRows.length?"":"disabled"} style="margin-top:0">Add ${okRows.length} learner${okRows.length===1?"":"s"}</button>`:'<p class="muted">The list is empty.</p>'):""}</div>`;
}
function bindAdd(){
  const v=id=>$(id).value.trim();
  $("a_save").onclick=async()=>{
    const r={name:v("a_name"),cls:v("a_cls"),year:v("a_year"),gname:v("a_gname"),gphone:v("a_gphone")};
    const decl=(document.querySelector('input[name="a_decl"]:checked')||{}).value||"none",report=$("a_report")?$("a_report").value:"";
    AD.single={...r,joined:$("a_joined").value,decl,report};
    const bad=parseBulk([r.name,r.cls,r.year,r.gname,r.gphone].join(","))[0];
    if(bad.status!=="ok"){S.err=bad.status==="dup"?`${r.name} is already in ${r.cls}.`:bad.msg+".";render();return}
    if(S.saving)return;S.saving=true;
    const ai=!!($("a_ai")&&$("a_ai").checked);AD.ai=ai;
    try{let tierNote="";const id=await addOne(r,AD.single.joined,ai,{declared:decl,report});AD.single={name:"",cls:r.cls,year:"",joined:"",gname:"",gphone:"",decl:"none",report:""};AD.msg=`${r.name} was added to ${r.cls}.`;S.err="";await loadAll();
      if(ai){AD.msg+=" Making starter goals and questions…";render();if(TIER_OK&&decl!=="none"&&report.trim().length>=20){try{await requestTier(byId(id),report);tierNote="A tier was suggested for confirmation. "}catch(e){tierNote="The AI could not suggest a tier ("+e.message+"). Set it by hand on their page. "}}const n=await makeStarter([id]);AD.msg=`${r.name} was added to ${r.cls}. ${tierNote}`+(n?"Starter goals and questions are waiting for approval on their profile.":"The AI could not make starter suggestions. Open their profile and press the suggest button.")}
      render()}
    catch(e){fail(e)}finally{S.saving=false}};
  $("a_prev").onclick=()=>{AD.bulk=$("a_bulk").value;AD.preview=parseBulk(AD.bulk);AD.msg="";render()};
  const imp=$("a_imp");if(imp)imp.onclick=async()=>{
    const rows=(AD.preview||[]).filter(r=>r.status==="ok");if(!rows.length||S.saving)return;S.saving=true;
    let added=0;const ids=[],ai=!!($("a_ai")&&$("a_ai").checked);AD.ai=ai;
    try{for(const r of rows){ids.push(await addOne(r,undefined,ai));added++}AD.msg=`${added} learner${added===1?"":"s"} added.`;AD.bulk="";AD.preview=null;S.err=""}
    catch(e){S.err=`Stopped after adding ${added} of ${rows.length}. ${e.message} Check the list again before adding the rest: names already added are skipped.`;AD.preview=null}
    finally{S.saving=false}
    try{await loadAll()}catch(e){}
    if(ai&&ids.length){AD.msg+=" Making starter goals and questions…";render();const n=await makeStarter(ids);AD.msg=AD.msg.replace(" Making starter goals and questions…",` Starter goals and questions were made for ${n} of ${ids.length}. They wait for approval on each profile.`)}
    render()};
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
   <div class="stat"><b>${overdue.length}</b><span>Overdue follow-up actions</span></div>${SUP_OK?supStats():""}</div>
  <div class="panel"><h2>Scores to discuss</h2><p class="muted">The teacher and director scored the same question 2 or more points apart in ${esc(CUR)}. Talk it over and record what was agreed. If a score needs correcting, do that on the child’s profile.</p>
  ${todo.length?`<div class="scroll"><table style="min-width:780px"><thead><tr><th>Learner</th><th>Question</th><th>Teacher</th><th>Director</th><th>Gap</th><th>What was agreed</th><th></th></tr></thead><tbody>${todo.map((r,i)=>{const c=COMP[r.competency_id]||{};
    return `<tr><td><b>${esc(who(r.learner_id))}</b></td><td>${esc(c.code||"")}<br><span class="muted">${c.a!==undefined?AREAS[c.a].n:""}</span></td><td>${r.teacher_score}</td><td>${r.director_score}</td><td>${r.gap}</td>
    <td>${ME.role==="head"?`<input type="text" id="rvr${i}" placeholder="Reason or agreement" style="width:100%;min-width:180px">`:'<span class="muted">The director records this</span>'}</td>
    <td>${ME.role==="head"?`<button class="ghost" data-rv="${i}" style="padding:2px 10px;font-size:.8rem">Record</button>`:""}</td></tr>`}).join("")}</tbody></table></div>`:'<p class="muted">Nothing to discuss right now.</p>'}</div>`;
  h+=`<div class="panel"><h2>Overdue follow-up actions</h2>${overdue.length?`<div class="scroll"><table><thead><tr><th>Learner</th><th>Action</th><th>Owner</th><th>Was due</th><th></th></tr></thead><tbody>${overdue.map(a=>`<tr><td>${esc(who(a.learner_id))}</td><td>${esc(a.action)}</td><td>${esc(STAFF[a.owner_id]||"")}</td><td>${esc(fmtDate(a.due_date+"T00:00:00"))}</td><td><button class="ghost" data-open="${a.learner_id}" style="padding:2px 10px;font-size:.8rem">Open</button></td></tr>`).join("")}</tbody></table></div>`:'<p class="muted">None. Every open action is on time.</p>'}</div>`;
  if(TD.rev.length)h+=`<div class="panel"><h2>Recently discussed</h2>${[...TD.rev].sort((a,b)=>b.reviewed_at.localeCompare(a.reviewed_at)).slice(0,5).map(r=>`<div class="nt"><span class="muted">${esc(fmtDate(r.reviewed_at))} · ${esc(who(r.learner_id))} · ${esc((COMP[r.competency_id]||{}).code||"")}</span><br>${esc(r.reason)}</div>`).join("")}</div>`;
  if(SUP_OK)h+=goalDuePanel();
  if(AI_OK)h+=aiWaitPanel();
  h+=`<div class="panel"><h2>Teaching insights</h2><p class="muted">Average score change per learning area, from each learner’s first completed term to their latest. Use this to coach and share what works, not to rank teachers.</p>
  <div class="scroll"><table><thead><tr><th>Class</th><th>Teacher</th>${AREAS.map(a=>`<th>${a.n}</th>`).join("")}</tr></thead><tbody>`;
  classList().forEach(c=>{const g=L.filter(l=>l.cls===c&&l.scores.length>1);
    h+=`<tr><td><b>${c}</b> (${L.filter(l=>l.cls===c).length})</td><td>${esc(TEACH[c]||"")}</td>${AREAS.map(a=>{
      if(!g.length)return "<td>—</td>";
      const d=avg(g.map(l=>last(l)[a.k]))-avg(g.map(l=>first(l)[a.k]));
      return `<td><b style="color:var(${d>0.05?'--good':d<-0.05?'--warn':'--muted'})">${d>0?'+':''}${f1(d)}</b></td>`}).join("")}</tr>`});
  h+=`</tbody></table></div><div class="note tip">Each class is small, so one child can swing these numbers. Compare several terms before drawing conclusions about teaching.</div></div>
  <div class="panel"><h2>Teacher and director agreement</h2><p class="muted">How closely the teacher and the director score the same child on the same question. This shows how consistently the two judge, not how well a class is doing.</p>
  <div class="scroll"><table><thead><tr><th>Class</th><th>Teacher</th><th>Questions scored by both</th><th>Average gap</th><th>Within 1 point</th></tr></thead><tbody>`;
  classList().forEach(c=>{const ids=new Set(L.filter(l=>l.cls===c).map(l=>l.id)),gaps=AGR.filter(r=>ids.has(r.learner_id)).map(r=>r.gap);
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

/* ---------- data backup (director) ---------- */
// Supabase's free plan keeps no backups, so the director downloads one here, at least once a month.
// The file holds every record, including health information, so it is locked with a password (AES-256-GCM, key from
// PBKDF2-SHA256). SQL/backup/make-restore.py opens it and turns it into a restore file for a new database.
// Every table, with a sort order that is unique, so reading in pages of 1,000 never skips or repeats a row.
const BK_TABLES=[["staff",["id"]],["classes",["id"]],["learners",["id"]],["guardians",["id"]],["learning_areas",["id"]],["terms",["id"]],["competencies",["id"]],
 ["question_variants",["id"]],["assessment_records",["id"]],["teacher_notes",["id"]],["attendance",["learner_id","day"]],["ai_insights",["id"]],["audit_log",["id"]],
 ["parent_messages",["id"]],["follow_up_actions",["id"]],["score_reviews",["id"]],["learner_consents",["id"]],["learner_support_profiles",["learner_id"]],
 ["learner_health_notes",["learner_id"]],["learner_needs",["id"]],["learner_accommodations",["id"]],["learner_goals",["id"]],["goal_progress",["id"]],
 ["learner_questions",["id"]],["learner_question_records",["id"]],["staff_attendance",["id"]],["learner_tiers",["learner_id"]],["learner_reports",["learner_id"]],
 ["curriculum_items",["id"]],["curriculum_coverage",["id"]],["check_records",["id"]],["assessment_notes",["id"]],["report_comments",["learner_id","term_id"]]];
const BK={busy:false,msg:"",err:"",done:""};
const lastBackup=()=>{try{return localStorage.getItem("matan_last_backup")||""}catch(e){return ""}};
const backupDue=()=>{const d=lastBackup();return !d||daysSince(d)>30};
async function bkRead(t,ord){
  let out=[],i=0;
  for(;;){let q=sb.from(t).select("*");ord.forEach(o=>{q=q.order(o)});const d=await run(q.range(i,i+999));out=out.concat(d);if(d.length<1000)return out;i+=1000}
}
function backupPanel(){
  if(!isHead())return "";
  const d=lastBackup();
  return `<div class="panel" id="backup"><h2>Data backup</h2>
  <p class="muted" style="margin-top:0">Supabase’s free plan keeps <b>no backups</b>. If the database is lost or damaged, this file is the only copy of the children’s records. Download one at least once a month, and before any big change.</p>
  <ul class="muted" style="margin:0 0 10px 18px;padding:0">
   <li>The file holds every child’s records, including health information, so it is locked with a password you choose here.</li>
   <li>Keep the password somewhere safe and separate from the file. <b>Without it the backup cannot be opened, by anyone.</b></li>
   <li>Keep the file on the school computer or a USB stick that is locked away. Never send it by WhatsApp or email. Delete old copies you no longer need.</li></ul>
  <p style="margin:0 0 8px">${d?`Last backup on this computer: <b>${esc(fmtDate(d))}</b>${backupDue()?' <span class="tag warn">due</span>':""}`:'<span class="tag warn">No backup downloaded on this computer yet</span>'}</p>
  <div class="facts" style="max-width:560px;margin:0 0 10px">
   <label class="muted">Backup password (at least 10 characters)<br><input type="password" id="bk_pw" autocomplete="new-password" style="width:100%"></label>
   <label class="muted">Type it again<br><input type="password" id="bk_pw2" autocomplete="new-password" style="width:100%"></label></div>
  <button class="primary" id="bk_go" ${BK.busy?"disabled":""}>${BK.busy?"Making the backup…":"Download a locked backup"}</button>
  ${BK.msg?`<p class="muted" role="status">${esc(BK.msg)}</p>`:""}${BK.err?`<div class="note watch" role="alert">${esc(BK.err)}</div>`:""}${BK.done?`<div class="note good" role="status">${esc(BK.done)}</div>`:""}</div>`;
}
function bkShow(){const p=$("backup");if(p){p.outerHTML=backupPanel();bindBackup()}}
function bindBackup(){
  const b=$("bk_go");if(!b)return;
  b.onclick=async()=>{
    const pw=$("bk_pw").value,pw2=$("bk_pw2").value;
    BK.err="";BK.done="";
    if(pw.length<10){BK.err="Choose a password of at least 10 characters.";bkShow();return}
    if(pw!==pw2){BK.err="The two passwords are not the same. Type them again.";bkShow();return}
    if(BK.busy)return;BK.busy=true;BK.msg="Reading the records…";bkShow();
    try{
      const tables={},counts={};
      for(const [t,ord] of BK_TABLES){BK.msg=`Reading ${t.replace(/_/g," ")}…`;bkShow();tables[t]=await bkRead(t,ord);counts[t]=tables[t].length}
      BK.msg="Locking the file…";bkShow();
      const made=new Date().toISOString(),enc=new TextEncoder();
      const plain=enc.encode(JSON.stringify({format:"matan-backup",version:1,made_at:made,made_by:ME.name,tables}));
      const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12)),iterations=310000;
      const base=await crypto.subtle.importKey("raw",enc.encode(pw),"PBKDF2",false,["deriveKey"]);
      const key=await crypto.subtle.deriveKey({name:"PBKDF2",salt,iterations,hash:"SHA-256"},base,{name:"AES-GCM",length:256},false,["encrypt"]);
      const ct=new Uint8Array(await crypto.subtle.encrypt({name:"AES-GCM",iv},key,plain));
      const b64=u=>{let s="";for(let i=0;i<u.length;i+=32768)s+=String.fromCharCode.apply(null,u.subarray(i,i+32768));return btoa(s)};
      // Only the table sizes are readable without the password, so the file can be checked without opening it.
      const file={format:"matan-backup-locked",version:1,made_at:made,cipher:"AES-256-GCM",kdf:"PBKDF2-SHA256",iterations,salt:b64(salt),iv:b64(iv),counts,data:b64(ct)};
      const name=`matan-backup-${todayStr()}${DEMO?"-DEMO":""}.json`,url=URL.createObjectURL(new Blob([JSON.stringify(file)],{type:"application/json"}));
      const a=document.createElement("a");a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
      if(!DEMO){try{localStorage.setItem("matan_last_backup",made)}catch(e){}}
      BK.done=`Saved ${name}: ${counts.learners} learners, ${counts.assessment_records} assessment records, ${counts.attendance} attendance marks. Move it from Downloads to a safe place now.`;
    }catch(e){BK.err="The backup could not be made: "+((e&&e.message)||e)+". Nothing was saved. Please try again."}
    finally{BK.busy=false;BK.msg="";bkShow();const p1=$("bk_pw");if(p1)p1.value=""}
  };
}

/* ---------- staff (director) ---------- */
// The director adds teachers and sets roles. Creating a login needs the api/staff.js function on Vercel.
const SD={rows:[],loaded:false,msg:"",cred:null,row:null,add:{name:"",email:"",phone:"",role:"teacher",cls:"",pw:""}};
async function loadStaff(){SD.rows=await run(sb.from("staff").select("id,name,role,phone").order("name"));SD.loaded=true}
async function staffApi(body){
  const {data}=await sb.auth.getSession();
  const r=await fetch((CFG.API_URL||"")+"/api/staff",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+data.session.access_token},body:JSON.stringify(body)});
  let j={};try{j=await r.json()}catch(e){}
  if(!r.ok)throw new Error(j.error||("The staff service did not answer ("+r.status+"). Check that api/staff.js is deployed on Vercel."));
  return j;
}
const clsOf=id=>CLASSES.find(c=>TEACHID[c]===id)||"";
// The result of Save or New password, shown next to the buttons that were pressed.
function staffRowNote(r){
  const x=SD.row;if(!x||x.id!==r.id||x.busy)return "";
  if(x.err)return `<div class="note watch" role="alert" style="margin:8px 0 0">${esc(x.err)}</div>`;
  if(x.pw)return `<div class="note tip" role="status" style="margin:8px 0 0"><b>New password for ${esc(r.name)}:</b> <code>${esc(x.pw)}</code><br><span class="muted">Their old password no longer works. Write this down and give it to them now. It is not shown again, and they can change it after they sign in.</span> <button class="ghost" data-rowdone>Done</button></div>`;
  return `<div class="note good" role="status" style="margin:8px 0 0">${esc(x.msg)}</div>`;
}
function staffView(){
  const a=SD.add,opt=(v,t,cur)=>`<option value="${v}" ${cur===v?"selected":""}>${t}</option>`;
  const roleSel=(id,cur,dis)=>`<select id="sr_${id}" ${dis?"disabled":""}>${["teacher","senior","head"].map(r=>opt(r,ROLEN[r],cur)).join("")}</select>`;
  const clsSel=(id,cur)=>`<select id="sc_${id}"><option value="">No class</option>${classList().map(c=>opt(c,c,cur)).join("")}</select>`;
  return `<p class="muted" style="margin-top:0">Add teachers and choose what each person can do. <b>Teacher</b>: only their own class. <b>Senior teacher</b>: every class, and can approve questions, but cannot open Teaching insights or Staff. <b>Director</b>: everything.</p>
  ${SD.msg?`<div class="note good" role="status">${esc(SD.msg)}</div>`:""}
  ${SD.cred?`<div class="note tip" role="status"><b>Login for ${esc(SD.cred.name)}</b><br>Email: <code>${esc(SD.cred.email)}</code><br>Password: <code>${esc(SD.cred.password)}</code><br><span class="muted">Write this down and give it to them now. It is not shown again, and they can change it after they sign in.</span> <button class="ghost" id="creddone">Done</button></div>`:""}
  <div class="panel"><h2>Add a staff member</h2><div class="row2">
   <label class="muted" style="flex:2;min-width:200px">Full name<br><input type="text" id="s_name" style="width:100%" value="${esc(a.name)}"></label>
   <label class="muted" style="flex:2;min-width:200px">Email (their login)<br><input type="email" id="s_email" style="width:100%" value="${esc(a.email)}"></label></div>
   <div class="row2" style="margin-top:8px">
   <label class="muted">Phone (optional)<br><input type="text" id="s_phone" value="${esc(a.phone)}"></label>
   <label class="muted">Role<br><select id="s_role">${["teacher","senior","head"].map(r=>opt(r,ROLEN[r],a.role)).join("")}</select></label>
   <label class="muted">Class<br><select id="s_cls"><option value="">No class</option>${classList().map(c=>opt(c,c,a.cls)).join("")}</select></label>
   <label class="muted">Password (optional)<br><input type="text" id="s_pw" placeholder="Leave empty to make one" value="${esc(a.pw)}"></label></div>
   <button class="primary" id="s_add">Add staff member</button> <span class="muted">Class: the class this person teaches, if any. The director and senior teacher see every class either way.</span></div>
  <div class="panel"><h2>Staff</h2>${!SD.loaded?'<p class="muted">Loading…</p>':`<div class="scroll"><table><thead><tr><th>Name</th><th>Role</th><th>Class</th><th></th></tr></thead><tbody>
   ${SD.rows.map(r=>`<tr><td><b>${esc(r.name)}</b>${r.id===ME.id?' <span class="muted">(you)</span>':""}${r.phone?`<br><span class="muted">${esc(r.phone)}</span>`:""}</td><td>${roleSel(r.id,r.role,r.id===ME.id)}</td><td>${clsSel(r.id,clsOf(r.id))}</td>
    <td><button class="ghost" data-ssave="${r.id}" ${S.saving?"disabled":""}>${SD.row&&SD.row.id===r.id&&SD.row.busy==="save"?"Saving…":"Save"}</button> <button class="ghost" data-spw="${r.id}" ${S.saving?"disabled":""}>${SD.row&&SD.row.id===r.id&&SD.row.busy==="pw"?"Making…":"New password"}</button>${staffRowNote(r)}</td></tr>`).join("")}</tbody></table></div>`}</div>`+backupPanel();
}
function bindStaff(){
  bindBackup();
  const keep=()=>{const g=id=>($(id)||{}).value||"";SD.add={name:g("s_name"),email:g("s_email"),phone:g("s_phone"),role:g("s_role")||"teacher",cls:g("s_cls"),pw:g("s_pw")}};
  ["s_name","s_email","s_phone","s_role","s_cls","s_pw"].forEach(id=>{const e=$(id);if(e)e.onchange=keep});
  const cd=$("creddone");if(cd)cd.onclick=()=>{SD.cred=null;render()};
  const ad=$("s_add");if(ad)ad.onclick=async()=>{
    keep();const a=SD.add;if(S.saving)return;
    if(!a.name.trim()||!a.email.trim()){S.err="Enter the name and the email address.";render();return}
    S.saving=true;
    try{const j=await staffApi({action:"create",email:a.email,name:a.name,phone:a.phone,role:a.role,class_name:a.cls,password:a.pw});
      SD.cred={name:a.name.trim(),email:j.email,password:j.password};SD.msg=`${a.name.trim()} was added.`;SD.add={name:"",email:"",phone:"",role:"teacher",cls:"",pw:""};S.err="";
      await loadAll();await loadStaff();render()}
    catch(e){fail(e)}finally{S.saving=false}};
  document.querySelectorAll("[data-ssave]").forEach(b=>b.onclick=async()=>{
    const id=b.dataset.ssave,role=$("sr_"+id).value,row=SD.rows.find(r=>r.id===id),cls=$("sc_"+id).value;if(!row||S.saving)return;
    const had=TEACHID[cls],hadName=had&&had!==id?(SD.rows.find(r=>r.id===had)||{}).name:"";
    S.saving=true;SD.row={id,busy:"save"};SD.msg="";render();
    try{
      if(role!==row.role)await run(sb.from("staff").update({role}).eq("id",id));
      for(const c of CLASSES){if(CLASSIDS[c]&&TEACHID[c]===id&&c!==cls)await run(sb.from("classes").update({teacher_id:null}).eq("id",CLASSIDS[c]))}
      if(cls&&TEACHID[cls]!==id)await run(sb.from("classes").update({teacher_id:id}).eq("id",CLASSIDS[cls]));
      await loadAll();await loadStaff();
      SD.row={id,msg:`Saved. ${row.name} is ${ROLEN[role]}${cls?`, class teacher of ${cls}`:", with no class"}.${hadName?` ${hadName} is no longer ${cls}’s class teacher.`:""}`};S.err=""}
    catch(e){SD.row={id,err:"Not saved: "+(e.message||e)}}
    finally{S.saving=false;render()}});
  document.querySelectorAll("[data-spw]").forEach(b=>b.onclick=async()=>{
    const id=b.dataset.spw,row=SD.rows.find(r=>r.id===id);if(!row||S.saving)return;
    if(!confirm(`Make a new password for ${row.name}? Their old password will stop working straight away.`))return;
    S.saving=true;SD.row={id,busy:"pw"};SD.msg="";render();
    try{const j=await staffApi({action:"reset_password",staff_id:id});SD.row={id,pw:j.password};S.err=""}
    catch(e){SD.row={id,err:"No new password was made: "+(e.message||e)}}
    finally{S.saving=false;render()}});
  document.querySelectorAll("[data-rowdone]").forEach(b=>b.onclick=()=>{SD.row=null;render()});
}

/* ---------- needs found in the doctor's report ---------- */
// The AI adapts questions from the RECORDED needs. This turns what the doctor's report says into recorded needs with one click.
// The keyword search below runs only in the browser, on text the viewer can already read. Nothing is sent anywhere.
const NEEDRX={visual:/\b(blind\w*|visual(?:ly)? impair\w*|low vision|partial(?:ly)? sighted|vision (?:loss|impair\w*)|sight loss)\b/i,
 hearing:/\b(deaf\w*|hearing (?:loss|impair\w*)|hard of hearing)\b/i,
 physical:/\b(cerebral palsy|wheelchair|physical(?:ly)? (?:disab\w*|impair\w*)|mobility|paraly\w*)\b/i,
 speech_language:/\b(speech|stammer\w*|stutter\w*|non-?verbal|language delay)\b/i,
 intellectual:/\b(intellectual|down(?:'s)? syndrome|developmental delay|learning disab\w*)\b/i};
const NEEDACC={visual:["Pre-Braille or Braille materials","Short, one-step instructions"],hearing:["Kenyan Sign Language","Seat near the front"],physical:["Extra time","Assistive device in use"],speech_language:["Picture or object cues","Short, one-step instructions"],intellectual:["Short, one-step instructions","Extra time"]};
function suggestedNeeds(l){
  const have=needsOf(l),out=new Set(),rep=l.report||"";
  Object.entries(NEEDRX).forEach(([k,rx])=>{if(rx.test(rep))out.add(k)});
  const m=((l.tier&&l.tier.reason)||"").match(/Possible needs: ([^.]*)\./);
  if(m)m[1].split(",").map(x=>x.trim()).forEach(lb=>{const k=Object.keys(NEEDLBL).find(k=>NEEDLBL[k]===lb);if(k&&k!=="other")out.add(k)});
  return [...out].filter(k=>!have.includes(k));
}
async function addNeeds(l,keys){
  for(const k of keys){
    await run(sb.from("learner_needs").insert({learner_id:l.id,need_type:k,detail:null,source:"Doctor’s report, recorded by "+(STAFF[ME.id]||"staff"),created_by:ME.id}));
    for(const a of NEEDACC[k]||[])await run(sb.from("learner_accommodations").upsert({learner_id:l.id,accommodation:a,applies_to:"both",active:true,created_by:ME.id},{onConflict:"learner_id,accommodation"}));
  }
}
function needsPrompt(l){
  if(!SUP_OK||!l.sup||!canEdit(l))return "";
  const ks=suggestedNeeds(l);
  if(!ks.length){
    const have=needsOf(l),left=Object.keys(NEEDLBL).filter(k=>!have.includes(k));if(!left.length)return "";
    return `<details class="panel" id="mneed" open><summary><b>Record a need</b> <span class="muted">(blind, deaf, and so on)</span></summary>
     <p class="muted" style="margin:6px 0">Use this when ${esc(l.name.split(" ")[0])} has a need that is not written in a doctor’s report yet. The AI then adapts the questions.</p>
     <select id="mn_sel">${left.map(k=>`<option value="${k}">${esc(NEEDLBL[k])}</option>`).join("")}</select>
     <button class="primary" id="mn_go">Record need</button></details>`;
  }
  const fn=esc(l.name.split(" ")[0]),acc=uniq(ks.flatMap(k=>NEEDACC[k]||[]));
  return `<div class="note watch" role="note" id="needsprompt"><b>${fn}’s doctor’s report mentions: ${ks.map(k=>esc(NEEDLBL[k])).join(", ")}.</b>
   That is not recorded in the Support plan yet. Until it is, the AI cannot adapt ${fn}’s questions.<br>
   ${l.sup.profile?ks.map(k=>`<button class="primary" data-addneed="${k}" style="margin:8px 8px 0 0">Record ${esc(NEEDLBL[k])} need</button>`).join(""):`<button class="primary" id="needs_plan" style="margin:8px 0 0">Add the support plan first</button> <span class="muted">It needs the guardian’s signed consent. The needs are recorded when you save it.</span>`}
   <br><span class="muted">Recording a need also turns on these accommodations, which you can change in the Support plan: ${acc.map(esc).join(", ")}.</span></div>`;
}

/* ---------- Stage 3: curriculum tick-off, small checks, report cards ---------- */
// End-of-term exams (assessment_records) are the ONLY thing that feeds the graph, the trend and the report card.
// Small checks are stored in check_records, so they can never move the graph.
let CHK_OK=false,COV_OK=false,CI=[],COVR={},CIDONE=false;
/* ----- curriculum design PDFs (migration 11) ----- */
// The PDFs are in a private Supabase storage bucket. A link that works for one hour is made when a staff member taps the button.
let PDF_OK=false;
const pdfFirst=(c,a)=>{const p=ciFor(c,a).map(i=>i.pdf_page).filter(Boolean);return p.length?Math.min(...p):null};
const pdfBtn=(c,page,label,title)=>PDF_OK?`<button class="ghost pdfb" data-pdf="${c}" data-pg="${page||""}" title="${esc(title||"Open the "+c+" curriculum design")}">${label}</button>`:"";
async function openPdf(c,page){
  const w=window.open("","_blank");  // opened straight away, so the browser does not block it
  try{
    const {data,error}=await sb.storage.from("curriculum").createSignedUrl(c+".pdf",3600);
    if(error||!data)throw new Error(/not.?found/i.test((error&&error.message)||"")?`The ${c} curriculum design could not be found. Either it has not been uploaded yet (in Supabase, open Storage > curriculum and upload it as ${c}.pdf), or this login is not set up as Matan staff.`:((error&&error.message)||"The curriculum design could not be opened."));
    const url=data.signedUrl+(page?"#page="+page:"");
    if(w)w.location.href=url;else location.href=url;
  }catch(e){if(w)w.close();fail(e)}
}
function bindPdf(){document.querySelectorAll("[data-pdf]").forEach(b=>b.onclick=e=>{e.preventDefault();e.stopPropagation();openPdf(b.dataset.pdf,+b.dataset.pg||0)})}
const CHKMAX=5;
const uniq=a=>[...new Set(a.filter(Boolean))];
async function probeStage3(){
  CHK_OK=false;COV_OK=false;
  try{await run(sb.from("check_records").select("id").limit(1));await run(sb.from("assessment_notes").select("id").limit(1));await run(sb.from("report_comments").select("term_id").limit(1));CHK_OK=true}catch(e){}
  try{await run(sb.from("curriculum_items").select("id").limit(1));await run(sb.from("curriculum_coverage").select("id").limit(1));COV_OK=true}catch(e){}
}
// The director's name for the report card signature line (left blank if the account is just called "Director").
const STAFFHEAD=()=>{const h=STAFFROWS.find(x=>x.role==="head");return h&&!/^director$/i.test(h.name.trim())?h.name:""};
const termIdOf=label=>{const k=Object.keys(TERMID).find(k=>TERMID[k]===label);return k===undefined?null:Number(k)};

/* ----- curriculum tick-off ----- */
async function loadCurr(){
  const cols="id,cls,area,code,strand,name,lessons,term,sort";
  let it;try{it=await fetchAll("curriculum_items",cols+",pdf_page","sort");PDF_OK=!DEMO}catch(e){it=await fetchAll("curriculum_items",cols,"sort");PDF_OK=false}
  const cv=await fetchAll("curriculum_coverage","id,item_id,term_id,taught_on,taught_by","created_at");
  CI=it;COVR={};cv.forEach(c=>{COVR[c.item_id]=c});CIDONE=true;
}
const ciFor=(c,a)=>CI.filter(i=>i.cls===c&&i.area===a);
const covPct=items=>{const w=items.reduce((s,i)=>s+(i.lessons||1),0),d=items.filter(i=>COVR[i.id]).reduce((s,i)=>s+(i.lessons||1),0);return w?Math.round(100*d/w):0};
function covView(){
  if(!COV_OK)return `<div class="note watch">Curriculum tick-off needs migration-8. Run sql/migration-8-checks-curriculum-reports.sql in Supabase, then refresh this page.</div>`;
  if(!CIDONE)return `<p class="muted">Loading the curriculum…</p>`;
  const vis=visCls();if(!vis.length)return `<p class="muted">You are not set as the teacher of a class yet. Ask the director to assign you.</p>`;
  const c=vis.includes(S.ccls)?S.ccls:vis[0],a=S.carea||0,items=ciFor(c,a),can=isAdmin()||TEACHID[c]===ME.id,tid=CURID;
  const termN=items.filter(i=>COVR[i.id]&&COVR[i.id].term_id===tid).length;
  const groups=[];items.forEach(i=>{const k=i.strand||"";let g=groups.find(x=>x.k===k);if(!g){g={k,items:[]};groups.push(g)}g.items.push(i)});
  const overview=isAdmin()?`<details class="panel"><summary><b>Coverage across all classes</b></summary>
   <div class="scroll"><table><thead><tr><th>Class</th>${AREAS_PG.map((_,i)=>`<th>Area ${i+1}</th>`).join("")}<th>Whole class</th></tr></thead><tbody>
   ${classList().map(x=>`<tr><td>${x}</td>${[0,1,2,3,4].map(i=>`<td>${covPct(ciFor(x,i))}%</td>`).join("")}<td><b>${covPct(CI.filter(y=>y.cls===x))}%</b></td></tr>`).join("")}</tbody></table></div>
   <p class="muted" style="margin:6px 0 0">Area 1 to 5 follow each class’s own order of learning areas. Percentages count taught lessons, not just sub-strands.</p></details>`:"";
  return `<p class="muted" style="margin-top:0">Tick each sub-strand once you have finished teaching it. Ticks stay for the whole year and show on the termly report card for the term they were taught in. ${esc(CUR)} so far: <b>${termN}</b> sub-strand${termN===1?"":"s"} in this learning area.</p>
  <div class="tools">${vis.map(x=>`<button class="chip" data-cc="${x}" aria-pressed="${c===x}">${x} · ${esc(TEACH[x]||"")} · ${covPct(CI.filter(y=>y.cls===x))}%</button>`).join("")}</div>
  <div class="tabs" role="tablist" aria-label="Learning areas">${AR(c).map(x=>`<button class="tab" role="tab" data-a="${x.k}" aria-selected="${x.k===a}" tabindex="${x.k===a?0:-1}">${x.n} · ${covPct(ciFor(c,x.k))}%</button>`).join("")}</div>
  <div class="panel"><h2>${esc(AR(c)[a].full)} · ${c}</h2>
   ${PDF_OK?`<p style="margin:0 0 8px">${pdfBtn(c,pdfFirst(c,a),"📄 Open the "+c+" curriculum design"+(pdfFirst(c,a)?" at this area":""))}</p>`:""}
   <div class="bar" aria-hidden="true" style="margin:0 0 8px"><i style="width:${covPct(items)}%"></i></div>
   <p style="margin:0 0 10px"><b>${covPct(items)}%</b> taught <span class="muted">(${items.filter(i=>COVR[i.id]).length} of ${items.length} sub-strands)</span>
   ${can&&items.some(i=>!COVR[i.id])?` <button class="ghost" id="cov_all" style="margin-left:8px">Mark the whole area taught</button>`:""}</p>
   ${!items.length?`<p class="muted">No sub-strands loaded for this area.</p>`:groups.map(g=>`${g.k?`<h3 style="margin:14px 0 4px;font-size:1rem">${esc(g.k)}</h3>`:""}
    ${g.items.map(i=>{const v=COVR[i.id];return `<label class="acc" style="display:flex;gap:8px;align-items:flex-start;padding:6px 0;border-bottom:1px solid var(--line)"><input type="checkbox" data-ci="${i.id}" ${v?"checked":""} ${can?"":"disabled"} aria-label="Taught: ${esc(i.name)}">
     <span style="flex:1"><b>${esc(i.code)}</b> ${esc(i.name)} <span class="muted">${i.lessons?i.lessons+" lessons":""}${i.term?" · planned Term "+i.term:""}</span>${i.pdf_page?" "+pdfBtn(c,i.pdf_page,"p. "+i.pdf_page,"Open the curriculum design at page "+i.pdf_page):""}
     ${v?`<br><span class="tag ok">Taught ${esc(fmtDate(v.taught_on+"T00:00:00"))}${v.term_id&&TERMID[v.term_id]?" · "+esc(TERMID[v.term_id]):""}${v.taught_by&&STAFF[v.taught_by]?" · "+esc(STAFF[v.taught_by]):""}</span>`:""}</span></label>`}).join("")}`).join("")}</div>${overview}`;
}
function bindCov(){
  const m=$("main");bindPdf();
  m.querySelectorAll("[data-cc]").forEach(b=>b.onclick=()=>{S.ccls=b.dataset.cc;S.carea=0;render()});
  m.querySelectorAll(".tab[data-a]").forEach(b=>b.onclick=()=>{S.carea=+b.dataset.a;rr()});
  m.querySelectorAll("[data-ci]").forEach(b=>b.onchange=async()=>{
    if(S.saving){b.checked=!b.checked;return}S.saving=true;const id=b.dataset.ci;
    try{
      if(b.checked)await run(sb.from("curriculum_coverage").insert({item_id:id,term_id:CURID||null,taught_by:ME.id,taught_on:todayStr()}));
      else await run(sb.from("curriculum_coverage").delete().eq("item_id",id));
      await loadCurr();S.err="";rr();
    }catch(e){fail(e)}finally{S.saving=false}});
  const all=$("cov_all");if(all)all.onclick=async()=>{
    if(S.saving)return;const c=S.ccls||visCls()[0],a=S.carea||0,rows=ciFor(c,a).filter(i=>!COVR[i.id]).map(i=>({item_id:i.id,term_id:CURID||null,taught_by:ME.id,taught_on:todayStr()}));
    if(!rows.length)return;S.saving=true;
    try{await run(sb.from("curriculum_coverage").insert(rows));await loadCurr();S.err="";rr()}catch(e){fail(e)}finally{S.saving=false}};
}

/* ----- small checks ----- */
async function loadChecks(l){
  if(!CHK_OK){l.chk=[];l.cnotes=[];l.chkLoaded=true;return}
  const [rows,notes]=await Promise.all([
    run(sb.from("check_records").select("batch_id,area,score,term_id,entered_at").eq("learner_id",l.id).order("entered_at").range(0,999)),
    run(sb.from("assessment_notes").select("id,batch_id,area,avg_score,body,source,created_at,term_id").eq("learner_id",l.id).order("created_at"))]);
  const by={};
  rows.forEach(r=>{const b=by[r.batch_id]=by[r.batch_id]||{id:r.batch_id,a:r.area,t:r.term_id,at:r.entered_at,sc:[]};const v=sv(r.score);if(num(v))b.sc.push(v)});
  l.chk=Object.values(by).map(b=>({...b,avg:b.sc.length?avg(b.sc):null})).sort((x,y)=>new Date(x.at)-new Date(y.at));
  l.cnotes=notes;l.chkLoaded=true;
}
function checksPanel(l){
  if(!CHK_OK)return "";
  const fn=esc(l.name.split(" ")[0]),ch=(l.chk||[]).slice().reverse().slice(0,6);
  return `<div class="panel"><h2>Small checks</h2>
  <p class="muted" style="margin-top:0">Quick checks between terms. They give the teacher a short note but never change the graph, the trend or the report card. Only the end-of-term exam does that.</p>
  ${ch.length?ch.map(b=>{const n=(l.cnotes||[]).find(x=>x.batch_id===b.id);return `<div class="nt"><span class="muted">${esc(fmtDate(b.at))} · ${esc(AR(l.cls)[b.a].full)}${b.avg!==null?" · average "+f1(b.avg):""}</span>${n?`<br>${esc(n.body)} <span class="tag ${n.source==="ai"?"warn":""}">${n.source==="ai"?"AI draft, approved by a teacher":n.source==="teacher"?"Teacher’s note":"Auto note"}</span>`:""}</div>`}).join(""):`<p class="muted">No small checks for ${fn} yet.</p>`}
  ${canEdit(l)?`<button class="ghost" id="gochk2">Start a small check</button>`:""}</div>`;
}
const checkQs=(l,A)=>{
  const s=S.chk;if(s.qs[A])return s.qs[A];
  const taught=CI.filter(i=>i.cls===l.cls&&i.area===A&&COVR[i.id]).map(i=>i.name.toLowerCase());
  const hit=q=>!!q.sub&&taught.some(t=>t.includes(q.sub.toLowerCase())||q.sub.toLowerCase().includes(t));
  const all=QA(l.cls,A);
  return s.qs[A]=all.filter(hit).concat(all.filter(q=>!hit(q))).slice(0,CHKMAX).map(q=>({...q,hit:hit(q)}));
};
async function beginCheck(id){
  const l=byId(id);
  try{if(COV_OK&&!CIDONE)await loadCurr();if(CHK_OK&&!l.chkLoaded)await loadChecks(l)}catch(e){return fail(e)}
  const first=AR(l.cls).find(a=>QA(l.cls,a.k).length);
  S.chk={id,area:first?first.k:0,qs:{},g:{0:[],1:[],2:[],3:[],4:[]},sc:{0:[],1:[],2:[],3:[],4:[]},n:{0:[],1:[],2:[],3:[],4:[]},qi:0,msg:"",done:null,busy:false};
  S.view="check";S.err="";render();
}
function checkRuleNote(l,A,items,av,prev){
  const nums=items.filter(i=>num(i.score)),strong=uniq(nums.filter(i=>i.score>=4).map(i=>i.sub||i.code)),weak=uniq(nums.filter(i=>i.score<=2).map(i=>i.sub||i.code));
  const k=kicd(av);
  let t=`${AR(l.cls)[A].full}: average ${f1(av)} out of 5${k?" ("+k.c+")":""}.`;
  if(strong.length)t+=` Secure in ${strong.slice(0,3).join(", ")}.`;
  if(weak.length)t+=` Practise ${weak.slice(0,3).join(", ")} again, with real objects and short, repeated turns.`;else t+=" Keep building on this with the next sub-strand.";
  if(prev!==null&&prev!==undefined)t+=` The last small check in this area averaged ${f1(prev)}.`;
  return t;
}
async function requestNote(mode,l,payload){
  const {data}=await sb.auth.getSession();
  const r=await fetch((CFG.API_URL||"")+"/api/ai-note",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+data.session.access_token},body:JSON.stringify({mode,learner_id:l.id,class:l.cls,...payload})});
  let j={};try{j=await r.json()}catch(e){}
  if(!r.ok)throw new Error(j.error||("The AI service did not answer ("+r.status+"). Check that api/ai-note.js is deployed on Vercel."));
  return j.note;
}
async function finishCheck(l,s,A){
  const qs=checkQs(l,A),batch=(crypto&&crypto.randomUUID)?crypto.randomUUID():"xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g,c=>{const r=Math.random()*16|0;return (c==="x"?r:(r&3|8)).toString(16)});
  const rows=qs.map((q,i)=>({batch_id:batch,learner_id:l.id,term_id:CURID||null,area:A,competency_id:String(q.id),variant_id:q.va?String(q.va):null,rater_id:ME.id,rater_role:myRole(),score:String(s.g[A][i]),support_code:s.sc[A][i]||"R0",comment:(s.n[A][i]||"").trim()||null}));
  await run(sb.from("check_records").insert(rows));
  const items=qs.map((q,i)=>({code:q.c,strand:q.st,sub:q.sub,score:s.g[A][i]})),nums=items.map(i=>i.score).filter(num),av=nums.length?avg(nums):null;
  const prevB=(l.chk||[]).filter(b=>b.a===A&&b.avg!==null).pop(),prev=prevB?prevB.avg:null;
  const taught=CI.filter(i=>i.cls===l.cls&&i.area===A&&COVR[i.id]&&COVR[i.id].term_id===CURID).map(i=>i.name).slice(0,12);
  let note=checkRuleNote(l,A,items,av===null?0:av,prev),src="rules",aiErr="";
  if(av!==null&&(l.aic||hasAIConsent(l))){
    try{note=await requestNote("check",l,{area:AR(l.cls)[A].full,term:CUR,average:av,previous:prev,items,taught});src="ai"}
    catch(e){aiErr=e.message}
  }
  s.done={batch,area:A,avg:av,note,src,aiErr,saved:false};
  await loadChecks(l);
}
function checkView(){
  const s=S.chk,l=byId(s.id),A=s.area,fn=esc(l.name.split(" ")[0]);
  const head=`<div class="who"><div style="display:flex;gap:12px;align-items:center">${av(l,56)}<div><h2>Small check: ${esc(l.name)}</h2><span class="muted">${l.cls} · ${esc(TEACH[l.cls]||"")} · does not change the term results</span></div></div><button class="ghost" id="toq">Back</button></div>`;
  if(s.done){const d=s.done,k=kicd(d.avg);
    return head+`<div class="panel"><h2>${esc(AR(l.cls)[d.area].full)} check saved</h2>
    <p>${d.avg!==null?`${fn} averaged <b>${f1(d.avg)}</b> out of 5${k?` (${k.c})`:""}. `:""}<span class="muted">This is not part of the term results.</span></p>
    ${d.saved?`<div class="note good">Insight saved to ${fn}’s profile.</div>`:`<p class="muted" style="margin:0 0 4px"><b>Short insight</b> ${d.src==="ai"?`<span class="tag warn">Written by AI. Read it, change anything you like, then save it.</span>`:`<span class="tag">Written from the scores. Edit it if you wish.</span>`}</p>
     ${d.aiErr?`<div class="note tip">${esc(d.aiErr)} A simple note was written from the scores instead.</div>`:""}
     <textarea id="ck_note" rows="4" style="width:100%" aria-label="Insight">${esc(d.note)}</textarea>
     <p><button class="primary" id="ck_save" style="margin:0">Save insight</button> <button class="ghost" id="ck_skip">Do not save an insight</button></p>`}
    <p><button class="ghost" id="ck_more">Check another area</button> <button class="ghost" id="toprof">Open profile</button></p></div>`}
  const tabs=`<div class="tabs" role="tablist" aria-label="Learning areas">${AR(l.cls).map(a=>`<button class="tab" role="tab" data-a="${a.k}" aria-selected="${a.k===A}" tabindex="${a.k===A?0:-1}">${a.n}</button>`).join("")}</div>`;
  const qs=checkQs(l,A);
  if(!qs.length)return head+tabs+`<div class="panel"><p class="muted" style="margin:0">There are no approved questions for ${esc(AR(l.cls)[A].full)} in ${l.cls} yet. Pick another area or add questions in the Question bank.</p></div>`;
  const g=s.g[A],au=((s.au=s.au||{})[A]=s.au[A]||{});preNA(l,qs,g,au);
  const q=qs[s.qi],n=qs.length,scored=g.filter(x=>x!==undefined).length;
  return head+tabs+`<div class="stage"><p class="muted" style="margin:0 0 8px">${esc(AR(l.cls)[A].full)} · Question ${s.qi+1} of ${n}${q.hit?" · <span class=\"tag ok\">taught this year</span>":""}</p>
   ${q.st?`<p class="muted" style="margin:0 0 8px"><b>${esc(q.c)}</b> · ${esc(q.st)}${q.sub?" · "+esc(q.sub):""}</p>`:""}
   ${isBlind(l)&&!s.pic?`<p class="muted" style="margin:0 0 8px"><b>Picture hidden.</b> Read the question aloud and use real objects ${fn} can touch. <button class="ghost" id="showpic">Show picture</button></p>`:`<div class="big">${q.s}</div>`}<p class="ask">${esc(askText(l,q))}</p>${blindNote(l,q,g,au,s.qi)}</div>
  <div class="panel"><p style="margin-top:0"><b>Look for:</b> ${esc(q.l)}</p>
   <div class="pick" role="group" aria-label="Score">${GR.map(x=>`<button class="${num(x)?"":"sm"}" data-v="${x}" aria-pressed="${g[s.qi]===x}">${x}</button>`).join("")}</div>
   <p class="rub muted">${g[s.qi]===undefined?"Choose a score from 0 to 5, or NA or DA.":num(g[s.qi])?`${g[s.qi]}: ${G[g[s.qi]]}`:`${g[s.qi]}: ${GL[g[s.qi]]}`}</p>
   <div class="row2"><label class="muted">Support to give<br><select id="sc">${Object.keys(SUP).map(k=>`<option value="${k}" ${(s.sc[A][s.qi]||"R0")===k?"selected":""}>${k} · ${SUP[k]}</option>`).join("")}</select></label>
   <label class="muted" style="flex:1;min-width:220px">Comment (optional)<br><textarea id="qn" rows="2" style="width:100%">${esc(s.n[A][s.qi]||"")}</textarea></label></div>
   <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px"><button class="ghost" id="prevq" ${s.qi===0?"disabled":""}>Previous question</button><button class="ghost" id="nextq" ${s.qi===n-1?"disabled":""}>Next question</button></div></div>
  <div class="panel"><p style="margin-top:0">You have scored ${scored} of ${n} questions.</p>${s.msg?`<div class="note watch">${esc(s.msg)}</div>`:""}
   <button class="primary" id="ck_done" style="margin-top:0" ${s.busy?"disabled":""}>${s.busy?"Saving…":"Finish small check"}</button></div>`;
}
function bindCheck(){
  const s=S.chk,l=byId(s.id),A=s.area,on=(id,f)=>{const e=$(id);if(e)e.onclick=f};
  on("toq",()=>{S.view="queue";S.chk=null;render()});
  on("toprof",()=>{S.sel=l.id;S.view="profile";S.chk=null;render()});
  on("ck_more",()=>{s.done=null;s.qi=0;rr()});
  on("ck_skip",()=>{s.done.saved=true;s.done.skipped=true;rr()});
  on("ck_save",async()=>{
    const body=($("ck_note").value||"").trim();if(!body||S.saving)return;S.saving=true;
    try{
      const d=s.done,edited=body!==d.note;
      await run(sb.from("assessment_notes").insert({learner_id:l.id,kind:"check",batch_id:d.batch,term_id:CURID||null,area:d.area,avg_score:d.avg,body,source:edited?"teacher":d.src,created_by:ME.id}));
      await loadChecks(l);d.saved=true;S.err="";rr();
    }catch(e){fail(e)}finally{S.saving=false}});
  if(s.done)return;
  on("showpic",()=>{s.pic=true;rr()});
  on("prevq",()=>{s.qi--;rr()});on("nextq",()=>{s.qi++;rr()});
  const qn=$("qn");if(qn)qn.oninput=()=>{s.n[A][s.qi]=qn.value};
  const sc=$("sc");if(sc)sc.onchange=()=>{s.sc[A][s.qi]=sc.value};
  document.querySelectorAll(".tab").forEach(b=>b.onclick=()=>{s.area=+b.dataset.a;s.qi=0;s.msg="";rr()});
  document.querySelectorAll(".pick button").forEach(b=>b.onclick=()=>{s.g[A][s.qi]=gv(b.dataset.v);s.msg="";rr()});
  on("ck_done",async()=>{
    const qs=checkQs(l,A),missing=qs.map((_,i)=>i).filter(i=>s.g[A][i]===undefined);
    if(missing.length){s.qi=missing[0];s.msg=`Question ${missing[0]+1} still needs a score${missing.length>1?` (and ${missing.length-1} more)`:""}. Choose a score, or NA if you did not ask it.`;rr();return}
    if(S.saving)return;S.saving=true;s.busy=true;rr();
    try{await finishCheck(l,s,A);S.err=""}catch(e){S.err=e.message||String(e)}finally{S.saving=false;s.busy=false;rr()}
  });
}

/* ----- termly report card ----- */
const RCN={};  // report comment cache: learnerId|termId -> {t,h,loaded}
async function loadRC(l,tid){
  const k=l.id+"|"+tid;
  if(!CHK_OK||!tid){RCN[k]={t:"",h:"",loaded:true};return}
  const r=await run(sb.from("report_comments").select("teacher_comment,head_comment").eq("learner_id",l.id).eq("term_id",tid).maybeSingle());
  RCN[k]={t:(r&&r.teacher_comment)||"",h:(r&&r.head_comment)||"",loaded:true};
}
function repView(){
  const vis=visCls();if(!vis.length)return `<p class="muted">You are not set as the teacher of a class yet.</p>`;
  const c=vis.includes(S.rcls)?S.rcls:vis[0],ls=L.filter(l=>l.cls===c),l=ls.find(x=>x.id===S.rsel)||null;
  const picker=`<div class="noprint"><p class="muted" style="margin-top:0">The termly report card is built from the end-of-term exam only. It shows scores, KICD levels, attendance and what was taught. It never shows support tiers, needs or health notes, so it is safe to print for parents.</p>
  <div class="tools">${vis.map(x=>`<button class="chip" data-rc="${x}" aria-pressed="${c===x}">${x} · ${esc(TEACH[x]||"")}</button>`).join("")}</div>
  <p><label class="muted">Learner<br><select id="rp_l"><option value="">Choose a learner</option>${ls.map(x=>`<option value="${x.id}" ${S.rsel===x.id?"selected":""}>${esc(x.name)}${has(x)?"":" (no term exam yet)"}</option>`).join("")}</select></label></p></div>`;
  if(!l)return picker;
  if(!has(l))return picker+`<div class="note tip">${esc(l.name)} has no end-of-term exam with all five areas scored yet, so there is no report card to show. Finish the ${esc(CUR)} end-of-term exam first.</div>`;
  const labels=l.labels,label=labels.includes(S.rterm)?S.rterm:labels[labels.length-1],ix=labels.indexOf(label),sc=l.scores[ix],pv=ix>0?l.scores[ix-1]:null,tid=termIdOf(label);
  const k=l.id+"|"+tid,rc=RCN[k];
  const ov=avg(sc),ok=kicd(ov),pov=pv?avg(pv):null;
  const taught=COV_OK&&CIDONE?CI.filter(i=>i.cls===l.cls&&COVR[i.id]&&COVR[i.id].term_id===tid):[];
  const total=COV_OK&&CIDONE?CI.filter(i=>i.cls===l.cls).length:0;
  const edT=canEdit(l)&&CHK_OK,edH=isHead()&&CHK_OK,aiOk=edT&&(l.aic||hasAIConsent(l));
  const nChecks=(l.chk||[]).filter(b=>b.t===tid).length;
  const nextT=TERMS[TERMS.indexOf(label)+1]||"";
  const card=`<div class="rcard" id="rcard"><div class="rc-h">${SCH.logo?`<img class="rc-logo" src="${esc(SCH.logo)}" alt="${esc(SCH.name)} logo">`:""}
    <div class="rc-school"><h2>${esc(SCH.name)}</h2>${SCH.motto?`<p class="rc-motto">${esc(SCH.motto)}</p>`:""}
    <p class="rc-contact">${[SCH.address,SCH.phone,[SCH.email,SCH.web].filter(Boolean).join(" · ")].filter(Boolean).map(esc).join("<br>")}</p></div></div>
   <p class="rc-title">Termly Report Card · ${esc(label)}</p>${DEMO?`<p class="rc-demo">Sample report card · made-up child · not a real record</p>`:""}
   <dl class="facts"><div><dt>Learner</dt><dd>${esc(l.name)}</dd></div><div><dt>Class</dt><dd>${l.cls}</dd></div><div><dt>Class teacher</dt><dd>${esc(TEACH[l.cls]||"")}</dd></div><div><dt>Age</dt><dd>${l.age!==null?l.age+" years":"—"}</dd></div><div><dt>Attendance</dt><dd>${l.att!==null?l.att+"%":"Not recorded"}</dd></div></dl>
   <table><thead><tr><th>Learning area</th><th>Score (0 to 5)</th><th>KICD level</th>${pv?"<th>Last term</th>":""}</tr></thead><tbody>
   ${AR(l.cls).map(a=>{const x=kicd(sc[a.k]);return `<tr><td>${esc(a.full)}</td><td>${cell(sc[a.k])}</td><td>${x.c} <span class="muted">${x.t}</span></td>${pv?`<td>${cell(pv[a.k])}</td>`:""}</tr>`}).join("")}
   <tr><td><b>Overall</b></td><td><b>${f1(ov)}</b></td><td><b>${ok.c}</b> <span class="muted">${ok.t}</span></td>${pv?`<td>${f1(pov)}</td>`:""}</tr></tbody></table>
   <p class="muted" style="font-size:.85rem">Scores come from the end-of-term exam. EE = Exceeds Expectations (4.5 and above), ME = Meets Expectations (2.5 to 4.4), AE = Approaches Expectations (1.5 to 2.4), BE = Below Expectations (under 1.5).</p>
   ${COV_OK&&CIDONE?`<h3>What we learned this term</h3>${taught.length?`<p>${taught.length} of ${total} sub-strands in the ${l.cls} curriculum were taught in ${esc(label)}.</p>${AR(l.cls).map(a=>{const t=taught.filter(i=>i.area===a.k);return t.length?`<p style="margin:2px 0"><b>${esc(a.n)}:</b> ${t.map(i=>esc(i.name)).join(", ")}</p>`:""}).join("")}`:`<p class="muted">No curriculum sub-strands were ticked as taught for this term.</p>`}`:""}
   ${nChecks?`<p class="muted" style="font-size:.85rem">${nChecks} small check${nChecks===1?"":"s"} were done this term. They help the teacher plan and are not part of the scores above.</p>`:""}
   <h3>Class teacher’s comment</h3><p id="rc_t_out" class="rc-c">${rc&&rc.t?esc(rc.t):'<span class="muted">—</span>'}</p>
   <h3>Director’s comment</h3><p id="rc_h_out" class="rc-c">${rc&&rc.h?esc(rc.h):'<span class="muted">—</span>'}</p>
   <div class="sign">
    <div><div class="sl"></div><b>Class teacher</b><span class="muted who">${esc(TEACH[l.cls]&&TEACH[l.cls]!=="Not assigned"?TEACH[l.cls]:"")}</span><div class="sd">Date: ______________</div></div>
    <div><div class="sl"></div><b>Director</b><span class="muted who">${esc(STAFFHEAD()||"")}</span><div class="sd">Date: ______________</div></div>
    <div><div class="sl"></div><b>Parent or guardian</b><span class="muted who"></span><div class="sd">Date: ______________</div></div></div>
   <div class="rc-foot"><span>School stamp</span><span>${nextT?`Next term (${esc(nextT)}) begins: ______________`:"Next term begins: ______________"}</span><span>Printed ${fmtDate(Date.now())}</span></div></div>`;
  const edit=`<div class="panel noprint"><h2>Term and comments</h2>
   <p><label class="muted">Term<br><select id="rp_t">${labels.slice().reverse().map(x=>`<option ${x===label?"selected":""}>${esc(x)}</option>`).join("")}</select></label>
   <button class="primary" id="rp_print" style="margin:0 0 0 12px">Print or save as PDF</button></p>
   ${!CHK_OK?`<p class="muted">Comments need migration-8. The card can still be printed without them.</p>`:!rc?`<p class="muted">Loading comments…</p>`:`
   ${edT?`<label class="muted">Class teacher’s comment<br><textarea id="rc_t" rows="4" style="width:100%">${esc(rc.t)}</textarea></label>
    ${aiOk?`<p style="margin:4px 0"><button class="ghost" id="rc_ai" ${S.aiBusy==="rc"?"disabled":""}>${S.aiBusy==="rc"?"Drafting…":"Draft a comment with AI"}</button> <span class="muted">The AI sees only the scores. Read it and edit it before you save.</span></p>`:`<p class="muted" style="margin:4px 0">${l.aic||hasAIConsent(l)?"":"AI drafting needs the guardian’s AI consent on the learner’s page."}</p>`}`:`<p class="muted">Only this class’s teacher or the director can write the teacher’s comment.</p>`}
   ${edH?`<label class="muted">Director’s comment<br><textarea id="rc_h" rows="3" style="width:100%">${esc(rc.h)}</textarea></label>`:""}
   ${edT||edH?`<p><button class="primary" id="rc_save" style="margin:0">Save comments</button> <span class="toast" role="status">${esc(S.rmsg||"")}</span></p>`:""}`}</div>`;
  return picker+edit+card;
}
async function ensureRep(){
  const l=byId(S.rsel);if(!l||!has(l))return;
  const label=l.labels.includes(S.rterm)?S.rterm:l.labels[l.labels.length-1],tid=termIdOf(label),k=l.id+"|"+tid;
  if(S.repBusy)return;
  const need=[];
  if(COV_OK&&!CIDONE)need.push(loadCurr());
  if(CHK_OK&&!l.chkLoaded)need.push(loadChecks(l));
  if(!RCN[k])need.push(loadRC(l,tid));
  if(!need.length)return;
  S.repBusy=true;
  try{await Promise.all(need)}catch(e){S.repBusy=false;return fail(e)}
  S.repBusy=false;rr();
}
function bindRep(){
  const m=$("main");
  m.querySelectorAll("[data-rc]").forEach(b=>b.onclick=()=>{S.rcls=b.dataset.rc;S.rsel=null;S.rterm=null;render()});
  const pl=$("rp_l");if(pl)pl.onchange=()=>{S.rsel=pl.value||null;S.rterm=null;S.rmsg="";render()};
  const pt=$("rp_t");if(pt)pt.onchange=()=>{S.rterm=pt.value;S.rmsg="";render()};
  const pr=$("rp_print");if(pr)pr.onclick=()=>{
    const l=byId(S.rsel),old=document.title,lab=l&&(l.labels.includes(S.rterm)?S.rterm:l.labels[l.labels.length-1]);
    if(l)document.title=`Report card - ${l.name} - ${lab}`;  // becomes the PDF file name
    window.print();setTimeout(()=>{document.title=old},500)};
  const t=$("rc_t"),h=$("rc_h");
  const live=(el,out)=>{if(el)el.oninput=()=>{const o=$(out);if(o)o.textContent=el.value||"—"}};live(t,"rc_t_out");live(h,"rc_h_out");
  const l=byId(S.rsel);if(!l||!has(l))return;
  const label=l.labels.includes(S.rterm)?S.rterm:l.labels[l.labels.length-1],tid=termIdOf(label),rc=RCN[l.id+"|"+tid];
  const ai=$("rc_ai");if(ai)ai.onclick=async()=>{
    if(S.saving)return;S.saving=true;S.aiBusy="rc";if(t)rc.t=t.value;if(h)rc.h=h.value;rr();
    try{
      const ix=l.labels.indexOf(label),sc=l.scores[ix],pv=ix>0?l.scores[ix-1]:null;
      const note=await requestNote("report",l,{term:label,average:avg(sc),previous:pv?avg(pv):null,areas:AR(l.cls).map(a=>({area:a.full,score:sc[a.k],level:(kicd(sc[a.k])||{}).c})),attendance:l.att});
      rc.t=note;S.rmsg="AI draft added. Read it and press Save comments.";S.err=""
    }catch(e){S.err=e.message}finally{S.saving=false;S.aiBusy=null;rr()}};
  const sv2=$("rc_save");if(sv2)sv2.onclick=async()=>{
    if(S.saving||!tid)return;S.saving=true;
    try{
      const row={learner_id:l.id,term_id:tid};
      if(t){row.teacher_comment=t.value.trim()||null;row.teacher_by=ME.id}
      if(h&&isHead()){row.head_comment=h.value.trim()||null;row.head_by=ME.id}
      await run(sb.from("report_comments").upsert(row,{onConflict:"learner_id,term_id"}));
      if(t)rc.t=t.value.trim();if(h)rc.h=h.value.trim();S.rmsg="Saved.";S.err="";rr()
    }catch(e){fail(e)}finally{S.saving=false}};
}

/* ---------- messages to parents ---------- */
// A whole class at once, by WhatsApp or SMS. Everything opens on the staff member's own phone
// and they press send there, so the school pays nothing and the app sends nothing by itself. Each tap is noted in
// parent_messages. Messages never mention support tiers, needs or health: only attendance and learning levels,
// the same as the report card.
const PM={cls:"",kind:"update",text:"",msgs:{},loadedFor:"",sent:{}};
const LEVEL_TXT={EE:"doing very well",ME:"doing well",AE:"getting there",BE:"needs more practice"};
const HOME_TIP=["read a picture book together and ask your child to tell you about the pictures.","count everyday things together, like cups, spoons or steps.",
  "talk about plants, animals and the weather when you walk outside.","let your child draw, colour, sing or dance, then tell you about it.",
  "share a short Bible story or prayer and talk about being kind."];
const HOME_TIP_PG="let your child help with small jobs at home, and praise them for sharing and taking turns.";
const NOTICE_T=[
  ["School closing","School closes on Friday at 12 noon. Please pick up your child on time."],
  ["Parents' meeting","There is a parents' meeting at the school on Saturday at 10 am. Please come."],
  ["Things to bring","Please send your child with a raincoat and a water bottle tomorrow."]];
// "Jane Wanjiru" is greeted as Jane; "Mrs. Kamau" and "Baba Bahati" keep both words.
const greetName=g=>{const w=String(g||"").trim().split(/\s+/).filter(Boolean);return !w.length?"":/^(mr|mrs|ms|miss|dr|mama|baba|mzee|pastor|rev)\.?$/i.test(w[0])&&w[1]?w[0]+" "+w[1]:w[0]};
const areaName=(c,k)=>AR(c)[k].full;
const homeTip=(c,k)=>c==="PG"&&k===4?HOME_TIP_PG:HOME_TIP[k];
// The scores a term update is built from: the latest end-of-term exam, or this term's scores so far.
function pmScores(l){
  if(has(l))return {term:l.labels[l.labels.length-1],sc:last(l),sofar:false};
  return l.cur.some(v=>v!==null)?{term:CUR,sc:l.cur,sofar:true}:null;
}
function pmUpdate(l,short){
  const first=greetName(l.guardian),fn=l.name.split(" ")[0],s=pmScores(l);
  const ks=s?s.sc.map((v,k)=>[v,k]).filter(x=>x[0]!==null):[];
  const hi=ks.length?ks.reduce((a,b)=>b[0]>a[0]?b:a):null,low=ks.length?ks.reduce((a,b)=>b[0]<a[0]?b:a):null;
  const best=hi&&low&&hi[0]>low[0]?hi:null,tip=homeTip(l.cls,low?low[1]:0);  // "doing best in" only when one area is really ahead
  const att=l.att!==null?l.att+"%":"";
  if(short)return `${SCH.name}: ${fn}'s update${s?" for "+s.term:""}.${att?" Attendance "+att+".":""}${best?" Doing best in "+areaName(l.cls,best[1])+".":""} At home: ${tip} - ${ME.name}`;
  const lines=ks.map(([v,k])=>`• ${areaName(l.cls,k)}: ${LEVEL_TXT[kicd(v).c]}`).join("\n");
  return `Hello${first?" "+first:""},\n\nHere is a short update on ${fn}${s?" ("+s.term+(s.sofar?", so far":"")+")":""} at ${SCH.name}.\n\n`
    +(att?`*Attendance:* ${att}\n\n`:"")+(lines?`*Learning*\n${lines}\n\n`:"")
    +(best?`${fn} is doing best in ${areaName(l.cls,best[1])}.\n\n`:"")
    +`*Something to try at home:* ${tip.charAt(0).toUpperCase()+tip.slice(1)}\n\nPlease talk to me if you have any questions.\n\nWarm regards,\n${ME.name}\n${SCH.name}`;
}
function pmNotice(l,short){
  const t=PM.text.trim(),first=l?greetName(l.guardian):"";
  if(short)return `${SCH.name}: ${t} - ${ME.name}`;
  return `Hello${first?" "+first:""},\n\n${t}\n\nThank you,\n${ME.name}\n${SCH.name}`;
}
const pmText=(l,short)=>PM.kind==="notice"?pmNotice(l,short):pmUpdate(l,short);
// SMS: 160 letters per message. Anything outside the basic SMS letters (for example an emoji) cuts it to 70.
const smsParts=t=>{const gsm=/^[\x20-\x7E\n\r£¥èéùìòÇØøÅå_ÆæßÉ¡ÄÖÑÜ§¿äöñüà€]*$/.test(t),one=gsm?160:70,many=gsm?153:67;return t.length<=one?1:Math.ceil(t.length/many)};
const smsNum=p=>{const d=waNumber(p);return d?"+"+d:""};
// sms: links open the phone's messages app; WhatsApp opens in a new tab (the WhatsApp app on a phone).
const openOut=u=>{if(DEMO||/^https:/.test(u))window.open(u,"_blank","noopener");else location.href=u};
async function loadPm(c){
  const ids=L.filter(l=>l.cls===c).map(l=>l.id);PM.msgs={};
  if(ids.length){
    const since=new Date(Date.now()-120*864e5).toISOString();
    const rows=await run(sb.from("parent_messages").select("learner_id,channel,language,sent_at").in("learner_id",ids).gte("sent_at",since).order("sent_at",{ascending:false}));
    rows.forEach(m=>{if(!PM.msgs[m.learner_id])PM.msgs[m.learner_id]=m});
  }
  PM.loadedFor=c;
}
async function pmLog(rows){
  await run(sb.from("parent_messages").insert(rows.map(r=>({learner_id:r.l.id,term_id:CURID||null,staff_id:ME.id,channel:r.ch,language:"en",body:r.body}))));
  const at=new Date().toISOString();
  rows.forEach(r=>{PM.sent[PM.kind+"|"+r.l.id+"|"+r.ch]=true;PM.msgs[r.l.id]={channel:r.ch,language:"en",sent_at:at}});
}
function pmView(){
  const vis=visCls();if(!vis.length)return `<p class="muted">You are not set as the teacher of a class yet.</p>`;
  const c=PM.cls=vis.includes(PM.cls)?PM.cls:vis[0],ls=L.filter(l=>l.cls===c),notice=PM.kind==="notice";
  const withNum=ls.filter(l=>waNumber(l.phone)),noText=notice&&!PM.text.trim();
  const chips=(k,v,label)=>`<button class="chip" data-${k}="${v}" aria-pressed="${PM[k]===v}">${label}</button>`;
  let h=`<div class="panel"><h2 style="margin-bottom:4px">Messages to parents</h2>
   <p class="muted" style="margin-top:0">Send every parent in a class a personal term update or a notice. Each button opens WhatsApp or SMS on <b>your</b> phone with the message ready: check it and press send there. The school pays nothing extra, and messages never mention support tiers, needs or health.</p>
   <div class="tools">${vis.map(x=>`<button class="chip" data-pmc="${x}" aria-pressed="${c===x}">${x} · ${esc(TEACH[x]||"")}</button>`).join("")}</div>
   <div class="tools"><span class="muted">Message</span>${chips("kind","update","Term update (personal)")}${chips("kind","notice","Notice (same for all)")}</div>`;
  if(notice){
    h+=`<p style="margin-bottom:4px"><label for="pm_text"><b>Notice</b></label></p>
     <textarea id="pm_text" rows="3" style="width:100%" maxlength="600" placeholder="For example: School closes on Friday at 12 noon.">${esc(PM.text)}</textarea>
     <div class="tools" style="margin-top:6px"><span class="muted">Start from</span>${NOTICE_T.map((t,i)=>`<button class="ghost" data-pmt="${i}">${t[0]}</button>`).join("")}</div>
     <p class="muted" style="margin:6px 0 4px">WhatsApp version (each parent gets their own name):</p>
     <pre class="pm-prev" id="pm_prev">${esc(pmNotice(withNum[0]||ls[0]||null,false))}</pre>
     <p class="muted" id="pm_smsn" style="margin:4px 0 10px">SMS version: "${esc(pmNotice(null,true))}" · ${smsParts(pmNotice(null,true))} SMS each</p>
     <button class="primary" id="pm_all" ${withNum.length&&!noText?"":"disabled"}>SMS to all ${withNum.length} parent${withNum.length===1?"":"s"}</button>
     <span class="muted" style="margin-left:8px">One message with every number filled in. Some phones only take the first number: then use the SMS buttons below one by one.</span>`;
  }else{
    h+=`<p class="muted" style="margin:0">Built from each child's latest end-of-term exam (or this term's scores so far) and attendance: the level in each learning area, what they do best, and one thing to try at home. Open a child below to read their message first.</p>`;
  }
  h+=`</div><div class="panel"><h3 style="margin-top:0">${esc(c)} parents (${ls.length})</h3>`;
  if(!ls.length)h+=`<p class="muted">There are no learners in ${esc(c)}.</p>`;
  if(PM.loadedFor!==c)h+=`<p class="muted">Loading the message history…</p>`;
  h+=ls.map(l=>{
    const num=waNumber(l.phone),m=PM.msgs[l.id],fn=l.name.split(" ")[0];
    const done=ch=>PM.sent[PM.kind+"|"+l.id+"|"+ch];
    const off=!num||noText;
    const last=m?`<span class="tag ok">&#10003; Last message ${esc(fmtDate(m.sent_at))} by ${m.channel==="sms"?"SMS":m.channel==="whatsapp"?"WhatsApp":"copy"}</span>`:`<span class="tag">No message in the last 4 months</span>`;
    const full=pmText(l,false),short=pmText(l,true);
    return `<div class="areaRow pm-row"><span style="display:flex;gap:10px;align-items:center;min-width:220px;flex:1">${av(l,36)}<span><b>${esc(l.name)}</b><br><span class="muted">${esc(l.guardian||"No guardian recorded")}${l.phone?" · "+esc(l.phone):""}</span></span></span>
     <span>${last}</span>
     <span class="pm-btns"><button class="${done("whatsapp")?"ghost":"primary"}" data-pmwa="${l.id}" ${off?"disabled":""}>${done("whatsapp")?"&#10003; WhatsApp opened":"WhatsApp"}</button>
     <button class="ghost" data-pmsms="${l.id}" ${off?"disabled":""}>${done("sms")?"&#10003; SMS opened":`SMS (${smsParts(short)})`}</button></span>
     ${!num?`<span class="muted" style="flex-basis:100%">No usable phone number for this guardian. Add it on the learner's page.</span>`:""}
     ${notice?"":`<details style="flex-basis:100%"><summary class="muted">Read ${esc(fn)}'s message</summary><pre class="pm-prev">${esc(full)}</pre><p class="muted" style="margin:4px 0">SMS version: "${esc(short)}"</p></details>`}</div>`}).join("");
  h+=`<p class="muted" style="margin-bottom:0">A tick is saved when you open WhatsApp or SMS, so the director can see which families were reached. If you did not press send on the phone, open it again.</p></div>`;
  return h;
}
function bindPm(){
  const c=PM.cls;
  if(PM.loadedFor!==c&&!S.pmLoading){S.pmLoading=true;loadPm(c).then(()=>{S.pmLoading=false;if(S.view==="par")rr()}).catch(e=>{S.pmLoading=false;PM.loadedFor=c;fail(e)})}
  document.querySelectorAll("[data-pmc]").forEach(b=>b.onclick=()=>{PM.cls=b.dataset.pmc;S.err="";render()});
  document.querySelectorAll("[data-kind]").forEach(b=>b.onclick=()=>{PM.kind=b.dataset.kind;rr()});
  document.querySelectorAll("[data-pmt]").forEach(b=>b.onclick=()=>{PM.text=NOTICE_T[+b.dataset.pmt][1];rr()});
  const ta=$("pm_text");
  if(ta){
    const refresh=()=>{const p=$("pm_prev"),n=$("pm_smsn"),ls=L.filter(l=>l.cls===c),one=ls.find(l=>waNumber(l.phone))||ls[0]||null,s=pmNotice(null,true);
      if(p)p.textContent=pmNotice(one,false);if(n)n.textContent=`SMS version: "${s}" · ${smsParts(s)} SMS each`};
    ta.oninput=()=>{const was=!!PM.text.trim();PM.text=ta.value;refresh();if(was!==!!PM.text.trim()){const pos=ta.selectionStart;rr();const t2=$("pm_text");if(t2){t2.focus();t2.setSelectionRange(pos,pos)}}};
  }
  const send=async(l,ch)=>{
    const num=waNumber(l.phone);if(!num||(PM.kind==="notice"&&!PM.text.trim()))return;
    const body=pmText(l,ch==="sms");
    openOut(ch==="sms"?`sms:${smsNum(l.phone)}?&body=${encodeURIComponent(body)}`:`https://wa.me/${num}?text=${encodeURIComponent(body)}`);
    try{await pmLog([{l,ch,body}]);rr()}catch(e){fail(e)}};
  document.querySelectorAll("[data-pmwa]").forEach(b=>b.onclick=()=>{const l=byId(b.dataset.pmwa);if(l)send(l,"whatsapp")});
  document.querySelectorAll("[data-pmsms]").forEach(b=>b.onclick=()=>{const l=byId(b.dataset.pmsms);if(l)send(l,"sms")});
  const all=$("pm_all");if(all)all.onclick=async()=>{
    const ls=L.filter(l=>l.cls===c&&waNumber(l.phone));if(!ls.length||!PM.text.trim())return;
    const body=pmNotice(null,true);
    openOut(`sms:${ls.map(l=>smsNum(l.phone)).join(",")}?&body=${encodeURIComponent(body)}`);
    try{await pmLog(ls.map(l=>({l,ch:"sms",body})));rr()}catch(e){fail(e)}};
}

/* ---------- director overview ---------- */
// The director's and senior teacher's first page: how each class is doing today and this term, and what needs attention.
// It reads only what the app already has, plus today's registers and this term's report comments.
const OV={loaded:false,day:"",att:[],staff:[],rc:[]};
async function loadOverview(){
  const d=todayStr(),opt=p=>p.catch(e=>{console.warn("Overview:",e&&e.message);return []});
  const [att,st,rc]=await Promise.all([
    opt(run(sb.from("attendance").select("learner_id,present").eq("day",d).range(0,4999))),
    ATX_OK?opt(run(sb.from("staff_attendance").select("staff_id,status").eq("day",d))):Promise.resolve([]),
    CHK_OK&&CURID?opt(fetchAll("report_comments","learner_id,teacher_comment,head_comment,term_id","learner_id")):Promise.resolve([])]);
  await ensureCurr();
  Object.assign(OV,{loaded:true,day:d,att,staff:st,rc:rc.filter(r=>r.term_id===CURID)});
}
// Why a child is on the "keep an eye on" list, in plain words.
function watchWhy(l){
  const w=[];
  if(has(l)&&avg(last(l))<2.5)w.push(`average ${f1(avg(last(l)))} of 5`);
  if(has(l)&&l.scores.length>1&&avg(last(l))-avg(first(l))<=-0.4)w.push("scores going down");
  if(l.att!==null&&l.att<80)w.push(`attendance ${l.att}%`);
  const g=(l.goals||[]).filter(x=>x.st&&x.st.overdue).length;if(g)w.push(g===1?"a goal needs a check-in":`${g} goals need a check-in`);
  return w;
}
function homeView(){
  if(!OV.loaded)return `<p class="muted">Loading the overview…</p>`;
  const cls=classList(),weekend=[0,6].includes(new Date().getDay());
  const here={},rcBy={};OV.att.forEach(a=>{here[a.learner_id]=a.present});OV.rc.forEach(r=>{rcBy[r.learner_id]=r});
  const qPend=Object.values(Q).flat(2).filter(q=>q.ok===false).length,aiPend=L.reduce((n,l)=>n+(l.pend||0),0);
  const marked=L.filter(l=>l.id in here),present=marked.filter(l=>here[l.id]).length;
  const watch=L.map(l=>({l,w:watchWhy(l)})).filter(x=>x.w.length).sort((a,b)=>b.w.length-a.w.length||a.l.name.localeCompare(b.l.name));
  const go=(v,t)=>`<button class="ghost" data-go="${v}" style="padding:2px 10px;font-size:.8rem">${t}</button>`;
  const when=new Date().toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long",year:"numeric"});

  // Things to do, most urgent first. Each one links to the page where it is fixed.
  const todo=[];
  cls.filter(c=>!TEACHID[c]).forEach(c=>todo.push([`${c} has no class teacher, so no teacher can see its children.`,isHead()?go("staff","Staff page"):""]));
  if(!weekend)cls.filter(c=>L.some(l=>l.cls===c)&&!L.some(l=>l.cls===c&&l.id in here)).forEach(c=>todo.push([`${c} attendance has not been marked today.`,go("att","Attendance")]));
  if(ATX_OK&&!weekend&&STAFFROWS.length&&OV.staff.length<STAFFROWS.length)todo.push([`Teacher register: ${STAFFROWS.length-OV.staff.length} of ${STAFFROWS.length} staff not marked today.`,go("att","Attendance")]);
  if(qPend)todo.push([`${qPend} question${qPend===1?"":"s"} waiting for approval in the Question bank.`,go("bank","Question bank")]);
  if(AI_OK&&aiPend)todo.push([`${aiPend} AI suggestion${aiPend===1?"":"s"} (goals or questions) waiting for a teacher to approve.`,go(isHead()?"teach":"list","See which")]);
  if(TIER_OK){const nt=L.filter(l=>!tierSet(l)).length;if(nt)todo.push([`${nt} learner${nt===1?" has":"s have"} no confirmed support tier.`,go("list","Learners")])}
  if(SUP_OK&&AI_OK&&MONTH_OK){const mt=monthTodo().length;if(mt)todo.push([`${mt} child${mt===1?" has":"ren have"} no plan for ${esc(monthName())} yet. They are made automatically after sign-in.`,go("list","Learners")])}
  if(isHead()&&!DEMO&&backupDue())todo.push([lastBackup()?`The last data backup on this computer was ${esc(fmtDate(lastBackup()))}. Download a new one (at least monthly).`:"No data backup has been downloaded on this computer yet. Supabase’s free plan keeps none.",go("staff","Staff page")]);
  const notDone=L.filter(l=>!done(l)).length;if(CUR&&notDone)todo.push([`${notDone} of ${L.length} learners are not fully assessed for ${esc(CUR)} yet.`,go("queue","Assessment")]);

  let h=`<div class="panel"><h2 style="margin-bottom:2px">Overview</h2><p class="muted" style="margin:0">${esc(when)} · ${esc(CUR||"No term set")}</p></div>
  <div class="stats">
   <div class="stat"><b>${L.length}</b><span>Active learners</span></div>
   <div class="stat"><b>${weekend?"—":marked.length?`${present} of ${marked.length}`:"—"}</b><span>${weekend?"Weekend, no register":marked.length?"Present today (marked so far)":"Attendance not marked yet today"}</span></div>
   <div class="stat"><b>${L.filter(done).length} of ${L.length}</b><span>Fully assessed in ${esc(CUR)}</span></div>
   <div class="stat"><b>${watch.length}</b><span>Children to keep an eye on</span></div>
   <div class="stat"><b>${qPend+(AI_OK?aiPend:0)}</b><span>Waiting for approval</span></div></div>`;

  h+=`<div class="panel"><h2>Needs attention</h2>${todo.length?`<ul class="ov-todo">${todo.map(t=>`<li><span>${t[0]}</span>${t[1]}</li>`).join("")}</ul>`:'<p class="muted" style="margin:0">Nothing needs attention right now.</p>'}</div>`;

  h+=`<div class="panel"><h2>Classes</h2><p class="muted">Averages are for ${esc(CUR)}, from 0 to 5, for children assessed in all areas. Classes are small, so one child can move an average a lot.</p>
  <div class="scroll"><table style="min-width:760px"><thead><tr><th>Class</th><th>Teacher</th><th>Learners</th><th>Here today</th><th>Fully assessed</th><th>Average</th><th>Curriculum taught</th>${CHK_OK?"<th>Report comments</th>":""}<th>Keep an eye on</th></tr></thead><tbody>`;
  cls.forEach(c=>{
    const ls=L.filter(l=>l.cls===c),n=ls.length,m=ls.filter(l=>l.id in here),full=ls.filter(done),items=COV_OK&&CIDONE?CI.filter(i=>i.cls===c):[];
    const pct=items.length?covPct(items):null,rcT=ls.filter(l=>rcBy[l.id]&&rcBy[l.id].teacher_comment).length,rcH=ls.filter(l=>rcBy[l.id]&&rcBy[l.id].head_comment).length;
    h+=`<tr><td><b>${c}</b></td><td>${TEACHID[c]?esc(TEACH[c]):'<span class="tag warn">Not assigned</span>'}</td><td>${n}</td>
    <td>${!n?"—":weekend?'<span class="muted">Weekend</span>':m.length?`${m.filter(l=>here[l.id]).length} of ${m.length}${m.length<n?` <span class="muted">(${n-m.length} not marked)</span>`:""}`:'<span class="tag warn">Not marked</span>'}</td>
    <td>${n?`${full.length} of ${n}<div class="bar" aria-hidden="true"><i style="width:${Math.round(100*full.length/n)}%"></i></div>`:"—"}</td>
    <td>${full.length?cell(avg(full.map(l=>avg(l.cur)))):"—"}</td>
    <td>${pct===null?'<span class="muted">—</span>':`${pct}%<div class="bar" aria-hidden="true"><i style="width:${pct}%"></i></div>`}</td>
    ${CHK_OK?`<td>${n?`Teacher ${rcT} of ${n}<br>Director ${rcH} of ${n}`:"—"}</td>`:""}
    <td>${watch.filter(x=>x.l.cls===c).length}</td></tr>`});
  h+=`</tbody></table></div></div>`;

  h+=`<div class="panel"><h2>Children to keep an eye on</h2><p class="muted">Low or falling scores, attendance under 80%, or a support goal without a recent check-in. This is a prompt to talk with the teacher, not a judgement on the child.</p>
  ${watch.length?`<div class="scroll"><table><thead><tr><th>Learner</th><th>Class</th><th>Why</th><th></th></tr></thead><tbody>${watch.slice(0,15).map(x=>`<tr><td><b>${esc(x.l.name)}</b></td><td>${x.l.cls}</td><td>${esc(x.w.join(", "))}</td><td><button class="ghost" data-open="${x.l.id}" style="padding:2px 10px;font-size:.8rem">Open</button></td></tr>`).join("")}</tbody></table></div>${watch.length>15?`<p class="muted">And ${watch.length-15} more. See the Learners page.</p>`:""}`:'<p class="muted" style="margin:0">No one right now.</p>'}</div>`;

  if(ATX_OK&&STAFFROWS.length){const by={};OV.staff.forEach(s=>{by[s.staff_id]=s.status});
    h+=`<div class="panel"><h2>Staff today</h2><div class="tools">${staffList().map(s=>`<span class="tag ${by[s.id]==="present"?"ok":by[s.id]?"warn":""}">${esc(s.name)} · ${by[s.id]?STAT[by[s.id]]:"Not marked"}</span>`).join(" ")}</div></div>`}
  return h;
}
function bindHome(){
  document.querySelectorAll("[data-go]").forEach(b=>b.onclick=()=>{const v=b.dataset.go;S.view=v;S.err="";if(v==="att"){AT.loaded=false;TA.loaded=false}if(v==="teach")TD=null;if(v==="staff")SD.loaded=false;render()});
  document.querySelectorAll("[data-open]").forEach(b=>b.onclick=()=>{S.sel=b.dataset.open;S.view="profile";S.err="";render()});
}

/* ---------- demo bar ---------- */
// Only in demo mode: says the children are made up, and lets the presenter see the app as each role.
function demoBar(){
  const bar=$("demobar");if(!bar)return;
  if(!DEMO||!ME){bar.hidden=true;return}
  const who=[["head","Director"],["pp2","Senior teacher"],["pp1","PP1 teacher"],["pg","Playgroup teacher"]];
  bar.hidden=false;
  bar.innerHTML=`<span><b>Demo</b> · made-up children only. Nothing is saved: refresh to start again.</span>
   <span class="demo-who" role="group" aria-label="View the demo as">View as: ${who.map(([k,n])=>`<button class="ghost" data-demo="${k}" aria-pressed="${DEMO.user===DEMO.staff[k].id}">${n}</button>`).join("")}</span>
   <a href="${location.pathname}">Leave the demo</a>`;
  bar.querySelectorAll("[data-demo]").forEach(b=>b.onclick=async()=>{
    if(S.batch){S.batch.stop=true;S.batch=null}const ap=$("autoplan");if(ap)ap.remove();
    DEMO.user=DEMO.staff[b.dataset.demo].id;S.err="";
    try{await enter({id:DEMO.user})}catch(e){fail(e)}});
}

/* ---------- page ---------- */
function render(){
  demoBar();
  const m=$("main");
  $("me").innerHTML=ME&&S.view!=="login"?`<span class="muted">Signed in as ${esc(ME.name)} · ${ROLEN[ME.role]||"Teacher"}</span> <button class="ghost" id="signout">Sign out</button>`:"";
  const so=$("signout");if(so)so.onclick=async()=>{if(DEMO){location.href=location.pathname;return}if(S.batch){S.batch.stop=true;S.batch=null}const ap=$("autoplan");if(ap)ap.remove();await sb.auth.signOut();ME=null;L=[];S.view="login";S.err="";S.sess=null;render()};
  if(S.view==="loading"){$("nav").innerHTML="";m.innerHTML=`<p class="muted">Loading…</p>`;return}
  if(S.view==="login"||!ME){
    $("nav").innerHTML="";m.innerHTML=loginView();
    $("signin").onclick=doLogin;$("pw").onkeydown=e=>{if(e.key==="Enter")doLogin()};return}
  const pend=isAdmin()?Object.values(Q).flat(2).filter(q=>q.ok===false).length:0;
  const tabs=(isAdmin()?[["home","Overview"]]:[]).concat([["list","Learners"],["queue","Assessment"],["att","Attendance"],["cov","Curriculum"],["rep","Report cards"],["par","Parents"],["bank","Question bank"+(pend?` (${pend} to approve)`:"")]]).concat(isAdmin()?[["add","Add learners"]]:[]).concat(isHead()?[["teach","Teaching insights"],["staff","Staff"]]:[]);
  const cur=S.view==="profile"?"list":S.view==="assess"||S.view==="check"?"queue":S.view;
  $("nav").innerHTML=tabs.map(t=>`<button data-t="${t[0]}" ${cur===t[0]?'aria-current="page"':''}>${t[1]}</button>`).join("");
  $("nav").querySelectorAll("button").forEach(b=>b.onclick=()=>{S.view=b.dataset.t;S.err="";S.sess=null;S.eq=null;S.wq=null;if(b.dataset.t==="teach")TD=null;if(b.dataset.t==="home")OV.loaded=false;if(b.dataset.t==="att"){AT.loaded=false;TA.loaded=false}if(b.dataset.t==="staff")SD.loaded=false;if(b.dataset.t==="cov")CIDONE=false;if(b.dataset.t==="rep"){S.rmsg=""}S.chk=null;AD.msg="";render()});
  applyPrefs();
  const err=S.err?`<div class="note watch" role="alert">${esc(S.err)} <button class="ghost" id="dismiss" style="padding:2px 10px;font-size:.8rem">Dismiss</button></div>`:"";
  m.innerHTML=err+(S.view==="home"?homeView():S.view==="list"?listView():S.view==="profile"?profileView():S.view==="queue"?queueView():S.view==="assess"?assessView():S.view==="bank"?bankView():S.view==="att"?attView():S.view==="add"?addView():S.view==="staff"?staffView():S.view==="cov"?covView():S.view==="rep"?repView():S.view==="par"?pmView():S.view==="check"?checkView():teachView());
  const dm=$("dismiss");if(dm)dm.onclick=()=>{S.err="";render()};
  if(S.view==="list"){fillGrid();$("q").oninput=e=>{S.q=e.target.value;fillGrid()};m.querySelectorAll(".chip[data-c]").forEach(b=>b.onclick=()=>{S.lcls=b.dataset.c;render()});const lp=$("lsp");if(lp)lp.onclick=()=>{S.lsp=!S.lsp;render()};m.querySelectorAll(".chip[data-tier]").forEach(b=>b.onclick=()=>{S.ltier=S.ltier===b.dataset.tier?"":b.dataset.tier;render()});const mr=$("m_run");if(mr)mr.onclick=()=>runMonthly(false)}
  if(S.view==="queue"){m.querySelectorAll(".chip[data-c]").forEach(b=>b.onclick=()=>{S.cls=b.dataset.c;render()});m.querySelectorAll(".chip[data-qm]").forEach(b=>b.onclick=()=>{S.qmode=b.dataset.qm;render()});m.querySelectorAll(".card").forEach(b=>b.onclick=()=>S.qmode==="check"&&CHK_OK?beginCheck(b.dataset.i):begin(b.dataset.i))}
  if(S.view==="check"){bindCheck();bindTabs()}
  if(S.view==="cov"){bindCov();bindTabs();if(COV_OK&&!CIDONE&&!S.covLoading){S.covLoading=true;loadCurr().then(()=>{S.covLoading=false;render()}).catch(e=>{S.covLoading=false;fail(e)})}}
  if(S.view==="rep"){bindRep();ensureRep()}
  if(S.view==="par")bindPm();
  if(S.view==="assess"){bindAssess();bindTabs()}
  if(S.view==="bank"){bindBank();bindTabs();bindPdf();if(COV_OK&&!CIDONE&&!S.ciTried){S.ciTried=true;ensureCurr().then(()=>{if(S.view==="bank")rr()})}}
  if(S.view==="att"){bindAtt();
    if(S.attTab==="staff"){if(ATX_OK&&!TA.loaded&&!S.atLoading){S.atLoading=true;if(!TA.date)TA.date=todayStr();loadStaffDay().then(()=>{S.atLoading=false;render()}).catch(e=>{S.atLoading=false;fail(e)})}}
    else if(!AT.loaded&&!S.atLoading){S.atLoading=true;if(!AT.date)AT.date=todayStr();loadDay().then(()=>{S.atLoading=false;render()}).catch(e=>{S.atLoading=false;fail(e)})}}
  if(S.view==="home"){bindHome();if(!OV.loaded&&!S.ovLoading){S.ovLoading=true;loadOverview().then(()=>{S.ovLoading=false;render()}).catch(e=>{S.ovLoading=false;OV.loaded=true;fail(e)})}}
  if(S.view==="add")bindAdd();
  if(S.view==="staff"){bindStaff();if(!SD.loaded&&!S.sdLoading){S.sdLoading=true;loadStaff().then(()=>{S.sdLoading=false;render()}).catch(e=>{S.sdLoading=false;fail(e)})}}
  if(S.view==="teach"){bindTeach();if(!TD&&!S.tdLoading){S.tdLoading=true;loadTeachData().then(()=>{S.tdLoading=false;render()}).catch(e=>{S.tdLoading=false;fail(e)})}}
  if(S.view==="profile"){
    const l=byId(S.sel);
    if(l&&!l.loaded&&!S.loadingProfile){S.loadingProfile=true;loadRecords(l).then(()=>{S.loadingProfile=false;render()}).catch(e=>{S.loadingProfile=false;fail(e)})}
    if(CHK_OK&&l&&l.loaded&&!l.chkLoaded&&!S.loadingChk){S.loadingChk=true;loadChecks(l).then(()=>{S.loadingChk=false;render()}).catch(e=>{S.loadingChk=false;l.chkLoaded=true;fail(e)})}
    bindProfile();
  }
}
(()=>{const b=id=>document.getElementById(id);
  if(b("pf-up"))b("pf-up").onclick=()=>setPref("size",Math.min(3,PREF.size+1));
  if(b("pf-down"))b("pf-down").onclick=()=>setPref("size",Math.max(0,PREF.size-1));
  if(b("pf-hc"))b("pf-hc").onclick=()=>setPref("hc",!PREF.hc);
  applyPrefs()})();
boot();