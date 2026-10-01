const STATES = Object.freeze({ START: "START", PROPERTY_TYPE: "PROPERTY_TYPE", BUDGET: "BUDGET", LOCATION: "LOCATION", COMPLETED: "COMPLETED" });
const PROPERTY_TYPES = { property_residential_commercial: "Residential / Commercial", property_authority_freehold_plot: "Authority Plot / Freehold Plot", property_builder_floor: "Builder Floor" };
const BUDGETS = { budget_50l_3cr: { label: "₹50 Lakh – ₹3 Crore", minimum: 5000000, maximum: 30000000 }, budget_3cr_10cr: { label: "₹3 Crore – ₹10 Crore", minimum: 30000000, maximum: 100000000 }, budget_10cr_20cr: { label: "₹10 Crore – ₹20 Crore", minimum: 100000000, maximum: 200000000 } };
const LOCATIONS = { location_noida_greater_noida: "Noida / Greater Noida", location_noida_extension_jewar: "Noida Extension / Jewar", location_ghaziabad: "Ghaziabad" };
const WELCOME = "🏡 Welcome to Paramshiv Real Estate!\n\nThank you for connecting with us. Let us understand your property requirement and help you find the right opportunity.\n\nPlease select: Residential / Commercial, Authority Plot / Freehold Plot, or Builder Floor.";
const COMPLETE = "✅ Thank you for sharing your requirement with Paramshiv Real Estate.\n\nOur property advisor will review your requirement and contact you shortly with suitable options.\n\n🏡 Paramshiv sed -n '1,320p' 'apps/frontend/app/employees/[id]/page.tsx'Urban Real Estate";

function crmPayload(session, config) {
  return { account_id: config.phoneNumberId, event_id: session.completedEventId, external_lead_id: session.completedEventId, external_contact_id: session.externalContactId, external_conversation_id: session.externalConversationId, phone: session.phone, name: session.name || "", property_type: session.propertyType, preferred_location: session.location, budget_minimum: session.budget.minimum, budget_maximum: session.budget.maximum, requirement_notes: `Paramshiv WhatsApp questionnaire: Property type: ${session.propertyType}; Budget: ${session.budget.label}; Location: ${session.location}.`, source_details: "Paramshiv WhatsApp questionnaire", event_type: "lead.received", metadata: { questionnaire_version: "1", source: "whatsapp", whatsapp_message_id: session.completedEventId } };
}
const askProperty = (client, to) => client.sendButtons(to, WELCOME, [{ id: "property_residential_commercial", title: "Residential / Comm." }, { id: "property_authority_freehold_plot", title: "Authority / Freehold" }, { id: "property_builder_floor", title: "Builder Floor" }]);
const askBudget = (client, to) => client.sendButtons(to, "What is your preferred investment budget?", [{ id: "budget_50l_3cr", title: "₹50L – ₹3Cr" }, { id: "budget_3cr_10cr", title: "₹3Cr – ₹10Cr" }, { id: "budget_10cr_20cr", title: "₹10Cr – ₹20Cr" }]);
const askLocation = (client, to) => client.sendButtons(to, "Which location are you primarily interested in?\n\nNoida / Greater Noida, Noida Extension / Jewar, or Ghaziabad.", [{ id: "location_noida_greater_noida", title: "Noida / Gr. Noida" }, { id: "location_noida_extension_jewar", title: "Extension / Jewar" }, { id: "location_ghaziabad", title: "Ghaziabad" }]);

async function handleMessage({ message, store, whatsapp, crm, config }) {
  if (store.isProcessed(message.id)) return { duplicate: true };
  let session = store.get(message.from);
  if (!session || session.state === STATES.COMPLETED) {
    if (message.type !== "text") return { ignored: true };
    session = { state: STATES.PROPERTY_TYPE, phone: message.from, name: message.profileName, externalContactId: message.from, externalConversationId: message.id, startedAt: message.timestamp || new Date().toISOString() };
    await askProperty(whatsapp, message.from);
  } else if (message.type !== "button_reply") {
    store.markProcessed(message.id);
    return { ignored: true };
  } else if (session.state === STATES.PROPERTY_TYPE && PROPERTY_TYPES[message.buttonId]) {
    session.propertyType = PROPERTY_TYPES[message.buttonId]; session.state = STATES.BUDGET; await askBudget(whatsapp, message.from);
  } else if (session.state === STATES.BUDGET && BUDGETS[message.buttonId]) {
    session.budget = BUDGETS[message.buttonId]; session.state = STATES.LOCATION; await askLocation(whatsapp, message.from);
  } else if (session.state === STATES.LOCATION && LOCATIONS[message.buttonId]) {
    session.location = LOCATIONS[message.buttonId];
    session.completedEventId = message.id;

    try {
      await crm.submitLead(crmPayload(session, config));
      session.crmSubmitted = true;
    } catch (error) {
      session.crmSubmitted = false;
      console.error("CRM webhook unavailable:", error.message);
    }

    session.state = STATES.COMPLETED;
    await whatsapp.sendText(message.from, COMPLETE);
  } else { store.markProcessed(message.id); return { ignored: true }; }
  store.set(message.from, session); store.markProcessed(message.id);
  return { advanced: session.state };
}

module.exports = { STATES, crmPayload, handleMessage };
