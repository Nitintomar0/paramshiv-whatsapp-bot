const express = require("express");
require("dotenv").config();

const app = express();

app.use(express.json());

const PORT = process.env.PORT || 3000;

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;

const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;

const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;

// Health check
app.get("/", (req, res) => {
  res.json({
    status: "ok",
    service: "Paramshiv WhatsApp Bot",
  });
});

// Meta Webhook Verification
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("Webhook verified successfully.");
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
});

// Send WhatsApp text message
async function sendWhatsAppButtons(to) {
  const url = `https://graph.facebook.com/v23.0/${PHONE_NUMBER_ID}/messages`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: to,
      type: "interactive",
      interactive: {
        type: "button",
        body: {
          text: "Hi! 👋 Welcome to Paramshiv Real Estate.\n\nHow can we help you today?"
        },
        action: {
          buttons: [
            {
              type: "reply",
              reply: {
                id: "buy_property",
                title: "🏠 Buy Property"
              }
            },
            {
              type: "reply",
              reply: {
                id: "sell_property",
                title: "💰 Sell Property"
              }
            },
            {
              type: "reply",
              reply: {
                id: "rent_property",
                title: "🏢 Rent Property"
              }
            }
          ]
        }
      }
    })
  });

  const data = await response.json();

  console.log("WhatsApp API response:");
  console.log(JSON.stringify(data, null, 2));

  if (!response.ok) {
    throw new Error(JSON.stringify(data));
  }
}

// WhatsApp incoming messages
// WhatsApp incoming messages
app.post("/webhook", async (req, res) => {
  console.log("WhatsApp webhook received:");
  console.log(JSON.stringify(req.body, null, 2));

  try {
    const messages =
      req.body?.entry?.[0]?.changes?.[0]?.value?.messages;

    if (messages && messages.length > 0) {
      const message = messages[0];

      if (message.type === "text") {
        const from = message.from;
        const text = message.text?.body?.trim().toLowerCase();

        console.log(`Message from ${from}: ${text}`);

        if (text === "hi" || text === "hello" || text === "hey") {
          await sendWhatsAppButtons(from);
        }
      }
    }

    res.sendStatus(200);
  } catch (error) {
    console.error("Error processing WhatsApp message:");
    console.error(error);

    res.sendStatus(200);
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});