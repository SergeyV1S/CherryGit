import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router';

import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeSlash, GitBranch, Warning } from '@phosphor-icons/react';
import { z } from 'zod';

import { ROUTES } from '@shared/constants';
import { useAuth } from '@shared/hooks';
import { Alert, AlertDescription, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label } from '@shared/ui';

const loginSchema = z.object({
  mail: z.string().email('Введите корректный email'),
  password: z.string().min(1, 'Введите пароль')
});

type LoginForm = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema)
  });

  const onSubmit = async (data: LoginForm) => {
    setServerError(null);
    try {
      await login(data);
      navigate(ROUTES.dashboard);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      setServerError(
        axiosErr?.response?.data?.message ?? 'Неверный email или пароль'
      );
    }
  };

  return (
    <div className='relative flex min-h-screen items-center justify-center overflow-hidden p-4'>
      {/* Декоративные cherry-blobs */}
      <div
        aria-hidden
        className='pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full opacity-60 blur-3xl'
        style={{ background: 'oklch(0.78 0.20 22 / 0.5)' }}
      />
      <div
        aria-hidden
        className='pointer-events-none absolute -bottom-32 -right-32 h-96 w-96 rounded-full opacity-50 blur-3xl'
        style={{ background: 'oklch(0.55 0.21 22 / 0.4)' }}
      />

      <div className='relative w-full max-w-sm'>
        {/* Brand */}
        <div className='mb-8 flex flex-col items-center gap-3 text-center'>
          <div
            className='flex h-14 w-14 items-center justify-center rounded-2xl shadow-xl shadow-rose-900/30'
            style={{
              background:
                'linear-gradient(135deg, oklch(0.78 0.22 22) 0%, oklch(0.45 0.22 18) 100%)'
            }}
          >
            <GitBranch size={28} weight='bold' className='text-white drop-shadow' />
          </div>
          <div>
            <h1 className='page-title text-3xl'>CherryGit</h1>
            <p className='mt-1 text-sm text-muted-foreground'>
              Аналитика процессов разработки
            </p>
          </div>
        </div>

        <Card className='backdrop-blur-md'>
          <CardHeader className='pb-3'>
            <CardTitle className='text-xl'>Вход в систему</CardTitle>
            <CardDescription>Введите данные вашей учётной записи</CardDescription>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className='space-y-4' noValidate>
              {serverError && (
                <Alert variant='destructive'>
                  <Warning size={16} />
                  <AlertDescription className='break-anywhere'>{serverError}</AlertDescription>
                </Alert>
              )}

              <div className='space-y-1.5'>
                <Label htmlFor='mail'>Email</Label>
                <Input
                  id='mail'
                  type='email'
                  placeholder='vasya@corp.ru'
                  autoComplete='email'
                  aria-invalid={!!errors.mail}
                  {...register('mail')}
                />
                {errors.mail && (
                  <p className='text-destructive text-xs'>{errors.mail.message}</p>
                )}
              </div>

              <div className='space-y-1.5'>
                <Label htmlFor='password'>Пароль</Label>
                <div className='relative'>
                  <Input
                    id='password'
                    type={showPassword ? 'text' : 'password'}
                    placeholder='••••••••'
                    autoComplete='current-password'
                    aria-invalid={!!errors.password}
                    className='pr-11'
                    {...register('password')}
                  />
                  <button
                    type='button'
                    tabIndex={-1}
                    className='absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary'
                    onClick={() => setShowPassword((v) => !v)}
                  >
                    {showPassword ? <EyeSlash size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {errors.password && (
                  <p className='text-destructive text-xs'>{errors.password.message}</p>
                )}
              </div>

              <Button type='submit' size='lg' className='mt-2 w-full' disabled={isSubmitting}>
                {isSubmitting ? 'Вход...' : 'Войти'}
              </Button>
            </form>

            <p className='mt-5 text-center text-xs text-muted-foreground text-balance'>
              Аккаунты создаются автоматически администратором при подключении проекта.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
