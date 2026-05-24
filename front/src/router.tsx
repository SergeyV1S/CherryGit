import { lazy } from 'react';
import { Navigate, createBrowserRouter } from 'react-router';

import { ProtectedRoute } from '@shared/components';
import { ROUTES } from '@shared/constants';
import { AppLayout } from '@shared/layouts';
import { createRoute } from '@shared/utils';

// Auth pages
const LoginPage = lazy(() => import('@pages/auth/login'));
const RegisterPage = lazy(() => import('@pages/auth/register'));

// Dashboard redirect
const DashboardRedirect = lazy(() => import('@pages/dashboard'));

// Developer
const MePage = lazy(() => import('@pages/me'));
const MeHistoryPage = lazy(() => import('@pages/me/history'));

// Lead
const TeamsPage = lazy(() => import('@pages/teams'));

// Head
const DepartmentDoraPage = lazy(() => import('@pages/department/dora'));
const DepartmentTrendPage = lazy(() => import('@pages/department/trend'));

// Admin
const AdminUsersPage = lazy(() => import('@pages/admin/users'));
const AdminGitlabUsersPage = lazy(() => import('@pages/admin/gitlab-users'));
const AdminTeamsPage = lazy(() => import('@pages/admin/teams'));
const AdminDepartmentsPage = lazy(() => import('@pages/admin/departments'));
const AdminGitlabPage = lazy(() => import('@pages/admin/gitlab'));
const AdminProjectsPage = lazy(() => import('@pages/admin/projects'));
const AdminSyncPage = lazy(() => import('@pages/admin/sync'));
const AdminAuditPage = lazy(() => import('@pages/admin/audit'));

export const router = createBrowserRouter([
  // Public routes
  createRoute(ROUTES.login, <LoginPage />),
  createRoute(ROUTES.register, <RegisterPage />),

  // Redirect from root
  {
    path: '/',
    element: <Navigate to={ROUTES.dashboard} replace />
  },

  // Protected routes (all authenticated users)
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppLayout />,
        children: [
          // Dashboard redirect
          createRoute(ROUTES.dashboard, <DashboardRedirect />),

          // Developer dashboard
          createRoute(ROUTES.developer.root, <MePage />),
          createRoute(ROUTES.developer.history, <MeHistoryPage />),

          // Lead dashboard
          createRoute('/teams', <TeamsPage />),
          createRoute('/teams/:teamUid', <TeamsPage />),
          createRoute('/teams/:teamUid/metrics', <TeamsPage />),
          createRoute('/teams/:teamUid/bus-factor', <TeamsPage />),
          createRoute('/teams/bus-factor', <TeamsPage />),

          // Head dashboard
          createRoute(ROUTES.head.dora, <DepartmentDoraPage />),
          createRoute(ROUTES.head.trend, <DepartmentTrendPage />),

          // Admin panel (admin only)
          {
            element: <ProtectedRoute roles={['ADMIN']} />,
            children: [
              createRoute(ROUTES.admin.users, <AdminUsersPage />),
              createRoute(ROUTES.admin.gitlabUsers, <AdminGitlabUsersPage />),
              createRoute(ROUTES.admin.teams, <AdminTeamsPage />),
              createRoute(ROUTES.admin.departments, <AdminDepartmentsPage />),
              createRoute(ROUTES.admin.gitlab, <AdminGitlabPage />),
              createRoute(ROUTES.admin.projects, <AdminProjectsPage />),
              createRoute(ROUTES.admin.sync, <AdminSyncPage />),
              createRoute(ROUTES.admin.audit, <AdminAuditPage />)
            ]
          }
        ]
      }
    ]
  },

  // Fallback
  {
    path: '*',
    element: <Navigate to={ROUTES.dashboard} replace />
  }
]);
