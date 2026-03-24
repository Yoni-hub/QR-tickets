async function verifyTurnstile(token, ip) {
  const secret = process.env.TURNSTILE_SECRET;
  if (!secret) return true; // not configured — allow (dev mode)
  if (!token) return false;

  try {
    const resp = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret, response: token, remoteip: ip || undefined }),
    });
    const data = await resp.json();
    return data.success === true;
  } catch {
    return false;
  }
}

module.exports = { verifyTurnstile };
