import nodemailer from "nodemailer";

const SMTP_HOST = "smtp.gmail.com";
const SMTP_PORT = 587;
const SMTP_USER = "boboagentai@gmail.com";
const SMTP_PASS = "xeef cdaj smeg eecv";

export const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: false,
  auth: { user: SMTP_USER, pass: SMTP_PASS },
  tls: { rejectUnauthorized: false },
});

function baseLayout(content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Bobo</title>
</head>
<body style="margin:0;padding:0;background:#08090A;font-family:-apple-system,BlinkMacSystemFont,'Inter','Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#08090A;min-height:100vh;">
    <tr>
      <td align="center" style="padding:48px 16px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;">
          <!-- Logo row -->
          <tr>
            <td style="padding-bottom:32px;" align="center">
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background:#111113;border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:8px 16px;">
                    <span style="font-size:15px;font-weight:600;color:rgba(255,255,255,0.85);letter-spacing:-0.3px;">Bobo</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Card -->
          <tr>
            <td style="background:#111113;border:1px solid rgba(255,255,255,0.07);border-radius:16px;padding:40px 36px;">
              ${content}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding-top:24px;" align="center">
              <p style="margin:0;font-size:11px;color:rgba(255,255,255,0.18);line-height:1.6;">
                This email was sent by Bobo · If you didn't request this, ignore it safely.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function otpEmailHtml(name: string, code: string): string {
  const digits = code.split("");
  const digitBoxes = digits
    .map(
      (d) =>
        `<td style="padding:0 3px;">
          <div style="width:44px;height:56px;background:#1A1A1C;border:1px solid rgba(255,255,255,0.12);border-radius:10px;display:inline-flex;align-items:center;justify-content:center;text-align:center;font-size:26px;font-weight:700;color:#F7F8F8;line-height:56px;font-family:ui-monospace,'SF Mono','Fira Code',monospace;">${d}</div>
        </td>`
    )
    .join("");

  const content = `
    <h1 style="margin:0 0 6px;font-size:22px;font-weight:600;color:#F7F8F8;letter-spacing:-0.4px;">Verify your email</h1>
    <p style="margin:0 0 28px;font-size:14px;color:rgba(255,255,255,0.38);line-height:1.6;">
      Hey ${name}, enter this 8-digit code to confirm your Bobo account.
    </p>
    <!-- OTP Digits -->
    <table cellpadding="0" cellspacing="0" style="margin:0 auto 28px;">
      <tr>${digitBoxes}</tr>
    </table>
    <!-- Expiry note -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
      <tr>
        <td style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);border-radius:8px;padding:10px 14px;">
          <p style="margin:0;font-size:12px;color:rgba(255,255,255,0.28);text-align:center;">
            ⏱ Expires in <strong style="color:rgba(255,255,255,0.45);">10 minutes</strong>
          </p>
        </td>
      </tr>
    </table>
    <hr style="border:none;border-top:1px solid rgba(255,255,255,0.06);margin:0 0 24px;" />
    <p style="margin:0;font-size:12px;color:rgba(255,255,255,0.22);line-height:1.7;">
      If you didn't create a Bobo account, you can safely ignore this email. 
      Someone may have typed your email address by mistake.
    </p>
  `;
  return baseLayout(content);
}

function projectCreatedEmailHtml(name: string, projectName: string): string {
  const content = `
    <h1 style="margin:0 0 6px;font-size:22px;font-weight:600;color:#F7F8F8;letter-spacing:-0.4px;">New project created</h1>
    <p style="margin:0 0 28px;font-size:14px;color:rgba(255,255,255,0.38);line-height:1.6;">
      Hey ${name}, your AI agent just started working on a new project.
    </p>
    <!-- Project name card -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
      <tr>
        <td style="background:#1A1A1C;border:1px solid rgba(255,255,255,0.09);border-radius:10px;padding:16px 18px;">
          <p style="margin:0 0 4px;font-size:10px;font-weight:600;color:rgba(255,255,255,0.22);text-transform:uppercase;letter-spacing:0.12em;">Project</p>
          <p style="margin:0;font-size:16px;font-weight:600;color:#F7F8F8;letter-spacing:-0.2px;">${projectName}</p>
        </td>
      </tr>
    </table>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
      <tr>
        <td align="center">
          <a href="#" style="display:inline-block;background:#E5E5E6;color:#08090A;font-size:13px;font-weight:600;padding:11px 28px;border-radius:100px;text-decoration:none;letter-spacing:-0.1px;">Open project →</a>
        </td>
      </tr>
    </table>
    <hr style="border:none;border-top:1px solid rgba(255,255,255,0.06);margin:0 0 20px;" />
    <p style="margin:0;font-size:12px;color:rgba(255,255,255,0.22);line-height:1.7;">
      The agent is autonomously writing code, running commands, and building your app. You can follow the progress live in the chat.
    </p>
  `;
  return baseLayout(content);
}

export async function sendOtpEmail(to: string, name: string, code: string): Promise<void> {
  await transporter.sendMail({
    from: `"Bobo" <${SMTP_USER}>`,
    to,
    subject: `${code} is your Bobo verification code`,
    html: otpEmailHtml(name, code),
  });
}

export async function sendProjectCreatedEmail(
  to: string,
  name: string,
  projectName: string
): Promise<void> {
  await transporter.sendMail({
    from: `"Bobo" <${SMTP_USER}>`,
    to,
    subject: `🛠 Your project "${projectName}" is being built`,
    html: projectCreatedEmailHtml(name, projectName),
  });
}
