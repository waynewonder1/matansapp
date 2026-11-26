/* Demo mode: open the app with ?demo at the end of the address (for example matan.vercel.app/?demo).
   Everything runs in this browser tab with MADE-UP children and staff. Nothing is read from or saved to the real
   database, nothing is sent to the AI, and every change disappears when the page is refreshed.
   The question bank, curriculum, classes and terms are the real ones (demo-data.js), because they hold no personal data. */
(function () {
  "use strict";
  const REF = window.MATAN_DEMO_DATA || {};
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const iso = (d) => d.toISOString();
  const day = (d) => d.toLocaleDateString("en-CA");
  const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d; };
  const at = (s) => new Date(s + "T09:30:00");

  // Repeatable "random" numbers, so the demo looks the same every time.
  let seed = 20261124;
  const rnd = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  let idn = 0;
  const uid = () => { idn++; const h = (n, l) => n.toString(16).padStart(l, "0").slice(-l); return `de300000-0000-4000-8000-${h(idn, 12)}`; };
  const newId = () => (crypto && crypto.randomUUID ? crypto.randomUUID() : uid());

  /* ---------------- the made-up school ---------------- */
  const T = {};
  for (const k of ["classes", "learning_areas", "terms", "competencies", "question_variants", "curriculum_items"]) T[k] = clone(REF[k] || []);
  for (const k of ["staff", "learners", "guardians", "assessment_records", "teacher_notes", "attendance", "ai_insights", "parent_messages", "follow_up_actions",
    "score_reviews", "learner_consents", "learner_support_profiles", "learner_health_notes", "learner_needs", "learner_accommodations", "learner_goals",
    "goal_progress", "learner_questions", "learner_question_records", "staff_attendance", "learner_tiers", "learner_reports", "curriculum_coverage",
    "check_records", "assessment_notes", "report_comments", "audit_log"]) T[k] = [];

  const STAFF = {
    head: { id: "de500000-0000-4000-8000-000000000001", name: "Mrs. Wairimu (demo director)", role: "head", phone: null, active: true },
    pg: { id: "de500000-0000-4000-8000-000000000002", name: "Ms. Akinyi (demo)", role: "teacher", phone: null, active: true },
    pp1: { id: "de500000-0000-4000-8000-000000000003", name: "Ms. Chebet (demo)", role: "teacher", phone: null, active: true },
    pp2: { id: "de500000-0000-4000-8000-000000000004", name: "Mr. Mutua (demo senior teacher)", role: "senior", phone: null, active: true },
  };
  T.staff = Object.values(STAFF).map(clone);
  const CLS = {}; T.classes.forEach((c) => { CLS[c.name] = c.id; c.teacher_id = (STAFF[c.name.toLowerCase()] || {}).id || null; });
  const TEACHER = { PG: STAFF.pg.id, PP1: STAFF.pp1.id, PP2: STAFF.pp2.id };

  const terms = T.terms.slice().sort((a, b) => a.id - b.id), CUR = terms[terms.length - 1];
  const termDate = (i) => { const n = terms.length - 1 - i; return daysAgo(14 + n * 120); };  // older terms further back

  const NAMES = {
    PG: ["Zawadi Kerubo", "Neema Wambui", "Tumaini Odhiambo", "Jabari Kiprono", "Amani Nduta", "Baraka Ouma", "Pendo Jeptoo", "Hodari Mwangi"],
    PP1: ["Imani Achieng", "Kito Barasa", "Nia Wanjiku", "Juma Kibet", "Shani Moraa", "Tafari Njoroge", "Wema Atieno", "Bahati Kamau"],
    PP2: ["Furaha Nyambura", "Jelani Otieno", "Makena Chepkoech", "Rafiki Mutiso", "Subira Awino", "Taji Kipchumba", "Waridi Muthoni", "Zuri Omondi"],
  };
  const AGE = { PG: 3, PP1: 4, PP2: 5 }, year = new Date().getFullYear();
  const kids = [];
  Object.entries(NAMES).forEach(([cls, names]) => names.forEach((full, i) => {
    const id = uid();
    const k = { id, cls, first: full.split(" ")[0], ability: 2 + rnd() * 2.2, growth: -0.15 + rnd() * 0.55, attend: i === 3 ? 0.72 : 0.9 + rnd() * 0.09, i };
    kids.push(k);
    T.learners.push({ id, full_name: full, class_id: CLS[cls], birth_year: year - AGE[cls], joined_on: cls === "PP2" ? "2025-01-08" : "2026-01-07", photo_url: null, photo_consent: false, active: true });
    T.guardians.push({ id: uid(), learner_id: id, name: (i % 2 ? "Baba " : "Mama ") + k.first, phone: "0700 000 " + String(100 + kids.length).padStart(3, "0") });
  }));
  const kid = (first) => kids.find((k) => k.first === first);
  // A few children whose scores make the "keep an eye on" list.
  kid("Hodari").ability = 1.6; kid("Hodari").growth = -0.25; kid("Juma").ability = 1.9;

  /* term assessments: up to 3 questions per learning area, scored by the class teacher */
  const vA = {}; T.question_variants.forEach((v) => { if (v.variant === "A" && v.status !== "rejected") vA[v.competency_id] = v; });
  // Outcomes with an approved question first; an area with none still gets scores, so every class looks complete.
  const comps = {}; T.competencies.forEach((c) => (comps[c.class_id + "|" + c.area_id] = comps[c.class_id + "|" + c.area_id] || []).push(c));
  const ok = (c) => (vA[c.id] && vA[c.id].status === "approved" ? 0 : 1);
  Object.values(comps).forEach((l) => l.sort((a, b) => ok(a) - ok(b) || a.id - b.id));
  const areaIds = {}; T.competencies.forEach((c) => { (areaIds[c.class_id] = areaIds[c.class_id] || new Set()).add(c.area_id); });
  let seq = 1000;
  const rec = (k, term, c, score, role, rater, when) => {
    const r = { id: uid(), public_id: "R" + String(++seq).padStart(6, "0"), learner_id: k.id, term_id: term.id, competency_id: c.id, variant_id: vA[c.id] ? vA[c.id].id : null,
      rater_id: rater, rater_role: role, score: String(score), support_code: score <= 2 ? pick(["R1", "R4"]) : "R0", comment: null, revision_of: null, entered_at: iso(when), adapted: false };
    T.assessment_records.push(r); return r;
  };
  kids.forEach((k) => {
    const cid = CLS[k.cls], areas = [...(areaIds[cid] || [])].sort((a, b) => a - b);
    terms.forEach((term, ti) => {
      if (k.cls !== "PP2" && ti === 0) return;   // PG and PP1 joined this year
      const isCur = term.id === CUR.id, doneAreas = isCur ? (k.i % 4 === 3 ? 2 : 5) : 5;  // some children not finished this term
      areas.slice(0, doneAreas).forEach((aid, ai) => {
        (comps[cid + "|" + aid] || []).slice(0, 3).forEach((c, qi) => {
          const s = Math.max(1, Math.min(5, Math.round(k.ability + k.growth * ti + (ai === 1 ? 0.3 : ai === 3 ? -0.3 : 0) + (rnd() - 0.5) * 1.2)));
          const when = termDate(ti); when.setHours(9 + qi);
          rec(k, term, c, s, "teacher", TEACHER[k.cls], when);
          // the director also scores some children this term, to show teacher and director agreement
          if (isCur && k.i % 3 === 0 && qi === 0) rec(k, term, c, Math.max(0, Math.min(5, s + (k.i === 0 && ai === 0 ? 2 : pick([0, 0, 1, -1])))), "director", STAFF.head.id, when);
        });
      });
    });
  });

  /* attendance for the last six weeks (today: PP2 not marked yet, so the overview has something to show) */
  for (let n = 42; n >= 0; n--) {
    const d = daysAgo(n); if (d.getDay() === 0 || d.getDay() === 6) continue;
    kids.forEach((k) => { if (n === 0 && k.cls === "PP2") return; const p = rnd() < k.attend;
      T.attendance.push({ learner_id: k.id, day: day(d), present: p, late: p && rnd() < 0.05, reason: p ? null : pick(["Sick", "Family matter", "Transport", "Not known"]) }); });
    Object.values(STAFF).forEach((s, si) => { if (n === 0 && si === 3) return;
      const st = n === 0 && si === 1 ? "late" : rnd() < 0.94 ? "present" : pick(["late", "absent", "leave"]);
      T.staff_attendance.push({ id: uid(), staff_id: s.id, day: day(d), status: st, time_in: st === "late" ? "08:20" : st === "present" ? "07:30" : null, note: null, marked_by: STAFF.head.id, created_at: iso(d) }); });
  }

  /* support plans, needs, goals, tiers, consents */
  const plan = (k, pathway, needs, acc, tier, report) => {
    T.learner_support_profiles.push({ learner_id: k.id, pathway, communication_notes: "Made-up example: speak first, then guide the hand to the object.", what_works: "Short turns, real objects, praise for effort.", what_to_avoid: "Long waits without a cue.", next_review: day(daysAgo(-60)), created_by: STAFF.head.id, created_at: iso(daysAgo(90)), updated_by: STAFF.head.id, updated_at: iso(daysAgo(30)) });
    needs.forEach(([t, d]) => T.learner_needs.push({ id: uid(), learner_id: k.id, need_type: t, detail: d, source: "doctor", recorded_on: day(daysAgo(90)), active: true, created_by: STAFF.head.id, created_at: iso(daysAgo(90)) }));
    acc.forEach((a) => T.learner_accommodations.push({ id: uid(), learner_id: k.id, accommodation: a, applies_to: "both", active: true, created_by: STAFF.head.id, created_at: iso(daysAgo(90)) }));
    T.learner_reports.push({ learner_id: k.id, report, updated_by: STAFF.head.id, updated_at: iso(daysAgo(90)) });
    T.learner_consents.push({ id: uid(), learner_id: k.id, kind: "support_needs", granted_by: "Guardian (demo)", granted_on: day(daysAgo(95)), withdrawn_on: null, recorded_by: STAFF.head.id, created_at: iso(daysAgo(95)) });
    T.learner_tiers.push({ learner_id: k.id, declared: tier === "C" ? "severe" : "some", suggested_tier: tier, suggestion_reason: "Made-up example.", suggested_at: iso(daysAgo(90)), confirmed_tier: tier, confirmed_by: STAFF.head.id, confirmed_at: iso(daysAgo(89)), updated_at: iso(daysAgo(89)) });
  };
  const goal = (k, domain, text, base, target, weeks, checkins) => {
    const g = { id: uid(), learner_id: k.id, domain, goal: text, baseline: base, target, target_date: day(daysAgo(-7 * weeks)), status: "active", achieved_on: null, term_id: CUR.id,
      created_by: TEACHER[k.cls], created_at: iso(daysAgo(60)), source: "teacher", rationale: null, approved_by: null, approved_at: null, month: null };
    T.learner_goals.push(g);
    checkins.forEach(([ago, lvl, note]) => T.goal_progress.push({ id: uid(), goal_id: g.id, level: lvl, note, rater_id: TEACHER[k.cls], entered_at: iso(daysAgo(ago)) }));
  };
  plan(kid("Kito"), "specialised_foundation", [["visual", "Made-up example: blind since birth."]], ["Pre-Braille or Braille materials", "Extra time", "Short, one-step instructions"], "C",
    "MADE-UP DEMO REPORT. The child has no useful vision in either eye. Recommend tactile materials, verbal description and orientation and mobility support.");
  goal(kid("Kito"), "Orientation and mobility", "Walks from the classroom door to own seat using the wall and a guide rail.", "Needs a hand to hold all the way", "Does it alone 4 days out of 5", 8, [[40, 1, "Holds hand"], [20, 2, "Half way alone"]]);
  goal(kid("Kito"), "Pre-numeracy and pre-literacy", "Counts up to 5 bottle tops by touch.", "Counts to 2", "Counts to 5 correctly", 6, [[30, 2, ""], [9, 3, "Up to 3 now"]]);
  plan(kid("Furaha"), "regular_adapted", [["hearing", "Made-up example: mild hearing loss in the left ear."]], ["Seat near the front", "Picture or object cues"], "B",
    "MADE-UP DEMO REPORT. Mild hearing loss in the left ear. Seat near the front and face the child when speaking.");
  goal(kid("Furaha"), "Communication and social skills", "Asks a friend to share using a full sentence.", "Points or takes", "Asks with a sentence 3 times a day", 6, [[25, 2, ""]]);
  plan(kid("Tumaini"), "regular_adapted", [["speech_language", "Made-up example: speech is hard to understand for new adults."]], ["Picture or object cues", "Short, one-step instructions"], "B",
    "MADE-UP DEMO REPORT. Speech delay. Speech therapy once a fortnight.");
  T.learner_tiers.find((t) => t.learner_id === kid("Tumaini").id).confirmed_tier = null;  // suggested only, waiting for the director
  kids.forEach((k) => {
    if (!T.learner_tiers.some((t) => t.learner_id === k.id) && k.i !== 5) T.learner_tiers.push({ learner_id: k.id, declared: "none", suggested_tier: null, suggestion_reason: null, suggested_at: null, confirmed_tier: "A", confirmed_by: STAFF.head.id, confirmed_at: iso(daysAgo(80)), updated_at: iso(daysAgo(80)) });
    if (k.i % 4 !== 2) T.learner_consents.push({ id: uid(), learner_id: k.id, kind: "gemini", granted_by: "Guardian (demo)", granted_on: day(daysAgo(95)), withdrawn_on: null, recorded_by: STAFF.head.id, created_at: iso(daysAgo(95)) });
  });

  /* notes, follow-up actions, an AI summary, report comments */
  T.teacher_notes.push({ id: uid(), learner_id: kid("Hodari").id, staff_id: STAFF.pg.id, body: "Made-up note: tired in the mornings this week. Spoke with Mama Hodari.", created_at: iso(daysAgo(6)) });
  T.teacher_notes.push({ id: uid(), learner_id: kid("Kito").id, staff_id: STAFF.pp1.id, body: "Made-up note: enjoyed the counting song with bottle tops.", created_at: iso(daysAgo(3)) });
  T.follow_up_actions.push({ id: uid(), learner_id: kid("Juma").id, area_id: null, action: "Call the guardian about attendance (demo)", owner_id: STAFF.pp1.id, due_date: day(daysAgo(4)), status: "open", created_by: STAFF.head.id, created_at: iso(daysAgo(14)), completed_at: null, completed_by: null, goal_id: null });
  T.follow_up_actions.push({ id: uid(), learner_id: kid("Hodari").id, area_id: null, action: "Extra sound games in small group (demo)", owner_id: STAFF.pg.id, due_date: day(daysAgo(-10)), status: "open", created_by: STAFF.pg.id, created_at: iso(daysAgo(5)), completed_at: null, completed_by: null, goal_id: null });
  T.ai_insights.push({ id: uid(), learner_id: kid("Makena").id, term_id: CUR.id, model: "demo", generated_at: iso(daysAgo(2)), reviewed_by: null, content: {
    summary: "Made-up example. Makena is making steady progress, strongest in Mathematical Activities.", strengths: ["Counts objects to 20 with confidence", "Joins in group songs"],
    watch: ["Letter sounds are still mixed up"], suggestions: [{ area: "Language Activities", activity: "Play 'I spy' with first sounds for five minutes a day" }],
    parent: { summary: "Makena is doing well and enjoys counting.", strengths: ["Counting", "Singing"], support: "Practise first sounds of words at home.", ideas: ["Name things that start with 'm' on the way home"] } } });
  kids.filter((k) => k.cls === "PP1" && k.i < 3).forEach((k) => T.report_comments.push({ learner_id: k.id, term_id: CUR.id, teacher_comment: "Made-up comment: a cheerful learner who is growing in confidence.", head_comment: null, teacher_by: STAFF.pp1.id, head_by: null, updated_at: iso(daysAgo(1)) }));

  /* curriculum: about half of each area taught so far */
  const order = T.curriculum_items.slice().sort((a, b) => a.sort - b.sort);
  ["PG", "PP1", "PP2"].forEach((cls) => [0, 1, 2, 3, 4].forEach((a) => {
    const it = order.filter((i) => i.cls === cls && i.area === a), n = Math.round(it.length * (0.4 + rnd() * 0.25));
    it.slice(0, n).forEach((i, j) => { const ago = 5 + Math.round((n - j) * 160 / Math.max(1, n)), ti = Math.max(0, terms.length - 1 - Math.floor(ago / 120));
      T.curriculum_coverage.push({ id: uid(), item_id: i.id, term_id: terms[ti].id, taught_on: day(daysAgo(ago)), taught_by: TEACHER[cls], note: null, created_at: iso(daysAgo(ago)) }); });
  }));

  /* ---------------- a small stand-in for the Supabase database ---------------- */
  const NOID = new Set(["attendance", "learner_support_profiles", "learner_health_notes", "learner_tiers", "learner_reports", "report_comments"]);
  const INTID = new Set(["classes", "learning_areas", "terms", "competencies", "audit_log"]);
  const DEF = {
    question_variants: { status: "pending", touch_status: "pending", created_at: "now" }, competencies: { source: "curriculum" },
    learners: { active: true, photo_consent: false }, staff: { active: true },
    assessment_records: { support_code: "R0", adapted: false, entered_at: "now", revision_of: null, comment: null },
    attendance: { late: false }, learner_goals: { status: "active", source: "teacher", created_at: "now" },
    learner_questions: { status: "proposed", source: "ai", created_at: "now" }, follow_up_actions: { status: "open", created_at: "now" },
    learner_support_profiles: { pathway: "regular_adapted", created_at: "now", updated_at: "now" }, learner_needs: { active: true, recorded_on: "today", created_at: "now" },
    learner_accommodations: { active: true, applies_to: "both", created_at: "now" }, learner_tiers: { declared: "none", updated_at: "now" },
    assessment_notes: { kind: "check", source: "rules", created_at: "now" }, learner_consents: { granted_on: "today", created_at: "now" },
    curriculum_coverage: { taught_on: "today", created_at: "now" }, report_comments: { updated_at: "now" }, learner_reports: { updated_at: "now" },
    learner_health_notes: { updated_at: "now" }, teacher_notes: { created_at: "now" }, parent_messages: { sent_at: "now" }, ai_insights: { generated_at: "now" },
    score_reviews: { reviewed_at: "now" }, goal_progress: { entered_at: "now" }, learner_question_records: { support_code: "R0", entered_at: "now" },
    check_records: { entered_at: "now" }, staff_attendance: { created_at: "now" },
  };
  function withDefaults(t, row) {
    const r = Object.assign({}, row), d = DEF[t] || {};
    for (const k in d) if (r[k] === undefined) r[k] = d[k] === "now" ? iso(new Date()) : d[k] === "today" ? day(new Date()) : d[k];
    if (!NOID.has(t) && r.id === undefined) r.id = INTID.has(t) ? Math.max(0, ...T[t].map((x) => +x.id || 0)) + 1 : newId();
    if (t === "assessment_records" && !r.public_id) r.public_id = "R" + String(++seq).padStart(6, "0");
    return r;
  }
  // The two score views, worked out from the records the same way the database does.
  const live = (r) => !T.assessment_records.some((x) => x.revision_of === r.id);
  const num05 = (s) => /^[0-5]$/.test(String(s));
  const VIEWS = {
    area_scores() {
      const comp = {}; T.competencies.forEach((c) => (comp[c.id] = c));
      const g = {};
      T.assessment_records.filter((r) => r.rater_role === "teacher" && num05(r.score) && live(r) && comp[r.competency_id]).forEach((r) => {
        const k = r.learner_id + "|" + r.term_id + "|" + comp[r.competency_id].area_id;
        (g[k] = g[k] || { learner_id: r.learner_id, term_id: r.term_id, area_id: comp[r.competency_id].area_id, s: [] }).s.push(+r.score);
      });
      return Object.values(g).map((x) => ({ learner_id: x.learner_id, term_id: x.term_id, area_id: x.area_id, score: Math.round(x.s.reduce((a, b) => a + b, 0) / x.s.length), questions_scored: x.s.length }));
    },
    rater_agreement() {
      const out = [], recs = T.assessment_records.filter((r) => num05(r.score) && live(r));
      recs.filter((t) => t.rater_role === "teacher").forEach((t) => recs.filter((d) => d.rater_role === "director" && d.learner_id === t.learner_id && d.term_id === t.term_id && d.competency_id === t.competency_id)
        .forEach((d) => out.push({ learner_id: t.learner_id, term_id: t.term_id, competency_id: t.competency_id, teacher_score: +t.score, director_score: +d.score, gap: Math.abs(+t.score - +d.score) })));
      return out;
    },
  };
  const same = (a, b) => String(a) === String(b);
  const cmp = (a, b) => (typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b)));
  function project(t, row, cols) {
    if (!cols || cols.trim() === "*") return clone(row);
    const out = {};
    cols.split(/,(?![^(]*\))/).map((c) => c.trim()).filter(Boolean).forEach((c) => {
      const m = /^(\w+)\(([^)]*)\)$/.exec(c);
      if (m) { const ref = (T[m[1]] || []).find((x) => same(x.id, row[m[1] + "_id"])); out[m[1]] = ref ? project(m[1], ref, m[2]) : null; }
      else out[c] = row[c] === undefined ? null : clone(row[c]);
    });
    return out;
  }
  class Query {
    constructor(t) { this.t = t; this.op = "select"; this.f = []; this.ord = []; this.cols = "*"; this.lo = 0; this.hi = Infinity; this.one = null; this.ret = false; }
    select(c) { if (this.op === "select") this.cols = c || "*"; else { this.ret = true; this.rcols = c || "*"; } return this; }
    eq(c, v) { this.f.push((r) => same(r[c], v)); return this; }
    neq(c, v) { this.f.push((r) => !same(r[c], v)); return this; }
    in(c, vs) { const s = new Set(vs.map(String)); this.f.push((r) => s.has(String(r[c]))); return this; }
    gte(c, v) { this.f.push((r) => r[c] !== null && r[c] !== undefined && cmp(r[c], v) >= 0); return this; }
    lte(c, v) { this.f.push((r) => r[c] !== null && r[c] !== undefined && cmp(r[c], v) <= 0); return this; }
    gt(c, v) { this.f.push((r) => r[c] !== null && r[c] !== undefined && cmp(r[c], v) > 0); return this; }
    lt(c, v) { this.f.push((r) => r[c] !== null && r[c] !== undefined && cmp(r[c], v) < 0); return this; }
    is(c, v) { this.f.push((r) => (v === null ? r[c] === null || r[c] === undefined : r[c] === v)); return this; }
    match(o) { Object.entries(o).forEach(([c, v]) => this.eq(c, v)); return this; }
    order(c, o) { this.ord.push([c, !o || o.ascending !== false]); return this; }
    range(a, b) { this.lo = a; this.hi = b; return this; }
    limit(n) { this.hi = this.lo + n - 1; return this; }
    single() { this.one = "single"; return this; }
    maybeSingle() { this.one = "maybe"; return this; }
    insert(rows) { this.op = "insert"; this.rows = rows; return this; }
    upsert(rows, o) { this.op = "upsert"; this.rows = rows; this.keys = ((o && o.onConflict) || "id").split(",").map((s) => s.trim()); return this; }
    update(v) { this.op = "update"; this.vals = v; return this; }
    delete() { this.op = "delete"; return this; }
    run() {
      const t = this.t, ok = (data) => ({ data, error: null, count: Array.isArray(data) ? data.length : null, status: 200 });
      if (!VIEWS[t] && !T[t]) return { data: null, error: { message: `relation "public.${t}" does not exist`, code: "42P01" } };
      if (this.op === "select") {
        let rows = (VIEWS[t] ? VIEWS[t]() : T[t]).filter((r) => this.f.every((f) => f(r)));
        if (this.ord.length) rows = rows.slice().sort((a, b) => { for (const [c, asc] of this.ord) { const x = a[c], y = b[c]; if (x === y) continue; if (x === null || x === undefined) return 1; if (y === null || y === undefined) return -1; const d = cmp(x, y); if (d) return asc ? d : -d; } return 0; });
        rows = rows.slice(this.lo, this.hi === Infinity ? undefined : this.hi + 1).map((r) => project(t, r, this.cols));
        return this.finish(rows, ok);
      }
      const list = Array.isArray(this.rows) ? this.rows : this.rows ? [this.rows] : [];
      let touched = [];
      if (this.op === "insert") touched = list.map((r) => { const x = withDefaults(t, r); T[t].push(x); return x; });
      if (this.op === "upsert") touched = list.map((r) => {
        const old = T[t].find((x) => this.keys.every((k) => same(x[k], r[k])));
        if (old) { Object.assign(old, r); return old; }
        const x = withDefaults(t, r); T[t].push(x); return x;
      });
      if (this.op === "update") touched = T[t].filter((r) => this.f.every((f) => f(r))).map((r) => Object.assign(r, clone(this.vals)));
      if (this.op === "delete") { touched = T[t].filter((r) => this.f.every((f) => f(r))); T[t] = T[t].filter((r) => !touched.includes(r)); }
      return this.finish(this.ret ? touched.map((r) => project(t, r, this.rcols)) : null, ok);
    }
    finish(rows, ok) {
      if (!this.one) return ok(rows);
      const r = rows && rows[0];
      if (!r && this.one === "single") return { data: null, error: { message: "JSON object requested, multiple (or no) rows returned", code: "PGRST116" } };
      return ok(r || null);
    }
    then(res, rej) { return new Promise((ok) => setTimeout(ok, 40)).then(() => this.run()).then(res, rej); }
  }

  /* ---------------- sign-in, storage and the AI services ---------------- */
  const demo = { user: STAFF.head.id, staff: STAFF };
  const session = () => ({ access_token: "demo", user: { id: demo.user, email: "demo@example.invalid" } });
  demo.client = {
    from: (t) => new Query(t),
    auth: {
      getSession: async () => ({ data: { session: session() }, error: null }),
      signInWithPassword: async () => ({ data: { user: session().user, session: session() }, error: null }),
      signOut: async () => ({ error: null }),
    },
    storage: { from: () => ({ createSignedUrl: async () => ({ data: null, error: { message: "The curriculum PDFs are not part of the demo." } }) }) },
  };
  const DOM = ["Language", "Maths", "Environment", "Creative", "Christian RE"];
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const reply = (code, obj) => new Response(JSON.stringify(obj), { status: code, headers: { "Content-Type": "application/json" } });
  const api = {
    async "ai-plan"(b) {
      const p = b.payload || {}, cur = p.curriculum || [], blind = (p.need_types || []).includes("visual");
      const sc = p.this_term || (p.terms && p.terms.length ? p.terms[p.terms.length - 1].scores : {}) || {};
      const vals = Object.values(sc), low = vals.length ? vals.indexOf(Math.min(...vals.filter((v) => v !== null))) : 0, a = low < 0 ? 0 : low;
      const next = (i) => cur.filter((c) => c.area === i && !c.taught)[0] || cur.filter((c) => c.area === i)[0];
      const goals = [{ domain: DOM[a], goal: `Practise ${next(a) ? next(a).sub_strand.toLowerCase() : "this area"} in short daily turns (demo suggestion).`, baseline: "Not yet secure", target: "Does it correctly 3 days out of 5", weeks: 4, reason: "Made-up demo suggestion: this was the lowest area." }];
      const questions = [a, (a + 1) % 5, (a + 2) % 5].map((i) => { const c = next(i); const sub = c ? c.sub_strand : "this sub-strand";
        return { area: i, shown: blind ? "🤲" : "💬", prompt: blind ? `Give the child real objects and ask them to show you ${sub.toLowerCase()} by touch.` : `Ask the child to show or tell you about ${sub.toLowerCase()}.`,
          look_for: "Answers with little help (demo)", reason: "Made-up demo question.", adapted_for: blind ? "visual" : null, sub_strand: c ? c.sub_strand : null }; });
      return reply(200, { goals, questions });
    },
    async "ai-bank"(b) {
      if (b.mode === "touch") return reply(200, { touch: (b.items || []).map((x) => ({ id: x.id, touch: "Demo touch version: give the child real objects to hold, and ask them to show the answer with their hands." })) });
      return reply(200, { questions: (b.items || []).map((x) => ({ id: x.id, shown: "💬", prompt: `Demo question: ask the child to show what they know about ${String(x.sub_strand || "this").toLowerCase()}.`, touch: null })) });
    },
    async "ai-tier"(b) {
      const r = String(b.report || "").toLowerCase(), need = [];
      if (/blind|vision|sight|see/.test(r)) need.push("visual"); if (/hear|deaf/.test(r)) need.push("hearing"); if (/speech|talk/.test(r)) need.push("speech_language");
      return reply(200, { tier: b.declared === "severe" ? "C" : b.declared === "some" || need.length ? "B" : "A", reason: "Made-up demo suggestion based on the words in the report.", need_types: need, unclear: "" });
    },
    async "ai-note"(b) {
      return reply(200, { note: b.mode === "report" ? "Made-up demo comment: a happy learner who has grown in confidence this term. Keep practising counting and first sounds at home." : "Made-up demo note: secure in most questions. Repeat the harder ones next week with real objects." });
    },
    async insights(b, lid) {
      const content = { summary: "Made-up demo summary: steady progress this term.", strengths: ["Takes part in group work"], watch: ["Some letter sounds"], suggestions: [{ area: "Language Activities", activity: "Short sound games every day" }],
        parent: { summary: "Your child is making steady progress.", strengths: ["Joins in"], support: "Practise sounds at home.", ideas: ["Sing a sounds song together"] } };
      T.ai_insights.push({ id: newId(), learner_id: lid, term_id: CUR.id, content, model: "demo", generated_at: iso(new Date()), reviewed_by: null });
      return reply(200, content);
    },
    async staff(b) {
      if (b.action === "create") { const id = newId(); T.staff.push({ id, name: b.name, role: b.role, phone: b.phone || null, active: true });
        if (b.class_name) { const c = T.classes.find((x) => x.name === b.class_name); if (c) c.teacher_id = id; }
        return reply(200, { id, email: b.email, password: "demo-pass-1234" }); }
      if (b.action === "reset_password") return reply(200, { password: "demo-pass-5678" });
      return reply(400, { error: "Unknown action." });
    },
  };
  // Every call to the app's own services is answered here. Nothing leaves this browser tab.
  const realFetch = window.fetch.bind(window);
  window.fetch = async (url, opts) => {
    const u = String(url), m = /\/api\/(?:learners\/([^/]+)\/(insights)|([a-z-]+))/.exec(u);
    if (!m) return realFetch(url, opts);
    let body = {}; try { body = JSON.parse((opts && opts.body) || "{}"); } catch (e) {}
    await wait(500 + Math.round(rnd() * 500));
    const h = api[m[2] || m[3]];
    return h ? h(body, m[1]) : reply(404, { error: "Not part of the demo." });
  };
  // WhatsApp and phone links would reach real people, so the demo shows the message instead.
  const realOpen = window.open.bind(window);
  window.open = (url, ...rest) => {
    if (/^(https:\/\/wa\.me|tel:|sms:)/.test(String(url || ""))) {
      const u = String(url), sms = /^sms:/.test(u);
      const text = (/[?&](?:text|body)=([^&]*)/.exec(u) || [])[1];
      const to = sms ? decodeURIComponent(u.slice(4).split("?")[0]).split(",").filter(Boolean) : [];
      alert((sms ? `Demo: in the real app this opens SMS on your phone, to ${to.length} number${to.length === 1 ? "" : "s"}.` : "Demo: in the real app this opens WhatsApp.")
        + " The message would be:\n\n" + (text ? decodeURIComponent(text) : "(no message)"));
      return null;
    }
    return realOpen(url, ...rest);
  };
  window.MATAN_DEMO = demo;
})();
