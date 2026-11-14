// api/ai-tier.js: a Vercel function that suggests a support tier (A, B or C) from a doctor's report.
// Environment variables: SUPABASE_URL, SUPABASE_ANON_KEY, GEMINI_API_KEY, GEMINI_MODEL
//
// Sent to Gemini: the class, age, what the form says about disability, and the typed doctor's report.
// The app removes the child's and guardian's names and phone numbers from the report before it is sent, and this function
// removes phone numbers and email addresses again. Nothing is sent unless the guardian's AI consent is on file.
// The AI only suggests. The director or senior teacher confirms the tier in the app.

const GEMINI = process.env.GEMINI_API_BASE || "https://generativelanguage.googleapis.com/v1beta/models";
const NEEDS = ["visual", "hearing", "physical", "intellectual", "speech_language", "other"];
const clip = (v, n) => String(v == null ? "" : v).replace(/[ \t]+/g, " ").trim().slice(0, n);

function scrub(t) {
  return clip(t, 4000)
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[email]")
    .replace(/(\+?\d[\d\s().-]{7,}\d)/g, "[number]");
}

const INSTRUCTIONS = `You help a kindergarten in Kenya place a child in a support tier from a medical or assessment report, so staff can plan teaching.
Tiers:
A: no disability or developmental concern that needs adapted teaching.
B: some disability or developmental need, mild to moderate. The child can follow the usual curriculum with adaptations and support.
C: severe or multiple disability. The child needs a specialised curriculum (Kenyan special needs foundation or intermediate level) with very small steps.
Use only what the report says. Do not diagnose and do not give medical advice. If the report is unclear or missing detail, choose the more supportive
tier and say plainly what is unclear, because a person will confirm the tier. A teacher or the director makes the final decision.
Return only JSON: {"tier": "A" | "B" | "C", "pathway": "regular" | "regular_adapted" | "specialised_foundation" | "specialised_intermediate",
"need_types": array of any of ${NEEDS.join(", ")}, "reason": string of at most 3 short plain sentences, "unclear": string, empty if nothing is unclear}.
Tier A goes with "regular", B with "regular_adapted", C with "specialised_foundation" or "specialised_intermediate".`;

async function gemini(input) {
  const url = `${GEMINI}/${process.env.GEMINI_MODEL || "gemini-2.5-flash"}:generateContent`;
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: INSTRUCTIONS }] },
    contents: [{ role: "user", parts: [{ text: JSON.stringify(input) }] }],
    generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
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

function cleanOutput(o) {
  o = o && typeof o === "object" ? o : {};
  const tier = ["A", "B", "C"].includes(o.tier) ? o.tier : null;
  if (!tier) return null;
  const pathway = ["regular", "regular_adapted", "specialised_foundation", "specialised_intermediate"].includes(o.pathway) ? o.pathway
    : tier === "A" ? "regular" : tier === "B" ? "regular_adapted" : "specialised_foundation";
  return {
    tier, pathway,
    need_types: (Array.isArray(o.need_types) ? o.need_types : []).filter((x) => NEEDS.includes(x)).slice(0, 6),
    reason: clip(o.reason, 400), unclear: clip(o.unclear, 300),
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
    const lid = String(body.learner_id || "");
    if (!/^[0-9a-fA-F-]{36}$/.test(lid)) return send(400, { error: "Missing learner." });
    const report = scrub(body.report);
    if (report.length < 20) return send(400, { error: "The doctor's report is too short to read. Type or paste the main findings first." });
    const user = await sb("/auth/v1/user", token);
    if (!user.ok || !user.json || !user.json.id) return send(401, { error: "Please sign in again." });
    const staff = await sb("/rest/v1/staff?select=id&id=eq." + encodeURIComponent(user.json.id), token);
    if (!staff.ok || !staff.json.length) return send(403, { error: "This login is not set up as Matan staff." });
    const consent = await sb("/rest/v1/learner_consents?select=id&limit=1&kind=eq.gemini&withdrawn_on=is.null&learner_id=eq." + lid, token);
    if (!consent.ok || !consent.json.length) return send(403, { error: "No guardian consent for AI planning is recorded for this child." });
    const out = cleanOutput(await gemini({
      class: ["PG", "PP1", "PP2"].includes(body.class) ? body.class : null,
      age: Number.isInteger(body.age) && body.age >= 1 && body.age <= 12 ? body.age : null,
      form_says: ["none", "some", "severe"].includes(body.declared) ? body.declared : null,
      report,
    }));
    if (!out) return send(502, { error: "The AI did not give a usable answer. Please try again, or choose the tier yourself." });
    return send(200, out);
  } catch (e) {
    console.error("ai-tier failed:", e && e.message);
    return send(e && e.status === 429 ? 429 : 502, { error: "The AI service could not read the report right now. Please try again in a minute, or choose the tier yourself." });
  }
};
module.exports.scrub = scrub;
module.exports.cleanOutput = cleanOutput;