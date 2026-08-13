export default async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");

  const clientId = process.env.DISCORD_CLIENT_ID;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;

  const redirectUri =
    "https://fib-time-control.netlify.app/.netlify/functions/discord";

  // Première étape : envoyer l'utilisateur vers Discord
  if (!code) {
    const discordUrl =
      "https://discord.com/oauth2/authorize" +
      "?client_id=" + encodeURIComponent(clientId) +
      "&response_type=code" +
      "&redirect_uri=" + encodeURIComponent(redirectUri) +
      "&scope=identify";

    return Response.redirect(discordUrl, 302);
  }

  // Deuxième étape : récupérer le token Discord
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
        code: code,
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

  // Récupération du compte Discord
  const userResponse = await fetch(
    "https://discord.com/api/users/@me",
    {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`
      }
    }
  );

  const user = await userResponse.json();

  if (!userResponse.ok) {
    return new Response(
      "Impossible de récupérer le compte Discord.",
      { status: 400 }
    );
  }

  // Pour le moment, affichage des informations récupérées.
  // On connectera Supabase juste après.
  return new Response(
    `
    <!DOCTYPE html>
    <html lang="fr">
    <head>
      <meta charset="UTF-8">
      <title>Connexion F.I.B</title>
      <style>
        body {
          background:#080808;
          color:white;
          font-family:Arial,sans-serif;
          display:flex;
          justify-content:center;
          align-items:center;
          min-height:100vh;
          text-align:center;
        }
        .box {
          background:#111;
          border:1px solid #222;
          border-radius:18px;
          padding:30px;
          width:90%;
          max-width:400px;
        }
        img {
          width:90px;
          height:90px;
          border-radius:50%;
          margin-bottom:15px;
        }
        h1 {
          margin-bottom:10px;
        }
        p {
          color:#aaa;
        }
      </style>
    </head>
    <body>
      <div class="box">
        <h1>Connexion réussie ✅</h1>
        <img src="https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png" />
        <h2>${user.username}</h2>
        <p>Discord ID : ${user.id}</p>
        <p>F.I.B — Time Control</p>
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
