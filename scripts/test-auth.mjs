const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

console.log("URL:", url ? "✓" : "✗", "ANON:", anon ? "✓" : "✗");

const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: { "Content-Type": "application/json", apikey: anon },
  body: JSON.stringify({ email: "test@test.com", password: "123456" }),
});
console.log("status:", res.status);
console.log("body:", await res.text());
