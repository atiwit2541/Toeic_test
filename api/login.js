/**
 * Vercel Serverless Function — POST JSON { "password": "..." }
 * Set env: TOEIC_LOGIN_PASSWORD
 */
export default function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  const secret = process.env.TOEIC_LOGIN_PASSWORD;
  if (!secret || String(secret).trim() === "") {
    res.status(503).setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        error: "Login not configured",
        hint: "Set TOEIC_LOGIN_PASSWORD in Vercel project settings",
      })
    );
    return;
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body || "{}");
    } catch {
      body = {};
    }
  }
  if (!body || typeof body !== "object") body = {};

  const pw = String(body.password ?? "");
  if (pw !== String(secret)) {
    res.status(401).setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Invalid password" }));
    return;
  }

  res.status(200).setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ ok: true }));
}
