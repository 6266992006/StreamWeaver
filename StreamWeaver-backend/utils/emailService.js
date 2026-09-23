const nodemailer = require("nodemailer");

// If SMTP env vars aren't set (common while developing locally),
// we just log the reset link instead of sending a real email so
// Week 1 testing never blocks on having a mail account configured.
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
    html: `<p>Click below to reset your password (valid 15 minutes):</p>
           <a href="${resetLink}">${resetLink}</a>`,
  });
};
