// server.js: small API for the parts that must not run in the browser (the Gemini key).
// The dashboard talks to Supabase directly for everything else.
import "dotenv/config";
import express from "express";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";
import { buildHistory, generateInsights } from "./insights.js";

const app = express();

// Which web addresses may call this service. ALLOWED_ORIGIN lists them, separated by commas.
// While testing on your own computer, set ALLOW_LOCAL=true in .env to also accept any
// localhost or 127.0.0.1 address, because Live Server changes its port number now and then.
// Do not set ALLOW_LOCAL when the service is online.
const allowed = (process.env.ALLOWED_ORIGIN || "").split(",").map((s) => s.trim()).filter(Boolean);
const isLocal = (o) => /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o || "");
app.use(cors({
  origin: (origin, cb) =>
    cb(null, !origin || allowed.includes(origin) || (process.env.ALLOW_LOCAL === "true" && isLocal(origin))),
}));
app.use(express.json());

// Every request runs as the signed-in staff member, so the database access rules apply to it.
async function requireStaff(req, res, next) {
  const token = (req.headers.authorization || "").replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "Not signed in" });

  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return res.status(401).json({ error: "Invalid session" });

  const { data: staff } = await db.from("staff").select("id, name, role").eq("id", data.user.id).single();
  if (!staff) return res.status(403).json({ error: "Not a Matan staff member" });

  req.db = db;
  req.staff = staff;
  next();
}

// Collects one learner's scores, comments and attendance into the shape Gemini receives.
async function loadContext(db, id) {
  const { data: learner } = await db
    .from("learners")
    .select("id, full_name, birth_year, classes(name)")
    .eq("id", id)
    .single();
  if (!learner) return null;

  const [terms, areas, scores, comments, att] = await Promise.all([
    db.from("terms").select("id, label").order("id"),
    db.from("learning_areas").select("id, name"),
    db.from("area_scores").select("term_id, area_id, score").eq("learner_id", id),
    db.from("assessment_records").select("term_id, comment").eq("learner_id", id)
      .not("comment", "is", null).neq("comment", ""),
    db.from("attendance").select("present").eq("learner_id", id),
  ]);

  const areaName = Object.fromEntries(areas.data.map((a) => [a.id, a.name]));
  const history = terms.data
    .map((t) => ({
      id: t.id,
      label: t.label,
      scores: Object.fromEntries(
        scores.data.filter((s) => s.term_id === t.id).map((s) => [areaName[s.area_id], s.score])
      ),
      notes: comments.data.filter((c) => c.term_id === t.id).map((c) => c.comment),
    }))
    .filter((t) => Object.keys(t.scores).length > 0);

  const present = att.data.filter((a) => a.present).length;
  const input = buildHistory(
    {
      full_name: learner.full_name,
      class_name: learner.classes.name,
      age: learner.birth_year ? new Date().getFullYear() - learner.birth_year : null,
      attendance_percent: att.data.length ? Math.round((100 * present) / att.data.length) : null,
    },
    history
  );
  return { history, input };
}

// Plain messages for the dashboard. Details stay in the server log only.
function sendError(res, err) {
  console.error("Request failed:", err.message);
  if (err.status === 429 || err.status === 503) {
    return res.status(503).json({ error: "Gemini is busy right now. Please try again in a minute." });
  }
  return res.status(502).json({ error: "Could not generate this right now" });
}

app.get("/health", (_req, res) => res.json({ ok: true }));

// Generate insights for one learner. A teacher presses a button; it never runs on its own.
app.post("/api/learners/:id/insights", requireStaff, async (req, res) => {
  const { db } = req;
  const id = req.params.id;
  try {
    const ctx = await loadContext(db, id);
    if (!ctx) return res.status(404).json({ error: "Learner not found" });
    if (!ctx.history.length) return res.status(400).json({ error: "No scores yet for this learner" });

    const content = await generateInsights(ctx.input);

    await db.from("ai_insights").insert({
      learner_id: id,
      term_id: ctx.history[ctx.history.length - 1].id,
      content,
      model: process.env.GEMINI_MODEL,
    });

    res.json(content);
  } catch (err) {
    sendError(res, err);
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Matan API listening on ${port}`));