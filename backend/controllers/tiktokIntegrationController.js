const axios = require("axios");
const crypto = require("crypto");
const prisma = require("../utils/prisma");
const logger = require("../utils/logger");
const { safeError } = require("../utils/sanitize");
const { encryptSecret, sha256Hex } = require("../utils/secretBox");

const PROVIDER = "TIKTOK";
const AUTHORIZE_URL = "https://www.tiktok.com/v2/auth/authorize/";
const TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/";
const USER_INFO_URL = "https://open.tiktokapis.com/v2/user/info/";

function requireTikTokEnv() {
  const clientKey = String(process.env.TIKTOK_CLIENT_KEY || "").trim();
  const clientSecret = String(process.env.TIKTOK_CLIENT_SECRET || "").trim();
  const redirectUri = String(process.env.TIKTOK_REDIRECT_URI || "https://qr-tickets.connsura.com/tiktok/callback").trim();

  if (!clientKey || !clientSecret) {
    const error = new Error("TikTok integration is not configured.");
    error.statusCode = 503;
    throw error;
  }

  return { clientKey, clientSecret, redirectUri };
}

function buildAuthorizeUrl({ clientKey, redirectUri, state }) {
  const scope = "video.upload,user.info.basic";
  const params = new URLSearchParams({
    client_key: clientKey,
    scope,
    response_type: "code",
    redirect_uri: redirectUri,
    state,
  });

  return `${AUTHORIZE_URL}?${params.toString()}`;
}

async function upsertIntegration({ accessToken, refreshToken, accessTokenExpiresAt, refreshTokenExpiresAt, openId, displayName }) {
  const now = new Date();
  const data = {
    provider: PROVIDER,
    accessTokenEnc: encryptSecret(accessToken),
    refreshTokenEnc: refreshToken ? encryptSecret(refreshToken) : null,
    accessTokenExpiresAt: accessTokenExpiresAt || null,
    refreshTokenExpiresAt: refreshTokenExpiresAt || null,
    openId: openId || null,
    displayName: displayName || null,
    connectedAt: now,
  };

  await prisma.socialIntegration.upsert({
    where: { provider: PROVIDER },
    create: { id: crypto.randomUUID(), ...data },
    update: data,
  });
}

async function consumeOAuthState(state) {
  const stateHash = sha256Hex(state);
  const now = new Date();

  const record = await prisma.oAuthState.findFirst({
    where: {
      provider: PROVIDER,
      stateHash,
      consumedAt: null,
      expiresAt: { gt: now },
    },
  });

  if (!record) {
    const error = new Error("Invalid or expired OAuth state.");
    error.statusCode = 400;
    throw error;
  }

  await prisma.oAuthState.update({
    where: { id: record.id },
    data: { consumedAt: now },
  });

  return record;
}

function toDateFromNowSeconds(seconds) {
  const s = Number(seconds);
  if (!Number.isFinite(s) || s <= 0) return null;
  return new Date(Date.now() + s * 1000);
}

async function exchangeCodeForToken({ clientKey, clientSecret, redirectUri, code }) {
  const body = new URLSearchParams({
    client_key: clientKey,
    client_secret: clientSecret,
    code,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
  });

  const response = await axios.post(TOKEN_URL, body.toString(), {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    timeout: 15000,
    validateStatus: () => true,
  });

  if (response.status < 200 || response.status >= 300) {
    const error = new Error("TikTok token exchange failed.");
    error.statusCode = 502;
    logger.error({
      message: "tiktok_token_exchange_failed",
      status: response.status,
      error: response.data?.error,
      error_description: response.data?.error_description,
      log_id: response.data?.log_id,
    });
    throw error;
  }

  const data = response.data?.data || response.data;
  const accessToken = String(data?.access_token || "").trim();
  if (!accessToken) {
    const error = new Error("TikTok token exchange returned no access token.");
    error.statusCode = 502;
    logger.error({
      message: "tiktok_token_exchange_missing_access_token",
      error: response.data?.error,
      error_description: response.data?.error_description,
      log_id: response.data?.log_id,
    });
    throw error;
  }

  const refreshToken = data?.refresh_token ? String(data.refresh_token) : "";
  const openId = data?.open_id ? String(data.open_id) : "";
  const accessTokenExpiresAt = toDateFromNowSeconds(data?.expires_in);
  const refreshTokenExpiresAt = toDateFromNowSeconds(data?.refresh_expires_in);

  return { accessToken, refreshToken, openId, accessTokenExpiresAt, refreshTokenExpiresAt };
}

async function fetchTikTokDisplayName(accessToken) {
  try {
    const response = await axios.get(USER_INFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: { fields: "open_id,display_name" },
      timeout: 12000,
      validateStatus: () => true,
    });

    if (response.status < 200 || response.status >= 300) return "";
    return String(response.data?.data?.user?.display_name || "").trim();
  } catch {
    return "";
  }
}

