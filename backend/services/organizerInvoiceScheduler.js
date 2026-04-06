const logger = require("../utils/logger");
const { runOrganizerInvoiceGenerationCycle } = require("./organizerInvoiceService");

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;

let intervalHandle = null;
let running = false;

async function runCycleSafely() {
  if (running) return;
  running = true;
  try {
    const summary = await runOrganizerInvoiceGenerationCycle();
    if (summary.scannedEvents > 0 || summary.finalScannedEvents > 0 || summary.overdueUpdated > 0) {
      logger.info("Organizer invoice scheduler cycle completed", {
        overdueUpdated: summary.overdueUpdated || 0,
        preScannedEvents: summary.scannedEvents,
        preResults: (summary.preResults || []).map((item) => ({ eventId: item.eventId, status: item.status })),
        finalScannedEvents: summary.finalScannedEvents || 0,
        finalResults: (summary.finalResults || []).map((item) => ({ eventId: item.eventId, status: item.status })),
      });
    }
  } catch (error) {
    logger.error("Organizer invoice scheduler cycle failed", {
      error: error?.message || "Unknown scheduler error",
    });
  } finally {
    running = false;
  }
}

function startOrganizerInvoiceScheduler() {
  if (intervalHandle) return;

  setTimeout(() => {
    runCycleSafely().catch(() => {});
  }, 5000);

  intervalHandle = setInterval(() => {
    runCycleSafely().catch(() => {});
  }, DEFAULT_INTERVAL_MS);
}

function stopOrganizerInvoiceScheduler() {
  if (!intervalHandle) return;
  clearInterval(intervalHandle);
  intervalHandle = null;
}

module.exports = {
  startOrganizerInvoiceScheduler,
  stopOrganizerInvoiceScheduler,
};
