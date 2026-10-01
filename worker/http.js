export async function parseBody(request) {
  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("application/x-www-form-urlencoded")) {
    const raw = await request.text();
    const params = new URLSearchParams(raw);
    return {
      username: (params.get("username") || "").trim(),
      password: params.get("password") || "",
    };
  }

  const body = await request.json().catch(() => ({}));
  return {
    username: (body?.username || "").trim(),
    password: body?.password || "",
  };
}

export function corsHeaders(request) {
  const origin = request.headers.get("Origin") || "https://codexabdyeni2.suleymannet.workers.dev";
  const requestedHeaders =
    request.headers.get("Access-Control-Request-Headers") || "Content-Type, Authorization";
  const requestedMethod =
    request.headers.get("Access-Control-Request-Method") || "GET, POST, PUT, OPTIONS";

  return {
    "Access-Control-Allow-Origin": origin,
    Vary: "Origin, Access-Control-Request-Headers, Access-Control-Request-Method",
    "Access-Control-Allow-Methods": requestedMethod,
    "Access-Control-Allow-Headers": requestedHeaders,
    "Access-Control-Max-Age": "86400",
  };
}

export function json(request, payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...corsHeaders(request),
    },
  });
}
