// api/ai-plan.js: a Vercel function that suggests goals and individual questions for one learner.
// Environment variables (Vercel, Settings, Environment Variables):
//   SUPABASE_URL, SUPABASE_ANON_KEY, GEMINI_API_KEY, GEMINI_MODEL
//
// The browser sends its own sign-in token. This function uses that token to ask Supabase who the person is
// and whether the guardian has signed the AI consent for this child. Without both, nothing is sent to Gemini.
// Only these fields ever reach Gemini: class, age, pathway, types of need, accommodations, scores,
// current goals and earlier individual questions. Never a name, a note, a health note or guardian details.
// Goals and questions are typed by people, so the child's and guardians' names are removed from them here too (api/_privacy.js).

const { namesFor, redact } = require("./_privacy");
const GEMINI = process.env.GEMINI_API_BASE || "https://generativelanguage.googleapis.com/v1beta/models";
const NEEDS = ["visual", "hearing", "physical", "intellectual", "speech_language", "other"];
const PATHWAYS = ["regular", "regular_adapted", "specialised_foundation", "specialised_intermediate"];
const AREAS = ["Language Activities", "Mathematical Activities", "Environmental Activities", "Creative Activities", "Christian Religious Education"];
const DOMAINS = ["Language", "Maths", "Environment", "Creative", "Religious", "Communication", "Self-care", "Movement", "Social", "Learning skills"];

const clip = (v, n) => String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, n);
const list = (v) => (Array.isArray(v) ? v : []);

// Keeps only the allowed fields, with limits on length and size.
function cleanPayload(p) {
  p = p && typeof p === "object" ? p : {};
  const score = (v) => (Number.isInteger(v) && v >= 0 && v <= 5 ? v : null);
  return {
    class: ["PG", "PP1", "PP2"].includes(p.class) ? p.class : "PP1",
    tier: ["A", "B", "C"].includes(p.tier) ? p.tier : null,
    month: /^\d{4}-\d{2}$/.test(p.month || "") ? p.month : null,
    curriculum: list(p.curriculum).slice(0, 30).map((c) => ({ area: Number.isInteger(c && c.area) && c.area >= 0 && c.area <= 4 ? c.area : 0, code: clip(c && c.code, 12), strand: clip(c && c.strand, 40), sub_strand: clip(c && c.sub_strand, 70), taught: c && c.taught === true, this_term: c && c.this_term === true })).filter((c) => c.sub_strand),
    age: Number.isInteger(p.age) && p.age >= 1 && p.age <= 12 ? p.age : null,
    new_learner: !!p.new_learner,
    pathway: PATHWAYS.includes(p.pathway) ? p.pathway : null,
    need_types: list(p.need_types).filter((x) => NEEDS.includes(x)).slice(0, 6),
    accommodations: list(p.accommodations).map((x) => clip(x, 40)).filter(Boolean).slice(0, 12),
    terms: list(p.terms).slice(-4).map((t) => ({
      term: clip(t && t.term, 30),
      scores: Object.fromEntries(AREAS.map((a) => [a, score(t && t.scores && t.scores[a])])),
    })),
    this_term: p.this_term && typeof p.this_term === "object"
      ? Object.fromEntries(AREAS.map((a) => [a, score(p.this_term[a])])) : null,
    current_goals: list(p.current_goals).slice(0, 6).map((g) => ({
      domain: clip(g && g.domain, 30), goal: clip(g && g.goal, 200), latest_level: score(g && g.latest_level) })),
    question_results: list(p.question_results).slice(0, 20).map((q) => ({
      area: AREAS[q && q.area_index] || "", prompt: clip(q && q.prompt, 160), latest_score: clip(q && q.latest_score, 3) })),
    existing_questions: list(p.existing_questions).slice(0, 20).map((x) => clip(x, 160)),
  };
}

