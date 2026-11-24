// Shared privacy helpers for the AI services. Files in api/ that start with "_" are not web addresses; they are only used by the others.
// Before any free text (teacher comments, goals, questions, a doctor's report) is sent to Gemini, the server removes:
//   - the child's names and the guardians' names (looked up here, so it does not depend on the browser doing it),
//   - email addresses and phone or ID numbers.
// The names themselves are never sent anywhere.

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const NUMBER = /(\+?\d[\d\s().-]{6,}\d)/g;   // phone numbers, birth certificate and NHIF numbers
const esc = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// get(path) must call Supabase with the signed-in staff member's own token and return { ok, json }.
async function namesFor(learnerId, get) {
  const id = encodeURIComponent(learnerId);
  const [l, g] = await Promise.all([
    get("/rest/v1/learners?select=full_name&id=eq." + id),
    get("/rest/v1/guardians?select=name&learner_id=eq." + id),
  ]);
  const all = [];
  if (l.ok && l.json) l.json.forEach((r) => all.push(r.full_name));
  if (g.ok && g.json) g.json.forEach((r) => all.push(r.name));
  // Each part of each name, longest first, so "Mary Wanjiku" removes "Mary" and "Wanjiku" wherever they appear.
  const words = [...new Set(all.filter(Boolean).join(" ").split(/[\s,.'-]+/).filter((w) => w.length >= 3))];
  return words.sort((a, b) => b.length - a.length);
}

function redact(text, words) {
  let t = String(text == null ? "" : text).replace(EMAIL, "[email]").replace(NUMBER, "[number]");
  (words || []).forEach((w) => { t = t.replace(new RegExp("\\b" + esc(w) + "\\b", "gi"), "the child"); });
  return t.replace(/\bthe child(?:\s+the child)+\b/gi, "the child");   // "Mary Wanjiku" becomes one "the child"
}

module.exports = { namesFor, redact };
