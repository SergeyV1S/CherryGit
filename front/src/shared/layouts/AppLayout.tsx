import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router';

import {
  ChartBar,
  ChartLineUp,
  ClipboardText,
  ClockCounterClockwise,
  Door,
  Folders,
  GitBranch,
  GitlabLogo,
  Gear,
  House,
  Info,
  List,
  Shield,
  SlidersHorizontal,
  Tree,
  UserCircle,
  Users,
  Warning,
  X
} from '@phosphor-icons/react';
import { useQuery } from '@tanstack/react-query';

import { meApi } from '@shared/api/me.api';
import { ROUTES } from '@shared/constants';
import { useAuth } from '@shared/hooks';
import { cn } from '@shared/lib/utils';
import type { MeAccess, MeAccessStatus, Role } from '@shared/types';
import { Alert, AlertDescription, AlertTitle, Badge, Button } from '@shared/ui';

const ROLE_LABELS: Record<Role, string> = {
  DEVELOPER: 'Разработчик',
  LEAD: 'Тимлид',
  HEAD: 'Руководитель',
  ADMIN: 'Администратор'
};

const ROLE_BADGE_VARIANT: Record<
  Role,
  'default' | 'secondary' | 'success' | 'warning' | 'outline'
> = {
  DEVELOPER: 'secondary',
  LEAD: 'success',
  HEAD: 'warning',
  ADMIN: 'default'
};

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  roles: Role[];
}

const NAV_ITEMS: NavItem[] = [
  {
    label: 'Мои метрики',
    href: ROUTES.developer.root,
    icon: House,
    roles: ['DEVELOPER', 'LEAD', 'HEAD', 'ADMIN']
  },
  {
    label: 'История метрик',
    href: ROUTES.developer.history,
    icon: ClockCounterClockwise,
    roles: ['DEVELOPER', 'LEAD', 'HEAD', 'ADMIN']
  },
  {
    label: 'Дашборд команды',
    href: '/teams',
    icon: ChartBar,
    roles: ['LEAD', 'ADMIN']
  },
  {
    label: 'Bus Factor',
    href: '/teams/bus-factor',
    icon: Tree,
    roles: ['LEAD', 'ADMIN']
  },
  {
    label: 'DORA-метрики',
    href: ROUTES.head.dora,
    icon: ChartLineUp,
    roles: ['HEAD', 'ADMIN']
  },
  {
    label: 'Динамика команд',
    href: ROUTES.head.trend,
    icon: SlidersHorizontal,
    roles: ['HEAD', 'ADMIN']
  }
];

const ADMIN_NAV_ITEMS: NavItem[] = [
  {
    label: 'GitLab',
    href: ROUTES.admin.gitlab,
    icon: GitBranch,
    roles: ['ADMIN']
  },
  {
    label: 'Проекты',
    href: ROUTES.admin.projects,
    icon: Folders,
    roles: ['ADMIN']
  },
  {
    label: 'GitLab участники',
    href: ROUTES.admin.gitlabUsers,
    icon: GitlabLogo,
    roles: ['ADMIN']
  },
  {
    label: 'Пользователи',
    href: ROUTES.admin.users,
    icon: Users,
    roles: ['ADMIN']
  },
  {
    label: 'Команды',
    href: ROUTES.admin.teams,
    icon: Shield,
    roles: ['ADMIN']
  },
  {
    label: 'Отделы',
    href: ROUTES.admin.departments,
    icon: Folders,
    roles: ['ADMIN']
  },
  {
    label: 'Синхронизация',
    href: ROUTES.admin.sync,
    icon: Gear,
    roles: ['ADMIN']
  },
  {
    label: 'Журнал аудита',
    href: ROUTES.admin.audit,
    icon: ClipboardText,
    roles: ['ADMIN']
  }
];

function NavItemLink({ item }: { item: NavItem }) {
  return (
    <NavLink
      to={item.href}
      end
      className={({ isActive }) =>
        cn(
          'group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all',
          isActive
            ? 'bg-white/15 text-white shadow-inner'
            : 'text-white/65 hover:bg-white/8 hover:text-white'
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <span className='absolute inset-y-1 left-0 w-1 rounded-r-full bg-gradient-to-b from-rose-300 to-rose-500' />
          )}
          <item.icon
            size={18}
            weight={isActive ? 'fill' : 'duotone'}
            className={cn(
              'shrink-0 transition-colors',
              isActive ? 'text-rose-300' : 'text-white/55 group-hover:text-rose-200'
            )}
          />
          <span className='truncate'>{item.label}</span>
        </>
      )}
    </NavLink>
  );
}

