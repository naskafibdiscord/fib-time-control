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

    // Session valable 24 heures
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
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SECRET_KEY;

  const discordId = getDiscordIdFromSession(req);

  if (!discordId) {
    return new Response(
      JSON.stringify({
        error: "Non connecté à Discord."
      }),
      {
        status: 401,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({
        error: "Méthode non autorisée."
      }),
      {
        status: 405,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
  }

  try {
    // Vérifier si l'agent est déjà en service
    const checkResponse = await fetch(
      `${supabaseUrl}/rest/v1/service?discord_id=eq.${encodeURIComponent(discordId)}&duration_seconds=eq.0&select=*`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`
        }
      }
    );

    const activeServices = await checkResponse.json();

    if (!checkResponse.ok) {
      return new Response(
        JSON.stringify({
          error: "Erreur Supabase.",
          details: activeServices
        }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json"
          }
        }
      );
    }

    if (activeServices.length > 0) {
      return new Response(
        JSON.stringify({
          error: "Tu es déjà en service."
        }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json"
          }
        }
      );
    }

    // Créer le service
    const createResponse = await fetch(
      `${supabaseUrl}/rest/v1/service`,
      {
        method: "POST",
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          "Content-Type": "application/json",
          Prefer: "return=representation"
        },
        body: JSON.stringify({
          discord_id: discordId,
          start_time: new Date().toISOString(),
          duration_seconds: 0
        })
      }
    );

    const createdService = await createResponse.json();

    if (!createResponse.ok) {
      return new Response(
        JSON.stringify({
          error: "Impossible de créer le service.",
          details: createdService
        }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json"
          }
        }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        service: createdService[0]
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({
        error: "Erreur serveur.",
        details: error.message
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
  }
};
