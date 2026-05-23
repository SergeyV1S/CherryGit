import { Navigate, Outlet } from 'react-router';

import { useAuth } from '@shared/hooks';
import type { Role } from '@shared/types';

import { ROUTES } from '@shared/constants';

interface ProtectedRouteProps {
  roles?: Role[];
  redirectTo?: string;
}

export function ProtectedRoute({ roles, redirectTo = ROUTES.login }: ProtectedRouteProps) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className='flex min-h-screen items-center justify-center'>
        <div className='text-muted-foreground text-sm'>Загрузка...</div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to={redirectTo} replace />;
  }

  if (roles && !roles.includes(user.role)) {
    return <Navigate to={ROUTES.dashboard} replace />;
  }

  return <Outlet />;
}
