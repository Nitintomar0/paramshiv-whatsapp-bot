const express = require("express");
require("dotenv").config();

const { getConfig } = require("./config");
const { ConversationStore } = require("./conversation-store");
const { createCrmClient } = require("./crm");
const { handleMessage } = require("./questionnaire");
const { createWhatsAppClient, parseIncomingMessages } = require("./whatsapp");

function createApp({ config = getConfig(), store, whatsapp, crm, logger = console, fetchImpl } = {}) {
  const app = express();
  const conversationStore = store || new ConversationStore({ filePath: config.storePath, ttlMs: config.sessionTtlMs });
  const whatsappClient = whatsapp || createWhatsAppClient({ config, fetchImpl });
  const crmClient = crm || createCrmClient({ config, fetchImpl });
  app.use(express.json({ limit: "256kb" }));

  app.get("/", (_req, res) => res.json({ status: "ok", service: "Paramshiv WhatsApp Bot" }));
  app.get("/webhook", (req, res) => {
    const valid = req.query["hub.mode"] === "subscribe" && config.verifyToken && req.query["hub.verify_token"] === config.verifyToken;
    return valid ? res.status(200).send(req.query["hub.challenge"]) : res.sendStatus(403);
  });
  app.post("/webhook", async (req, res) => {
    for (const message of parseIncomingMessages(req.body)) {
      try {
        await handleMessage({ message, store: conversationStore, whatsapp: whatsappClient, crm: crmClient, config });
      } catch (error) {
        logger.error("WhatsApp webhook message processing failed.", { messageId: message.id, error: error.message });
      }
    }
    return res.sendStatus(200);
  });
  return app;
}

if (require.main === module) {
  const config = getConfig();
  createApp({ config }).listen(config.port, () => console.log(`Paramshiv WhatsApp Bot listening on port ${config.port}.`));
}

module.exports = { createApp };
