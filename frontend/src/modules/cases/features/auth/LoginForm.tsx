/**
 * Login Form Component
 *
 * Provides a login form with validation using React Hook Form and Zod.
 * Matches existing UI style with Tailwind CSS.
 */
import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { User, Lock, Building } from 'lucide-react';
import Button from '../../components/ui/Button';

/**
 * Login form validation schema
 */
const loginSchema = z.object({
  username: z.string().min(3, '用户名至少 3 个字符'),
  password: z.string().min(6, '密码至少 6 个字符'),
  organization: z.string().optional().default('built-in'),
});

type LoginFormData = z.infer<typeof loginSchema>;

interface LoginFormProps {
  /** Callback to handle form submission with login credentials */
  onSubmit: (username: string, password: string, organization?: string) => Promise<void>;

  /** Loading state */
  isLoading?: boolean;
}

/**
 * Login Form Component
 *
 * Renders a login form with username, password, and optional organization fields.
 */
export function LoginForm({ onSubmit, isLoading = false }: LoginFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      organization: 'built-in',
    },
  });

  const onFormSubmit = async (data: LoginFormData) => {
    console.log('🔥 LoginForm onFormSubmit called with:', data);
    console.log('🔥 onSubmit function exists:', typeof onSubmit);
    try {
      console.log('🔥 About to call onSubmit...');
      await onSubmit(data.username, data.password, data.organization);
      console.log('🔥 onSubmit completed successfully');
    } catch (error) {
      // Re-throw error so LoginPage can handle it
      console.error('🔥 Login form error:', error);
      throw error;
    }
  };

  return (
    <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-6 animate-in fade-in duration-500">
      {/* Username Field */}
      <div className="space-y-1.5">
        <label htmlFor="username" className="block text-sm font-medium text-slate-700">
          用户名
        </label>
        <div className="relative group">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <User className="h-5 w-5 text-slate-400 group-focus-within:text-brand-500 transition-colors" />
          </div>
          <input
            {...register('username')}
            type="text"
            id="username"
            name="username"
            autoComplete="username"
            className={`block w-full pl-10 rounded-lg border px-3 py-2 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 transition-all ${
              errors.username 
                ? 'border-red-300 focus:border-red-500 focus:ring-red-500/10' 
                : 'border-slate-300 hover:border-slate-400'
            }`}
            placeholder="请输入您的工号或用户名"
            disabled={isLoading || isSubmitting}
          />
        </div>
        {errors.username && (
          <p className="text-sm text-red-600 animate-in slide-in-from-top-1">{errors.username.message}</p>
        )}
      </div>

      {/* Password Field */}
      <div className="space-y-1.5">
        <label htmlFor="password" className="block text-sm font-medium text-slate-700">
          密码
        </label>
        <div className="relative group">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Lock className="h-5 w-5 text-slate-400 group-focus-within:text-brand-500 transition-colors" />
          </div>
          <input
            {...register('password')}
            type="password"
            id="password"
            name="password"
            autoComplete="current-password"
            className={`block w-full pl-10 rounded-lg border px-3 py-2 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 transition-all ${
              errors.password 
                ? 'border-red-300 focus:border-red-500 focus:ring-red-500/10' 
                : 'border-slate-300 hover:border-slate-400'
            }`}
            placeholder="••••••••"
            disabled={isLoading || isSubmitting}
          />
        </div>
        {errors.password && (
          <p className="text-sm text-red-600 animate-in slide-in-from-top-1">{errors.password.message}</p>
        )}
      </div>

      {/* Organization Field */}
      <div className="space-y-1.5">
        <label htmlFor="organization" className="block text-sm font-medium text-slate-700">
          组织 <span className="text-slate-400 font-normal">(仅外部机构填写)</span>
        </label>
        <div className="relative group">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Building className="h-5 w-5 text-slate-400 group-focus-within:text-brand-500 transition-colors" />
          </div>
          <input
            {...register('organization')}
            type="text"
            id="organization"
            name="organization"
            className={`block w-full pl-10 rounded-lg border px-3 py-2 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 transition-all ${
              errors.organization 
                ? 'border-red-300 focus:border-red-500 focus:ring-red-500/10' 
                : 'border-slate-300 hover:border-slate-400'
            }`}
            placeholder="built-in"
            disabled={isLoading || isSubmitting}
          />
        </div>
        {errors.organization && (
          <p className="text-sm text-red-600 animate-in slide-in-from-top-1">{errors.organization.message}</p>
        )}
      </div>

      {/* Submit Button */}
      <div className="pt-2">
        <Button
          type="submit"
          variant="primary"
          className="w-full h-11 text-base shadow-brand-500/20 shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all"
          disabled={isLoading || isSubmitting}
        >
          {isLoading || isSubmitting ? '验证身份中...' : '安全登录'}
        </Button>
      </div>
    </form>
  );
}