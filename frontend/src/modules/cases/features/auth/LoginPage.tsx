/**
 * Login Page Component
 *
 * Complete login page with branding and form.
 * Matches existing UI style with centered card design.
 */
import React, { useState, useEffect } from 'react';
import { LoginForm } from './LoginForm';
import { useAuth } from '../../hooks/useAuth';
import { Scale } from 'lucide-react';
import { toast } from 'sonner';

/**
 * Login Page Component
 *
 * Renders the complete login page with:
 * - Logo/branding placeholder
 * - Title
 * - Login form
 * - Footer version info
 */
export function LoginPage() {
  const { login, isLoading } = useAuth();
  const [error, setError] = useState<string | null>(null);

  // Force re-render when error changes
  useEffect(() => {
    if (error) {
      console.log('🔥 Error state changed, forcing re-render:', error);
    }
  }, [error]);

  const handleLogin = async (username: string, password: string, organization?: string) => {
    console.log('🔥 LoginPage handleLogin called:', { username, password, organization });
    console.log('🔥 login function exists:', typeof login);
    try {
      setError(null);
      console.log('🔥 About to call login API...');
      await login(username, password);
      console.log('🔥 Login successful, user state should be updated');
      // Don't manually navigate - let React state update trigger re-render
      // The App component will automatically show AuthenticatedApp when isAuthenticated becomes true
    } catch (err) {
      console.error('🔥 Login failed:', err);
      const errorMessage = err instanceof Error ? err.message : '登录失败，请重试';
      console.log('🔥 Setting error state:', errorMessage);
      setError(errorMessage);
      toast.error(errorMessage, {
        description: '请检查您的凭证或联系管理员',
        position: 'top-center',
      });
      console.log('🔥 Error state set, current error:', errorMessage);
      // Don't re-throw - let the error state update the UI
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-8 relative overflow-hidden bg-slate-900 text-slate-50">
      {/* Deep minimalist background with subtle glow */}
      <div className="absolute top-[-20%] left-[-10%] w-3/4 h-3/4 bg-brand-600/10 rounded-full blur-[100px] pointer-events-none"></div>
      <div className="absolute bottom-[-20%] right-[-10%] w-1/2 h-1/2 bg-blue-600/10 rounded-full blur-[100px] pointer-events-none"></div>
      
      <div className="relative z-10 w-full max-w-md space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-700">
        <div className="text-center flex flex-col items-center">
          <div className="w-14 h-14 bg-gradient-to-br from-brand-400 to-brand-600 rounded-2xl flex items-center justify-center shadow-lg shadow-brand-500/30 mb-6 border border-white/10 backdrop-blur-md">
            <Scale className="w-7 h-7 text-white" />
          </div>
          <h2 className="text-3xl font-bold tracking-tight text-white mb-2">
            法务中台
          </h2>
        </div>

        <div className="bg-white py-10 px-8 shadow-2xl shadow-black/40 sm:rounded-2xl border border-white/10 relative z-10">
          {error && (
            <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm flex items-start gap-3 animate-in fade-in slide-in-from-top-1">
              <div className="w-5 h-5 rounded-full bg-red-100 flex items-center justify-center shrink-0 mt-0.5">
                <div className="w-1.5 h-1.5 bg-red-600 rounded-full"></div>
              </div>
              <div>{error}</div>
            </div>
          )}
          
          <LoginForm onSubmit={handleLogin} isLoading={isLoading} />
          
          <div className="mt-8 text-center text-xs text-slate-400 pt-6 border-t border-slate-100">
            © 2026 SLD-CMS. All rights reserved.
          </div>
        </div>
      </div>
    </div>
  );
}