function emailProvider(env = {}) {
  return String(env.EMAIL_PROVIDER || '').toLowerCase() || 'resend';
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function textToHtml(text = '') {
  return escapeHtml(text)
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${paragraph.replace(/\n/g, '<br>')}</p>`)
    .join('');
}

function localEmailMode(env = {}) {
  return emailProvider(env) === 'mock' || emailProvider(env) === 'local';
}

function emailProviderApiKey(env = {}) {
  return env.EMAIL_PROVIDER_API_KEY || env.RESEND_API_KEY;
}

export function createDeliveryEmailPayload(env, { to, subject, text, html, replyTo }) {
  const recipient = String(to || '').trim();
  const cleanSubject = String(subject || '').trim();
  const cleanText = String(text || '').trim();
  const cleanHtml = String(html || '').trim() || textToHtml(cleanText);

  if (!recipient || !recipient.includes('@')) throw new Error('A recipient email is required.');
  if (!cleanSubject) throw new Error('An email subject is required.');
  if (!cleanHtml && !cleanText) throw new Error('An email body is required.');

  return {
    from: env.EMAIL_FROM || env.RESEND_FROM_EMAIL || 'Lanterna <deliver@lanterna.video>',
    html: cleanHtml,
    reply_to: replyTo || env.EMAIL_REPLY_TO || undefined,
    subject: cleanSubject,
    text: cleanText || undefined,
    to: [recipient],
  };
}

export async function sendTransactionalEmail(env, input, fetchImpl = fetch) {
  const payload = createDeliveryEmailPayload(env, input);

  if (localEmailMode(env)) {
    return {
      id: `mock-email-${Date.now()}`,
      mode: 'mock',
      provider: 'mock',
      status: 'previewed',
      subject: payload.subject,
      to: payload.to[0],
    };
  }

  const provider = emailProvider(env);
  if (provider !== 'resend') throw new Error(`Unsupported email provider: ${provider}`);
  const apiKey = emailProviderApiKey(env);
  if (!apiKey) throw new Error('Resend API key is not configured.');

  const response = await fetchImpl('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || body.error?.message || `Email request failed with ${response.status}`);

  return {
    id: body.id,
    mode: 'sent',
    provider,
    status: 'sent',
    subject: payload.subject,
    to: payload.to[0],
  };
}
