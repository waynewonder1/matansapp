// api/ai-note.js: a Vercel function that writes SHORT notes for teachers.
//   mode "check":  a 2 to 3 sentence insight after one small check, tied to the curriculum sub-strands that were checked.
//   mode "report": a draft class teacher's comment for a termly report card.
// Environment variables: SUPABASE_URL, SUPABASE_ANON_KEY, GEMINI_API_KEY, GEMINI_MODEL
//
// Sent to Gemini: class, learning area, term label, scores, curriculum codes and sub-strand names. No names, no phone numbers,
// no diagnoses, no teacher notes, no health information. Nothing is sent unless the guardian's AI consent is on file.
// The note is only a draft. The teacher reads it, edits it and saves it, so a person always approves the words.

const GEMINI = process.env.GEMINI_API_BASE || "https://generativelanguage.googleapis.com/v1beta/models";
const clip = (v, n) => String(v == null ? "" : v).replace(/[ \t]+/g, " ").trim().slice(0, n);
const numOrNull = (v) => (typeof v === "number" && isFinite(v) ? Math.round(v * 10) / 10 : null);

function scrub(t, n = 200) {
  return clip(t, n)
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[email]")
    .replace(/(\+?\d[\d\s().-]{7,}\d)/g, "[number]");
}

const CHECK = `You write one short note for a kindergarten teacher in Kenya after a small check on one learning area.
The check does not change the learner's term results. It is only a quick read for the teacher.
Scores run from 0 to 5: 0 not yet shown, 1 and 2 beginning, 3 developing, 4 secure, 5 strong. NA means the question was not asked.
Use only the scores and the curriculum sub-strands given. Say what went well, what to practise next, and one simple classroom activity from that sub-strand.
At most 3 short sentences, in plain English a busy teacher can read in ten seconds. Do not use the child's name. Do not mention disability, tier, or health.
Do not diagnose. Do not promise outcomes. Return only JSON: {"note": string}.`;

const REPORT = `You draft a short class teacher's comment for a kindergarten termly report card in Kenya, for the parent to read.
Use only the term scores given (0 to 5) and the KICD levels EE (exceeds), ME (meets), AE (approaching), BE (below).
Start with a strength, name one area to support at home or school, and end kindly. 3 to 4 short sentences, plain English, no jargon.
Never use the child's name: write "your child". Do not mention disability, tier, health or other children. Do not diagnose.
Return only JSON: {"note": string}.`;

async function gemini(instructions, input) {
  const url = `${GEMINI}/${process.env.GEMINI_MODEL || "gemini-2.5-flash"}:generateContent`;
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: instructions }] },
    contents: [{ role: "user", parts: [{ text: JSON.stringify(input) }] }],
    generationConfig: { responseMimeType: "application/json", temperature: 0.4 },
  });
  let status = 0;
  for (const wait of [0, 1200, 3000]) {
    if (wait) await new Promise((r) => setTimeout(r, wait));
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY }, body });
    if (res.ok) { const d = await res.json(); return JSON.parse(d?.candidates?.[0]?.content?.parts?.[0]?.text); }
    status = res.status;
    if (![429, 500, 502, 503, 504].includes(status)) break;
  }
  const e = new Error("Gemini request failed: " + status);
  e.status = status;
  throw e;
}

function cleanNote(o) {
  const n = clip(o && o.note, 700);
  return n.length >= 20 ? n : null;
}

function buildInput(mode, b) {
  const cls = ["PG", "PP1", "PP2"].includes(b.class) ? b.class : null;
  if (mode === "check") {
    return {
      class: cls,
      area: scrub(b.area, 60),
      term: scrub(b.term, 30),
      average: numOrNull(b.average),
      previous_check_average: numOrNull(b.previous),
      questions: (Array.isArray(b.items) ? b.items : []).slice(0, 12).map((i) => ({
        code: scrub(i && i.code, 12), strand: scrub(i && i.strand, 80), sub_strand: scrub(i && i.sub, 80),
        score: i && (i.score === "NA" || i.score === "DA" || (Number.isInteger(i.score) && i.score >= 0 && i.score <= 5)) ? i.score : null,
      })),
      sub_strands_taught_this_term: (Array.isArray(b.taught) ? b.taught : []).slice(0, 12).map((t) => scrub(t, 80)),
    };
  }
  return {
    class: cls,
    term: scrub(b.term, 30),
    average: numOrNull(b.average),
    previous_term_average: numOrNull(b.previous),
    areas: (Array.isArray(b.areas) ? b.areas : []).slice(0, 5).map((a) => ({
      area: scrub(a && a.area, 60), score: numOrNull(a && a.score), level: ["EE", "ME", "AE", "BE"].includes(a && a.level) ? a.level : null,
    })),
    attendance_percent: Number.isInteger(b.attendance) && b.attendance >= 0 && b.attendance <= 100 ? b.attendance : null,
  };
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
    const mode = body.mode === "report" ? "report" : body.mode === "check" ? "check" : null;
    if (!mode) return send(400, { error: "Unknown request." });
    const lid = String(body.learner_id || "");
    if (!/^[0-9a-fA-F-]{36}$/.test(lid)) return send(400, { error: "Missing learner." });
    const user = await sb("/auth/v1/user", token);
    if (!user.ok || !user.json || !user.json.id) return send(401, { error: "Please sign in again." });
    const staff = await sb("/rest/v1/staff?select=id&id=eq." + encodeURIComponent(user.json.id), token);
    if (!staff.ok || !staff.json.length) return send(403, { error: "This login is not set up as Matan staff." });
    const consent = await sb("/rest/v1/learner_consents?select=id&limit=1&kind=eq.gemini&withdrawn_on=is.null&learner_id=eq." + lid, token);
    if (!consent.ok || !consent.json.length) return send(403, { error: "No guardian consent for AI planning is recorded for this child." });
    const note = cleanNote(await gemini(mode === "check" ? CHECK : REPORT, buildInput(mode, body)));
    if (!note) return send(502, { error: "The AI did not give a usable answer. Please write the note yourself." });
    return send(200, { note });
  } catch (e) {
    console.error("ai-note failed:", e && e.message);
    return send(e && e.status === 429 ? 429 : 502, { error: "The AI service could not write the note right now. Please write it yourself or try again in a minute." });
  }
};
module.exports.buildInput = buildInput;
module.exports.cleanNote = cleanNote;