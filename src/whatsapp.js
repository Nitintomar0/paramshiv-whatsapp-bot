function withTimeout(timeoutMs, task) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return task(controller.signal).finally(() => clearTimeout(timer));
}

async function safeJson(response) {
  try { return await response.json(); } catch { return {}; }
}

function createWhatsAppClient({ config, fetchImpl = fetch }) {
  async function send(to, payload) {
    if (!config.accessToken || !config.phoneNumberId) throw new Error("WhatsApp sending is not configured.");
    const response = await withTimeout(config.timeoutMs, (signal) => fetchImpl(
      `https://graph.facebook.com/v23.0/${config.phoneNumberId}/messages`,
      { method: "POST", signal, headers: { Authorization: `Bearer ${config.accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to, ...payload }) },
    ));
    const body = await safeJson(response);
    if (!response.ok) throw new Error(`WhatsApp API request failed (${response.status}). ${body.error?.message || ""}`.trim());
    return body;
  }
  return {
    sendText: (to, text) => send(to, { type: "text", text: { body: text } }),
    sendButtons: (to, text, buttons) => send(to, { type: "interactive", interactive: { type: "button", body: { text }, action: { buttons: buttons.map(({ id, title }) => ({ type: "reply", reply: { id, title } })) } } }),
  };
}

function parseIncomingMessages(payload) {
  const messages = [];
  for (const entry of payload?.entry || []) for (const change of entry?.changes || []) {
    const value = change?.value || {};
    const contacts = Object.fromEntries((value.contacts || []).map((contact) => [contact.wa_id, contact]));
    for (const message of value.messages || []) {
      const interactive = message.interactive || {};
      const reply = interactive.button_reply || message.button_reply;
      const isButton = interactive.type === "button_reply" || message.type === "button_reply";
      messages.push({ id: message.id, from: message.from, type: isButton ? "button_reply" : message.type, text: message.text?.body || "", buttonId: isButton ? reply?.id : "", profileName: contacts[message.from]?.profile?.name || "", timestamp: message.timestamp || "" });
    }
  }
  return messages.filter((message) => message.id && message.from);
}

module.exports = { createWhatsAppClient, parseIncomingMessages };
