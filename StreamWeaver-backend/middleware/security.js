const helmet = require("helmet");
const cors = require("cors");

/**
 * Week 4 Day 1 — security headers, finalized into their own file
 * (previously just a bare `app.use(helmet())` inline in server.js).
 *
 * helmet() defaults already cover the big ones (CSP, X-Frame-Options,
 * X-Content-Type-Options, HSTS, etc.) — this file makes the choices
 * explicit instead of relying on defaults silently, and gives one place
 * to loosen a policy later for a specific need (e.g. serving the React
 * frontend from the same origin) without hunting through server.js.
 */
function applySecurityMiddleware(app) {
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          "default-src": ["'self'"],
          "object-src": ["'none'"], // blocks <object>/<embed> — a common XSS vector
        },
      },
      crossOriginResourcePolicy: { policy: "same-origin" },
      hsts: { maxAge: 15552000, includeSubDomains: true }, // 180 days
    })
  );

  // CORS is also "a security header concern" in practice (controls who
  // can call this API from a browser) — kept alongside helmet so both
  // live in one place. Open for now (API is used by the project's own
  // frontend during development); tighten `origin` before production.
  app.use(cors());

  // Node/Express' own fingerprint — no reason to advertise it.
  app.disable("x-powered-by");
}

module.exports = applySecurityMiddleware;
