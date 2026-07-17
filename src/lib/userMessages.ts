const INTERNAL_LANGUAGE = /\b(?:api|backend|bucket|cdn|cloudflare|column|constraint|database|debug|developer|encoding|endpoint|frontend|infrastructure|jwt|locally|master|mock|multipart|object key|playback|provider|r2|relation|request|response|sample data|sandbox|schema|sdk|server|service role|signed url|stream|supabase|test data|token|upload job|webhook)\b/i;
const MACHINE_LANGUAGE = /(?:failed to fetch|load failed|networkerror|https?:\/\/|\bstatus\s+\d{3}\b|\b[a-z]+_[a-z_]+\b)/i;

export function userMessage(error: unknown, fallback: string) {
  const message = error instanceof Error
    ? error.message.trim()
    : typeof error === 'string'
      ? error.trim()
      : '';

  if (!message || INTERNAL_LANGUAGE.test(message) || MACHINE_LANGUAGE.test(message)) return fallback;
  return message;
}
