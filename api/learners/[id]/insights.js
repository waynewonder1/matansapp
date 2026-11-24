// api/learners/[id]/insights.js: the "Generate insights" button, as a Vercel function.
// It replaces the old Node server in matan-backend, which was never part of the Vercel site.
// Environment variables: SUPABASE_URL, SUPABASE_ANON_KEY, GEMINI_API_KEY, GEMINI_MODEL
//
// The request runs as the signed-in staff member, so the database rules apply to it.
// Sent to Gemini: class, age, attendance percent, scores per learning area and short teacher comments. No name, no phone number,
// no guardian details: the child's and guardians' names are removed from the comments (api/_privacy.js). Nothing is sent unless the guardian's AI consent is on file for the child.

const { namesFor, redact } = require("../../_privacy");
const GEMINI = process.env.GEMINI_API_BASE || "https://generativelanguage.googleapis.com/v1beta/models";
const list = (v) => (Array.isArray(v) ? v : []);
const clip = (v, n) => String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, n);
const scrub = (t, n = 240) =>
  clip(t, n)
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[email]")
    .replace(/(\+?\d[\d\s().-]{7,}\d)/g, "[number]");

const INSTRUCTIONS = `You help kindergarten teachers in Kenya (CBC pre-primary: Playgroup is about age 3 to 4, PP1 about age 4 to 5, PP2 about age 5 to 6).
You get one child's scores per learning area over several terms, plus short teacher comments. The child has no name here: say "the child".

How the scores work (0 to 5): 0 no attempt, 1 needs full help, 2 needs a lot of help, 3 needs some help,
4 mostly on their own, 5 confident and on their own. A steady 3 or 4 is normal and is not a problem.

Write for a busy teacher, in plain and warm language. Rules:
- Use only the scores and comments given. Do not guess causes. No medical or psychological labels.
- Say each fact once. Do not repeat the same score or trend in more than one section.
- "summary": at most 2 short sentences giving the overall picture.
- "strengths": at most 3 short items. Only areas that are high (4 or 5) or clearly improving.
- "watch": only real concerns, and often this list should be empty. A real concern is: a score that fell by 1 or more
  since the previous term, a latest score of 2 or below, attendance under 85 percent, or something worrying in a
  teacher comment. Never list a steady score as a concern.
- "suggestions": at most 3, one sentence each, each tied to a different learning area, starting with the area that most
  needs help. Make them simple activities for the classroom or for a guardian at home, suited to the class.
- If there is only one term of data, say there is not enough history to show a trend.
- If a teacher comment mentions something specific, reflect it in the suggestions.

Also write "parent": a gentler version of the same picture for the child's parent or guardian, in plain, warm words
they can read on a phone. These rules apply to the "parent" part only:
- Never use scores or numbers out of 5, and never compare the child with other children.
- Never use negative words such as dropped, low, behind, weak, poor, struggling, concern or worry. Describe what the
  child is working on, or what the teacher is helping with, instead.
- "summary": at most 2 short sentences, starting with something positive and true.
- "strengths": at most 2 short items about what is going well.
- "support": one short, kind sentence about the one area that needs more help, saying the teacher is helping at school.
  Use an empty string when there is no real concern.
- "ideas": at most 2 very simple things to try at home, a few minutes a day, using things found at home.

Return only JSON with this shape:
{"summary": string, "strengths": string[], "watch": string[], "suggestions": [{"area": string, "activity": string}],
 "parent": {"summary": string, "strengths": string[], "support": string, "ideas": string[]}}`;

async function callGemini(payload) {
  const url = `${GEMINI}/${process.env.GEMINI_MODEL || "gemini-2.5-flash"}:generateContent`;
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: INSTRUCTIONS }] },
    contents: [{ role: "user", parts: [{ text: JSON.stringify(payload) }] }],
    generationConfig: { responseMimeType: "application/json", temperature: 0.3 },
  });
  let status = 0;
  for (const wait of [0, 1500, 4000]) {
    if (wait) await new Promise((r) => setTimeout(r, wait));
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY }, body });
    if (res.ok) {
      const d = await res.json();
      return JSON.parse(d?.candidates?.[0]?.content?.parts?.[0]?.text);
    }
    status = res.status;
    if (![429, 500, 502, 503, 504].includes(status)) break;
  }
  const e = new Error("Gemini request failed: " + status);
  e.status = status;
  throw e;
}

// Words that must never reach a parent. If Gemini uses one, the parent version is dropped and the teacher can press Generate again.
const NOT_FOR_PARENTS = /\b(scores?|scored|out of 5|dropped|declin\w*|behind|weak|poor|struggl\w*|concern\w*|worr\w*)\b|\/\s*5\b/i;
function cleanParent(p) {
  if (!p || typeof p !== "object") return null;
  const out = { summary: String(p.summary || "").trim(), strengths: list(p.strengths).map(String).slice(0, 2), support: String(p.support || "").trim(), ideas: list(p.ideas).map(String).slice(0, 2) };
  if (!out.summary) return null;
  if (NOT_FOR_PARENTS.test([out.summary, out.support, ...out.strengths, ...out.ideas].join(" "))) return null;
  return out;
}

