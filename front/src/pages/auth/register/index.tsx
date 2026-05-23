import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router';

import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeSlash, GitBranch, Warning } from '@phosphor-icons/react';
import { z } from 'zod';

import { ROUTES } from '@shared/constants';
import { useAuth } from '@shared/hooks';
import { Alert, AlertDescription, Button, Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, Input, Label } from '@shared/ui';

const registerSchema = z
  .object({
    firstName: z.string().min(1, 'Введите имя').max(64, 'Слишком длинное имя'),
    secondName: z.string().min(1, 'Введите фамилию').max(64, 'Слишком длинная фамилия'),
    mail: z.string().email('Введите корректный email'),
    password: z
      .string()
      .min(8, 'Минимум 8 символов')
      .regex(/[A-Z]/, 'Пароль должен содержать заглавную букву')
      .regex(/[0-9]/, 'Пароль должен содержать цифру'),
    confirmPassword: z.string()
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Пароли не совпадают',
    path: ['confirmPassword']
  });

type RegisterForm = z.infer<typeof registerSchema>;

export default function RegisterPage() {
  const { register: registerUser } = useAuth();
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema)
  });

  const onSubmit = async (data: RegisterForm) => {
    setServerError(null);
    try {
      await registerUser({
        firstName: data.firstName,
        secondName: data.secondName,
        mail: data.mail,
        password: data.password
      });
      navigate(ROUTES.dashboard);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      setServerError(
        axiosErr?.response?.data?.message ?? 'Ошибка регистрации. Возможно, email уже занят.'
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
            <CardTitle className='text-lg'>Регистрация</CardTitle>
            <CardDescription>Создайте аккаунт в системе CherryGit</CardDescription>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className='space-y-4' noValidate>
              {serverError && (
                <Alert variant='destructive'>
                  <Warning size={16} />
                  <AlertDescription>{serverError}</AlertDescription>
                </Alert>
              )}

              <div className='grid grid-cols-2 gap-3'>
                <div className='space-y-1.5'>
                  <Label htmlFor='firstName'>Имя</Label>
                  <Input
                    id='firstName'
                    placeholder='Иван'
                    autoComplete='given-name'
                    aria-invalid={!!errors.firstName}
                    {...register('firstName')}
                  />
                  {errors.firstName && (
                    <p className='text-destructive text-xs'>{errors.firstName.message}</p>
                  )}
                </div>

                <div className='space-y-1.5'>
                  <Label htmlFor='secondName'>Фамилия</Label>
                  <Input
                    id='secondName'
                    placeholder='Иванов'
                    autoComplete='family-name'
                    aria-invalid={!!errors.secondName}
                    {...register('secondName')}
                  />
                  {errors.secondName && (
                    <p className='text-destructive text-xs'>{errors.secondName.message}</p>
                  )}
                </div>
              </div>

              <div className='space-y-1.5'>
                <Label htmlFor='mail'>Email</Label>
                <Input
                  id='mail'
                  type='email'
                  placeholder='ivan@corp.ru'
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
                    placeholder='Минимум 8 символов'
                    autoComplete='new-password'
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

              <div className='space-y-1.5'>
                <Label htmlFor='confirmPassword'>Подтвердите пароль</Label>
                <Input
                  id='confirmPassword'
                  type={showPassword ? 'text' : 'password'}
                  placeholder='Повторите пароль'
                  autoComplete='new-password'
                  aria-invalid={!!errors.confirmPassword}
                  {...register('confirmPassword')}
                />
                {errors.confirmPassword && (
                  <p className='text-destructive text-xs'>{errors.confirmPassword.message}</p>
                )}
              </div>

              <Button type='submit' className='w-full' disabled={isSubmitting}>
                {isSubmitting ? 'Регистрация...' : 'Создать аккаунт'}
              </Button>
            </form>
          </CardContent>

          <CardFooter className='justify-center'>
            <p className='text-muted-foreground text-sm'>
              Уже есть аккаунт?{' '}
              <Link to={ROUTES.login} className='text-primary hover:underline'>
                Войти
              </Link>
            </p>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
