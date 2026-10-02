import { useState } from 'react';
import type { FormEvent } from 'react';
import { Loader2, LockKeyhole, Shield, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '../../contexts/AuthContext';

export default function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      await login(username, password);
    } catch (error) {
      setError(error instanceof Error ? error.message : '登录失败，请稍后重试');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-5 py-8">
      <div className="absolute inset-0 bg-[linear-gradient(135deg,#0f172a,#020617_62%,#082f49)]" />
      <main className="relative flex min-h-[min(640px,calc(100vh-4rem))] w-full max-w-[440px] flex-col justify-center">
        <section className="rounded-xl border border-white/10 bg-white p-8 text-slate-900 shadow-2xl sm:p-10">
          <div className="mb-9 flex items-center justify-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center">
              <Shield className="h-5 w-5 text-blue-600" />
            </div>
            <div className="text-lg font-bold tracking-tight">合规与案件管理平台</div>
          </div>

          <form className="space-y-5" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="platform-username" className="mb-2 block text-sm font-semibold text-slate-700">用户名</label>
              <div className="relative">
                <UserRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  id="platform-username" data-testid="login-username"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  className="h-11 pl-9 text-sm"
                  autoComplete="username"
                />
              </div>
            </div>

            <div>
              <label htmlFor="platform-password" className="mb-2 block text-sm font-semibold text-slate-700">密码</label>
              <div className="relative">
                <LockKeyhole className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  id="platform-password" data-testid="login-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="h-11 pl-9 text-sm"
                  type="password"
                  autoComplete="current-password"
                />
              </div>
            </div>

            {error && (
              <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">
                {error}
              </p>
            )}

            <Button
              data-testid="login-submit"
              type="submit"
              className="h-11 w-full bg-blue-600 text-white hover:bg-blue-700"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  登录中
                </>
              ) : (
                '登录'
              )}
            </Button>
          </form>
        </section>
      </main>
    </div>
  );
}