function redirectToAdminWithResult(res, result, message) {
  const params = new URLSearchParams();
  if (result) params.set("result", result);
  if (message) params.set("message", message);
  const query = params.toString();
  res.redirect(302, query ? `/admin/dashboard?${query}` : "/admin/dashboard");
}

async function handleTikTokCallback(req, res) {
  const { clientKey, clientSecret, redirectUri } = requireTikTokEnv();

  const errorParam = String(req.query?.error || "").trim();
  const errorDescription = String(req.query?.error_description || "").trim();
  if (errorParam) {
    redirectToAdminWithResult(
      res,
      "failed",
      safeError({ statusCode: 400, message: `TikTok OAuth error: ${errorParam}${errorDescription ? ` (${errorDescription})` : ""}` }, "TikTok OAuth failed."),
    );
    return;
  }

  const code = String(req.query?.code || "").trim();
  const state = String(req.query?.state || "").trim();

  if (!state || state.length > 256) {
    redirectToAdminWithResult(res, "failed", "Missing or invalid state.");
    return;
  }

  if (!code || code.length > 2048) {
    redirectToAdminWithResult(res, "failed", "Missing or invalid authorization code.");
    return;
  }

  await consumeOAuthState(state);

  const token = await exchangeCodeForToken({ clientKey, clientSecret, redirectUri, code });
  const displayName = await fetchTikTokDisplayName(token.accessToken);

  await upsertIntegration({
    accessToken: token.accessToken,
    refreshToken: token.refreshToken,
    accessTokenExpiresAt: token.accessTokenExpiresAt,
    refreshTokenExpiresAt: token.refreshTokenExpiresAt,
    openId: token.openId,
    displayName,
  });

  redirectToAdminWithResult(res, "connected", displayName ? `Connected as ${displayName}.` : "TikTok connected.");
}

async function adminTikTokLogin(req, res) {
  try {
    const { clientKey, redirectUri } = requireTikTokEnv();
    const state = crypto.randomBytes(24).toString("hex");
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    // Best-effort cleanup to prevent state table growth.
    await prisma.oAuthState
      .deleteMany({
        where: {
          provider: PROVIDER,
          OR: [{ expiresAt: { lte: new Date() } }, { consumedAt: { not: null } }],
        },
      })
      .catch(() => null);

    await prisma.oAuthState.create({
      data: {
        id: crypto.randomUUID(),
        provider: PROVIDER,
        stateHash: sha256Hex(state),
        expiresAt,
      },
    });

    const url = buildAuthorizeUrl({ clientKey, redirectUri, state });
    res.redirect(302, url);
  } catch (error) {
    redirectToAdminWithResult(res, "failed", safeError(error, "Failed to start TikTok OAuth."));
  }
}

async function adminTikTokCallback(req, res) {
  try {
    await handleTikTokCallback(req, res);
  } catch (error) {
    redirectToAdminWithResult(res, "failed", safeError(error, "TikTok callback failed."));
  }
}

async function publicTikTokCallback(req, res) {
  try {
    await handleTikTokCallback(req, res);
  } catch (error) {
    redirectToAdminWithResult(res, "failed", safeError(error, "TikTok callback failed."));
  }
}

async function adminTikTokStatus(req, res) {
  try {
    const integration = await prisma.socialIntegration.findUnique({
      where: { provider: PROVIDER },
      select: { provider: true, displayName: true, openId: true, connectedAt: true, updatedAt: true },
    });

    res.status(200).json({
      connected: Boolean(integration),
      provider: PROVIDER,
      displayName: integration?.displayName || null,
      openId: integration?.openId || null,
      connectedAt: integration?.connectedAt || null,
      updatedAt: integration?.updatedAt || null,
    });
  } catch (error) {
    if (error?.code === "P2021" || /SocialIntegration/i.test(String(error?.message || ""))) {
      res.status(503).json({ error: "TikTok integration is not ready (database migration missing). Run prisma migrate deploy." });
      return;
    }
    res.status(500).json({ error: safeError(error, "Failed to load TikTok status.") });
  }
}

async function adminTikTokDisconnect(req, res) {
  try {
    await prisma.socialIntegration.delete({ where: { provider: PROVIDER } }).catch(() => null);
    res.status(200).json({ ok: true });
  } catch (error) {
    if (error?.code === "P2021" || /SocialIntegration/i.test(String(error?.message || ""))) {
      res.status(503).json({ error: "TikTok integration is not ready (database migration missing). Run prisma migrate deploy." });
      return;
    }
    res.status(500).json({ error: safeError(error, "Failed to disconnect TikTok.") });
  }
}

module.exports = {
  adminTikTokLogin,
  adminTikTokCallback,
  adminTikTokStatus,
  adminTikTokDisconnect,
  publicTikTokCallback,
};
