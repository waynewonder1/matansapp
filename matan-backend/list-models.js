// list-models.js: shows which Gemini models your key can use for this app.
// Run it with:  node list-models.js
// It reads GEMINI_API_KEY from your .env file and never prints the key.
import "dotenv/config";
 
const base = process.env.GEMINI_API_BASE || "https://generativelanguage.googleapis.com/v1beta/models";
 
if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY.startsWith("paste-")) {
  console.error("GEMINI_API_KEY is empty. Put your key in the .env file first, then run this again.");
  process.exit(1);
}
 
let all = [];
let token = "";
do {
  const url = `${base}?pageSize=200${token ? `&pageToken=${encodeURIComponent(token)}` : ""}`;
  const res = await fetch(url, { headers: { "x-goog-api-key": process.env.GEMINI_API_KEY } });
  if (!res.ok) {
    console.error(`Google answered with status ${res.status}. Check that the key is correct and copied in full.`);
    process.exit(1);
  }
  const data = await res.json();
  all = all.concat(data.models || []);
  token = data.nextPageToken || "";
} while (token);
 
const usable = all
  .filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
  .map((m) => m.name.replace(/^models\//, ""))
  .filter((n) => n.startsWith("gemini"))
  .sort();
 
if (!usable.length) {
  console.log("No Gemini models were listed for this key.");
} else {
  console.log("Models your key can use:\n");
  usable.forEach((n) => console.log("  " + n));
  console.log("\nNames with 'flash' are the faster, cheaper kind, which is plenty for this app.");
  console.log("Prefer one without 'preview' or 'exp' in its name, then copy it into GEMINI_MODEL in .env.");
}
 