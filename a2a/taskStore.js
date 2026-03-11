/**
 * In-memory A2A task store with 1-hour TTL cleanup.
 * Compliant with A2A Protocol v0.2.5 (Gemini Enterprise compatible).
 *
 * Task lifecycle: submitted → working → completed | failed | canceled
 * Also supports: input-required (when message needs clarification)
 */

const crypto = require('crypto');

const TTL_MS = 60 * 60 * 1000; // 1 hour
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

const tasks = new Map();

// Periodic cleanup of expired tasks
setInterval(() => {
  const now = Date.now();
  for (const [id, task] of tasks) {
    if (now - task._createdAt > TTL_MS) {
      tasks.delete(id);
    }
  }
}, CLEANUP_INTERVAL_MS).unref();

/**
 * Create a new task from an incoming message.
 */
function createTask(message, contextId) {
  const id = crypto.randomUUID();
  const taskContextId = contextId || crypto.randomUUID();

  // Ensure incoming message has messageId
  if (!message.messageId) {
    message.messageId = crypto.randomUUID();
  }

  const task = {
    id,
    contextId: taskContextId,
    status: { state: 'submitted' },
    artifacts: [],
    history: [message],
    metadata: {},
    _createdAt: Date.now()
  };

  tasks.set(id, task);
  return task;
}

/**
 * Get a task by ID. Returns null if not found.
 */
function getTask(id) {
  const task = tasks.get(id);
  if (!task) return null;
  // Check TTL
  if (Date.now() - task._createdAt > TTL_MS) {
    tasks.delete(id);
    return null;
  }
  return task;
}

/**
 * Update task status. Message must be a proper A2A Message with messageId.
 */
function updateStatus(id, state, message) {
  const task = tasks.get(id);
  if (!task) return null;
  task.status = { state };
  if (message) {
    // Ensure message has messageId
    if (!message.messageId) {
      message.messageId = crypto.randomUUID();
    }
    task.status.message = message;
  }
  return task;
}

/**
 * Add an artifact to a task. Ensures artifactId is present.
 */
function addArtifact(id, artifact) {
  const task = tasks.get(id);
  if (!task) return null;
  if (!artifact.artifactId) {
    artifact.artifactId = crypto.randomUUID();
  }
  task.artifacts.push(artifact);
  return task;
}

/**
 * Serialize a task for the wire (strip internal fields).
 */
function serialize(task) {
  if (!task) return null;
  const { _createdAt, ...rest } = task;
  return rest;
}

module.exports = { createTask, getTask, updateStatus, addArtifact, serialize };