const INSTRUCTIONS = `You help kindergarten teachers in Kenya (Playgroup "PG" is about age 3 to 4, CBC pre-primary PP1 about age 4 to 5, PP2 about age 5 to 6).
You get information about ONE child and suggest goals and individual questions that suit that child. A teacher will read and approve
everything before it is used, so write for a busy teacher, in plain and warm English.

How scores work (0 to 5): 0 no attempt, 1 needs full help, 2 needs a lot of help, 3 needs some help, 4 mostly on their own,
5 confident and on their own. A steady 3 or 4 is normal.
The five learning areas are numbered 0 to 4 in this order: ${AREAS.map((a, i) => i + " " + a).join(", ")}.

"tier" is the school's support tier for this child. A: no disability, follow the usual curriculum and use the scores to pick stepping stones
and stretch tasks. B: some disability, usual curriculum with adaptations: smaller steps, extra cues, a different way to answer, and use the accommodations.
C: severe disability, specialised curriculum: functional skills, very small observable steps, real objects, answers by pointing, looking, touching or choosing.
"month" is the month this test and these goals are for (year-month), so keep goals reachable within that month and the next few weeks.
"curriculum" comes from the KICD curriculum design for this class. Each item has a code, an optional strand and a sub-strand name.
"taught" is true when the teacher has ticked that sub-strand as taught, and "this_term" is true when it was taught this term.
Base every question on a sub-strand that has "taught": true, so children are only tested on what they have been taught. Prefer ones with "this_term": true.
Base each goal on a sub-strand: use one with "taught": true that this child still finds hard, or the next "taught": false one when the child is secure.
Copy the sub-strand name exactly into "sub_strand". If no item has "taught": true yet, use the first items listed for each area, and say nothing about teaching progress. If "curriculum" is empty, leave "sub_strand" empty.

Use only what is given. Never name or guess a diagnosis, never give medical advice, never mention a score out of 5 in a goal or question.
"need_types" and "accommodations" tell you how to adapt, so adapt the task itself:
- visual: the child may be blind, so assume they CANNOT SEE anything. Every question and goal must work through hearing, touch, smell,
  taste or movement. Use real objects the child can hold, sounds, songs, spoken words and body movement. NEVER ask the child to look at,
  see, watch, find or sort by colour, match by how things look, point to a picture or card, read, draw, colour or copy a shape from sight.
  Put one of these touch or hearing emojis in "shown": 🤚 👂 🔊 🎵. Never put a picture of the task in "shown".
- hearing: use pictures, gestures, demonstration and written or pictured prompts; the child may answer by pointing or signing.
- physical: no need for fine hand control or walking; allow pointing, eye pointing or choosing between two things.
- intellectual: one short step at a time, real objects, repeat the same wording, small goals.
- speech_language: the child can answer without speaking: point, pick, match, gesture or use a picture card.
- pathway specialised_foundation or specialised_intermediate: follow the Kenyan special needs foundation or intermediate level, with
  everyday functional skills (communication, self-care, movement, social, early number and language) and very small steps.
If there are no scores ("new_learner" true), suggest goals that first set a starting point, and starter questions at the usual entry
level for the age and class, adapted to any needs. Say in "baseline" that it is to be confirmed.
Otherwise look at the trend: for the weakest or falling areas, give stepping-stone questions one step easier than the child's level;
for the strongest area, give one stretch question. Use "question_results" to move easier or harder. Do not repeat anything in
"existing_questions" or "current_goals".

Return only JSON with this shape:
{"goals": [{"domain": string (one of ${DOMAINS.join(", ")}), "goal": string, "baseline": string, "target": string, "weeks": number, "reason": string}],
 "questions": [{"area": number 0 to 4, "shown": one emoji, "prompt": string, "look_for": string, "reason": string, "adapted_for": string, "sub_strand": string}]}
Limits: 2 or 3 goals, each one sentence, measurable, doable in 6 to 12 weeks ("weeks"). 4 to 8 questions in total, at most 2 per area.
"prompt" is what the teacher says or does with the child, at most 2 short sentences. "look_for" is what a good answer looks like.
"reason" is one short plain sentence on why this suits the child, with no labels or diagnoses. "adapted_for" is the need type it was
adapted for, or an empty string.`;

async function gemini(payload) {
  const url = `${GEMINI}/${process.env.GEMINI_MODEL || "gemini-2.5-flash"}:generateContent`;
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: INSTRUCTIONS }] },
    contents: [{ role: "user", parts: [{ text: JSON.stringify(payload) }] }],
    generationConfig: { responseMimeType: "application/json", temperature: 0.4 },
  });
  let status = 0;
  for (const wait of [0, 1200, 3000]) {
    if (wait) await new Promise((r) => setTimeout(r, wait));
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY }, body });
    if (res.ok) {
      const data = await res.json();
      return JSON.parse(data?.candidates?.[0]?.content?.parts?.[0]?.text);
    }
    status = res.status;
    if (![429, 500, 502, 503, 504].includes(status)) break;
  }
  const e = new Error("Gemini request failed: " + status);
  e.status = status;
  throw e;
}

