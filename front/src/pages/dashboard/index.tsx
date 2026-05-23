import { Navigate } from 'react-router';

import { ROUTES } from '@shared/constants';
import { useAuth } from '@shared/hooks';

export default function DashboardRedirect() {
  const { user } = useAuth();

  if (!user) return <Navigate to={ROUTES.login} replace />;

  switch (user.role) {
    case 'ADMIN':
      return <Navigate to={ROUTES.admin.users} replace />;
    case 'HEAD':
      return <Navigate to={ROUTES.head.dora} replace />;
    case 'LEAD':
      return <Navigate to='/teams' replace />;
    default:
      return <Navigate to={ROUTES.developer.root} replace />;
  }
}
