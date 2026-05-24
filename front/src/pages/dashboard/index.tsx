import { Navigate } from 'react-router';

import { Info } from '@phosphor-icons/react';
import { useQuery } from '@tanstack/react-query';

import { meApi } from '@shared/api/me.api';
import { ROUTES } from '@shared/constants';
import { useAuth } from '@shared/hooks';
import { Card, CardContent } from '@shared/ui';

/**
 * Корневой редирект:
 *   ADMIN → /admin/projects (главное место работы админа в новом флоу).
 *   HEAD  → DORA, если department назначен; иначе fallback-страница.
 *   LEAD/DEVELOPER → /me, если есть команды; иначе fallback.
 *
 * Fallback вместо редиректа на /me, когда юзер ещё не назначен ни в одну
 * команду (теоретически он бы увидел пустую страницу) — отдаём осмысленный
 * экран «обратитесь к админу». Баннер сверху из AppLayout всё равно
 * выводит сообщение, но fallback убирает «пустой» дашборд под ним.
 */
export default function DashboardRedirect() {
  const { user } = useAuth();
  const { data: access, isLoading } = useQuery({
    queryKey: ['me-access'],
    queryFn: () => meApi.getMyAccess(),
    enabled: Boolean(user)
  });

  if (!user) return <Navigate to={ROUTES.login} replace />;
  if (isLoading) return <div className='bg-muted m-6 h-32 animate-pulse rounded-lg' />;

  // ADMIN всегда идёт в админку.
  if (user.role === 'ADMIN') return <Navigate to={ROUTES.admin.projects} replace />;

  // Не активированные или без команды/отдела — fallback вместо пустого дашборда.
  if (access && access.status !== 'ready' && access.status !== 'temp_password') {
    return (
      <div className='p-6'>
        <Card>
          <CardContent className='space-y-2 py-12 text-center'>
            <Info size={32} weight='duotone' className='text-muted-foreground mx-auto' />
            <p className='font-medium'>{access.message}</p>
            <p className='text-muted-foreground text-sm'>
              Как только администратор завершит настройку, дашборды появятся здесь автоматически.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  switch (user.role) {
    case 'HEAD':
      return <Navigate to={ROUTES.head.dora} replace />;
    case 'LEAD':
      return <Navigate to='/teams' replace />;
    default:
      return <Navigate to={ROUTES.developer.root} replace />;
  }
}
