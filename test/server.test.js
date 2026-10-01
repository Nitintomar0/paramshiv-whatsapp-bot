const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { ConversationStore } = require("../src/conversation-store");
const { createApp } = require("../src/server");

function config(directory) { return { verifyToken: "verify-token", accessToken: "access-token", phoneNumberId: "wa-account", crmWebhookUrl: "http://crm.test/webhook", crmWebhookSecret: "shared-secret", storePath: path.join(directory, "store.json"), sessionTtlMs: 86400000, timeoutMs: 1000 }; }
function createHarness(t, options = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "paramshiv-test-")); t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const sent = []; const submitted = []; const errors = [];
  const crm = { submitLead: async (payload) => { submitted.push(payload); if (options.crmError) throw new Error("CRM unavailable"); return {}; } };
  const whatsapp = { sendButtons: async (to, text, buttons) => { sent.push({ type: "buttons", to, text, buttons }); if (options.whatsappError) throw new Error("Meta unavailable"); }, sendText: async (to, text) => { sent.push({ type: "text", to, text }); if (options.whatsappError) throw new Error("Meta unavailable"); } };
  const app = createApp({ config: config(directory), store: new ConversationStore({ filePath: path.join(directory, "store.json"), ttlMs: 86400000 }), crm, whatsapp, logger: { error: (...args) => errors.push(args) } });
  return { app, sent, submitted, errors };
}
function event({ id, type = "text", buttonId, from = "919876543210", name = "Rahul" }) {
  const message = { id, from, type }; if (type === "text") message.text = { body: "anything at all 👋" }; if (type === "interactive") message.interactive = { type: "button_reply", button_reply: { id: buttonId, title: "Choice" } };
  return { entry: [{ changes: [{ value: { contacts: [{ wa_id: from, profile: { name } }], messages: [message] } }] }] };
}
async function request(app, route, options) { const server = app.listen(0); await new Promise((resolve) => server.once("listening", resolve)); try { return await fetch(`http://127.0.0.1:${server.address().port}${route}`, options); } finally { await new Promise((resolve) => server.close(resolve)); } }

test("health check and Meta verification are safe", async (t) => {
  const { app } = createHarness(t);
  assert.deepEqual(await (await request(app, "/")).json(), { status: "ok", service: "Paramshiv WhatsApp Bot" });
  assert.equal(await (await request(app, "/webhook?hub.mode=subscribe&hub.verify_token=verify-token&hub.challenge=challenge")).text(), "challenge");
  assert.equal((await request(app, "/webhook?hub.mode=subscribe&hub.verify_token=wrong")).status, 403);
});

test("any text starts a questionnaire and submits exactly once after location", async (t) => {
  const { app, sent, submitted } = createHarness(t); const post = (payload) => request(app, "/webhook", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  await post(event({ id: "text-1" }));
  assert.match(sent[0].text, /Welcome to Paramshiv Real Estate/); assert.deepEqual(sent[0].buttons.map((button) => button.id), ["property_residential_commercial", "property_authority_freehold_plot", "property_builder_floor"]); assert.equal(submitted.length, 0);
  await post(event({ id: "property-1", type: "interactive", buttonId: "property_residential_commercial" })); await post(event({ id: "budget-1", type: "interactive", buttonId: "budget_3cr_10cr" })); await post(event({ id: "location-1", type: "interactive", buttonId: "location_noida_greater_noida" }));
  assert.equal(submitted.length, 1); assert.equal(submitted[0].property_type, "Residential / Commercial"); assert.equal(submitted[0].preferred_location, "Noida / Greater Noida"); assert.equal(submitted[0].budget_minimum, 30000000); assert.equal(submitted[0].budget_maximum, 100000000); assert.equal(submitted[0].event_id, "location-1"); assert.match(submitted[0].requirement_notes, /₹3 Crore/); assert.match(sent.at(-1).text, /contact you shortly/);
  await post(event({ id: "location-1", type: "interactive", buttonId: "location_noida_greater_noida" })); assert.equal(submitted.length, 1);
});

test("status events and safe failures do not crash or expose secrets", async (t) => {
  const normal = createHarness(t); const statusResponse = await request(normal.app, "/webhook", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entry: [{ changes: [{ value: { statuses: [{ id: "status-only" }] } }] }] }) }); assert.equal(statusResponse.status, 200); assert.equal(normal.sent.length, 0);
  const failedCrm = createHarness(t, { crmError: true }); const post = (payload) => request(failedCrm.app, "/webhook", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  await post(event({ id: "start" })); await post(event({ id: "property", type: "interactive", buttonId: "property_builder_floor" })); await post(event({ id: "budget", type: "interactive", buttonId: "budget_50l_3cr" })); await post(event({ id: "location", type: "interactive", buttonId: "location_ghaziabad" }));
  assert.equal(failedCrm.errors.length, 1); assert.match(failedCrm.errors[0][1].error, /CRM unavailable/); assert.doesNotMatch(failedCrm.errors[0][1].error, /shared-secret/);
  const failedMeta = createHarness(t, { whatsappError: true }); assert.equal((await request(failedMeta.app, "/webhook", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(event({ id: "meta-failure" })) })).status, 200); assert.equal(failedMeta.errors.length, 1);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "paramshiv-missing-config-")); t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const missingConfig = { ...config(directory), accessToken: "", phoneNumberId: "", crmWebhookUrl: "", crmWebhookSecret: "" }; const missingErrors = [];
  const app = createApp({ config: missingConfig, logger: { error: (...args) => missingErrors.push(args) } });
  assert.equal((await request(app, "/webhook", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(event({ id: "missing-config" })) })).status, 200); assert.equal(missingErrors.length, 1); assert.doesNotMatch(missingErrors[0][1].error, /access-token|shared-secret/);
});
