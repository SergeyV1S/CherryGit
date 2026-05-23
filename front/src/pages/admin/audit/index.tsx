import { useState } from 'react';

import { useQuery } from '@tanstack/react-query';
import { ClipboardText, Download, MagnifyingGlass } from '@phosphor-icons/react';

import { adminAuditApi } from '@shared/api/admin.api';
import type { AuditLogItem } from '@shared/types';
import { Button, Card, CardContent, CardHeader, CardTitle, Input } from '@shared/ui';

const PAGE_SIZE = 30;

function ActionBadge({ action }: { action: string }) {
  const prefix = action.split('.')[0];
  const colors: Record<string, string> = {
    auth: 'bg-orange-100 text-orange-700',
    user: 'bg-blue-100 text-blue-700',
    team: 'bg-green-100 text-green-700',
    department: 'bg-purple-100 text-purple-700',
    gitlab: 'bg-red-100 text-red-700',
    project: 'bg-yellow-100 text-yellow-700',
    sync: 'bg-gray-100 text-gray-700'
  };
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded font-mono ${colors[prefix] ?? 'bg-muted text-muted-foreground'}`}>
      {action}
    </span>
  );
}

function AuditRow({ entry }: { entry: AuditLogItem }) {
  const [expanded, setExpanded] = useState(false);
  const hasDetails = entry.details && Object.keys(entry.details).length > 0;

  return (
    <>
      <tr
        className={`border-t hover:bg-muted/30 transition-colors ${hasDetails ? 'cursor-pointer' : ''}`}
        onClick={() => hasDetails && setExpanded(!expanded)}
      >
        <td className='px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap'>
          {new Date(entry.createdAt).toLocaleString('ru-RU', {
            day: '2-digit', month: '2-digit', year: '2-digit',
            hour: '2-digit', minute: '2-digit'
          })}
        </td>
        <td className='px-4 py-2.5'>
          <ActionBadge action={entry.action} />
        </td>
        <td className='px-4 py-2.5 text-xs text-muted-foreground'>
          {entry.entityType}
          {entry.entityId && (
            <span className='ml-1 font-mono text-[10px] text-muted-foreground/70'>
              {entry.entityId.slice(0, 8)}…
            </span>
          )}
        </td>
        <td className='px-4 py-2.5 text-xs'>
          {entry.user ? (
            <span>{entry.user.firstName} {entry.user.secondName}</span>
          ) : entry.userUid ? (
            <span className='font-mono text-muted-foreground'>{entry.userUid.slice(0, 8)}…</span>
          ) : (
            <span className='text-muted-foreground'>система</span>
          )}
        </td>
        <td className='px-4 py-2.5 text-xs text-muted-foreground'>
          {hasDetails && (expanded ? '▲' : '▼')}
        </td>
      </tr>
      {expanded && hasDetails && (
        <tr className='border-t bg-muted/20'>
          <td colSpan={5} className='px-4 py-3'>
            <pre className='text-xs font-mono text-muted-foreground overflow-x-auto whitespace-pre-wrap'>
              {JSON.stringify(entry.details, null, 2)}
            </pre>
          </td>
        </tr>
      )}
    </>
  );
}

export default function AdminAuditPage() {
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [entityTypeFilter, setEntityTypeFilter] = useState('');
  const [offset, setOffset] = useState(0);

  const { data: knownActions } = useQuery({
    queryKey: ['audit-known-actions'],
    queryFn: adminAuditApi.listKnownActions,
    staleTime: 60_000
  });

  const { data: knownEntityTypes } = useQuery({
    queryKey: ['audit-known-entity-types'],
    queryFn: adminAuditApi.listKnownEntityTypes,
    staleTime: 60_000
  });

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-audit', actionFilter, entityTypeFilter, search, offset],
    queryFn: () =>
      adminAuditApi.listLogs({
        action: actionFilter || undefined,
        entityType: entityTypeFilter || undefined,
        limit: PAGE_SIZE,
        offset
      }),
    staleTime: 15_000
  });

  const handleExport = () => {
    const params = new URLSearchParams();
    if (actionFilter) params.set('action', actionFilter);
    if (entityTypeFilter) params.set('entityType', entityTypeFilter);
    window.open(`/api/admin/audit/export?${params.toString()}`);
  };

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 0;
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  return (
    <div className='p-6 space-y-6 max-w-6xl'>
      <div className='flex items-center justify-between'>
        <div>
          <h1 className='text-2xl font-bold tracking-tight'>Журнал аудита</h1>
          <p className='text-muted-foreground text-sm mt-1'>История всех действий в системе</p>
        </div>
        <Button variant='outline' className='gap-2' onClick={handleExport}>
          <Download size={16} />
          Экспорт CSV
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className='pb-3'>
          <CardTitle className='text-base'>Фильтры</CardTitle>
        </CardHeader>
        <CardContent>
          <div className='flex flex-wrap gap-3'>
            <div className='relative flex-1 min-w-48'>
              <MagnifyingGlass size={16} className='text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2' />
              <Input
                placeholder='Поиск...'
                className='pl-9'
                value={search}
                onChange={(e) => { setSearch(e.target.value); setOffset(0); }}
              />
            </div>

            <select
              value={actionFilter}
              onChange={(e) => { setActionFilter(e.target.value); setOffset(0); }}
              className='rounded-md border border-input bg-background px-3 py-2 text-sm min-w-48'
            >
              <option value=''>Все действия</option>
              {knownActions?.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>

            <select
              value={entityTypeFilter}
              onChange={(e) => { setEntityTypeFilter(e.target.value); setOffset(0); }}
              className='rounded-md border border-input bg-background px-3 py-2 text-sm min-w-40'
            >
              <option value=''>Все типы</option>
              {knownEntityTypes?.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>

            {(actionFilter || entityTypeFilter || search) && (
              <Button
                variant='outline'
                onClick={() => { setActionFilter(''); setEntityTypeFilter(''); setSearch(''); setOffset(0); }}
              >
                Сбросить
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader className='pb-2'>
          <div className='flex items-center gap-2'>
            <ClipboardText size={18} className='text-primary' weight='duotone' />
            <CardTitle className='text-base'>
              События
              {data && (
                <span className='text-muted-foreground font-normal text-sm ml-2'>
                  ({data.total} всего)
                </span>
              )}
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className='p-0'>
          {isError && (
            <p className='text-sm text-muted-foreground text-center py-8'>Не удалось загрузить журнал</p>
          )}
          {isLoading && <div className='h-48 bg-muted animate-pulse m-4 rounded' />}

          {!isLoading && data && (
            <>
              <div className='overflow-x-auto'>
                <table className='w-full text-sm'>
                  <thead>
                    <tr className='bg-muted/50 text-left'>
                      <th className='px-4 py-2.5 font-medium'>Время</th>
                      <th className='px-4 py-2.5 font-medium'>Действие</th>
                      <th className='px-4 py-2.5 font-medium'>Сущность</th>
                      <th className='px-4 py-2.5 font-medium'>Пользователь</th>
                      <th className='px-4 py-2.5 font-medium w-8'></th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((entry) => <AuditRow key={entry.uid} entry={entry} />)}
                    {data.items.length === 0 && (
                      <tr>
                        <td colSpan={5} className='px-4 py-8 text-center text-muted-foreground text-sm'>
                          Нет событий по выбранным фильтрам
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className='flex items-center justify-between px-4 py-3 border-t'>
                  <p className='text-xs text-muted-foreground'>
                    Страница {currentPage} из {totalPages}
                  </p>
                  <div className='flex gap-2'>
                    <Button
                      variant='outline'
                      size='sm'
                      disabled={offset === 0}
                      onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                    >
                      Назад
                    </Button>
                    <Button
                      variant='outline'
                      size='sm'
                      disabled={offset + PAGE_SIZE >= data.total}
                      onClick={() => setOffset(offset + PAGE_SIZE)}
                    >
                      Вперёд
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
