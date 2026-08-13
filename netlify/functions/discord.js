export default async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");

  const clientId = process.env.DISCORD_CLIENT_ID;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SECRET_KEY;

  const redirectUri =
    "https://fib-time-control.netlify.app/.netlify/functions/discord";

  // Pas encore connecté à Discord
  if (!code) {
    const discordUrl =
      "https://discord.com/oauth2/authorize" +
      "?client_id=" + encodeURIComponent(clientId) +
      "&response_type=code" +
      "&redirect_uri=" + encodeURIComponent(redirectUri) +
      "&scope=identify";

    return Response.redirect(discordUrl, 302);
  }

  // Récupération du token Discord
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
    return new Response(
      "Erreur Discord : " + JSON.stringify(tokenData),
      { status: 400 }
    );
  }

  // Récupération du profil Discord
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

  // Création de l'URL de l'avatar
  const avatarUrl = discordUser.avatar
    ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
    : `https://cdn.discordapp.com/embed/avatars/${Number(discordUser.discriminator || 0) % 5}.png`;

  // Vérifier si l'utilisateur existe déjà
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
    return new Response(
      "Erreur Supabase : " + JSON.stringify(existingUsers),
      { status: 500 }
    );
  }

  let user;

  // Utilisateur déjà enregistré
  if (existingUsers.length > 0) {
    user = existingUsers[0];

    // Mise à jour du pseudo et de l'avatar
    const updateResponse = await fetch(
      `${supabaseUrl}/rest/v1/users?discord_id=eq.${encodeURIComponent(discordUser.id)}`,
      {
        method: "PATCH",
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          "Content-Type": "application/json",
          Prefer: "return=representation"
        },
        body: JSON.stringify({
          discord_username: discordUser.username,
          avatar_url: avatarUrl
        })
      }
    );

    const updatedUsers = await updateResponse.json();

    if (updateResponse.ok && updatedUsers.length > 0) {
      user = updatedUsers[0];
    }
  }

  // Nouvel utilisateur
  else {
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

    const createdUsers = await createResponse.json();

    if (!createResponse.ok) {
      return new Response(
        "Erreur lors de la création du compte : " +
        JSON.stringify(createdUsers),
        { status: 500 }
      );
    }

    user = createdUsers[0];
  }

  // Affichage temporaire pour vérifier que tout fonctionne
  return new Response(
    `
    <!DOCTYPE html>
    <html lang="fr">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width,initial-scale=1">
      <title>F.I.B — Connexion</title>
      <style>
        body {
          margin:0;
          min-height:100vh;
          display:flex;
          justify-content:center;
          align-items:center;
          background:#080808;
          color:white;
          font-family:Arial,sans-serif;
        }

        .box {
          width:90%;
          max-width:420px;
          background:#111;
          border:1px solid #292929;
          border-radius:20px;
          padding:30px;
          text-align:center;
          box-sizing:border-box;
        }

        img {
          width:90px;
          height:90px;
          border-radius:50%;
          margin-bottom:15px;
        }

        h1 {
          margin:0 0 10px;
        }

        p {
          color:#aaa;
        }

        .ok {
          color:#55ff88;
          font-weight:bold;
        }
      </style>
    </head>

    <body>
      <div class="box">
        <img src="${avatarUrl}">
        <h1>Connexion réussie ✅</h1>

        <p class="ok">Compte enregistré dans Supabase</p>

        <p>
          <strong>${discordUser.username}</strong>
        </p>

        <p>
          Grade : ${user.grade || "Réserviste FIB"}
        </p>

        <p>
          Services : ${user.services_count || 0}
        </p>

        <p>
          Temps total :
          ${user.total_seconds || 0} secondes
        </p>
      </div>
    </body>
    </html>
    `,
    {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=UTF-8"
      }
    }
  );
};