module.exports = async function handler(req, res) {
  const send = (code, obj) => { res.statusCode = code; res.setHeader("Content-Type", "application/json"); res.setHeader("Cache-Control", "no-store"); res.end(JSON.stringify(obj)); };
  if (req.method !== "POST") return send(405, { error: "Use POST." });
  for (const k of ["SUPABASE_URL", "SUPABASE_ANON_KEY", "GEMINI_API_KEY"]) if (!process.env[k]) return send(500, { error: "The AI service is not set up yet: " + k + " is missing in Vercel." });
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return send(401, { error: "Please sign in again." });
  const id = String((req.query && req.query.id) || "");
  if (!/^[0-9a-fA-F-]{36}$/.test(id)) return send(400, { error: "Missing learner." });

  const get = async (path) => {
    const r = await fetch(process.env.SUPABASE_URL + path, { headers: { apikey: process.env.SUPABASE_ANON_KEY, Authorization: "Bearer " + token } });
    return { ok: r.ok, status: r.status, json: r.ok ? await r.json() : null };
  };
  try {
    const user = await get("/auth/v1/user");
    if (!user.ok || !user.json || !user.json.id) return send(401, { error: "Please sign in again." });
    const staff = await get("/rest/v1/staff?select=id&id=eq." + encodeURIComponent(user.json.id));
    if (!staff.ok || !staff.json.length) return send(403, { error: "This login is not set up as Matan staff." });
    const consent = await get("/rest/v1/learner_consents?select=id&limit=1&kind=eq.gemini&withdrawn_on=is.null&learner_id=eq." + id);
    if (!consent.ok || !consent.json.length) return send(403, { error: "No guardian consent for AI planning is recorded for this child. Tick it on the learner's page first." });

    const [lr, terms, areas, scores, comments, att] = await Promise.all([
      get("/rest/v1/learners?select=id,birth_year,classes(name)&id=eq." + id),
      get("/rest/v1/terms?select=id,label&order=id"),
      get("/rest/v1/learning_areas?select=id,name"),
      get("/rest/v1/area_scores?select=term_id,area_id,score&learner_id=eq." + id),
      get("/rest/v1/assessment_records?select=term_id,comment&learner_id=eq." + id + "&comment=not.is.null&comment=neq."),
      get("/rest/v1/attendance?select=present&learner_id=eq." + id),
    ]);
    if (!lr.ok || !lr.json.length) return send(404, { error: "Learner not found." });
    if (![terms, areas, scores, comments, att].every((x) => x.ok)) return send(502, { error: "Could not read this learner's records." });
    const learner = lr.json[0];
    const names = await namesFor(id, get);
    const areaName = Object.fromEntries(areas.json.map((a) => [a.id, a.name]));
    const history = terms.json
      .map((t) => ({
        id: t.id,
        label: t.label,
        scores: Object.fromEntries(scores.json.filter((s) => s.term_id === t.id).map((s) => [areaName[s.area_id], s.score])),
        notes: comments.json.filter((c) => c.term_id === t.id).map((c) => redact(scrub(c.comment), names)),
      }))
      .filter((t) => Object.keys(t.scores).length > 0);
    if (!history.length) return send(400, { error: "No scores yet for this learner." });

    const present = att.json.filter((a) => a.present).length;
    const parsed = await callGemini({
      class: learner.classes && learner.classes.name,
      age: learner.birth_year ? new Date().getFullYear() - learner.birth_year : null,
      attendance_percent: att.json.length ? Math.round((100 * present) / att.json.length) : null,
      terms: history.map((t) => ({ term: t.label, scores: t.scores, teacher_notes: t.notes })),
    });
    if (typeof parsed.summary !== "string") throw new Error('Missing "summary" in model output');
    const content = {
      summary: parsed.summary,
      strengths: list(parsed.strengths).map(String).slice(0, 3),
      watch: list(parsed.watch).map(String).slice(0, 3),
      suggestions: list(parsed.suggestions).slice(0, 3).map((x) => (typeof x === "string" ? { area: "", activity: x } : { area: String(x.area || ""), activity: String(x.activity || "") })),
      parent: cleanParent(parsed.parent),
    };
    const ins = await fetch(process.env.SUPABASE_URL + "/rest/v1/ai_insights", {
      method: "POST",
      headers: { apikey: process.env.SUPABASE_ANON_KEY, Authorization: "Bearer " + token, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ learner_id: id, term_id: history[history.length - 1].id, content, model: process.env.GEMINI_MODEL || "gemini-2.5-flash" }),
    });
    if (!ins.ok) return send(502, { error: "The insight was written but could not be saved." });
    return send(200, content);
  } catch (e) {
    console.error("insights failed:", e && e.message);
    return send(e && (e.status === 429 || e.status === 503) ? 503 : 502, { error: e && (e.status === 429 || e.status === 503) ? "Gemini is busy right now. Please try again in a minute." : "Could not generate this right now." });
  }
};