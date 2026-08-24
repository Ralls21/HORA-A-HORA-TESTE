import { Resend } from "resend";

export async function sendPasswordResetEmail(input: { name: string; email: string; token: string }) {
  const appUrl = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const resetUrl = `${appUrl}/?reset=${encodeURIComponent(input.token)}`;
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;

  if (!apiKey || !from) {
    if (process.env.NODE_ENV === "production") throw new Error("Serviço de e-mail não configurado.");
    console.info(`[Hora a Hora] Link de recuperação para ${input.email}: ${resetUrl}`);
    return;
  }

  const resend = new Resend(apiKey);
  const result = await resend.emails.send({
    from,
    to: input.email,
    subject: "Redefina sua senha — Hora a Hora",
    html: `
      <div style="background:#f3f6fb;padding:32px 16px;font-family:Arial,sans-serif;color:#23334d">
        <div style="max-width:560px;margin:auto;background:white;border-radius:18px;overflow:hidden;box-shadow:0 12px 35px rgba(35,51,77,.10)">
          <div style="background:#4a6da7;padding:26px 32px;color:white">
            <div style="font-size:22px;font-weight:800">Hora a Hora</div>
            <div style="opacity:.82;margin-top:4px">Recuperação de senha</div>
          </div>
          <div style="padding:32px">
            <p style="font-size:17px">Olá, ${escapeHtml(input.name)}.</p>
            <p style="line-height:1.65;color:#586982">Recebemos uma solicitação para trocar a senha da sua conta. O link abaixo é válido por 30 minutos e só pode ser usado uma vez.</p>
            <p style="margin:28px 0"><a href="${resetUrl}" style="display:inline-block;background:#4a6da7;color:white;text-decoration:none;font-weight:700;padding:14px 22px;border-radius:10px">Criar nova senha</a></p>
            <p style="font-size:13px;line-height:1.6;color:#7a879b">Se você não solicitou esta alteração, ignore esta mensagem. Sua senha continuará a mesma.</p>
          </div>
        </div>
      </div>`,
  });
  if (result.error) {
    throw new Error(`O provedor recusou o e-mail de recuperação: ${result.error.message}`);
  }
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#039;",
    '"': "&quot;",
  })[character] ?? character);
}
