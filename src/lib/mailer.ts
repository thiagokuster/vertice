export async function sendPasswordResetEmail(to: string, link: string) {
  if (!process.env.SMTP_HOST) return { sent: false as const };
  const nodemailer = await import("nodemailer");
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
      : undefined,
  });
  await transport.sendMail({
    from: process.env.SMTP_FROM ?? "Vértice <estoque@localhost>",
    to,
    subject: "Redefinição de senha — Vértice",
    text: `Para criar uma nova senha, acesse o link abaixo. Ele expira em 30 minutos.\n\n${link}\n\nSe você não solicitou a recuperação, ignore esta mensagem.`,
  });
  return { sent: true as const };
}
