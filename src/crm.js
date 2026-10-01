const crypto = require("node:crypto");

async function safeErrorDetail(response) {
  try {
    const body = await response.json();
    return typeof body.detail === "string" ? body.detail.slice(0, 300) : "";
  } catch {
    return "";
  }
}

function createCrmClient({ config, fetchImpl = fetch }) {
  return {
    async submitLead(payload) {
      if (!config.crmWebhookUrl || !config.crmWebhookSecret) throw new Error("CRM webhook configuration is missing.");
      const rawBody = JSON.stringify(payload);
      const signature = `sha256=${crypto.createHmac("sha256", config.crmWebhookSecret).update(rawBody).digest("hex")}`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), config.timeoutMs);
      try {
        const response = await fetchImpl(config.crmWebhookUrl, { method: "POST", signal: controller.signal, headers: { "Content-Type": "application/json", "X-Hub-Signature-256": signature }, body: rawBody });
        if (!response.ok) {
          const detail = await safeErrorDetail(response);
          throw new Error(`CRM webhook request failed (${response.status})${detail ? `: ${detail}` : "."}`);
        }
        return response.json().catch(() => ({}));
      } finally { clearTimeout(timer); }
    },
  };
}

module.exports = { createCrmClient };
