// api/staff.js: a Vercel function that lets the director add staff logins and reset passwords.
// Environment variables (Vercel, Settings, Environment Variables):
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
// The service role key can do anything in your database. Keep it only here, never in config.js or the browser.
// The browser sends its own sign-in token. This function checks that the person is the director before doing anything.

const crypto = require("crypto");
const ROLES = ["head", "senior", "teacher"];
const clip = (v, n) => String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, n);

function newPassword() {
  const chars = "abcdefghjkmnpqrstuvwxyzACDEFGHJKLMNPQRTUVWXY346789";
  let out = "";
  for (let i = 0; i < 10; i++) out += chars[crypto.randomInt(chars.length)];
  return out;
}

const base = () => process.env.SUPABASE_URL;
async function call(path, { method = "GET", key, token, body, prefer } = {}) {
  // The new Supabase keys (sb_publishable_..., sb_secret_...) are not JWTs and go in the apikey header only.
  // The older anon and service_role keys are JWTs and are also sent as the bearer.
  const headers = { apikey: key, "Content-Type": "application/json" };
  if (token) headers.Authorization = "Bearer " + token;
  else if (!String(key).startsWith("sb_")) headers.Authorization = "Bearer " + key;
  if (prefer) headers.Prefer = prefer;
  const r = await fetch(base() + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let json = null;
  try { json = await r.json(); } catch (e) { /* empty body */ }
  return { ok: r.ok, status: r.status, json };
}

module.exports = async function handler(req, res) {
  const send = (code, obj) => { res.statusCode = code; res.setHeader("Content-Type", "application/json"); res.setHeader("Cache-Control", "no-store"); res.end(JSON.stringify(obj)); };
  if (req.method !== "POST") return send(405, { error: "Use POST." });
  for (const k of ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"]) {
    if (!process.env[k]) return send(500, { error: "Adding staff is not set up yet: " + k + " is missing in Vercel." });
  }
  const anon = process.env.SUPABASE_ANON_KEY, service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return send(401, { error: "Please sign in again." });
  try {
    let body = req.body;
    if (typeof body === "string") body = JSON.parse(body);
    body = body || {};
    const user = await call("/auth/v1/user", { key: anon, token });
    if (!user.ok || !user.json || !user.json.id) return send(401, { error: "Please sign in again." });
    const me = await call("/rest/v1/staff?select=role&id=eq." + encodeURIComponent(user.json.id), { key: anon, token });
    if (!me.ok || !me.json.length || me.json[0].role !== "head") return send(403, { error: "Only the director can add staff or reset passwords." });

    if (body.action === "create") {
      const email = clip(body.email, 120).toLowerCase(), name = clip(body.name, 80), role = body.role;
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return send(400, { error: "Enter a valid email address." });
      if (!name) return send(400, { error: "Enter the person's name." });
      if (!ROLES.includes(role)) return send(400, { error: "Choose a role." });
      const password = clip(body.password, 72).length >= 8 ? clip(body.password, 72) : newPassword();
      const made = await call("/auth/v1/admin/users", { method: "POST", key: service, body: { email, password, email_confirm: true } });
      if (!made.ok || !made.json || !made.json.id) {
        const exists = made.status === 422 || /already|registered/i.test(JSON.stringify(made.json || ""));
        return send(exists ? 409 : 502, { error: exists ? "That email already has a login." : "The login could not be created. Please try again." });
      }
      const row = await call("/rest/v1/staff", { method: "POST", key: service, body: { id: made.json.id, name, role, phone: clip(body.phone, 30) || null }, prefer: "return=minimal" });
      if (!row.ok) {
        await call("/auth/v1/admin/users/" + made.json.id, { method: "DELETE", key: service });
        return send(502, { error: "The staff record could not be saved. Has migration-6 been run?" });
      }
      const cls = clip(body.class_name, 10);
      if (cls) await call("/rest/v1/classes?name=eq." + encodeURIComponent(cls), { method: "PATCH", key: service, body: { teacher_id: made.json.id }, prefer: "return=minimal" });
      return send(200, { id: made.json.id, email, password });
    }

    if (body.action === "reset_password") {
      const id = String(body.staff_id || "");
      if (!/^[0-9a-fA-F-]{36}$/.test(id)) return send(400, { error: "Missing staff member." });
      const password = newPassword();
      const r = await call("/auth/v1/admin/users/" + id, { method: "PUT", key: service, body: { password } });
      if (!r.ok) return send(502, { error: "The password could not be changed." });
      return send(200, { password });
    }
    return send(400, { error: "Unknown action." });
  } catch (e) {
    console.error("staff failed:", e && e.message);
    return send(502, { error: "Something went wrong. Please try again." });
  }
};