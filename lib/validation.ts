// Chat message validation — manual runtime checks (no external deps)
// Single Responsibility: validation logic lives here, not in the route handler
// Open/Closed: add new validation rules by extending the validators array

const VALID_ROLES = ['user', 'assistant', 'system'] as const
type ValidRole = typeof VALID_ROLES[number]

export interface ValidatedChatMessage {
  role: ValidRole
  content: string
}

export type ValidationResult = {
  ok: true
  messages: ValidatedChatMessage[]
} | {
  ok: false
  error: string
}

/**
 * Validates that the parsed request body contains a well-formed messages array.
 * Returns a discriminated union so the caller can branch on `ok`.
 */
export function validateChatMessages(body: unknown): ValidationResult {
  if (body === null || typeof body !== 'object') {
    return { ok: false, error: 'Request body must be a JSON object.' }
  }

  const { messages } = body as Record<string, unknown>

  if (!Array.isArray(messages)) {
    return { ok: false, error: '`messages` must be an array.' }
  }

  if (messages.length === 0) {
    return { ok: false, error: '`messages` must not be empty.' }
  }

  const validated: ValidatedChatMessage[] = []

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]

    if (msg === null || typeof msg !== 'object') {
      return { ok: false, error: `messages[${i}] must be an object.` }
    }

    const { role, content } = msg as Record<string, unknown>

    if (typeof role !== 'string' || !(VALID_ROLES as readonly string[]).includes(role)) {
      return {
        ok: false,
        error: `messages[${i}].role must be one of: ${VALID_ROLES.join(', ')}. Got: ${JSON.stringify(role)}`,
      }
    }

    if (typeof content !== 'string') {
      return {
        ok: false,
        error: `messages[${i}].content must be a string. Got: ${typeof content}`,
      }
    }

    validated.push({ role: role as ValidRole, content })
  }

  return { ok: true, messages: validated }
}
