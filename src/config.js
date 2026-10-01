const path = require("node:path");

function getConfig(env = process.env) {
  return {
    port: Number(env.PORT || 3000),
    verifyToken: env.WHATSAPP_VERIFY_TOKEN || "",
    accessToken: env.WHATSAPP_ACCESS_TOKEN || "",
    phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID || "",
    crmWebhookUrl: env.CRM_WEBHOOK_URL || "",
    crmWebhookSecret: env.CRM_WEBHOOK_SECRET || "",
    storePath: path.resolve(env.CONVERSATION_STORE_PATH || "data/conversations.json"),
    sessionTtlMs: Number(env.CONVERSATION_TTL_SECONDS || 86400) * 1000,
    timeoutMs: Number(env.OUTBOUND_TIMEOUT_MS || 10000),
  };
}

module.exports = { getConfig };
