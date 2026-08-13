import crypto from "node:crypto";

function createSession(discordId) {
  const secret = process.env.SESSION_SECRET;

  const data = `${discordId}.${Date.now()}`;
  const signature = crypto
    .createHmac("sha256", secret)
    .update(data)
    .digest("hex");

  return Buffer.from(`${data}.${signature}`).toString("base64url");
}

export default async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");

  const clientId = process.env.DISCORD_CLIENT_ID;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SECRET_KEY;

  const redirectUri =
    "https://fib-time-control.netlify.app/.netlify/functions/discord";

  if (!code) {
    const discordUrl =
      "https://discord.com/oauth2/authorize" +
      "?client_id=" + encodeURIComponent(clientId) +
      "&response_type=code" +
      "&redirect_uri=" + encodeURIComponent(redirectUri) +
      "&scope=identify";

    return Response.redirect(discordUrl, 302);
  }

  const tokenResponse = await fetch(
    "https://discord.com/api/oauth2/token",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri
      })
    }
  );

  const tokenData = await tokenResponse.json();

  if (!tokenResponse.ok) {
    return new Response("Erreur Discord.", { status: 400 });
  }

  const userResponse = await fetch(
    "https://discord.com/api/users/@me",
    {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`
      }
    }
  );

  const discordUser = await userResponse.json();

  if (!userResponse.ok) {
    return new Response(
      "Impossible de récupérer le compte Discord.",
      { status: 400 }
    );
  }

  const avatarUrl = discordUser.avatar
    ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
    : `https://cdn.discordapp.com/embed/avatars/0.png`;

  // Vérifier l'utilisateur
  const searchResponse = await fetch(
    `${supabaseUrl}/rest/v1/users?discord_id=eq.${encodeURIComponent(discordUser.id)}&select=*`,
    {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`
      }
    }
  );

  const existingUsers = await searchResponse.json();

  if (!searchResponse.ok) {
    return new Response("Erreur Supabase.", { status: 500 });
  }

  if (existingUsers.length === 0) {
    const createResponse = await fetch(
      `${supabaseUrl}/rest/v1/users`,
      {
        method: "POST",
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          "Content-Type": "application/json",
          Prefer: "return=representation"
        },
        body: JSON.stringify({
          discord_id: discordUser.id,
          discord_username: discordUser.username,
          avatar_url: avatarUrl,
          grade: "Réserviste FIB",
          total_seconds: 0,
          services_count: 0
        })
      }
    );

    if (!createResponse.ok) {
      return new Response(
        "Erreur lors de la création du compte.",
        { status: 500 }
      );
    }
  } else {
    await fetch(
      `${supabaseUrl}/rest/v1/users?discord_id=eq.${encodeURIComponent(discordUser.id)}`,
      {
        method: "PATCH",
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          discord_username: discordUser.username,
          avatar_url: avatarUrl
        })
      }
    );
  }

  // Création de la session
  const session = createSession(discordUser.id);

  return new Response(null, {
  status: 302,
  headers: {
    "Location": "/",
    "Set-Cookie":
      `fib_session=${session}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=86400`
  }
});
