import crypto from "node:crypto"; 

function getDiscordIdFromSession(req) {
  const cookie = req.headers.get("cookie") || "";
  const match = cookie.match(/fib_session=([^;]+)/);

  if (!match) return null;

  try {
    const decoded = Buffer.from(match[1], "base64url").toString("utf8");
    const parts = decoded.split(".");

    if (parts.length !== 3) return null;

    const discordId = parts[0];
    const timestamp = parts[1];
    const signature = parts[2];

    if (Date.now() - Number(timestamp) > 86400000) {
      return null;
    }

    const data = `${discordId}.${timestamp}`;

    const expectedSignature = crypto
      .createHmac("sha256", process.env.SESSION_SECRET)
      .update(data)
      .digest("hex");

    if (
      !crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      )
    ) {
      return null;
    }

    return discordId;
  } catch {
    return null;
  }
}

export default async (req) => {
  const discordId = getDiscordIdFromSession(req);

  if (!discordId) {
    return new Response(
      JSON.stringify({ connected: false }),
      {
        status: 401,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
  }

  const response = await fetch(
    `${process.env.SUPABASE_URL}/rest/v1/users?discord_id=eq.${encodeURIComponent(discordId)}&select=*`,
    {
      headers: {
        apikey: process.env.SUPABASE_SECRET_KEY,
        Authorization: `Bearer ${process.env.SUPABASE_SECRET_KEY}`
      }
    }
  );

  const users = await response.json();

  if (!response.ok || users.length === 0) {
    return new Response(
      JSON.stringify({ error: "Utilisateur introuvable." }),
      {
        status: 404,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
  }

  return new Response(
    JSON.stringify({
      connected: true,
      user: users[0]
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json"
      }
    }
  );
};
console.log("FIB ME FUNCTION LOADED");
