/**
 * Roles (Week 4): "analyst" sees only their own imports; "admin" can also
 * see and download everyone's.
 *
 * Who is an admin is decided by the ADMIN_EMAILS environment variable
 * (comma-separated), so there is no signup form field anyone could tamper
 * with to promote themselves:
 *
 *   ADMIN_EMAILS=krishna@example.com,mohan@example.com
 *
 * The role is stored on the user and embedded in the JWT; after changing
 * ADMIN_EMAILS the person simply signs in again.
 */
const ROLES = ["analyst", "admin"];

function adminEmails() {
  return String(process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

// Role a user should have right now. Promotes listed emails; never demotes
// an existing admin just because the list changed (do that in the DB).
function resolveRole(email, currentRole = "analyst") {
  if (currentRole === "admin") return "admin";
  return adminEmails().includes(String(email || "").toLowerCase()) ? "admin" : "analyst";
}

const isAdmin = (req) => req.userRole === "admin";

module.exports = { ROLES, adminEmails, resolveRole, isAdmin };
