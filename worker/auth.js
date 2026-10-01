import { nowIso, randomHex } from "./util.js";
import { parseBody, json } from "./http.js";
import { ensureDb } from "./db.js";

export async function handleRegister(request, env) {
  ensureDb(env);

  const body = await parseBody(request);
  const username = body.username;
  const password = body.password;

  if (!username || !password) {
    return json(request, { error: "Username and password are required." }, 400);
  }

  if (password.length < 6) {
    return json(request, { error: "Password must be at least 6 characters." }, 400);
  }

  const existing = await env.DB.prepare(
    "SELECT id FROM users WHERE username = ?"
  ).bind(username).first();

  if (existing) {
    return json(request, { error: "That username is already taken." }, 409);
  }

  const salt = randomHex(16);
  const passwordHash = await hashPassword(password, salt);
  const userId = crypto.randomUUID();

  await env.DB.prepare(
    "INSERT INTO users (id, username, password_hash, salt, created_at, status, is_admin) VALUES (?, ?, ?, ?, ?, 'pending', 0)"
  ).bind(userId, username, passwordHash, salt, nowIso()).run();

  return json(request, {
    ok: true,
    pending: true,
    message: "Kaydınız alındı. Hesabınız yönetici onayından sonra aktifleşecek.",
  });
}

export async function handleLogin(request, env) {
  ensureDb(env);

  const body = await parseBody(request);
  const username = body.username;
  const password = body.password;

  if (!username || !password) {
    return json(request, { error: "Username and password are required." }, 400);
  }

  const user = await env.DB.prepare(
    "SELECT id, username, password_hash, salt, status, is_admin FROM users WHERE username = ?"
  ).bind(username).first();

  if (!user) {
    return json(request, { error: "Incorrect username or password." }, 401);
  }

  const passwordHash = await hashPassword(password, user.salt);
  if (passwordHash !== user.password_hash) {
    return json(request, { error: "Incorrect username or password." }, 401);
  }

  if (user.status !== "approved") {
    const msg = user.status === "rejected"
      ? "Hesabınız reddedildi. Lütfen yönetici ile iletişime geçin."
      : "Hesabınız henüz onaylanmadı. Yönetici onayı bekleniyor.";
    return json(request, { error: msg }, 403);
  }

  const session = await createSession(env, user.id);
  return json(request, {
    ok: true,
    user: { id: user.id, username: user.username, isAdmin: !!user.is_admin },
    token: session.token,
  });
}

export async function handleLogout(request, env) {
  ensureDb(env);

  const token = getSessionToken(request);
  if (token) {
    await env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(token).run();
  }

  return json(request, { ok: true });
}

export async function handleSession(request, env) {
  ensureDb(env);

  const user = await requireUser(request, env);
  if (!user) return json(request, { user: null });
  return json(request, { user: { id: user.id, username: user.username, isAdmin: user.isAdmin } });
}

export async function handleAdminListUsers(request, env) {
  ensureDb(env);
  const user = await requireUser(request, env);
  if (!user) return json(request, { error: "Unauthorized." }, 401);
  if (!user.isAdmin) return json(request, { error: "Forbidden." }, 403);

  const result = await env.DB.prepare(
    "SELECT id, username, status, is_admin AS isAdmin, created_at AS createdAt FROM users ORDER BY (status = 'pending') DESC, created_at DESC"
  ).all();

  const users = (result.results ?? []).map((u) => ({ ...u, isAdmin: !!u.isAdmin }));
  const pendingCount = users.filter((u) => u.status === "pending").length;
  return json(request, { users, pendingCount });
}

export async function handleAdminSetUserStatus(request, env, status) {
  ensureDb(env);
  const user = await requireUser(request, env);
  if (!user) return json(request, { error: "Unauthorized." }, 401);
  if (!user.isAdmin) return json(request, { error: "Forbidden." }, 403);

  const body = await request.json().catch(() => ({}));
  const targetId = (body?.userId || "").trim();
  if (!targetId) return json(request, { error: "userId is required." }, 400);

  const target = await env.DB.prepare(
    "SELECT id, is_admin FROM users WHERE id = ?"
  ).bind(targetId).first();
  if (!target) return json(request, { error: "User not found." }, 404);
  if (target.is_admin) return json(request, { error: "Admin hesabının durumu değiştirilemez." }, 400);

  await env.DB.prepare("UPDATE users SET status = ? WHERE id = ?").bind(status, targetId).run();
  if (status === "rejected") {
    await env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(targetId).run();
  }

  return json(request, { ok: true, status });
}

function seedOwnerName(env) {
  return String(env.SEED_OWNER_USERNAME || "").trim().toLowerCase();
}

export async function requireUser(request, env) {
  const token = getSessionToken(request);
  if (!token) return null;

  const session = await env.DB.prepare(
    `SELECT sessions.id, sessions.user_id, sessions.expires_at, users.username, users.is_admin
     FROM sessions
     INNER JOIN users ON users.id = sessions.user_id
     WHERE sessions.id = ?`
  ).bind(token).first();

  if (!session) return null;

  if (new Date(session.expires_at).getTime() <= Date.now()) {
    await env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(token).run();
    return null;
  }

  return { id: session.user_id, username: session.username, isAdmin: !!session.is_admin };
}

async function createSession(env, userId) {
  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString();

  await env.DB.prepare(
    "INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)"
  ).bind(token, userId, expiresAt, nowIso()).run();

  return { token, expiresAt };
}

function getSessionToken(request) {
  const auth = request.headers.get("Authorization") || "";
  const bearer = auth.match(/^Bearer\s+(.+)$/i);
  return bearer?.[1] || "";
}

async function hashPassword(password, salt) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: encoder.encode(salt),
      iterations: 100000,
      hash: "SHA-256",
    },
    key,
    256
  );

  return [...new Uint8Array(bits)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

export function isSeedOwner(user, env) {
  const owner = seedOwnerName(env);
  if (!owner) return false;
  return String(user?.username || "").trim().toLowerCase() === owner;
}
