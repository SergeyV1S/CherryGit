import { useMemo, useState } from 'react';

import { CaretDown, CaretRight, MagnifyingGlass, Plus, Trash, UserPlus, Users } from '@phosphor-icons/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { adminProjectsApi, adminTeamsApi, adminUsersApi } from '@shared/api/admin.api';
import { cn } from '@shared/lib/utils';
import type {
  AdminProject,
  AdminTeam,
  AdminTeamMember,
  AdminUser,
  TeamProjectLink,
  TeamRole
} from '@shared/types';
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input
} from '@shared/ui';

const MEMBER_ROLE_LABEL: Record<TeamRole, string> = { DEVELOPER: 'Разработчик', LEAD: 'Тимлид' };
const MEMBER_ROLE_BADGE: Record<TeamRole, 'secondary' | 'success'> = {
  DEVELOPER: 'secondary',
  LEAD: 'success'
};

const PAGE_SIZE = 20;

// ---------------------------------------------------------------------------
// Create team dialog
// ---------------------------------------------------------------------------

function CreateTeamDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: () => adminTeamsApi.createTeam({ name, description: description || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-teams'] });
      onClose();
    },
    onError: (e: unknown) => {
      const ax = e as { response?: { data?: { message?: string } } };
      setError(ax?.response?.data?.message ?? (e as Error).message);
    }
  });

  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4'>
      <div className='bg-background w-full max-w-md space-y-4 rounded-lg border p-6 shadow-lg'>
        <h2 className='text-lg font-semibold'>Создать команду</h2>

        <div className='space-y-3'>
          <div>
            <label className='text-sm font-medium'>Название</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder='Backend Team'
              className='mt-1'
            />
          </div>
          <div>
            <label className='text-sm font-medium'>Описание (опционально)</label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder='Что делает команда'
              className='mt-1'
            />
          </div>
        </div>

        {error && (
          <Alert variant='destructive'>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className='flex justify-end gap-2'>
          <Button variant='outline' onClick={onClose}>
            Отмена
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !name}>
            {mutation.isPending ? 'Создание…' : 'Создать'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// User picker (search + pagination, no UID input)
// ---------------------------------------------------------------------------

function UserPickerDialog({
  team,
  excludeUserUids,
  onClose,
  onAdd
}: {
  team: AdminTeam;
  excludeUserUids: Set<string>;
  onClose: () => void;
  onAdd: (userUid: string, role: TeamRole) => void;
}) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [selectedUserUid, setSelectedUserUid] = useState<string | null>(null);
  const [role, setRole] = useState<TeamRole>('DEVELOPER');
  // Когда admin изменил роль вручную — больше не пере-дефолтим автоматически.
  const [roleEditedManually, setRoleEditedManually] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-users-picker', search, page],
    queryFn: () =>
      adminUsersApi.listUsers({
        search: search || undefined,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE
      })
  });

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const visibleItems = useMemo(
    () => data?.items.filter((u) => !excludeUserUids.has(u.uid)) ?? [],
    [data, excludeUserUids]
  );

  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4'>
      <div className='bg-background flex max-h-[85vh] w-full max-w-2xl flex-col rounded-lg border shadow-lg'>
        <div className='border-b p-5'>
          <h2 className='text-lg font-semibold'>
            Добавить участника в «{team.name}»
          </h2>
          <p className='text-muted-foreground mt-1 text-sm'>
            Выберите пользователя из списка и роль в команде
          </p>
        </div>

        <div className='border-b p-4'>
          <div className='relative'>
            <MagnifyingGlass
              size={14}
              className='text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2'
            />
            <Input
              autoFocus
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
                setSelectedUserUid(null);
              }}
              placeholder='Поиск по имени, фамилии или email…'
              className='pl-9'
            />
          </div>
        </div>

        <div className='min-h-[280px] flex-1 overflow-y-auto'>
          {isLoading && <div className='bg-muted m-4 h-24 animate-pulse rounded' />}

          {!isLoading && visibleItems.length === 0 && (
            <p className='text-muted-foreground py-10 text-center text-sm'>
              {data && data.items.length > 0
                ? 'Все найденные пользователи уже в команде'
                : 'Никого не найдено'}
            </p>
          )}

          {!isLoading && visibleItems.length > 0 && (
            <ul>
              {visibleItems.map((u: AdminUser) => {
                const selected = selectedUserUid === u.uid;
                return (
                  <li key={u.uid}>
                    <button
                      onClick={() => {
                        setSelectedUserUid(u.uid);
                        // Авто-дефолт per-team роли по глобальной — пока admin
                        // не поменял её вручную в нижнем select'е.
                        if (!roleEditedManually) {
                          setRole(u.role === 'LEAD' || u.role === 'ADMIN' ? 'LEAD' : 'DEVELOPER');
                        }
                      }}
                      className={cn(
                        'hover:bg-muted/50 flex w-full items-center justify-between gap-3 border-b px-4 py-2.5 text-left text-sm transition-colors',
                        selected && 'bg-primary/5'
                      )}
                    >
                      <div className='min-w-0 flex-1'>
                        <p className='font-medium'>
                          {u.firstName} {u.secondName}
                        </p>
                        <p className='text-muted-foreground truncate text-xs'>{u.mail}</p>
                      </div>
                      <Badge variant='outline' className='text-[10px] uppercase'>
                        {u.role}
                      </Badge>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className='flex items-center justify-between gap-2 border-t px-4 py-2 text-xs'>
          <span className='text-muted-foreground'>
            Всего: {total}
            {visibleItems.length < (data?.items.length ?? 0) &&
              ` · в команде уже: ${(data?.items.length ?? 0) - visibleItems.length}`}
          </span>
          <div className='flex items-center gap-2'>
            <Button
              variant='ghost'
              size='sm'
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
            >
              ←
            </Button>
            <span>
              {page + 1} / {totalPages}
            </span>
            <Button
              variant='ghost'
              size='sm'
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page + 1 >= totalPages}
            >
              →
            </Button>
          </div>
        </div>

        <div className='border-t bg-muted/30 flex items-center gap-3 p-4'>
          <select
            value={role}
            onChange={(e) => {
              setRole(e.target.value as TeamRole);
              setRoleEditedManually(true);
            }}
            className='bg-background rounded-md border px-2.5 py-1.5 text-sm'
          >
            <option value='DEVELOPER'>Роль в команде: Разработчик</option>
            <option value='LEAD'>Роль в команде: Тимлид</option>
          </select>
          <span className='text-muted-foreground text-xs'>
            Это per-team роль (доступ к метрикам команды), не глобальная.
          </span>
          <Button variant='outline' onClick={onClose} className='ml-auto'>
            Отмена
          </Button>
          <Button
            onClick={() => {
              if (selectedUserUid) {
                onAdd(selectedUserUid, role);
              }
            }}
            disabled={!selectedUserUid}
          >
            <UserPlus size={14} className='mr-1' />
            Добавить
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Members panel inside a team row
// ---------------------------------------------------------------------------

function MembersPanel({ team }: { team: AdminTeam }) {
  const queryClient = useQueryClient();
  const [showPicker, setShowPicker] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: members, isLoading } = useQuery({
    queryKey: ['admin-team-members', team.uid],
    queryFn: () => adminTeamsApi.listMembers(team.uid)
  });

  const addMutation = useMutation({
    mutationFn: (dto: { userUid: string; role: TeamRole }) =>
      adminTeamsApi.addMember(team.uid, dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-team-members', team.uid] });
      setShowPicker(false);
      setError(null);
    },
    onError: (e: unknown) => {
      const ax = e as { response?: { data?: { message?: string } } };
      setError(ax?.response?.data?.message ?? (e as Error).message);
    }
  });

  const removeMutation = useMutation({
    mutationFn: (memberUid: string) => adminTeamsApi.removeMember(team.uid, memberUid),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['admin-team-members', team.uid] })
  });

  const updateRoleMutation = useMutation({
    mutationFn: ({ memberUid, role }: { memberUid: string; role: TeamRole }) =>
      adminTeamsApi.updateMemberRole(team.uid, memberUid, role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-team-members', team.uid] });
      setError(null);
    },
    onError: (e: unknown) => {
      const ax = e as { response?: { data?: { message?: string } } };
      setError(ax?.response?.data?.message ?? (e as Error).message);
    }
  });

  if (isLoading) return <div className='bg-muted mt-3 h-20 animate-pulse rounded' />;

  const memberUids = new Set(members?.map((m) => m.userUid) ?? []);

  return (
    <div className='mt-3 space-y-3'>
      <div className='flex items-center justify-between'>
        <p className='text-muted-foreground text-xs font-medium uppercase tracking-wide'>
          Состав ({members?.length ?? 0})
        </p>
        <Button size='sm' variant='outline' onClick={() => setShowPicker(true)}>
          <UserPlus size={14} className='mr-1' />
          Добавить участника
        </Button>
      </div>

      {error && (
        <Alert variant='destructive'>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {members && members.length === 0 ? (
        <p className='text-muted-foreground py-3 text-center text-xs'>
          Участников ещё нет — назначьте кого-то из списка
        </p>
      ) : (
        <ul className='divide-y rounded-md border'>
          {members?.map((m: AdminTeamMember) => (
            <li
              key={m.uid}
              className='flex items-center justify-between gap-3 px-3 py-2 text-sm'
            >
              <div className='min-w-0 flex-1'>
                <p className='font-medium'>
                  {m.firstName} {m.secondName}
                </p>
                <p className='text-muted-foreground truncate text-xs'>{m.mail}</p>
              </div>
              <select
                value={m.role}
                disabled={updateRoleMutation.isPending}
                onChange={(e) =>
                  updateRoleMutation.mutate({
                    memberUid: m.uid,
                    role: e.target.value as TeamRole
                  })
                }
                className={cn(
                  'bg-background rounded-md border px-2 py-1 text-xs disabled:opacity-50',
                  m.role === 'LEAD' && 'border-emerald-500/40'
                )}
                title='Per-team роль (доступ к метрикам этой команды)'
              >
                <option value='DEVELOPER'>{MEMBER_ROLE_LABEL.DEVELOPER}</option>
                <option value='LEAD'>{MEMBER_ROLE_LABEL.LEAD}</option>
              </select>
              <button
                onClick={() => {
                  if (confirm(`Убрать ${m.firstName} ${m.secondName} из команды?`))
                    removeMutation.mutate(m.uid);
                }}
                className='text-muted-foreground hover:text-destructive rounded p-1'
                title='Убрать'
              >
                <Trash size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {showPicker && (
        <UserPickerDialog
          team={team}
          excludeUserUids={memberUids}
          onClose={() => setShowPicker(false)}
          onAdd={(userUid, role) => addMutation.mutate({ userUid, role })}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Team row
// ---------------------------------------------------------------------------

function TeamRow({ team }: { team: AdminTeam }) {
  const [expanded, setExpanded] = useState(false);
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: () => adminTeamsApi.deleteTeam(team.uid),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-teams'] })
  });

  return (
    <div className='rounded-lg border'>
      <div
        className='hover:bg-muted/30 flex cursor-pointer items-center gap-3 p-3 transition-colors'
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded ? <CaretDown size={16} /> : <CaretRight size={16} />}
        <div className='min-w-0 flex-1'>
          <p className='text-sm font-medium'>{team.name}</p>
          {team.description && (
            <p className='text-muted-foreground truncate text-xs'>{team.description}</p>
          )}
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (confirm(`Удалить команду «${team.name}»?`)) deleteMutation.mutate();
          }}
          className='text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded p-1.5'
        >
          <Trash size={14} />
        </button>
      </div>
      {expanded && (
        <div className='border-t px-4 pb-3 space-y-4'>
          <MembersPanel team={team} />
          <ProjectsPanel team={team} />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Projects panel — привязка/отвязка проектов команды
// ---------------------------------------------------------------------------

function ProjectsPanel({ team }: { team: AdminTeam }) {
  const queryClient = useQueryClient();
  const [pickerOpen, setPickerOpen] = useState(false);

  const { data: linked, isLoading } = useQuery({
    queryKey: ['admin-team-projects', team.uid],
    queryFn: () => adminTeamsApi.listTeamProjects(team.uid)
  });

  const detachMutation = useMutation({
    mutationFn: (projectUid: string) => adminTeamsApi.detachProject(team.uid, projectUid),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-team-projects', team.uid] });
      queryClient.invalidateQueries({ queryKey: ['admin-projects'] });
    }
  });

  return (
    <div>
      <div className='flex items-center justify-between mb-1'>
        <p className='text-muted-foreground text-xs font-medium uppercase tracking-wide'>
          Проекты ({linked?.length ?? 0})
        </p>
        <Button
          size='sm'
          variant='outline'
          className='h-7 text-xs gap-1'
          onClick={() => setPickerOpen(true)}
        >
          <Plus size={12} /> Привязать
        </Button>
      </div>

      {isLoading && <div className='bg-muted h-10 animate-pulse rounded' />}

      {!isLoading && (linked?.length ?? 0) === 0 && (
        <p className='text-muted-foreground text-xs'>Проекты не привязаны</p>
      )}

      {linked && linked.length > 0 && (
        <div className='space-y-1'>
          {linked.map((p: TeamProjectLink) => (
            <div
              key={p.uid}
              className='flex items-center justify-between rounded border px-2 py-1.5'
            >
              <div className='min-w-0'>
                <p className='truncate text-sm font-medium'>{p.name}</p>
                {p.namespace && (
                  <p className='text-muted-foreground truncate text-xs'>{p.namespace}</p>
                )}
              </div>
              <button
                onClick={() => {
                  if (confirm(`Отвязать проект «${p.name}» от команды?`))
                    detachMutation.mutate(p.uid);
                }}
                className='text-muted-foreground hover:text-destructive p-1 rounded'
                title='Отвязать'
              >
                <Trash size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

      {pickerOpen && (
        <AttachProjectDialog
          team={team}
          alreadyLinkedUids={new Set((linked ?? []).map((p) => p.uid))}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}

interface AttachProjectDialogProps {
  team: AdminTeam;
  alreadyLinkedUids: Set<string>;
  onClose: () => void;
}

function AttachProjectDialog({ team, alreadyLinkedUids, onClose }: AttachProjectDialogProps) {
  const queryClient = useQueryClient();
  const [error, setError] = useState('');
  const [pendingUid, setPendingUid] = useState<string | null>(null);

  const { data: allProjects, isLoading } = useQuery({
    queryKey: ['admin-projects'],
    queryFn: adminProjectsApi.listProjects
  });

  const attachMutation = useMutation({
    mutationFn: (projectUid: string) => adminTeamsApi.attachProject(team.uid, projectUid),
    onMutate: (projectUid) => setPendingUid(projectUid),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-team-projects', team.uid] });
      queryClient.invalidateQueries({ queryKey: ['admin-projects'] });
    },
    onError: (e: Error) => setError(e.message),
    onSettled: () => setPendingUid(null)
  });

  const candidates = (allProjects ?? []).filter((p) => !alreadyLinkedUids.has(p.uid));

  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/50'>
      <div className='bg-background w-full max-w-md space-y-4 rounded-lg border p-6 shadow-lg'>
        <div>
          <h2 className='text-lg font-semibold'>Привязать проект</h2>
          <p className='text-muted-foreground text-xs mt-0.5'>к команде «{team.name}»</p>
        </div>

        {isLoading && <div className='bg-muted h-32 animate-pulse rounded' />}

        {!isLoading && candidates.length === 0 && (
          <p className='text-muted-foreground text-sm'>
            Все подключённые проекты уже привязаны к этой команде.
          </p>
        )}

        {!isLoading && candidates.length > 0 && (
          <div className='max-h-72 space-y-1 overflow-y-auto rounded-md border p-1'>
            {candidates.map((p: AdminProject) => (
              <button
                key={p.uid}
                disabled={pendingUid === p.uid}
                onClick={() => attachMutation.mutate(p.uid)}
                className='hover:bg-muted/50 disabled:opacity-50 flex w-full items-center justify-between rounded px-2 py-1.5 text-left'
              >
                <div className='min-w-0'>
                  <p className='truncate text-sm font-medium'>{p.name}</p>
                  {p.namespace && (
                    <p className='text-muted-foreground truncate text-xs'>{p.namespace}</p>
                  )}
                </div>
                <Plus size={14} className='text-muted-foreground' />
              </button>
            ))}
          </div>
        )}

        {error && <p className='text-sm text-red-600'>{error}</p>}

        <div className='flex justify-end'>
          <Button variant='outline' onClick={onClose}>
            Закрыть
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AdminTeamsPage() {
  const [showCreate, setShowCreate] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-teams'],
    queryFn: adminTeamsApi.listTeams
  });

  return (
    <div className='max-w-4xl space-y-6 p-6'>
      <div className='flex items-center justify-between'>
        <div>
          <h1 className='text-2xl font-bold tracking-tight'>Команды</h1>
          <p className='text-muted-foreground mt-1 text-sm'>
            Сформируйте команды и распределите по ним пользователей. После назначения у них
            появятся дашборды.
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus size={16} className='mr-1' />
          Создать команду
        </Button>
      </div>

      {isError && (
        <Card>
          <CardContent className='py-8 text-center text-sm text-muted-foreground'>
            Не удалось загрузить команды
          </CardContent>
        </Card>
      )}

      {isLoading && (
        <div className='space-y-3'>
          {[1, 2, 3].map((i) => (
            <div key={i} className='bg-muted h-16 animate-pulse rounded-lg' />
          ))}
        </div>
      )}

      {!isLoading && data && data.length === 0 && (
        <Card>
          <CardContent className='space-y-2 py-10 text-center'>
            <Users size={32} weight='duotone' className='text-muted-foreground mx-auto' />
            <p className='font-medium'>Команд пока нет</p>
            <p className='text-muted-foreground text-sm'>Создайте первую команду</p>
          </CardContent>
        </Card>
      )}

      {!isLoading && data && data.length > 0 && (
        <Card>
          <CardHeader className='pb-2'>
            <CardTitle className='text-base'>
              Список команд{' '}
              <span className='text-muted-foreground text-sm font-normal'>({data.length})</span>
            </CardTitle>
          </CardHeader>
          <CardContent className='space-y-2'>
            {data.map((team) => (
              <TeamRow key={team.uid} team={team} />
            ))}
          </CardContent>
        </Card>
      )}

      {showCreate && <CreateTeamDialog onClose={() => setShowCreate(false)} />}
    </div>
  );
}