function Sidebar({ onClose }: { onClose?: () => void }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const role = user?.role ?? 'DEVELOPER';

  const visibleNav = NAV_ITEMS.filter((item) => item.roles.includes(role));
  const visibleAdmin = ADMIN_NAV_ITEMS.filter((item) => item.roles.includes(role));

  const handleLogout = async () => {
    await logout();
    navigate(ROUTES.login);
  };

  return (
    <aside
      className='relative flex h-full w-64 flex-col text-white'
      style={{
        background:
          'linear-gradient(180deg, oklch(0.22 0.08 22) 0%, oklch(0.16 0.05 22) 100%)'
      }}
    >
      {/* Декоративный cherry-блик */}
      <div
        aria-hidden
        className='pointer-events-none absolute inset-x-0 top-0 h-px'
        style={{
          background:
            'linear-gradient(90deg, transparent, oklch(0.78 0.20 22 / 0.7), transparent)'
        }}
      />

      {/* Brand */}
      <div className='flex h-16 items-center gap-3 px-5'>
        <div
          className='relative flex h-9 w-9 items-center justify-center rounded-xl shadow-lg shadow-rose-900/40'
          style={{
            background:
              'linear-gradient(135deg, oklch(0.78 0.22 22) 0%, oklch(0.55 0.21 22) 100%)'
          }}
        >
          <GitBranch size={18} weight='bold' className='text-white drop-shadow' />
        </div>
        <div className='min-w-0'>
          <p className='text-base font-bold tracking-tight text-white'>CherryGit</p>
          <p className='text-[10px] uppercase tracking-widest text-white/40'>
            DORA · SPACE
          </p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className='ml-auto rounded-md p-1.5 text-white/60 transition-colors hover:bg-white/10 hover:text-white'
          >
            <X size={16} />
          </button>
        )}
      </div>

      <div className='mx-5 h-px bg-white/10' />

      {/* Navigation */}
      <nav className='flex-1 space-y-1 overflow-y-auto px-3 py-4'>
        <div className='space-y-1'>
          {visibleNav.map((item) => (
            <NavItemLink key={item.href} item={item} />
          ))}
        </div>

        {visibleAdmin.length > 0 && (
          <>
            <div className='px-3 pb-1 pt-5'>
              <p className='text-[10px] font-semibold uppercase tracking-[0.15em] text-white/35'>
                Администрирование
              </p>
            </div>
            <div className='space-y-1'>
              {visibleAdmin.map((item) => (
                <NavItemLink key={item.href} item={item} />
              ))}
            </div>
          </>
        )}
      </nav>

      <div className='mx-5 h-px bg-white/10' />

      {/* User info */}
      <div className='space-y-2 p-3'>
        <div className='flex items-center gap-3 rounded-lg bg-white/5 px-3 py-2.5'>
          <div
            className='flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white shadow-md'
            style={{
              background:
                'linear-gradient(135deg, oklch(0.68 0.22 22), oklch(0.45 0.22 18))'
            }}
          >
            <UserCircle size={20} weight='fill' />
          </div>
          <div className='min-w-0 flex-1'>
            <p className='truncate text-sm font-medium text-white'>
              {user?.firstName} {user?.secondName}
            </p>
            <div className='mt-1'>
              <Badge variant={ROLE_BADGE_VARIANT[role]} className='text-[10px]'>
                {ROLE_LABELS[role]}
              </Badge>
            </div>
          </div>
        </div>

        <button
          onClick={handleLogout}
          className='flex w-full items-center justify-start gap-2 rounded-lg px-3 py-2 text-sm font-medium text-white/65 transition-colors hover:bg-white/8 hover:text-white'
        >
          <Door size={16} />
          Выйти
        </button>
      </div>
    </aside>
  );
}

/**
 * Баннер сверху страницы — берёт MeAccess из /api/me/access и информирует юзера,
 * почему он пока не видит дашборды. ADMIN никогда не блокируется.
 */
function AccessBanner({ access }: { access: MeAccess }) {
  if (access.status === 'ready') return null;

  const config: Record<
    Exclude<MeAccessStatus, 'ready'>,
    { title: string; variant: 'default' | 'destructive'; icon: React.ElementType }
  > = {
    pending_provision: {
      title: 'Аккаунт ещё не активирован',
      variant: 'destructive',
      icon: Warning
    },
    pending_assignment: {
      title: 'Вас ещё не добавили в команду',
      variant: 'default',
      icon: Info
    },
    temp_password: {
      title: 'Используется временный пароль',
      variant: 'default',
      icon: Warning
    }
  };

  const cfg = config[access.status];
  const Icon = cfg.icon;

  return (
    <div className='border-b px-6 py-3'>
      <Alert variant={cfg.variant}>
        <Icon size={16} />
        <AlertTitle>{cfg.title}</AlertTitle>
        <AlertDescription>{access.message}</AlertDescription>
      </Alert>
    </div>
  );
}

export function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user } = useAuth();

  const { data: access } = useQuery({
    queryKey: ['me-access'],
    queryFn: () => meApi.getMyAccess(),
    enabled: Boolean(user),
    refetchInterval: 60_000
  });

  return (
    <div className='flex h-screen overflow-hidden'>
      {/* Desktop sidebar */}
      <div className='hidden md:flex md:shrink-0'>
        <Sidebar />
      </div>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className='fixed inset-0 z-40 md:hidden'>
          <div
            className='absolute inset-0 bg-black/50 backdrop-blur-sm'
            onClick={() => setSidebarOpen(false)}
          />
          <div className='absolute inset-y-0 left-0 z-50 shadow-2xl'>
            <Sidebar onClose={() => setSidebarOpen(false)} />
          </div>
        </div>
      )}

      {/* Main content */}
      <div className='flex flex-1 flex-col overflow-hidden'>
        {/* Mobile top bar */}
        <header className='flex h-14 items-center gap-3 border-b border-border/60 bg-card/80 px-4 backdrop-blur-md md:hidden'>
          <Button variant='ghost' size='icon-sm' onClick={() => setSidebarOpen(true)}>
            <List size={20} />
          </Button>
          <div
            className='flex h-7 w-7 items-center justify-center rounded-lg shadow-md'
            style={{
              background:
                'linear-gradient(135deg, oklch(0.78 0.22 22) 0%, oklch(0.55 0.21 22) 100%)'
            }}
          >
            <GitBranch size={14} weight='bold' className='text-white' />
          </div>
          <span className='page-title text-base'>CherryGit</span>
        </header>

        {access && <AccessBanner access={access} />}

        {/* Page content */}
        <main className='relative flex-1 overflow-y-auto'>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
