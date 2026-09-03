async function checkHeaders() {
  const res = await fetch("https://rmvpdcftfdeizitnrvkw.supabase.co/auth/v1/token?grant_type=password", {
    method: "POST",
    headers: {
      "apikey": "sb_publishable_bm-NG6px_0m-dNsWPQ0KfQ_RrIThuMU",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      email: "phase7_test_a@test.local",
      password: "Phase7TestPassword123!"
    })
  });

  console.log("Status:", res.status);
  console.log("Retry-After:", res.headers.get("retry-after"));
  console.log("X-RateLimit-Reset:", res.headers.get("x-ratelimit-reset"));
  const text = await res.text();
  console.log("Body:", text);
}

checkHeaders();
