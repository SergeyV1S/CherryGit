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
import { Alert, AlertDescription, AlertTitle, Badge, Button, Separator } from '@shared/ui';

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
      className={({ isActive }) =>
        cn(
          'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
          isActive
            ? 'bg-primary/10 text-primary'
            : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
        )
      }
    >
      <item.icon size={18} weight='duotone' />
      <span>{item.label}</span>
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
    <aside className='bg-sidebar border-sidebar-border flex h-full w-64 flex-col border-r'>
      {/* Brand */}
      <div className='flex h-14 items-center gap-2 px-4'>
        <div className='from-primary to-primary/60 flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br'>
          <GitBranch size={16} weight='bold' className='text-primary-foreground' />
        </div>
        <span className='font-semibold tracking-tight'>CherryGit</span>
        {onClose && (
          <Button variant='ghost' size='icon-sm' className='ml-auto' onClick={onClose}>
            <X size={16} />
          </Button>
        )}
      </div>

      <Separator />

      {/* Navigation */}
      <nav className='flex-1 overflow-y-auto p-3 space-y-1'>
        <div className='space-y-1'>
          {visibleNav.map((item) => (
            <NavItemLink key={item.href} item={item} />
          ))}
        </div>

        {visibleAdmin.length > 0 && (
          <>
            <div className='pt-4 pb-1'>
              <p className='text-muted-foreground px-3 text-xs font-semibold uppercase tracking-wider'>
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

      <Separator />

      {/* User info */}
      <div className='p-3'>
        <div className='flex items-center gap-3 rounded-lg px-3 py-2'>
          <div className='bg-muted flex h-8 w-8 shrink-0 items-center justify-center rounded-full'>
            <UserCircle size={20} className='text-muted-foreground' />
          </div>
          <div className='min-w-0 flex-1'>
            <p className='truncate text-sm font-medium'>
              {user?.firstName} {user?.secondName}
            </p>
            <Badge variant={ROLE_BADGE_VARIANT[role]} className='mt-0.5 text-[10px]'>
              {ROLE_LABELS[role]}
            </Badge>
          </div>
        </div>

        <Button
          variant='ghost'
          size='sm'
          className='mt-1 w-full justify-start gap-2 text-muted-foreground'
          onClick={handleLogout}
        >
          <Door size={16} />
          Выйти
        </Button>
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
            className='bg-background/80 absolute inset-0 backdrop-blur-sm'
            onClick={() => setSidebarOpen(false)}
          />
          <div className='absolute inset-y-0 left-0 z-50'>
            <Sidebar onClose={() => setSidebarOpen(false)} />
          </div>
        </div>
      )}

      {/* Main content */}
      <div className='flex flex-1 flex-col overflow-hidden'>
        {/* Mobile top bar */}
        <header className='bg-background border-b flex h-14 items-center gap-3 px-4 md:hidden'>
          <Button variant='ghost' size='icon-sm' onClick={() => setSidebarOpen(true)}>
            <List size={20} />
          </Button>
          <div className='from-primary to-primary/60 flex h-6 w-6 items-center justify-center rounded bg-gradient-to-br'>
            <GitBranch size={13} weight='bold' className='text-primary-foreground' />
          </div>
          <span className='font-semibold text-sm'>CherryGit</span>
        </header>

        {access && <AccessBanner access={access} />}

        {/* Page content */}
        <main className='flex-1 overflow-y-auto'>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
