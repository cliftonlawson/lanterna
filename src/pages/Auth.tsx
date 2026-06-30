import { useState, FormEvent } from 'react';
import { Eye, EyeOff, ArrowLeft } from 'lucide-react';
import { LanternLogo } from '../components/LanternLogo';
import { useAuth } from '../contexts/AuthContext';

type Props = {
  onBack: () => void;
};

export function Auth({ onBack }: Props) {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const fn = mode === 'signin' ? signIn : signUp;
    const { error } = await fn(email, password);

    if (error) {
      setError(error.message);
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
            <span className="text-xl font-semibold tracking-tight text-white">Lanterna</span>
          </div>

          {/* Tab toggle */}
          <div className="flex bg-white/[0.04] rounded-xl p-1 mb-7">
            <button
              onClick={() => { setMode('signin'); setError(''); }}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
                mode === 'signin'
                  ? 'bg-orange-500 text-white shadow-[0_0_20px_rgba(249,115,22,0.3)]'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              Sign in
            </button>
            <button
              onClick={() => { setMode('signup'); setError(''); }}
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

          {mode === 'signup' && (
            <p className="text-xs text-center text-gray-600 mt-5">
              By creating an account, you agree to our{' '}
              <a href="#" className="text-gray-400 hover:text-gray-200 transition-colors">Terms of Service</a>
              {' '}and{' '}
              <a href="#" className="text-gray-400 hover:text-gray-200 transition-colors">Privacy Policy</a>.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
