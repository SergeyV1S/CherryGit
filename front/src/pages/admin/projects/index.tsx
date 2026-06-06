import { useMemo, useState } from 'react';

import {
  ArrowsClockwise,
  CheckCircle,
  Copy,
  Folders,
  GitBranch,
  Key,
  MagnifyingGlass,
  Plug,
  Plus,
  Trash,
  UsersThree,
  Warning
} from '@phosphor-icons/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { adminGitlabApi, adminProjectsApi, adminTeamsApi } from '@shared/api/admin.api';
import { cn } from '@shared/lib/utils';
import type {
  AdminProject,
  AvailableProject,
  ConnectProjectResult,
  GitlabConnection,
  ProvisionedUserRecord
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

/**
 * Страница `/admin/projects` — переработана под новый онбординг-флоу:
 *   1. Админ выбирает GitLab-подключение (chips).
 *   2. Сверху — кнопка «Обновить discovery» (триггерит вручную).
 *   3. Снизу — два списка:
 *        — пул discovery (с поиском + статусом подключения);
 *        — уже подключённые проекты (с действиями: resync, delete).
 *   4. Подключение проекта (`Connect`) → бэкенд возвращает provisioning-отчёт
 *      → открывается модал с временными паролями новых юзеров (один раз).
 */

const formatRelative = (iso: string | null): string => {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' });
};

// ---------------------------------------------------------------------------
// Provisioning passwords modal — ОТКРЫВАЕТСЯ ОДИН РАЗ ПОСЛЕ connectProject
// ---------------------------------------------------------------------------

function ProvisionedPasswordsModal({
  report,
  onClose
}: {
  report: ConnectProjectResult['provisioning'];
  onClose: () => void;
}) {
  const created = report.records.filter((r) => r.status === 'created');
  const reused = report.records.filter((r) => r.status === 'reused');
  const skipped = report.records.filter((r) => r.status === 'skipped');

  const csv = useMemo(
    () =>
      ['email,temporary_password,first_name,last_name']
        .concat(
          created.map(
            (r) => `${r.mail},${r.temporaryPassword ?? ''},${r.firstName},${r.secondName}`
          )
        )
        .join('\n'),
    [created]
  );

  const copyCsv = async () => {
    try {
      await navigator.clipboard.writeText(csv);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4'>
      <div className='bg-background flex max-h-[85vh] w-full max-w-3xl flex-col rounded-lg border shadow-lg'>
        <div className='border-b p-5'>
          <div className='flex items-center gap-2'>
            <Key size={22} weight='duotone' className='text-primary' />
            <h2 className='text-lg font-semibold'>Аккаунты созданы</h2>
          </div>
          <p className='text-muted-foreground mt-1 text-sm'>
            Скопируйте временные пароли — после закрытия они недоступны.
          </p>
          <div className='mt-3 flex flex-wrap gap-2 text-xs'>
            <Badge variant='success'>Создано: {report.created}</Badge>
            <Badge variant='secondary'>Переиспользовано: {report.reused}</Badge>
            {report.skipped > 0 && <Badge variant='warning'>Пропущено: {report.skipped}</Badge>}
          </div>
        </div>

        <div className='flex-1 overflow-y-auto p-5'>
          {created.length === 0 && (
            <Alert>
              <Warning size={16} />
              <AlertDescription>
                Новых аккаунтов не создано: все участники проекта уже были в системе.
              </AlertDescription>
            </Alert>
          )}

          {created.length > 0 && (
            <div className='space-y-3'>
              <div className='flex items-center justify-between'>
                <p className='text-sm font-medium'>Созданные аккаунты ({created.length})</p>
                <Button variant='outline' size='sm' onClick={copyCsv}>
                  <Copy size={14} className='mr-1.5' />
                  CSV в буфер
                </Button>
              </div>
              <div className='overflow-hidden rounded-md border'>
                <table className='w-full text-sm'>
                  <thead className='bg-muted/50 text-left'>
                    <tr>
                      <th className='px-3 py-2 font-medium'>Email (логин)</th>
                      <th className='px-3 py-2 font-medium'>Имя</th>
                      <th className='px-3 py-2 font-medium'>Временный пароль</th>
                    </tr>
                  </thead>
                  <tbody>
                    {created.map((r) => (
                      <ProvisionedRow key={r.gitlabUserUid} record={r} />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {reused.length > 0 && (
            <details className='mt-4'>
              <summary className='text-muted-foreground cursor-pointer text-xs'>
                Уже существовали — привязка обновлена ({reused.length})
              </summary>
              <ul className='mt-2 space-y-1 text-xs'>
                {reused.map((r) => (
                  <li key={r.gitlabUserUid} className='text-muted-foreground'>
                    @{r.gitlabUsername} → {r.mail}
                  </li>
                ))}
              </ul>
            </details>
          )}

          {skipped.length > 0 && (
            <details className='mt-4'>
              <summary className='cursor-pointer text-xs text-amber-700'>
                Пропущены ({skipped.length})
              </summary>
              <ul className='mt-2 space-y-1 text-xs'>
                {skipped.map((r) => (
                  <li key={r.gitlabUserUid} className='text-muted-foreground'>
                    @{r.gitlabUsername}: {r.reason ?? '—'}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>

        <div className='border-t p-4'>
          <Button onClick={onClose} className='w-full'>
            Я скопировал пароли
          </Button>
        </div>
      </div>
    </div>
  );
}

function ProvisionedRow({ record }: { record: ProvisionedUserRecord }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (!record.temporaryPassword) return;
    try {
      await navigator.clipboard.writeText(record.temporaryPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* ignore */
    }
  };

  return (
    <tr className='border-t'>
      <td className='px-3 py-2 font-mono text-xs'>{record.mail}</td>
      <td className='px-3 py-2 text-xs'>
        {record.firstName} {record.secondName}
      </td>
      <td className='px-3 py-2'>
        <button
          onClick={copy}
          className='hover:bg-muted inline-flex items-center gap-1.5 rounded border px-2 py-1 font-mono text-xs'
          title='Скопировать'
        >
          {copied ? <CheckCircle size={12} className='text-green-600' /> : <Copy size={12} />}
          {record.temporaryPassword}
        </button>
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Connect dialog (выбрать настройки + подтвердить)
// ---------------------------------------------------------------------------

function ConnectProjectDialog({
  project,
  onClose,
  onConnected
}: {
  project: AvailableProject;
  onClose: () => void;
  onConnected: (result: ConnectProjectResult) => void;
}) {
  const [tagPattern, setTagPattern] = useState('v*');
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      adminProjectsApi.connectProject({
        availableProjectUid: project.uid,
        releaseTagPattern: tagPattern || undefined
      }),
    onSuccess: (result) => {
      onConnected(result);
    },
    onError: (e: unknown) => {
      const axiosErr = e as { response?: { data?: { message?: string } } };
      setError(axiosErr?.response?.data?.message ?? (e as Error).message);
    }
  });

  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4'>
      <div className='bg-background w-full max-w-md space-y-4 rounded-lg border p-6 shadow-lg'>
        <div>
          <h2 className='text-lg font-semibold'>Подключить проект</h2>
          <p className='text-muted-foreground mt-1 text-sm'>
            Будут созданы аккаунты для всех его участников.
          </p>
        </div>

        <div className='bg-muted/40 rounded border p-3'>
          <p className='font-medium text-sm'>{project.name}</p>
          <p className='text-muted-foreground text-xs'>{project.namespace}</p>
          {project.defaultBranch && (
            <p className='text-muted-foreground mt-1 text-xs'>
              ветка: <code className='font-mono'>{project.defaultBranch}</code>
            </p>
          )}
        </div>

        <div>
          <label className='text-sm font-medium' htmlFor='tag-pattern'>
            Паттерн тегов деплоя
          </label>
          <Input
            id='tag-pattern'
            value={tagPattern}
            onChange={(e) => setTagPattern(e.target.value)}
            placeholder='v*'
            className='mt-1 font-mono'
          />
          <p className='text-muted-foreground mt-1 text-xs'>
            Какие теги считать релизными. Пример: v*, release/*, deploy-*
          </p>
        </div>

        {error && (
          <Alert variant='destructive'>
            <Warning size={16} />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className='flex justify-end gap-2'>
          <Button variant='outline' onClick={onClose}>
            Отмена
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? 'Подключение…' : 'Подключить'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Available projects list (pool)
// ---------------------------------------------------------------------------

function AvailableProjectsPanel({ connection }: { connection: GitlabConnection }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [toConnect, setToConnect] = useState<AvailableProject | null>(null);
  const [provisioningReport, setProvisioningReport] = useState<
    ConnectProjectResult['provisioning'] | null
  >(null);

  const { data: pool, isLoading, refetch } = useQuery({
    queryKey: ['admin-available-projects', connection.uid],
    queryFn: () => adminGitlabApi.listAvailableProjects(connection.uid)
  });

  const discovery = useMutation({
    mutationFn: () => adminGitlabApi.triggerDiscovery(connection.uid),
    onSuccess: () => {
      refetch();
      queryClient.invalidateQueries({ queryKey: ['admin-projects'] });
    }
  });

  const filtered = useMemo(() => {
    if (!pool) return [];
    const q = search.trim().toLowerCase();
    if (!q) return pool;
    return pool.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.namespace ?? '').toLowerCase().includes(q)
    );
  }, [pool, search]);

  return (
    <Card>
      <CardHeader className='pb-3'>
        <div className='flex items-center justify-between gap-2'>
          <div>
            <CardTitle className='text-base'>
              Проекты в {connection.name}{' '}
              <span className='text-muted-foreground text-xs font-normal'>
                ({pool?.length ?? 0})
              </span>
            </CardTitle>
            <p className='text-muted-foreground mt-1 text-xs'>
              {connection.baseUrl} · обновлено: {formatRelative(connection.lastCheckedAt)}
            </p>
          </div>
          <Button
            variant='outline'
            size='sm'
            onClick={() => discovery.mutate()}
            disabled={discovery.isPending}
          >
            <ArrowsClockwise
              size={14}
              className={cn('mr-1.5', discovery.isPending && 'animate-spin')}
            />
            Обновить
          </Button>
        </div>
        {discovery.isError && (
          <p className='mt-2 text-xs text-red-600'>
            Не удалось обновить: {(discovery.error as Error).message}
          </p>
        )}
        {discovery.isSuccess && discovery.data && (
          <p className='mt-2 text-xs text-green-700'>
            Обновлено: {discovery.data.projectsSeen} проектов,{' '}
            {discovery.data.gitlabUsersUpserted} участников
          </p>
        )}
      </CardHeader>
      <CardContent className='space-y-3'>
        <div className='relative'>
          <MagnifyingGlass
            size={14}
            className='text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2'
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder='Поиск по имени или namespace…'
            className='pl-9'
          />
        </div>

        {isLoading && <div className='bg-muted h-32 animate-pulse rounded' />}

        {!isLoading && filtered.length === 0 && (
          <div className='text-muted-foreground py-8 text-center text-sm'>
            {pool && pool.length === 0
              ? 'Список пуст. Запустите discovery, чтобы получить проекты с GitLab.'
              : 'Ничего не найдено'}
          </div>
        )}

        {!isLoading && filtered.length > 0 && (
          <div className='overflow-hidden rounded-md border'>
            <table className='w-full text-sm'>
              <thead className='bg-muted/40 text-left'>
                <tr>
                  <th className='px-3 py-2 font-medium'>Проект</th>
                  <th className='px-3 py-2 font-medium'>Ветка</th>
                  <th className='px-3 py-2 font-medium'>Активность</th>
                  <th className='w-32 px-3 py-2 font-medium text-right'>Статус</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.uid} className='hover:bg-muted/30 border-t'>
                    <td className='px-3 py-2'>
                      <p className='font-medium'>{p.name}</p>
                      <p className='text-muted-foreground text-xs'>{p.namespace}</p>
                    </td>
                    <td className='px-3 py-2 text-xs'>
                      {p.defaultBranch ? (
                        <code className='bg-muted rounded px-1.5 py-0.5'>{p.defaultBranch}</code>
                      ) : (
                        <span className='text-muted-foreground'>—</span>
                      )}
                    </td>
                    <td className='text-muted-foreground px-3 py-2 text-xs'>
                      {formatRelative(p.lastActivityAt)}
                    </td>
                    <td className='px-3 py-2 text-right'>
                      {p.connectedProjectUid ? (
                        <Badge variant='success' className='gap-1'>
                          <CheckCircle size={12} weight='fill' />
                          Подключён
                        </Badge>
                      ) : (
                        <Button size='sm' onClick={() => setToConnect(p)}>
                          <Plug size={13} className='mr-1' />
                          Подключить
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>

      {toConnect && (
        <ConnectProjectDialog
          project={toConnect}
          onClose={() => setToConnect(null)}
          onConnected={(result) => {
            setToConnect(null);
            setProvisioningReport(result.provisioning);
            queryClient.invalidateQueries({ queryKey: ['admin-projects'] });
            queryClient.invalidateQueries({
              queryKey: ['admin-available-projects', connection.uid]
            });
          }}
        />
      )}

      {provisioningReport && (
        <ProvisionedPasswordsModal
          report={provisioningReport}
          onClose={() => setProvisioningReport(null)}
        />
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Connected projects panel (existing projects with actions)
// ---------------------------------------------------------------------------

function ConnectedProjectsPanel() {
  const queryClient = useQueryClient();
  const [editTeamsProject, setEditTeamsProject] = useState<AdminProject | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-projects'],
    queryFn: adminProjectsApi.listProjects
  });

  const deleteMutation = useMutation({
    mutationFn: (uid: string) => adminProjectsApi.deleteProject(uid),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-projects'] });
      queryClient.invalidateQueries({ queryKey: ['admin-available-projects'] });
    }
  });

  const resyncMutation = useMutation({
    mutationFn: (uid: string) => adminProjectsApi.triggerResync(uid)
  });

  if (isLoading) return <div className='bg-muted h-32 animate-pulse rounded' />;
  if (isError) {
    return (
      <Card>
        <CardContent className='py-6 text-center text-sm text-muted-foreground'>
          Не удалось загрузить подключённые проекты
        </CardContent>
      </Card>
    );
  }
  if (!data || data.length === 0) return null;

  return (
    <Card>
      <CardHeader className='pb-2'>
        <CardTitle className='text-base'>
          Подключённые проекты{' '}
          <span className='text-muted-foreground text-sm font-normal'>({data.length})</span>
        </CardTitle>
      </CardHeader>
      <CardContent className='p-0'>
        <table className='w-full text-sm'>
          <thead className='bg-muted/40 text-left'>
            <tr>
              <th className='px-4 py-2 font-medium'>Проект</th>
              <th className='px-4 py-2 font-medium'>Команды</th>
              <th className='px-4 py-2 font-medium'>Паттерн тегов</th>
              <th className='px-4 py-2 font-medium'>Последний sync</th>
              <th className='w-28 px-4 py-2 font-medium'>Действия</th>
            </tr>
          </thead>
          <tbody>
            {data.map((p: AdminProject) => (
              <tr key={p.uid} className='hover:bg-muted/30 border-t'>
                <td className='px-4 py-2'>
                  <p className='font-medium'>{p.name}</p>
                  <p className='text-muted-foreground text-xs'>{p.namespace}</p>
                </td>
                <td className='px-4 py-2'>
                  <button
                    onClick={() => setEditTeamsProject(p)}
                    className='group inline-flex max-w-[260px] flex-wrap items-center gap-1 text-left'
                    title='Изменить привязку к командам'
                  >
                    {p.teams.length === 0 ? (
                      <span className='text-muted-foreground text-xs italic group-hover:underline'>
                        нет команд — нажмите чтобы привязать
                      </span>
                    ) : (
                      p.teams.map((t) => (
                        <Badge key={t.uid} variant='secondary' className='text-[10px]'>
                          {t.name}
                        </Badge>
                      ))
                    )}
                  </button>
                </td>
                <td className='px-4 py-2 text-xs'>
                  <code className='bg-muted rounded px-1.5 py-0.5'>{p.releaseTagPattern}</code>
                </td>
                <td className='text-muted-foreground px-4 py-2 text-xs'>
                  {formatRelative(p.lastSyncAt)}
                </td>
                <td className='px-4 py-2'>
                  <div className='flex gap-1'>
                    <button
                      onClick={() => setEditTeamsProject(p)}
                      className='text-muted-foreground hover:bg-muted rounded p-1.5'
                      title='Команды проекта'
                    >
                      <UsersThree size={14} />
                    </button>
                    <button
                      onClick={() => resyncMutation.mutate(p.uid)}
                      disabled={resyncMutation.isPending}
                      className='text-muted-foreground hover:bg-muted rounded p-1.5'
                      title='Запустить sync'
                    >
                      <ArrowsClockwise
                        size={14}
                        className={resyncMutation.isPending ? 'animate-spin' : ''}
                      />
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`Отключить проект «${p.name}»?`)) deleteMutation.mutate(p.uid);
                      }}
                      className='text-muted-foreground hover:text-destructive rounded p-1.5'
                      title='Отключить'
                    >
                      <Trash size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>

      {editTeamsProject && (
        <ProjectTeamsDialog
          project={editTeamsProject}
          onClose={() => setEditTeamsProject(null)}
        />
      )}
    </Card>
  );
}

interface ProjectTeamsDialogProps {
  project: AdminProject;
  onClose: () => void;
}

function ProjectTeamsDialog({ project, onClose }: ProjectTeamsDialogProps) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(project.teams.map((t) => t.uid))
  );
  const [error, setError] = useState('');

  const { data: allTeams, isLoading } = useQuery({
    queryKey: ['admin-teams'],
    queryFn: adminTeamsApi.listTeams
  });

  const mutation = useMutation({
    mutationFn: () =>
      adminProjectsApi.updateProject(project.uid, { teamUids: [...selected] }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-projects'] });
      queryClient.invalidateQueries({ queryKey: ['admin-team-projects'] });
      onClose();
    },
    onError: (e: Error) => setError(e.message)
  });

  const toggle = (uid: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  };

  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/50'>
      <div className='bg-background w-full max-w-md space-y-4 rounded-lg border p-6 shadow-lg'>
        <div>
          <h2 className='text-lg font-semibold'>Команды проекта</h2>
          <p className='text-muted-foreground text-xs mt-0.5'>
            {project.name}
            {project.namespace ? ` · ${project.namespace}` : ''}
          </p>
        </div>

        {isLoading && <div className='bg-muted h-32 animate-pulse rounded' />}

        {!isLoading && allTeams && allTeams.length === 0 && (
          <p className='text-muted-foreground text-sm'>
            Команд ещё нет. Создайте их на странице /admin/teams.
          </p>
        )}

        {!isLoading && allTeams && allTeams.length > 0 && (
          <div className='max-h-72 space-y-1 overflow-y-auto rounded-md border p-2'>
            {allTeams.map((t) => (
              <label
                key={t.uid}
                className='hover:bg-muted/50 flex cursor-pointer items-center gap-2 rounded px-2 py-1.5'
              >
                <input
                  type='checkbox'
                  checked={selected.has(t.uid)}
                  onChange={() => toggle(t.uid)}
                />
                <span className='text-sm'>{t.name}</span>
                {t.description && (
                  <span className='text-muted-foreground truncate text-xs'>
                    · {t.description}
                  </span>
                )}
              </label>
            ))}
          </div>
        )}

        {error && <p className='text-sm text-red-600'>{error}</p>}

        <div className='flex justify-end gap-2'>
          <Button variant='outline' onClick={onClose}>
            Отмена
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? 'Сохранение…' : 'Сохранить'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Connection selector (chips at the top)
// ---------------------------------------------------------------------------

function ConnectionSwitcher({
  connections,
  active,
  onChange
}: {
  connections: GitlabConnection[];
  active: string | null;
  onChange: (uid: string) => void;
}) {
  if (connections.length === 0) return null;

  return (
    <div className='flex flex-wrap gap-2'>
      {connections.map((c) => (
        <button
          key={c.uid}
          onClick={() => onChange(c.uid)}
          className={cn(
            'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors',
            active === c.uid
              ? 'bg-primary text-primary-foreground border-primary'
              : 'hover:bg-muted'
          )}
        >
          <GitBranch size={14} weight='duotone' />
          <span className='font-medium'>{c.name}</span>
          {c.status === 'error' && <Warning size={12} className='text-amber-500' weight='fill' />}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AdminProjectsPage() {
  const { data: connections, isLoading } = useQuery({
    queryKey: ['admin-gitlab-connections'],
    queryFn: adminGitlabApi.listConnections
  });

  const [selectedConnection, setSelectedConnection] = useState<string | null>(null);

  // Авто-выбор первого подключения: если админ ещё ничего не выбрал — берём первое.
  const activeConnection = selectedConnection ?? connections?.[0]?.uid ?? null;
  const active = connections?.find((c) => c.uid === activeConnection) ?? null;

  return (
    <div className='page-shell'>
      <div className='flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between'>
        <div className='min-w-0'>
          <h1 className='page-title'>Проекты</h1>
          <p className='page-subtitle text-balance'>
            Подключайте GitLab-проекты, чтобы система начала собирать метрики и активировала
            аккаунты их участников.
          </p>
        </div>
      </div>

      {isLoading && <div className='bg-muted h-24 animate-pulse rounded-lg' />}

      {!isLoading && (!connections || connections.length === 0) && (
        <Card>
          <CardContent className='space-y-3 py-10 text-center'>
            <GitBranch size={32} weight='duotone' className='text-muted-foreground mx-auto' />
            <p className='font-medium'>Нет GitLab-подключений</p>
            <p className='text-muted-foreground mx-auto max-w-md text-sm'>
              Сначала добавьте подключение в разделе «GitLab» — система автоматически получит
              список проектов и их участников.
            </p>
            <Button asChild>
              <a href='/admin/gitlab'>
                <Plus size={14} className='mr-1' />
                Перейти к подключениям
              </a>
            </Button>
          </CardContent>
        </Card>
      )}

      {connections && connections.length > 0 && (
        <>
          <ConnectionSwitcher
            connections={connections}
            active={activeConnection}
            onChange={setSelectedConnection}
          />

          {active && <AvailableProjectsPanel connection={active} />}

          <div className='border-t pt-6'>
            <h2 className='mb-3 flex items-center gap-2 text-lg font-semibold'>
              <Folders size={20} weight='duotone' />
              Подключено к системе
            </h2>
            <ConnectedProjectsPanel />
          </div>
        </>
      )}
    </div>
  );
}
