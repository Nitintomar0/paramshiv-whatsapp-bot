const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const test = require("node:test");

const { createCrmClient } = require("../src/crm");

const config = { crmWebhookUrl: "http://127.0.0.1:8000/api/integrations/webhooks/whatsapp/", crmWebhookSecret: "test-shared-secret", timeoutMs: 1000 };
const payload = { account_id: "phone-id", event_id: "event-id", phone: "919876543210" };

function response(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

test("CRM client signs the exact raw JSON bytes and accepts a 200 response", async () => {
  let request;
  const client = createCrmClient({ config, fetchImpl: async (_url, options) => { request = options; return response(200, { status: "PROCESSED" }); } });
  const result = await client.submitLead(payload);
  assert.deepEqual(result, { status: "PROCESSED" });
  assert.equal(request.body, JSON.stringify(payload));
  assert.equal(request.headers["X-Hub-Signature-256"], `sha256=${crypto.createHmac("sha256", config.crmWebhookSecret).update(request.body).digest("hex")}`);
});

test("CRM client returns safe diagnostics for 403 and 422 responses", async () => {
  for (const [status, detail] of [[403, "Webhook signature is invalid."], [422, "Webhook processing failed."]]) {
    const client = createCrmClient({ config, fetchImpl: async () => response(status, { detail }) });
    await assert.rejects(client.submitLead(payload), new RegExp(`CRM webhook request failed \\(${status}\\): ${detail}`));
  }
});
