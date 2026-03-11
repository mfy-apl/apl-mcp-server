/**
 * JSON-RPC 2.0 method dispatcher for A2A protocol v0.2.5.
 *
 * Supported methods:
 *   message/send  — send a message, execute skill, return task
 *   tasks/get     — retrieve a task by ID
 *   tasks/cancel  — cancel a running task
 */

const crypto = require('crypto');
const taskStore = require('./taskStore');
const { executeSkill } = require('./skillExecutor');
const {
  errorResponse,
  PARSE_ERROR,
  INVALID_REQUEST,
  METHOD_NOT_FOUND,
  INVALID_PARAMS,
  INTERNAL_ERROR,
  TASK_NOT_FOUND,
  TASK_NOT_CANCELABLE
} = require('./errors');

/**
 * Build an A2A v0.2.5 compliant Message object.
 */
function makeMessage(role, parts) {
  return {
    messageId: crypto.randomUUID(),
    role,
    parts
  };
}

/**
 * Handle a single JSON-RPC 2.0 request object.
 * Returns a JSON-RPC response object.
 */
async function handleRequest(rpcRequest, agentConfig) {
  // Validate basic JSON-RPC structure
  if (!rpcRequest || typeof rpcRequest !== 'object') {
    return errorResponse(null, INVALID_REQUEST, 'Invalid JSON-RPC request');
  }

  const { jsonrpc, method, params, id } = rpcRequest;

  if (jsonrpc !== '2.0') {
    return errorResponse(id, INVALID_REQUEST, 'jsonrpc must be "2.0"');
  }

  if (!method || typeof method !== 'string') {
    return errorResponse(id, INVALID_REQUEST, 'method is required');
  }

  switch (method) {
    case 'message/send':
      return handleMessageSend(id, params, agentConfig);
    case 'tasks/get':
      return handleTasksGet(id, params);
    case 'tasks/cancel':
      return handleTasksCancel(id, params);
    default:
      return errorResponse(id, METHOD_NOT_FOUND, `Method not found: ${method}`);
  }
}

/**
 * message/send — receive a message, execute the skill, return the task.
 */
async function handleMessageSend(id, params, agentConfig) {
  if (!params || !params.message) {
    return errorResponse(id, INVALID_PARAMS, 'params.message is required');
  }

  const { message, contextId } = params;

  // Ensure incoming message has required fields
  if (!message.messageId) message.messageId = crypto.randomUUID();
  if (!message.role) message.role = 'user';

  if (!message.parts || !Array.isArray(message.parts) || message.parts.length === 0) {
    return errorResponse(id, INVALID_PARAMS, 'message.parts must be a non-empty array');
  }

  // Create the task with contextId
  const task = taskStore.createTask(message, contextId);
  taskStore.updateStatus(task.id, 'working');

  try {
    const result = await executeSkill(message.parts, agentConfig);

    if (result.state === 'input-required') {
      taskStore.updateStatus(task.id, 'input-required',
        makeMessage('agent', [{ type: 'text', text: result.message }])
      );
    } else if (result.state === 'failed') {
      taskStore.updateStatus(task.id, 'failed',
        makeMessage('agent', [{ type: 'text', text: result.message }])
      );
    } else {
      // completed
      if (result.artifact) {
        taskStore.addArtifact(task.id, result.artifact);
      }
      // For completed tasks, include the response as status message
      const responseParts = result.artifact?.parts || [{ type: 'text', text: 'Done' }];
      taskStore.updateStatus(task.id, 'completed',
        makeMessage('agent', responseParts)
      );
    }
  } catch (err) {
    console.error('[A2A] Skill execution error:', err.message);
    taskStore.updateStatus(task.id, 'failed',
      makeMessage('agent', [{ type: 'text', text: 'Internal server error' }])
    );
  }

  return {
    jsonrpc: '2.0',
    result: taskStore.serialize(taskStore.getTask(task.id)),
    id
  };
}

/**
 * tasks/get — retrieve a task by ID.
 */
async function handleTasksGet(id, params) {
  if (!params || !params.id) {
    return errorResponse(id, INVALID_PARAMS, 'params.id (task ID) is required');
  }

  const task = taskStore.getTask(params.id);
  if (!task) {
    return errorResponse(id, TASK_NOT_FOUND, `Task not found: ${params.id}`);
  }

  return {
    jsonrpc: '2.0',
    result: taskStore.serialize(task),
    id
  };
}

/**
 * tasks/cancel — cancel a task (only if still working).
 */
async function handleTasksCancel(id, params) {
  if (!params || !params.id) {
    return errorResponse(id, INVALID_PARAMS, 'params.id (task ID) is required');
  }

  const task = taskStore.getTask(params.id);
  if (!task) {
    return errorResponse(id, TASK_NOT_FOUND, `Task not found: ${params.id}`);
  }

  const cancelable = ['submitted', 'working', 'input-required'];
  if (!cancelable.includes(task.status.state)) {
    return errorResponse(id, TASK_NOT_CANCELABLE, `Task is ${task.status.state} and cannot be canceled`);
  }

  taskStore.updateStatus(params.id, 'canceled');

  return {
    jsonrpc: '2.0',
    result: taskStore.serialize(taskStore.getTask(params.id)),
    id
  };
}

module.exports = { handleRequest };
