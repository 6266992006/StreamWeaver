const nodemailer = require("nodemailer");

// If SMTP env vars aren't set, log the reset link instead of sending a
// real email so testing never blocks on having a mail account configured.
exports.sendPasswordResetEmail = async (toEmail, resetToken) => {
  const resetLink = `http://localhost:3000/reset-password?token=${resetToken}`;

  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.log("📧 [DEV MODE] Password reset link (SMTP not configured):");
    console.log(`   To: ${toEmail}`);
    console.log(`   Link: ${resetLink}`);
    return;
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });

  await transporter.sendMail({
    from: process.env.SMTP_USER,
    to: toEmail,
    subject: "StreamWeaver - Password Reset",
    html: `<p>Click below to reset your password (valid 15 minutes):</p><a href="${resetLink}">${resetLink}</a>`,
  });
};

/**
 * Week 4 Day 2/Day 5 — completion-notification email. Fired once a
 * long-running job (Week 4's buffered bulk-insert pipeline) finishes,
 * so the user doesn't have to keep the HTTP request open or poll for
 * status — same dev-mode-log fallback as the reset email, so testing
 * never blocks on having a real mail account configured.
 */
exports.sendCompletionNotificationEmail = async (toEmail, { fileName, totalRows, batches } = {}) => {
  const subject = "StreamWeaver - Your upload finished processing";
  const summary = `"${fileName}" — ${totalRows} rows inserted in ${batches} batch(es).`;

  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.log("📧 [DEV MODE] Completion notification (SMTP not configured):");
    console.log(`   To: ${toEmail}`);
    console.log(`   Summary: ${summary}`);
    return;
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });

  await transporter.sendMail({
    from: process.env.SMTP_USER,
    to: toEmail,
    subject,
    html: `<p>Your StreamWeaver upload finished processing.</p><p>${summary}</p>`,
  });
};
