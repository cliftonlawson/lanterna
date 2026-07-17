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

function localEmailMode(env = {}) {
  return emailProvider(env) === 'mock' || emailProvider(env) === 'local';
}

function emailProviderApiKey(env = {}) {
  return env.EMAIL_PROVIDER_API_KEY || env.RESEND_API_KEY;
}

function emailProviderReadApiKey(env = {}) {
  return env.RESEND_READ_API_KEY || env.EMAIL_PROVIDER_READ_API_KEY;
}

function cleanText(value = '', fallback = '') {
  const text = String(value || '').trim();
  return text || fallback;
}

function cleanAccentColor(value = '') {
  const color = String(value || '').trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color : '#6EE7F9';
}

function textToHtml(text = '') {
  return escapeHtml(text)
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${paragraph.replace(/\n/g, '<br>')}</p>`)
    .join('');
}

export function buildDeliveryEmailContent({
  accentColor,
  deliveryLink,
  galleryName,
  message,
  studioName,
  tagline,
} = {}) {
  const brand = cleanText(studioName, 'LANTERNA Studio');
  const galleryTitle = cleanText(galleryName, 'Your gallery');
  const href = cleanText(deliveryLink);
  const accent = cleanAccentColor(accentColor);
  const brandTagline = cleanText(tagline);
  const customMessage = cleanText(message);
  const intro = customMessage || 'Your film is ready, and your gallery is waiting for you.';

  if (!href) throw new Error('A delivery link is required.');

  const text = [
    brand,
    brandTagline,
    '',
    galleryTitle,
    '',
    intro,
    '',
    `Open your gallery: ${href}`,
    '',
    'If the button does not open, copy and paste the link above into your browser.',
  ].filter((line, index, lines) => line || lines[index - 1]).join('\n').trim();

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f6f2eb;color:#201913;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(galleryTitle)} is ready to view.</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6f2eb;margin:0;padding:0;">
      <tr>
        <td align="center" style="padding:40px 18px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#fffaf4;border:1px solid #eadfce;border-radius:18px;overflow:hidden;">
            <tr>
              <td style="padding:34px 34px 12px;">
                <div style="font-size:13px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:#2d241c;">${escapeHtml(brand)}</div>
                ${brandTagline ? `<div style="margin-top:7px;font-size:14px;line-height:1.5;color:#766b5d;">${escapeHtml(brandTagline)}</div>` : ''}
              </td>
            </tr>
            <tr>
              <td style="padding:8px 34px 6px;">
                <div style="width:44px;height:3px;background:${accent};border-radius:999px;"></div>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 34px 8px;">
                <h1 style="margin:0;color:#201913;font-size:30px;line-height:1.15;font-weight:800;letter-spacing:0;">${escapeHtml(galleryTitle)}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 34px 4px;">
                <p style="margin:0;color:#51483f;font-size:17px;line-height:1.6;">${escapeHtml(intro)}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:26px 34px 16px;">
                <a href="${escapeHtml(href)}" style="display:inline-block;background:${accent};color:#17110b;text-decoration:none;font-size:16px;font-weight:800;line-height:1;padding:15px 22px;border-radius:999px;">Open gallery</a>
              </td>
            </tr>
            <tr>
              <td style="padding:4px 34px 34px;">
                <p style="margin:0;color:#8b8175;font-size:13px;line-height:1.6;">If the button does not open, copy and paste this link into your browser:<br><a href="${escapeHtml(href)}" style="color:#6f6255;text-decoration:underline;word-break:break-all;">${escapeHtml(href)}</a></p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { html, text };
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
    from: env.EMAIL_FROM || env.RESEND_FROM_EMAIL || 'LANTERNA <deliver@lanterna.video>',
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

export async function getTransactionalEmailStatus(env, emailId, fetchImpl = fetch) {
  const provider = emailProvider(env);
  if (provider !== 'resend') throw new Error(`Unsupported email provider: ${provider}`);

  const cleanEmailId = String(emailId || '').trim();
  if (!cleanEmailId) throw new Error('A Resend email id is required.');

  const apiKey = emailProviderReadApiKey(env);
  if (!apiKey) throw new Error('RESEND_READ_API_KEY is required to read Resend delivery status.');

  const response = await fetchImpl(`https://api.resend.com/emails/${encodeURIComponent(cleanEmailId)}`, {
    headers: {
      authorization: `Bearer ${apiKey}`,
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || body.error?.message || `Email status lookup failed with ${response.status}`);

  return body;
}
