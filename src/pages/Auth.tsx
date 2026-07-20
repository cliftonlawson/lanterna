import { useEffect, useState, FormEvent } from 'react';
import { AlertCircle, ArrowLeft, Check, CheckCircle2, Eye, EyeOff, Loader2, LockKeyhole } from 'lucide-react';
import { LanternLogo } from '../components/LanternLogo';
import { useAuth } from '../contexts/useAuth';
import { userMessage } from '../lib/userMessages';

type Props = {
  onBack: () => void;
};

export function Auth({ onBack }: Props) {
  const { recoveryMode, requestPasswordReset, signIn, signUp, resendConfirmation, updatePassword } = useAuth();
  const [mode, setMode] = useState<'forgot' | 'recovery' | 'signin' | 'signup'>(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('mode') === 'recovery') return 'recovery';
    return params.get('mode') === 'signup' ? 'signup' : 'signin';
  });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (recoveryMode) setMode('recovery');
  }, [recoveryMode]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const checkoutSku = params.get('checkout');
    if (checkoutSku) window.localStorage.setItem('lanterna.pendingCheckoutSku', checkoutSku);
    if (params.get('error_description')) {
      setError(authMessage(params.get('error_description') ?? 'Unable to confirm email.'));
      window.history.replaceState({}, '', '/auth');
      return;
    }

    if (params.get('type') === 'signup') {
      setNotice('Email confirmed. Sign in with your password to continue.');
      window.history.replaceState({}, '', '/auth');
    }
  }, []);

  const selectMode = (nextMode: 'forgot' | 'signin' | 'signup') => {
    setMode(nextMode);
    setError('');
    setNotice('');
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setNotice('');
    setLoading(true);

    let authError: Error | null = null;
    if (mode === 'forgot') {
      ({ error: authError } = await requestPasswordReset(email));
    } else if (mode === 'recovery') {
      ({ error: authError } = await updatePassword(password));
    } else {
      ({ error: authError } = await (mode === 'signin' ? signIn(email, password) : signUp(email, password)));
    }

    if (authError) {
      setError(authMessage(authError.message));
    } else if (mode === 'forgot') {
      setNotice('If an account exists for that email, a password-reset link is on its way.');
    } else if (mode === 'recovery') {
      setNotice('Password updated. You can continue to your dashboard.');
      window.history.replaceState({}, '', '/');
    } else if (mode === 'signup') {
      setNotice('Account created. Check your email for the confirmation link, then come back here to sign in.');
    }

    setLoading(false);
  };

  const handleResend = async () => {
    if (!email.trim()) {
      setError('Enter your email first, then resend the confirmation link.');
      return;
    }

    setError('');
    setNotice('');
    setLoading(true);
    const { error: resendError } = await resendConfirmation(email);
    if (resendError) {
      setError(authMessage(resendError.message));
    } else {
      setNotice('Confirmation email sent. Open the newest message, then come back here to sign in.');
    }
    setLoading(false);
  };

  const creating = mode === 'signup';
  const forgot = mode === 'forgot';
  const recovering = mode === 'recovery';

  return (
    <div className="auth-page">
      <div className="auth-ambient" aria-hidden="true"><span /><span /><span /></div>
      <main className="auth-shell">
        <button className="auth-back" onClick={onBack} type="button">
          <ArrowLeft size={17} /> Back to home
        </button>

        <section className="auth-story" aria-labelledby="auth-story-title">
          <div className="auth-brand">
            <LanternLogo size={42} />
            <span>LANTERNA</span>
          </div>
          <div className="auth-story-copy">
            <p className="auth-eyebrow">Film delivery, illuminated</p>
            <h1 id="auth-story-title">A brighter way to <span>finish the story.</span></h1>
            <p>Build a client experience with the same care you bring to the film—cinematic galleries, thoughtful controls, and every delivery in one calm workspace.</p>
          </div>
          <div className="auth-benefits" aria-label="LANTERNA account benefits">
            <span><Check size={16} /> 10 GB welcome allowance</span>
            <span><Check size={16} /> Nine cinematic layouts</span>
            <span><Check size={16} /> No card required</span>
          </div>
          <div className="auth-preview" aria-hidden="true">
            <div className="auth-preview-top"><i /><i /><i /><span>deliver.lanterna.video</span></div>
            <div className="auth-preview-scene">
              <small>THE WEDDING FILM</small>
              <strong>Emma &amp; James</strong>
              <div><b>Play all films</b><span>Villa Cimbrone · Ravello</span></div>
            </div>
          </div>
        </section>

        <section className="auth-card" aria-labelledby="auth-title">
          <div className="auth-card-mark">
            <LanternLogo size={30} />
            <span>LANTERNA</span>
          </div>
          {!forgot && !recovering && <div className="auth-tabs" role="tablist" aria-label="Account access">
            <button aria-selected={!creating} className={!creating ? 'is-active' : ''} onClick={() => selectMode('signin')} role="tab" type="button">Sign in</button>
            <button aria-selected={creating} className={creating ? 'is-active' : ''} onClick={() => selectMode('signup')} role="tab" type="button">Create account</button>
          </div>}

          <header className="auth-card-header">
            <p>{recovering ? 'Account recovery' : forgot ? 'Password help' : creating ? 'Your studio starts here' : 'Studio access'}</p>
            <h2 id="auth-title">{recovering ? 'Choose a new password' : forgot ? 'Reset your password' : creating ? 'Create your account' : 'Welcome back'}</h2>
            <span>{recovering ? 'Use at least 8 characters.' : forgot ? 'We will send a secure reset link if the account exists.' : creating ? 'Start free with 10 GB for your first year.' : 'Sign in to continue building and delivering.'}</span>
          </header>

          <form className="auth-form" onSubmit={handleSubmit}>
            {!recovering && <label>
              <span>Email address</span>
              <input
                autoComplete="email"
                inputMode="email"
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@studio.com"
                required
                type="email"
                value={email}
              />
            </label>}

            {!forgot && <label>
              <span>Password</span>
              <div className="auth-password-field">
                <input
                  autoComplete={creating || recovering ? 'new-password' : 'current-password'}
                  minLength={recovering ? 8 : 6}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="••••••••"
                  required
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                />
                <button
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                  onClick={() => setShowPassword((visible) => !visible)}
                  type="button"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {(creating || recovering) && <small>Use at least {recovering ? '8' : '6'} characters.</small>}
            </label>}

            {creating && <p className="auth-legal-note">By creating an account, you agree to the <a href="/terms">Terms</a> and acknowledge the <a href="/privacy">Privacy Notice</a>.</p>}
            {mode === 'signin' && <button className="auth-text-action" onClick={() => selectMode('forgot')} type="button">Forgot your password?</button>}
            {(forgot || recovering) && <button className="auth-text-action" onClick={() => selectMode('signin')} type="button">Back to sign in</button>}

            <div aria-live="polite">
              {error && (
                <div className="auth-message is-error">
                  <AlertCircle size={18} />
                  <div>
                    <p>{error}</p>
                    {error.toLowerCase().includes('not confirmed') && (
                      <button disabled={loading} onClick={handleResend} type="button">Resend confirmation email</button>
                    )}
                  </div>
                </div>
              )}
              {notice && <div className="auth-message is-success"><CheckCircle2 size={18} /><p>{notice}</p></div>}
            </div>

            <button className="auth-submit" disabled={loading} type="submit">
              {loading && <Loader2 aria-hidden="true" className="auth-spinner" size={18} />}
              {loading
                ? recovering ? 'Updating password' : forgot ? 'Sending reset link' : creating ? 'Creating account' : 'Signing in'
                : recovering ? 'Save new password' : forgot ? 'Send reset link' : creating ? 'Create free account' : 'Sign in to LANTERNA'}
            </button>
          </form>

          <p className="auth-secure-note"><LockKeyhole size={14} /> Secure studio access</p>
        </section>
      </main>
    </div>
  );
}

function authMessage(message: string) {
  const lower = message.toLowerCase();
  if (lower.includes('rate') || lower.includes('wait')) {
    return 'Too many confirmation emails were requested. Wait about a minute, then try again. Check your inbox before requesting another.';
  }
  if (lower.includes('email not confirmed')) {
    return 'Your email is not confirmed yet. Use the newest confirmation email, or resend it below.';
  }
  return userMessage(message, 'Sign-in could not be completed. Check your details and try again.');
}
