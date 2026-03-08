const prisma = require("./prisma");

async function writeAdminAuditLog({ action, targetType, targetId, eventId = null, metadata = null }) {
  try {
    await prisma.adminAuditLog.create({
      data: {
        action: String(action || "UNKNOWN"),
        targetType: String(targetType || "UNKNOWN"),
        targetId: String(targetId || "UNKNOWN"),
        eventId: eventId ? String(eventId) : null,
        metadata: metadata && typeof metadata === "object" ? metadata : null,
      },
    });
  } catch (error) {
    console.error("writeAdminAuditLog failed", error);
  }
}

module.exports = { writeAdminAuditLog };