const { ZodError } = require("zod");

function formatValidationIssues(issues) {
  return issues.map((issue) => ({
    field: issue.path.length ? issue.path.join(".") : "request",
    message: (() => {
      if (issue.code === "invalid_type" && issue.input === undefined) {
        return `${issue.path.length ? issue.path.join(".") : "field"} is required.`;
      }
      if (typeof issue.message === "string" && issue.message.startsWith("Invalid input")) {
        return "Invalid value.";
      }
      return issue.message || "Invalid value.";
    })(),
  }));
}

function validateRequest(schemas = {}) {
  return async function validateRequestMiddleware(req, res, next) {
    try {
      if (schemas.params) {
        req.params = await schemas.params.parseAsync(req.params || {});
      }
      if (schemas.query) {
        req.query = await schemas.query.parseAsync(req.query || {});
      }
      if (schemas.body) {
        req.body = await schemas.body.parseAsync(req.body || {});
      }
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({
          error: "Invalid request input.",
          details: formatValidationIssues(error.issues || []),
        });
        return;
      }
      next(error);
    }
  };
}

module.exports = {
  validateRequest,
};
