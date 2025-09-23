import type { NextApiRequest, NextApiResponse } from "next";
import { requirePerm } from "@/lib/rbac";
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const ctx = await requirePerm(req, res, "integracoes:whatsapp:send"); if (!ctx) return;
  const { to, body } = req.body || {};
  if (!to || !body) return res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "to e body são obrigatórios" } });
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_WHATSAPP;
  if (!sid || !token || !from) return res.status(400).json({ ok: false, error: { code: "NOT_CONFIGURED", message: "Configure TWILIO_* no .env" } });
  try {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
    const params = new URLSearchParams({ From: from, To: `whatsapp:${to}`, Body: body });
    const r = await fetch(url, { method: "POST", headers: { "Authorization": "Basic " + Buffer.from(`${sid}:${token}`).toString("base64"), "Content-Type": "application/x-www-form-urlencoded" }, body: params.toString() });
    const js = await r.json();
    if (r.ok) return res.json({ ok: true, data: { sid: js.sid, status: js.status } });
    return res.status(400).json({ ok: false, error: { code: "TWILIO_ERROR", message: js.message || "Falha no envio" } });
  } catch (e:any) { res.status(500).json({ ok: false, error: { code: "INTERNAL", message: e.message } }); }
}
