import { useCallback, useMemo, useState } from 'react';

import {
  CheckCircle,
  Copy,
  GitlabLogo,
  Key,
  MagnifyingGlass,
  UserPlus
} from '@phosphor-icons/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { adminGitlabApi, adminGitlabUsersApi, adminProjectsApi } from '@shared/api/admin.api';
import { cn } from '@shared/lib/utils';
import type {
  AdminProject,
  GitlabConnection,
  GitlabUserRegistryItem,
  ProvisionReport,
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
 * `/admin/gitlab-users` — реестр GitLab-участников (`gitlab_users`).
 *
 * Опыт:
 *  - фильтры: connection (chips), project (select), provisioned (toggle), поиск;
 *  - выбор нескольких строк → bulk-provisioning;
 *  - результат провижининга → модал с временными паролями (как в /admin/projects).
 */

const PAGE_SIZE = 50;

const formatRelative = (iso: string | null | undefined): string => {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' });
};

// ---------------------------------------------------------------------------
// Provisioning result modal (shared style w/ projects page)
// ---------------------------------------------------------------------------

function ProvisionResultModal({
  report,
  onClose
}: {
  report: ProvisionReport;
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

  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4'>
      <div className='bg-background flex max-h-[85vh] w-full max-w-3xl flex-col rounded-lg border shadow-lg'>
        <div className='border-b p-5'>
          <div className='flex items-center gap-2'>
            <Key size={22} weight='duotone' className='text-primary' />
            <h2 className='text-lg font-semibold'>Provisioning завершён</h2>
          </div>
          <div className='mt-2 flex flex-wrap gap-2 text-xs'>
            <Badge variant='success'>Создано: {report.created}</Badge>
            <Badge variant='secondary'>Переиспользовано: {report.reused}</Badge>
            {report.skipped > 0 && <Badge variant='warning'>Пропущено: {report.skipped}</Badge>}
          </div>
        </div>

        <div className='flex-1 overflow-y-auto p-5'>
          {created.length === 0 && (
            <Alert>
              <AlertDescription>
                Новых аккаунтов не создано: все участники уже были в системе.
              </AlertDescription>
            </Alert>
          )}

          {created.length > 0 && (
            <div className='space-y-3'>
              <div className='flex items-center justify-between'>
                <p className='text-sm font-medium'>Созданные аккаунты ({created.length})</p>
                <Button
                  variant='outline'
                  size='sm'
                  onClick={() => navigator.clipboard.writeText(csv).catch(() => {})}
                >
                  <Copy size={14} className='mr-1.5' />
                  CSV в буфер
                </Button>
              </div>
              <div className='overflow-hidden rounded-md border'>
                <table className='w-full text-sm'>
                  <thead className='bg-muted/50 text-left'>
                    <tr>
                      <th className='px-3 py-2 font-medium'>Email</th>
                      <th className='px-3 py-2 font-medium'>Имя</th>
                      <th className='px-3 py-2 font-medium'>Временный пароль</th>
                    </tr>
                  </thead>
                  <tbody>
                    {created.map((r) => (
                      <PasswordRow key={r.gitlabUserUid} record={r} />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {reused.length > 0 && (
            <details className='mt-4'>
              <summary className='text-muted-foreground cursor-pointer text-xs'>
                Переиспользованы существующие аккаунты ({reused.length})
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
            Готово
          </Button>
        </div>
      </div>
    </div>
  );
}

function PasswordRow({ record }: { record: ProvisionedUserRecord }) {
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
        >
          {copied ? <CheckCircle size={12} className='text-green-600' /> : <Copy size={12} />}
          {record.temporaryPassword}
        </button>
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Filters bar
// ---------------------------------------------------------------------------

interface Filters {
  connectionUid?: string;
  projectUid?: string;
  search: string;
  provisioned?: 'true' | 'false';
}

function FiltersBar({
  connections,
  projects,
  filters,
  onChange
}: {
  connections: GitlabConnection[];
  projects: AdminProject[];
  filters: Filters;
  onChange: (f: Filters) => void;
}) {
  return (
    <div className='space-y-3'>
      {/* Connections chips */}
      <div className='flex flex-wrap gap-2'>
        <button
          onClick={() => onChange({ ...filters, connectionUid: undefined })}
          className={cn(
            'rounded-full border px-3 py-1 text-xs transition-colors',
            !filters.connectionUid
              ? 'bg-primary text-primary-foreground border-primary'
              : 'hover:bg-muted'
          )}
        >
          Все подключения
        </button>
        {connections.map((c) => (
          <button
            key={c.uid}
            onClick={() => onChange({ ...filters, connectionUid: c.uid })}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors',
              filters.connectionUid === c.uid
                ? 'bg-primary text-primary-foreground border-primary'
                : 'hover:bg-muted'
            )}
          >
            <GitlabLogo size={12} />
            {c.name}
          </button>
        ))}
      </div>

      <div className='flex flex-wrap items-center gap-2'>
        <div className='relative min-w-[260px] flex-1'>
          <MagnifyingGlass
            size={14}
            className='text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2'
          />
          <Input
            value={filters.search}
            onChange={(e) => onChange({ ...filters, search: e.target.value })}
            placeholder='Имя, username или email…'
            className='pl-9'
          />
        </div>

        <select
          value={filters.projectUid ?? ''}
          onChange={(e) =>
            onChange({ ...filters, projectUid: e.target.value || undefined })
          }
          className='bg-background rounded-md border px-2.5 py-2 text-sm'
        >
          <option value=''>Все проекты</option>
          {projects.map((p) => (
            <option key={p.uid} value={p.uid}>
              {p.name}
            </option>
          ))}
        </select>

        <select
          value={filters.provisioned ?? ''}
          onChange={(e) =>
            onChange({
              ...filters,
              provisioned: (e.target.value || undefined) as 'true' | 'false' | undefined
            })
          }
          className='bg-background rounded-md border px-2.5 py-2 text-sm'
        >
          <option value=''>Все статусы</option>
          <option value='true'>Только активированные</option>
          <option value='false'>Только не активированные</option>
        </select>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AdminGitlabUsersPage() {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<Filters>({ search: '' });
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<ProvisionReport | null>(null);

  const filtersKey = JSON.stringify(filters);

  // Любая смена фильтров сбрасывает page+selection в одном переходе.
  const updateFilters = useCallback((next: Filters) => {
    setFilters(next);
    setPage(0);
    setSelected(new Set());
  }, []);

  const { data: connections } = useQuery({
    queryKey: ['admin-gitlab-connections'],
    queryFn: adminGitlabApi.listConnections
  });

  const { data: projects } = useQuery({
    queryKey: ['admin-projects'],
    queryFn: adminProjectsApi.listProjects
  });

  const { data, isLoading } = useQuery({
    queryKey: ['admin-gitlab-users', filtersKey, page],
    queryFn: () =>
      adminGitlabUsersApi.list({
        connectionUid: filters.connectionUid,
        projectUid: filters.projectUid,
        search: filters.search || undefined,
        provisioned: filters.provisioned,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE
      })
  });

  const provisionMutation = useMutation({
    mutationFn: (uids: string[]) => adminGitlabUsersApi.provisionBulk(uids),
    onSuccess: (report) => {
      setResult(report);
      setSelected(new Set());
      queryClient.invalidateQueries({ queryKey: ['admin-gitlab-users'] });
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    }
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const selectableUids = items
    .filter((i) => !i.isProvisioned)
    .map((i) => i.uid);

  const toggleAll = () => {
    if (selected.size === selectableUids.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(selectableUids));
    }
  };

  const toggleOne = (uid: string) => {
    const next = new Set(selected);
    if (next.has(uid)) next.delete(uid);
    else next.add(uid);
    setSelected(next);
  };

  return (
    <div className='page-shell'>
      <div className='min-w-0'>
        <h1 className='page-title'>GitLab участники</h1>
        <p className='page-subtitle text-balance'>
          Реестр пользователей, найденных через discovery. Создайте им аккаунты в CherryGit.
        </p>
      </div>

      <Card>
        <CardHeader className='pb-3'>
          <CardTitle className='text-base'>Фильтры</CardTitle>
        </CardHeader>
        <CardContent>
          <FiltersBar
            connections={connections ?? []}
            projects={projects ?? []}
            filters={filters}
            onChange={updateFilters}
          />
        </CardContent>
      </Card>

      {selected.size > 0 && (
        <div className='bg-primary/5 border-primary/20 sticky top-0 z-10 flex items-center gap-3 rounded-md border p-3'>
          <span className='text-sm font-medium'>Выбрано: {selected.size}</span>
          <Button
            size='sm'
            onClick={() => provisionMutation.mutate([...selected])}
            disabled={provisionMutation.isPending}
          >
            <UserPlus size={14} className='mr-1' />
            {provisionMutation.isPending ? 'Создание…' : 'Создать аккаунты'}
          </Button>
          <Button variant='ghost' size='sm' onClick={() => setSelected(new Set())}>
            Снять выделение
          </Button>
        </div>
      )}

      <Card>
        <CardContent className='p-0'>
          {isLoading ? (
            <div className='bg-muted m-4 h-40 animate-pulse rounded' />
          ) : items.length === 0 ? (
            <p className='text-muted-foreground py-10 text-center text-sm'>
              Ничего не найдено
            </p>
          ) : (
            <table className='w-full text-sm'>
              <thead className='bg-muted/40 text-left'>
                <tr>
                  <th className='w-10 px-3 py-2'>
                    <input
                      type='checkbox'
                      checked={
                        selectableUids.length > 0 && selected.size === selectableUids.length
                      }
                      onChange={toggleAll}
                      disabled={selectableUids.length === 0}
                    />
                  </th>
                  <th className='px-3 py-2 font-medium'>GitLab пользователь</th>
                  <th className='px-3 py-2 font-medium'>Email</th>
                  <th className='px-3 py-2 font-medium'>Подключение</th>
                  <th className='px-3 py-2 font-medium'>CherryGit-аккаунт</th>
                  <th className='px-3 py-2 font-medium'>Видели</th>
                  <th className='w-32 px-3 py-2 font-medium text-right'>Действие</th>
                </tr>
              </thead>
              <tbody>
                {items.map((u: GitlabUserRegistryItem) => (
                  <Row
                    key={u.uid}
                    item={u}
                    selected={selected.has(u.uid)}
                    onToggle={() => toggleOne(u.uid)}
                    onProvisioned={(r) => {
                      setResult(r);
                      queryClient.invalidateQueries({ queryKey: ['admin-gitlab-users'] });
                      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
                    }}
                  />
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
        <div className='flex items-center justify-between border-t px-4 py-2 text-xs'>
          <span className='text-muted-foreground'>Всего: {total}</span>
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
      </Card>

      {result && <ProvisionResultModal report={result} onClose={() => setResult(null)} />}
    </div>
  );
}

function Row({
  item,
  selected,
  onToggle,
  onProvisioned
}: {
  item: GitlabUserRegistryItem;
  selected: boolean;
  onToggle: () => void;
  onProvisioned: (r: ProvisionReport) => void;
}) {
  const mutation = useMutation({
    mutationFn: () => adminGitlabUsersApi.provisionOne(item.uid),
    onSuccess: onProvisioned
  });

  return (
    <tr className='hover:bg-muted/30 border-t'>
      <td className='px-3 py-2'>
        <input
          type='checkbox'
          checked={selected}
          onChange={onToggle}
          disabled={item.isProvisioned}
        />
      </td>
      <td className='px-3 py-2'>
        <div className='flex items-center gap-2'>
          {item.avatarUrl && (
            <img
              src={item.avatarUrl}
              alt=''
              className='h-6 w-6 rounded-full'
              loading='lazy'
            />
          )}
          <div>
            <p className='font-medium'>{item.name}</p>
            <p className='text-muted-foreground text-xs'>@{item.gitlabUsername}</p>
          </div>
        </div>
      </td>
      <td className='px-3 py-2 text-xs'>
        {item.email ?? <span className='text-muted-foreground italic'>не указан</span>}
      </td>
      <td className='px-3 py-2 text-xs'>{item.gitlabConnectionName ?? '—'}</td>
      <td className='px-3 py-2 text-xs'>
        {item.isProvisioned && item.mappedUserMail ? (
          <span>
            {item.mappedUserName}
            <span className='text-muted-foreground'> · {item.mappedUserMail}</span>
          </span>
        ) : (
          <Badge variant='outline' className='text-[10px]'>
            не активирован
          </Badge>
        )}
      </td>
      <td className='text-muted-foreground px-3 py-2 text-xs'>
        {formatRelative(item.lastSeenAt)}
      </td>
      <td className='px-3 py-2 text-right'>
        {item.isProvisioned ? (
          <Badge variant='success' className='gap-1'>
            <CheckCircle size={12} weight='fill' />
            Активирован
          </Badge>
        ) : (
          <Button
            size='sm'
            variant='outline'
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? '…' : 'Активировать'}
          </Button>
        )}
      </td>
    </tr>
  );
}
