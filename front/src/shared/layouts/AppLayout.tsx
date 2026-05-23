import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router';

import {
  ChartBar,
  ChartLineUp,
  ClipboardText,
  Door,
  Folders,
  GitBranch,
  Gear,
  House,
  List,
  Shield,
  SlidersHorizontal,
  Tree,
  UserCircle,
  Users,
  X
} from '@phosphor-icons/react';

import { ROUTES } from '@shared/constants';
import { useAuth } from '@shared/hooks';
import type { Role } from '@shared/types';
import { Badge, Button, Separator } from '@shared/ui';
import { cn } from '@shared/lib/utils';

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

export function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

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

        {/* Page content */}
        <main className='flex-1 overflow-y-auto'>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
