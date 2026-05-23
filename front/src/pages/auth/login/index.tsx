import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router';

import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeSlash, GitBranch, Warning } from '@phosphor-icons/react';
import { z } from 'zod';

import { ROUTES } from '@shared/constants';
import { useAuth } from '@shared/hooks';
import { Alert, AlertDescription, Button, Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, Input, Label } from '@shared/ui';

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
    <div className='bg-muted/40 flex min-h-screen items-center justify-center p-4'>
      <div className='w-full max-w-sm'>
        {/* Brand */}
        <div className='mb-6 flex flex-col items-center gap-2'>
          <div className='from-primary to-primary/60 flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br shadow-md'>
            <GitBranch size={20} weight='bold' className='text-primary-foreground' />
          </div>
          <span className='text-xl font-bold tracking-tight'>CherryGit</span>
          <p className='text-muted-foreground text-sm'>Аналитика Git-процессов</p>
        </div>

        <Card>
          <CardHeader className='pb-4'>
            <CardTitle className='text-lg'>Вход в систему</CardTitle>
            <CardDescription>Введите данные вашей учётной записи</CardDescription>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className='space-y-4' noValidate>
              {serverError && (
                <Alert variant='destructive'>
                  <Warning size={16} />
                  <AlertDescription>{serverError}</AlertDescription>
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
                    className='pr-10'
                    {...register('password')}
                  />
                  <button
                    type='button'
                    tabIndex={-1}
                    className='text-muted-foreground hover:text-foreground absolute right-3 top-1/2 -translate-y-1/2 transition-colors'
                    onClick={() => setShowPassword((v) => !v)}
                  >
                    {showPassword ? <EyeSlash size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {errors.password && (
                  <p className='text-destructive text-xs'>{errors.password.message}</p>
                )}
              </div>

              <Button type='submit' className='w-full' disabled={isSubmitting}>
                {isSubmitting ? 'Вход...' : 'Войти'}
              </Button>
            </form>
          </CardContent>

          <CardFooter className='justify-center'>
            <p className='text-muted-foreground text-sm'>
              Нет аккаунта?{' '}
              <Link to={ROUTES.register} className='text-primary hover:underline'>
                Зарегистрироваться
              </Link>
            </p>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
