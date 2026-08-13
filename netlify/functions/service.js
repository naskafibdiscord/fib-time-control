export default async (req) => {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SECRET_KEY;

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Méthode non autorisée" }),
      {
        status: 405,
        headers: { "Content-Type": "application/json" }
      }
    );
  }

  try {
    const body = await req.json();
    const discordId = body.discord_id;

    if (!discordId) {
      return new Response(
        JSON.stringify({ error: "Discord ID manquant" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" }
        }
      );
    }

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
          error: "Erreur Supabase",
          details: activeServices
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" }
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
          headers: { "Content-Type": "application/json" }
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
          headers: { "Content-Type": "application/json" }
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
        error: "Erreur serveur",
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
