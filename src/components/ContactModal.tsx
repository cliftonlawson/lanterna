import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { CheckCircle2, Loader2, Mail, Send, X } from 'lucide-react';

export const SUPPORT_EMAIL = 'team@hellobower.com';

type Props = {
  onClose: () => void;
};

export function ContactModal({ onClose }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  const submittingRef = useRef(false);
  const nameId = useId();
  const emailId = useId();
  const subjectId = useId();
  const messageId = useId();
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  closeRef.current = onClose;
  submittingRef.current = submitting;

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.requestAnimationFrame(() => dialogRef.current?.querySelector<HTMLElement>('input:not([tabindex="-1"])')?.focus());

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape' && !submittingRef.current) {
        closeRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not(:disabled), input:not([type="hidden"]):not(:disabled), textarea:not(:disabled)',
      ) ?? []);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      setSubmitting(true);
      setError('');
      const response = await fetch('/api/contact', {
        body: JSON.stringify({
          email: form.get('email'),
          message: form.get('message'),
          name: form.get('name'),
          subject: form.get('subject'),
          website: form.get('website'),
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'Your message could not be sent. Email us directly instead.');
      setSent(true);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Your message could not be sent. Email us directly instead.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="contact-modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !submitting) onClose();
      }}
      role="presentation"
    >
      <div
        aria-describedby="contact-modal-description"
        aria-labelledby="contact-modal-title"
        aria-modal="true"
        className="contact-modal-card"
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <button aria-label="Close contact form" className="contact-modal-close" disabled={submitting} onClick={onClose} type="button"><X aria-hidden="true" size={19} /></button>
        <header>
          <span className="contact-modal-kicker"><Mail aria-hidden="true" size={15} /> Contact LANTERNA</span>
          <h2 id="contact-modal-title">How can we help?</h2>
          <p id="contact-modal-description">Email us directly at <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>, or send the form below.</p>
        </header>

        {sent ? (
          <div className="contact-modal-success" role="status">
            <span><CheckCircle2 aria-hidden="true" size={24} /></span>
            <h3>Message sent.</h3>
            <p>We’ll reply to the email address you provided.</p>
            <button onClick={onClose} type="button">Close</button>
          </div>
        ) : (
          <form onSubmit={(event) => void submit(event)}>
            <label htmlFor={nameId}>Name<input autoComplete="name" id={nameId} maxLength={80} name="name" required /></label>
            <label htmlFor={emailId}>Email address<input autoComplete="email" id={emailId} maxLength={160} name="email" required type="email" /></label>
            <label htmlFor={subjectId}>Subject<input id={subjectId} maxLength={120} name="subject" placeholder="What can we help with?" /></label>
            <label htmlFor={messageId}>Message<textarea id={messageId} maxLength={4000} minLength={10} name="message" required rows={6} /></label>
            <div aria-hidden="true" className="contact-modal-honeypot"><label>Website<input autoComplete="off" name="website" tabIndex={-1} /></label></div>
            {error && <div className="contact-modal-error" role="alert">{error}</div>}
            <button className="contact-modal-submit" disabled={submitting} type="submit">
              {submitting ? <><Loader2 aria-hidden="true" size={17} /> Sending</> : <><Send aria-hidden="true" size={17} /> Send message</>}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
