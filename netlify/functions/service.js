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
    const timestamp = Number(parts[1]);
    const signature = parts[2];

    if (Date.now() - timestamp > 86400000) {
      return null;
    }

    const data = `${discordId}.${timestamp}`;

    const expectedSignature = crypto
      .createHmac("sha256", process.env.SESSION_SECRET)
      .update(data)
      .digest("hex");

    if (signature.length !== expectedSignature.length) {
      return null;
    }

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

function json(data, status = 200) {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: {
        "Content-Type": "application/json"
      }
    }
  );
}

export default async (req) => {

  const supabaseUrl =
    process.env.SUPABASE_URL;

  const supabaseKey =
    process.env.SUPABASE_SECRET_KEY;

  const discordId =
    getDiscordIdFromSession(req);

  if (!discordId) {
    return json(
      {
        error: "Tu n'es pas connecté à Discord."
      },
      401
    );
  }

  try {

    /*
     * GET
     * Vérifier le service actuel
     */

    if (req.method === "GET") {

      const response = await fetch(
        `${supabaseUrl}/rest/v1/service?discord_id=eq.${encodeURIComponent(discordId)}&duration_seconds=eq.0&order=start_time.desc&limit=1&select=*`,
        {
          headers: {
            apikey: supabaseKey,
            Authorization:
              `Bearer ${supabaseKey}`
          }
        }
      );

      const services =
        await response.json();

      if (!response.ok) {
        return json(
          {
            error: "Erreur Supabase.",
            details: services
          },
          500
        );
      }

      if (services.length === 0) {
        return json({
          active: false
        });
      }

      return json({
        active: true,
        service: services[0]
      });
    }

    /*
     * POST
     * Prendre le service
     */

    if (req.method === "POST") {

      // Vérifier si déjà en service
      const checkResponse =
        await fetch(
          `${supabaseUrl}/rest/v1/service?discord_id=eq.${encodeURIComponent(discordId)}&duration_seconds=eq.0&select=*`,
          {
            headers: {
              apikey: supabaseKey,
              Authorization:
                `Bearer ${supabaseKey}`
            }
          }
        );

      const activeServices =
        await checkResponse.json();

      if (!checkResponse.ok) {
        return json(
          {
            error: "Erreur Supabase."
          },
          500
        );
      }

      if (activeServices.length > 0) {
        return json(
          {
            error: "Tu es déjà en service."
          },
          400
        );
      }

      const now =
        new Date().toISOString();

      const createResponse =
        await fetch(
          `${supabaseUrl}/rest/v1/service`,
          {
            method: "POST",
            headers: {
              apikey: supabaseKey,
              Authorization:
                `Bearer ${supabaseKey}`,
              "Content-Type":
                "application/json",
              Prefer:
                "return=representation"
            },
            body: JSON.stringify({
              discord_id: discordId,
              start_time: now,
              duration_seconds: 0
            })
          }
        );

      const created =
        await createResponse.json();

      if (!createResponse.ok) {
        return json(
          {
            error:
              "Impossible de prendre le service.",
            details: created
          },
          500
        );
      }

      return json({
        success: true,
        service: created[0]
      });
    }

    /*
     * DELETE
     * Terminer le service
     */

    if (req.method === "DELETE") {

      // Trouver le service actif
      const searchResponse =
        await fetch(
          `${supabaseUrl}/rest/v1/service?discord_id=eq.${encodeURIComponent(discordId)}&duration_seconds=eq.0&order=start_time.desc&limit=1&select=*`,
          {
            headers: {
              apikey: supabaseKey,
              Authorization:
                `Bearer ${supabaseKey}`
            }
          }
        );

      const services =
        await searchResponse.json();

      if (!searchResponse.ok) {
        return json(
          {
            error: "Erreur Supabase."
          },
          500
        );
      }

      if (services.length === 0) {
        return json(
          {
            error: "Aucun service en cours."
          },
          400
        );
      }

      const service =
        services[0];

      const start =
        new Date(service.start_time);

      const end =
        new Date();

      const duration =
        Math.max(
          0,
          Math.floor(
            (end.getTime() -
              start.getTime()) /
            1000
          )
        );

      // Mettre à jour la session
      const updateResponse =
        await fetch(
          `${supabaseUrl}/rest/v1/service?id=eq.${service.id}`,
          {
            method: "PATCH",
            headers: {
              apikey: supabaseKey,
              Authorization:
                `Bearer ${supabaseKey}`,
              "Content-Type":
                "application/json",
              Prefer:
                "return=representation"
            },
            body: JSON.stringify({
              duration_seconds:
                duration
            })
          }
        );

      const updated =
        await updateResponse.json();

      if (!updateResponse.ok) {
        return json(
          {
            error:
              "Impossible de terminer le service.",
            details: updated
          },
          500
        );
      }

      /*
       * Mise à jour des statistiques
       * de l'utilisateur
       */

      const userResponse =
        await fetch(
          `${supabaseUrl}/rest/v1/users?discord_id=eq.${encodeURIComponent(discordId)}&select=total_seconds,services_count`,
          {
            headers: {
              apikey: supabaseKey,
              Authorization:
                `Bearer ${supabaseKey}`
            }
          }
        );

      const users =
        await userResponse.json();

      if (userResponse.ok &&
          users.length > 0) {

        const user =
          users[0];

        const total =
          Number(
            user.total_seconds || 0
          );

        const count =
          Number(
            user.services_count || 0
          );

        await fetch(
          `${supabaseUrl}/rest/v1/users?discord_id=eq.${encodeURIComponent(discordId)}`,
          {
            method: "PATCH",
            headers: {
              apikey: supabaseKey,
              Authorization:
                `Bearer ${supabaseKey}`,
              "Content-Type":
                "application/json"
            },
            body: JSON.stringify({
              total_seconds:
                total + duration,

              services_count:
                count + 1
            })
          }
        );
      }

      return json({
        success: true,
        duration_seconds:
          duration
      });
    }

    return json(
      {
        error: "Méthode non autorisée."
      },
      405
    );

  } catch (error) {

    return json(
      {
        error: "Erreur serveur.",
        details: error.message
      },
      500
    );
  }
};
