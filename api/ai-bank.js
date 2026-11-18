// api/ai-bank.js: a Vercel function that drafts child-friendly questions for curriculum outcomes that have none yet.
// Environment variables: SUPABASE_URL, SUPABASE_ANON_KEY, GEMINI_API_KEY, GEMINI_MODEL
// Only the director or a senior teacher can use it. It sends curriculum text only: no child's information at all.
// Mode "touch" writes touch or spoken versions of existing questions for blind learners. It gets the question text only.
// Drafts are saved in the app as "waiting for approval". A person approves them before any child is asked them.

const GEMINI = process.env.GEMINI_API_BASE || "https://generativelanguage.googleapis.com/v1beta/models";
const clip = (v, n) => String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, n);

const INSTRUCTIONS = `You write assessment questions for kindergarten teachers in Kenya, based on the school's curriculum.
You get a class (PG is age 3 to 4, PP1 about 4 to 5, PP2 about 5 to 6), a learning area, and a list of curriculum items, each with an id, a strand, a sub-strand and sometimes an outcome.
For EACH item write one question the teacher can ask or one short task the teacher can give a child one-to-one, in plain English.
Rules: at most 2 short sentences, play-based and concrete, using things in a classroom or home. No reading or writing demands for PG. Possible to do without a worksheet.
"look_for" says in one short sentence what a good answer looks like. "shown" is one emoji for the child to see.
"touch" is the same check for a blind child: spoken, or with real objects the child can hold, with no pictures, print, colours or pointing. Use "" if the prompt already needs no sight.
Return only JSON: {"questions": [{"id": number, "shown": string, "prompt": string, "look_for": string, "touch": string}]} with one entry per item, using the same ids.`;

const TOUCH = `You help kindergarten teachers in Kenya assess blind children (PG is age 3 to 4, PP1 about 4 to 5, PP2 about 5 to 6).
You get a class, a learning area, and questions that need sight as written. Each has an id, a prompt and what a good answer looks like.
For EACH question write "touch": the same skill checked without sight, at most 2 short sentences in plain English.
Rules: the child listens, speaks, or handles real objects found in a Kenyan classroom or home (bottle tops, beans, sticks, cups, fruit, blocks, cloth). Raised or tactile letters are fine for reading skills.
Never use pictures, print, the screen, colours, pointing at something far away, or words like "look" or "see". Keep the same learning goal.
Return only JSON: {"touch": [{"id": number, "touch": string}]} with one entry per question, using the same ids.`;

async function gemini(input, instructions = INSTRUCTIONS) {
  const url = `${GEMINI}/${process.env.GEMINI_MODEL || "gemini-2.5-flash"}:generateContent`;
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: instructions }] },
    contents: [{ role: "user", parts: [{ text: JSON.stringify(input) }] }],
    generationConfig: { responseMimeType: "application/json", temperature: 0.5 },
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
    const user = await sb("/auth/v1/user", token);
    if (!user.ok || !user.json || !user.json.id) return send(401, { error: "Please sign in again." });
    const me = await sb("/rest/v1/staff?select=role&id=eq." + encodeURIComponent(user.json.id), token);
    if (!me.ok || !me.json.length || !["head", "senior"].includes(me.json[0].role)) return send(403, { error: "Only the director or a senior teacher can draft questions." });
    const cls = ["PG", "PP1", "PP2"].includes(body.class) ? body.class : "PP1";
    if (body.mode === "touch") {
      const qs = (Array.isArray(body.items) ? body.items : []).slice(0, 10).map((x) => ({
        id: Number.isInteger(x && x.id) ? x.id : null, prompt: clip(x && x.prompt, 240), look_for: clip(x && x.look_for, 200),
      })).filter((x) => x.id !== null && x.prompt);
      if (!qs.length) return send(400, { error: "There are no questions to write touch versions for." });
      const out = await gemini({ class: cls, area: clip(body.area, 60), questions: qs }, TOUCH);
      const ids = new Set(qs.map((x) => x.id));
      const touch = (Array.isArray(out && out.touch) ? out.touch : []).filter((t) => ids.has(t && t.id) && clip(t.touch, 240)).map((t) => ({ id: t.id, touch: clip(t.touch, 240) }));
      if (!touch.length) return send(502, { error: "The AI did not give usable touch versions. Please try again." });
      return send(200, { touch });
    }
    const items = (Array.isArray(body.items) ? body.items : []).slice(0, 10).map((x) => ({
      id: Number.isInteger(x && x.id) ? x.id : null, strand: clip(x && x.strand, 60), sub_strand: clip(x && x.sub_strand, 80), outcome: clip(x && x.outcome, 200),
    })).filter((x) => x.id !== null);
    if (!items.length) return send(400, { error: "There is nothing to draft questions for." });
    const out = await gemini({ class: cls, area: clip(body.area, 60), items });
    const ids = new Set(items.map((x) => x.id));
    const questions = (Array.isArray(out && out.questions) ? out.questions : []).filter((q) => ids.has(q && q.id) && clip(q.prompt, 240)).map((q) => ({
      id: q.id, shown: clip(q.shown, 8) || "💬", prompt: clip(q.prompt, 240), look_for: clip(q.look_for, 200), touch: clip(q.touch, 240),
    }));
    if (!questions.length) return send(502, { error: "The AI did not give usable questions. Please try again." });
    return send(200, { questions });
  } catch (e) {
    console.error("ai-bank failed:", e && e.message);
    return send(e && e.status === 429 ? 429 : 502, { error: "The AI service could not draft questions right now. Please try again in a minute." });
  }
};