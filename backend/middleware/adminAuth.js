function resolveConfiguredAdminKey() {
  return String(process.env.ADMIN_PANEL_KEY || "").trim();
}

function requireAdminAccess(req, res, next) {
  const configuredKey = resolveConfiguredAdminKey();
  if (!configuredKey) {
    res.status(503).json({ error: "Admin panel is not configured." });
    return;
  }

  const providedKey = String(req.header("x-admin-key") || req.query?.adminKey || "").trim();
  if (!providedKey || providedKey !== configuredKey) {
    res.status(401).json({ error: "Unauthorized admin access." });
    return;
  }

  req.adminActor = {
    authType: "x-admin-key",
  };
  next();
}

module.exports = { requireAdminAccess, resolveConfiguredAdminKey };
