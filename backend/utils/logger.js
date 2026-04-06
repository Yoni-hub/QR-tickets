const { createLogger, format, transports } = require("winston");

const isProduction = process.env.NODE_ENV === "production";

// SAFETY RULE: Never log OTP codes, access tokens, client tokens, or request bodies
// that may contain PII. Only log error objects and operational context strings.

const logger = createLogger({
  level: isProduction ? "info" : "debug",
  format: isProduction
    ? format.combine(format.timestamp(), format.errors({ stack: true }), format.json())
    : format.combine(
        format.timestamp({ format: "HH:mm:ss" }),
        format.errors({ stack: true }),
        format.colorize(),
        format.printf(({ level, message, timestamp, stack }) =>
          stack ? `${timestamp} ${level}: ${message}\n${stack}` : `${timestamp} ${level}: ${message}`
        )
      ),
  transports: [new transports.Console()],
});

module.exports = logger;
