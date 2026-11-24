"""Opens a locked backup from the app (Staff page > Data backup) and writes a restore file for Supabase.

Usage (from the project folder):
  python -I SQL/backup/make-restore.py matan-backup-2026-11-24.json
  python -I SQL/backup/make-restore.py matan-backup-2026-11-24.json --check      (only checks the password and lists what is inside)

It asks for the backup password (it is never shown or saved). It needs the "cryptography" package:
  python -m pip install cryptography

The restore file it writes is NOT locked and holds every child's records. It is written next to the backup file,
never inside the project folder. Run it in the Supabase SQL Editor, then delete it.

How a full restore works (a new, empty Supabase project):
  1. Run SQL/0-rebuild-from-empty.sql (structure, security rules, question bank, curriculum), then any newer migrations.
  2. Run this restore file. It puts back every record. Staff logins cannot be backed up (Supabase keeps passwords
     separately), so it also makes a login for each staff member with the email you type here and a temporary password,
     shown at the end of this script. Each person changes it after signing in, or the director uses "New password".
  3. In Vercel, point SUPABASE_URL and SUPABASE_ANON_KEY (and config.js) at the new project.

The restore part that makes logins writes to Supabase's own auth tables. It follows the way Supabase's seed examples
do it, but it has not been tried on this project yet: test it on a spare project before you need it.
"""
import base64, getpass, json, os, re, secrets, sys

if len(sys.argv) < 2:
    sys.exit(__doc__)
src = sys.argv[1]
check_only = "--check" in sys.argv[2:]
try:
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
    from cryptography.hazmat.primitives import hashes
except ImportError:
    sys.exit('This needs the "cryptography" package. Run: python -m pip install cryptography')

box = json.load(open(src, encoding="utf-8"))
if box.get("format") != "matan-backup-locked":
    sys.exit("This is not a locked Matan backup file.")
print(f"Backup made {box['made_at']}.")
# Typed at the keyboard (hidden); or read from a pipe when there is no keyboard, for example in a test.
pw = getpass.getpass("Backup password: ") if sys.stdin.isatty() else sys.stdin.readline().rstrip("\r\n")
kdf = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=base64.b64decode(box["salt"]), iterations=int(box["iterations"]))
try:
    plain = AESGCM(kdf.derive(pw.encode("utf-8"))).decrypt(base64.b64decode(box["iv"]), base64.b64decode(box["data"]), None)
except Exception:
    sys.exit("Wrong password, or the file is damaged. Nothing was written.")
data = json.loads(plain)
tables = data["tables"]
print("Password correct. Inside:")
for t, rows in tables.items():
    print(f"  {t:28} {len(rows)}")
if check_only:
    sys.exit(0)

# Tables in an order where every record comes after the records it points to.
here = os.path.dirname(os.path.abspath(__file__))
rebuild = open(os.path.join(os.path.dirname(here), "0-rebuild-from-empty.sql"), encoding="utf-8").read()
deps = {t: set() for t in tables}
for a, b in re.findall(r"alter table public\.(\w+) add constraint \w+ FOREIGN KEY \(\w+\) REFERENCES (\w+)\(", rebuild):
    if a in deps and b in deps and a != b:
        deps[a].add(b)
order, left = [], dict(deps)
while left:
    ready = sorted(t for t, d in left.items() if not (d & set(left)))
    if not ready:
        ready = sorted(left)  # a loop between tables: fall back to name order
    for t in ready:
        order.append(t)
        left.pop(t)

# Staff logins: ask for each person's email.
staff = tables.get("staff", [])
print(f"\n{len(staff)} staff members. Type the email each one should sign in with.")
print("Leave it empty for someone who has left: their records are kept, under a login nobody can use.")
logins, nologin = [], []
for s in staff:
    em = input(f"  {s['name']} ({s['role']}): ").strip().lower()
    if em:
        logins.append((s["id"], em, "Matan-" + secrets.token_urlsafe(9)))
    else:
        # Every staff record must belong to a login, so a placeholder is made: an address that cannot exist and a random password nobody sees.
        nologin.append((s["id"], f"left-{s['id'][:8]}@no-login.invalid", secrets.token_urlsafe(24)))
        print("    (kept, no usable login)")

q = lambda v: "'" + str(v).replace("'", "''") + "'"
out = [
    f"-- Matan restore file, made from the backup of {data['made_at']}.",
    "-- IT IS NOT LOCKED and holds every child's records. Run it once in the Supabase SQL Editor of the NEW project, then delete it.",
    "-- Run SQL/0-rebuild-from-empty.sql (and any newer migrations) first.",
    "begin;",
    "",
    "-- 1. staff logins (Supabase's own tables). The temporary passwords appear below too: another reason to delete this file after running it.",
]
for sid, em, tmp in logins + nologin:
    out += [
        "insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)",
        f"values ('00000000-0000-0000-0000-000000000000', {q(sid)}, 'authenticated', 'authenticated', {q(em)}, extensions.crypt({q(tmp)}, extensions.gen_salt('bf')), now(), now(), now(),"
        " '{\"provider\":\"email\",\"providers\":[\"email\"]}', '{}') on conflict (id) do nothing;",
        "insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)",
        f"values (gen_random_uuid(), {q(sid)}, {q(sid)}, 'email', jsonb_build_object('sub', {q(sid)}, 'email', {q(em)}, 'email_verified', true), now(), now(), now()) on conflict do nothing;",
    ]
out += ["", "-- 2. every record. The two guard rules (tiers, report comments) check who is signed in, so they are paused while restoring."]
out += ["alter table public.learner_tiers disable trigger user;", "alter table public.report_comments disable trigger user;"]
tag = "$mtnrestore$"
for t in order:
    rows = tables[t]
    if not rows:
        continue
    js = json.dumps(rows, ensure_ascii=False)
    if tag in js:
        sys.exit(f"Unexpected text in table {t}; cannot write the restore file safely.")
    if t == "staff" and nologin:
        gone = {sid for sid, _, _ in nologin}
        out.append(f"-- kept without a usable login: {', '.join(s['name'] for s in rows if s['id'] in gone)}")
    out.append(f"insert into public.{t} select * from jsonb_populate_recordset(null::public.{t}, {tag}{js}{tag}::jsonb) on conflict do nothing;")
out += ["alter table public.learner_tiers enable trigger user;", "alter table public.report_comments enable trigger user;", "",
        "-- 3. new ids carry on after the restored ones"]
for sq, t, c in re.findall(r"alter sequence public\.(\w+) owned by public\.(\w+)\.(\w+);", rebuild):
    out.append(f"select setval('public.{sq}', greatest(1, (select coalesce(max({c}), 1) from public.{t})));")
out.append("select setval('public.record_seq', greatest(1000, (select coalesce(max(nullif(regexp_replace(public_id, '\\D', '', 'g'), '')::bigint), 1000) from public.assessment_records)));")
out += ["", "commit;", "notify pgrst, 'reload schema';", ""]

dest = os.path.join(os.path.dirname(os.path.abspath(src)), "RESTORE-" + os.path.basename(src).replace(".json", ".sql"))
open(dest, "w", encoding="utf-8", newline="\n").write("\n".join(out))
print(f"\nWrote {dest}")
print("It is NOT locked. Run it in the Supabase SQL Editor, then delete it.")
if logins:
    print("\nTemporary passwords (give each person theirs; they can change it after signing in):")
    for sid, em, tmp in logins:
        print(f"  {em:40} {tmp}")
