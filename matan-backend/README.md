# Matan insights service
 
A small Express server that calls Gemini for the "Generate insights" button.
The Gemini key lives only here, never in the dashboard.
 
## Run it on your computer
1. In this folder: `npm install`
2. Copy `.env.example` to `.env` and fill in the values.
3. `npm start`. You should see "Matan API listening on 3000".
4. Check http://localhost:3000/health shows `{"ok":true}`.
## Settings (in .env)
- SUPABASE_URL and SUPABASE_ANON_KEY: the project URL and the publishable key.
- GEMINI_API_KEY and GEMINI_MODEL: from Google AI Studio. Use the same model name as your leads app.
- ALLOWED_ORIGIN: the addresses the dashboard runs from, separated by commas.
- Never commit `.env` to GitHub. The `.gitignore` line below helps.
## What it sends to Gemini
First name, class, age, attendance percent, scores per term, and teacher comments.
It does not send surnames, guardian names, phone numbers or photos.
 
## Putting it online
Create a Web Service on Render from this folder. Build command `npm install`, start command `npm start`.
Add the same settings under Environment, set ALLOWED_ORIGIN to your dashboard address,
then change API_URL in the dashboard's config.js to the Render address.
 