import { readFileSync } from "node:fs";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l&&!l.startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i),l.slice(i+1).replace(/^["']|["']$/g,"")];}));
const URL = env.NEXT_PUBLIC_SUPABASE_URL, KEY = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const EMAIL = "pwtest-admin@samorah.test", PW = "Test-Passw0rd-9x!";
// clean any prior
const existing = await (await fetch(`${URL}/auth/v1/admin/users?filter=${encodeURIComponent(EMAIL)}`, { headers: H })).json().catch(()=>({}));
for (const u of (existing.users || existing.aud ? (existing.users||[]) : [])) if (u.email === EMAIL) await fetch(`${URL}/auth/v1/admin/users/${u.id}`, { method:"DELETE", headers: H });
// create auth user
const r = await fetch(`${URL}/auth/v1/admin/users`, { method: "POST", headers: H, body: JSON.stringify({ email: EMAIL, password: PW, email_confirm: true }) });
const u = await r.json();
if (!u.id) { console.log("create failed:", JSON.stringify(u).slice(0,200)); process.exit(1); }
// upsert profile with admin role
const pr = await fetch(`${URL}/rest/v1/users?on_conflict=id`, { method: "POST", headers: { ...H, Prefer: "resolution=merge-duplicates" }, body: JSON.stringify({ id: u.id, email: EMAIL, full_name: "PW Test Admin", role: "admin" }) });
console.log("auth user:", r.status, "| profile:", pr.status, "| id:", u.id);
console.log("LOGIN", EMAIL, PW);
