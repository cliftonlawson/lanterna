import { useEffect, useState, FormEvent } from 'react';
import { Eye, EyeOff, ArrowLeft } from 'lucide-react';
import { LanternLogo } from '../components/LanternLogo';
import { useAuth } from '../contexts/useAuth';
import { userMessage } from '../lib/userMessages';

type Props = {
  onBack: () => void;
};

export function Auth({ onBack }: Props) {
  const { signIn, signUp, resendConfirmation } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('mode') === 'signup' ? 'signup' : 'signin';
  });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('error_description')) {
      setError(authMessage(params.get('error_description') ?? 'Unable to confirm email.'));
      window.history.replaceState({}, '', '/auth');
      return;
    }

    if (params.get('type') === 'signup' || params.get('type') === 'recovery') {
      setNotice('Email confirmed. Sign in with your password to continue.');
      window.history.replaceState({}, '', '/auth');
    }
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setNotice('');
    setLoading(true);

    const fn = mode === 'signin' ? signIn : signUp;
    const { error } = await fn(email, password);

    if (error) {
      setError(authMessage(error.message));
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
    const { error } = await resendConfirmation(email);
    if (error) {
      setError(authMessage(error.message));
    } else {
      setNotice('Confirmation email sent. Open the newest message, then come back here to sign in.');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#080808] flex items-center justify-center px-4">
      {/* Background glow */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[500px] bg-orange-500/[0.06] rounded-full blur-[120px]" />
      </div>

      <div className="relative z-10 w-full max-w-md">
        {/* Back button */}
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-300 transition-colors mb-8"
        >
          <ArrowLeft size={14} />
          Back to home
        </button>

        {/* Card */}
        <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-8">
          {/* Logo */}
          <div className="flex items-center justify-center gap-2.5 mb-8">
            <LanternLogo size={36} />
            <span className="text-xl font-semibold tracking-tight text-white">LANTERNA</span>
          </div>

          {/* Tab toggle */}
          <div className="flex bg-white/[0.04] rounded-xl p-1 mb-7">
            <button
              onClick={() => { setMode('signin'); setError(''); setNotice(''); }}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
                mode === 'signin'
                  ? 'bg-orange-500 text-white shadow-[0_0_20px_rgba(249,115,22,0.3)]'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              Sign in
            </button>
            <button
              onClick={() => { setMode('signup'); setError(''); setNotice(''); }}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
                mode === 'signup'
                  ? 'bg-orange-500 text-white shadow-[0_0_20px_rgba(249,115,22,0.3)]'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              Create account
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@studio.com"
                required
                className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-2.5 text-white placeholder-gray-600 text-sm focus:outline-none focus:border-orange-500/50 focus:bg-white/[0.06] transition-all"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1.5">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={6}
                  className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-2.5 pr-11 text-white placeholder-gray-600 text-sm focus:outline-none focus:border-orange-500/50 focus:bg-white/[0.06] transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-400 transition-colors"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {mode === 'signup' && (
                <p className="text-xs text-gray-600 mt-1.5">Minimum 6 characters</p>
              )}
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
                <p className="text-sm text-red-400">{error}</p>
                {error.toLowerCase().includes('not confirmed') && (
                  <button
                    type="button"
                    onClick={handleResend}
                    disabled={loading}
                    className="mt-3 text-sm font-medium text-red-200 hover:text-white disabled:opacity-60"
                  >
                    Resend confirmation email
                  </button>
                )}
              </div>
            )}

            {notice && (
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3">
                <p className="text-sm text-emerald-300">{notice}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-orange-500 hover:bg-orange-400 disabled:bg-orange-500/50 text-white py-2.5 rounded-xl font-medium text-sm transition-all hover:shadow-[0_0_30px_rgba(249,115,22,0.4)] disabled:cursor-not-allowed mt-2"
            >
              {loading
                ? mode === 'signin' ? 'Signing in...' : 'Creating account...'
                : mode === 'signin' ? 'Sign in' : 'Create account'
              }
            </button>
          </form>

        </div>
      </div>
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
