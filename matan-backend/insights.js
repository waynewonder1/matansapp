// insights.js: turns one learner's assessment history into trends and suggestions with Gemini.
// Node 18+ (uses built-in fetch). Env vars: GEMINI_API_KEY, GEMINI_MODEL.

// GEMINI_API_BASE exists so the service can be tested without calling Google.
const API = process.env.GEMINI_API_BASE || "https://generativelanguage.googleapis.com/v1beta/models";

// Only what the model needs. No surname, photo, guardian details or phone numbers.
export function buildHistory(learner, terms) {
  return {
    first_name: learner.full_name.split(" ")[0],
    class: learner.class_name,            // PP1 or PP2
    age: learner.age,
    attendance_percent: learner.attendance_percent,
    terms: terms.map((t) => ({
      term: t.label,
      scores: t.scores,                   // { "Language Activities": 3, "Mathematical Activities": 4, ... }
      teacher_notes: t.notes,             // short notes the teacher wrote on questions
    })),
  };
}

const SCALE = `How the scores work (0 to 5): 0 no attempt, 1 needs full help, 2 needs a lot of help, 3 needs some help,
4 mostly on their own, 5 confident and on their own. A steady 3 or 4 is normal and is not a problem.`;

const INSTRUCTIONS = `You help kindergarten teachers in Kenya (CBC pre-primary: PP1 is about age 4 to 5, PP2 about age 5 to 6).
You get one child's scores per learning area over several terms, plus short teacher comments.

${SCALE}

Write for a busy teacher, in plain and warm language. Rules:
- Use only the scores and comments given. Do not guess causes. No medical or psychological labels.
- Say each fact once. Do not repeat the same score or trend in more than one section.
- "summary": at most 2 short sentences giving the overall picture.
- "strengths": at most 3 short items. Only areas that are high (4 or 5) or clearly improving.
- "watch": only real concerns, and often this list should be empty. A real concern is: a score that fell by 1 or more
  since the previous term, a latest score of 2 or below, attendance under 85 percent, or something worrying in a
  teacher comment. Never list a steady score as a concern.
- "suggestions": at most 3, one sentence each, each tied to a different learning area, starting with the area that most
  needs help. Make them simple activities for the classroom or for a guardian at home, suited to the class:
  PP1 should be short and play-based, PP2 can ask a little more (for example simple sentences, counting to 20, writing a name).
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

// Calls Gemini and returns the JSON it answers with.
// Google is sometimes busy (429, 500, 502, 503, 504), so those are retried twice before giving up.
async function callGemini(systemText, payload) {
  const url = `${API}/${process.env.GEMINI_MODEL}:generateContent`;
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: systemText }] },
    contents: [{ role: "user", parts: [{ text: JSON.stringify(payload) }] }],
    generationConfig: { responseMimeType: "application/json", temperature: 0.3 },
  });
  let status = 0;
  for (const wait of [0, 1500, 4000]) {
    if (wait) await new Promise((r) => setTimeout(r, wait));
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
      body,
    });
    if (res.ok) {
      const data = await res.json();
      return JSON.parse(data?.candidates?.[0]?.content?.parts?.[0]?.text); // throws if the model returned bad JSON
    }
    status = res.status;
    if (![429, 500, 502, 503, 504].includes(status)) break;
  }
  const err = new Error(`Gemini request failed: ${status}`);
  err.status = status;
  throw err;
}

const list = (v) => (Array.isArray(v) ? v : []);

// Words that must never reach a parent. If Gemini uses one, the parent version is thrown away
// (the teacher version is kept) and the teacher can press Generate again.
const NOT_FOR_PARENTS = /\b(scores?|scored|out of 5|dropped|declin\w*|behind|weak|poor|struggl\w*|concern\w*|worr\w*)\b|\/\s*5\b/i;

function cleanParent(p) {
  if (!p || typeof p !== "object") return null;
  const out = {
    summary: String(p.summary || "").trim(),
    strengths: list(p.strengths).map(String).slice(0, 2),
    support: String(p.support || "").trim(),
    ideas: list(p.ideas).map(String).slice(0, 2),
  };
  if (!out.summary) return null;
  if (NOT_FOR_PARENTS.test([out.summary, out.support, ...out.strengths, ...out.ideas].join(" "))) {
    console.error("Parent version rejected: it used words that should not go to a parent");
    return null;
  }
  return out;
}

export async function generateInsights(history) {
  const parsed = await callGemini(INSTRUCTIONS, history);
  if (typeof parsed.summary !== "string") throw new Error('Missing "summary" in model output');
  return {
    summary: parsed.summary,
    strengths: list(parsed.strengths).map(String).slice(0, 3),
    watch: list(parsed.watch).map(String).slice(0, 3),
    suggestions: list(parsed.suggestions).slice(0, 3).map((x) =>
      typeof x === "string" ? { area: "", activity: x } : { area: String(x.area || ""), activity: String(x.activity || "") }),
    parent: cleanParent(parsed.parent),
  };
}

// If the AI call fails, the dashboard falls back to the simple rule-based suggestions.