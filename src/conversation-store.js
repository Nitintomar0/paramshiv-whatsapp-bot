const fs = require("node:fs");
const path = require("node:path");

class ConversationStore {
  constructor({ filePath, ttlMs, now = () => Date.now() }) {
    this.filePath = filePath;
    this.ttlMs = ttlMs;
    this.now = now;
    this.data = { sessions: {}, processedEvents: {} };
    this._load();
  }

  _load() {
    try {
      this.data = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
      if (!this.data.sessions || !this.data.processedEvents) throw new Error("invalid store");
    } catch (error) {
      if (error.code !== "ENOENT") console.warn("Conversation store could not be read; starting empty.");
    }
    this._purge();
  }

  _purge() {
    const cutoff = this.now() - this.ttlMs;
    for (const [id, session] of Object.entries(this.data.sessions)) if ((session.updatedAt || 0) < cutoff) delete this.data.sessions[id];
    for (const [id, timestamp] of Object.entries(this.data.processedEvents)) if (timestamp < cutoff) delete this.data.processedEvents[id];
  }

  _save() {
    this._purge();
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.tmp`;
    fs.writeFileSync(temporaryPath, JSON.stringify(this.data), { mode: 0o600 });
    fs.renameSync(temporaryPath, this.filePath);
  }

  get(userId) { this._purge(); return this.data.sessions[userId] || null; }
  set(userId, session) { this.data.sessions[userId] = { ...session, updatedAt: this.now() }; this._save(); }
  isProcessed(eventId) { this._purge(); return Boolean(eventId && this.data.processedEvents[eventId]); }
  markProcessed(eventId) { if (eventId) { this.data.processedEvents[eventId] = this.now(); this._save(); } }
}

module.exports = { ConversationStore };