// Checks the model's answer and keeps only safe, well-shaped items.
// Words that only make sense for a child who can see. A child with a visual need must never be given them.
const SEEING = /\b(look(?:s|ing)? at|see|sees|seeing|watch\w*|colou?r\w*|red|blue|green|yellow|orange|purple|pink|picture\w*|draw\w*|crayons?|scribbl\w*|doodl\w*|point(?:s|ing)? to the (?:picture|card)|show(?:s|ing)? (?:me|the child)|read(?:s|ing)? the (?:card|page|word)|written)\b/i;
function cleanOutput(o, needs) {
  const blind = list(needs).includes("visual");
  o = o && typeof o === "object" ? o : {};
  const goals = list(o.goals).slice(0, 3).map((g) => ({
    domain: DOMAINS.includes(g && g.domain) ? g.domain : "Learning skills",
    goal: clip(g && g.goal, 220), baseline: clip(g && g.baseline, 160), target: clip(g && g.target, 160),
    weeks: Math.min(16, Math.max(4, parseInt(g && g.weeks, 10) || 10)), reason: clip(g && g.reason, 200),
  })).filter((g) => g.goal && !(blind && SEEING.test(g.goal + " " + g.baseline + " " + g.target)));
  const per = {};
  const questions = [];
  for (const q of list(o.questions)) {
    const a = q && q.area;
    const prompt = clip(q && q.prompt, 240);
    if (!Number.isInteger(a) || a < 0 || a > 4 || !prompt) continue;
    if (blind && SEEING.test(prompt + " " + clip(q && q.look_for, 200))) continue;
    if ((per[a] = (per[a] || 0) + 1) > 2) continue;
    questions.push({
      area: a, shown: blind ? (["🤚", "👂", "🔊", "🎵"].includes(clip(q.shown, 8)) ? clip(q.shown, 8) : "🤚") : (clip(q.shown, 8) || "💬"), prompt, look_for: clip(q.look_for, 200), reason: clip(q.reason, 200),
      adapted_for: NEEDS.includes(q.adapted_for) ? q.adapted_for : "",
      sub_strand: clip(q.sub_strand, 70),
    });
    if (questions.length >= 8) break;
  }
  return { goals, questions };
}

async function sb(path, token) {
  const r = await fetch(process.env.SUPABASE_URL + path, { headers: { apikey: process.env.SUPABASE_ANON_KEY, Authorization: "Bearer " + token } });
  return { ok: r.ok, status: r.status, json: r.ok ? await r.json() : null };
}

module.exports = async function handler(req, res) {
  const send = (code, obj) => { res.statusCode = code; res.setHeader("Content-Type", "application/json"); res.setHeader("Cache-Control", "no-store"); res.end(JSON.stringify(obj)); };
  if (req.method !== "POST") return send(405, { error: "Use POST." });
  for (const k of ["SUPABASE_URL", "SUPABASE_ANON_KEY", "GEMINI_API_KEY"]) if (!process.env[k]) return send(500, { error: "The AI service is not set up yet: " + k + " is missing in Vercel." });
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return send(401, { error: "Please sign in again." });
  try {
    let body = req.body;
    if (typeof body === "string") body = JSON.parse(body);
    body = body || {};
    const lid = String(body.learner_id || "");
    if (!/^[0-9a-fA-F-]{36}$/.test(lid)) return send(400, { error: "Missing learner." });
    const user = await sb("/auth/v1/user", token);
    if (!user.ok || !user.json || !user.json.id) return send(401, { error: "Please sign in again." });
    const staff = await sb("/rest/v1/staff?select=id&id=eq." + encodeURIComponent(user.json.id), token);
    if (!staff.ok || !staff.json.length) return send(403, { error: "This login is not set up as Matan staff." });
    const consent = await sb("/rest/v1/learner_consents?select=id&limit=1&kind=eq.gemini&withdrawn_on=is.null&learner_id=eq." + lid, token);
    if (!consent.ok || !consent.json.length) return send(403, { error: "No guardian consent for AI planning is recorded for this child." });
    const clean = cleanPayload(body.payload);
    const names = await namesFor(lid, (p) => sb(p, token));
    clean.current_goals.forEach((g) => { g.goal = redact(g.goal, names); });
    clean.question_results.forEach((q) => { q.prompt = redact(q.prompt, names); });
    clean.existing_questions = clean.existing_questions.map((x) => redact(x, names));
    const out = cleanOutput(await gemini(clean), clean.need_types);
    if (!out.goals.length && !out.questions.length) return send(502, { error: "The AI did not give usable suggestions. Please try again." });
    return send(200, out);
  } catch (e) {
    console.error("ai-plan failed:", e && e.message);
    return send(e && e.status === 429 ? 429 : 502, { error: "The AI service could not make suggestions right now. Please try again in a minute." });
  }
};
module.exports.cleanPayload = cleanPayload;
module.exports.cleanOutput = cleanOutput;