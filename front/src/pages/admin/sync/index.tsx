import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowsClockwise, CheckCircle, Warning, XCircle } from '@phosphor-icons/react';

import { adminProjectsApi, adminSyncApi } from '@shared/api/admin.api';
import type { SyncStatus } from '@shared/types';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@shared/ui';
import { cn } from '@shared/lib/utils';

const STATUS_CONFIG = {
  idle: { label: 'Ожидание', icon: null, color: 'text-muted-foreground' },
  running: { label: 'Выполняется', icon: ArrowsClockwise, color: 'text-blue-600' },
  success: { label: 'Завершено', icon: CheckCircle, color: 'text-green-600' },
  error: { label: 'Ошибка', icon: XCircle, color: 'text-red-600' }
};

function ProjectSyncCard({ projectUid, projectName }: { projectUid: string; projectName: string }) {
  const { data: status, refetch } = useQuery<SyncStatus>({
    queryKey: ['sync-status', projectUid],
    queryFn: () => adminSyncApi.getStatus(projectUid),
    refetchInterval: (query) => {
      return query.state.data?.status === 'running' ? 5000 : false;
    }
  });

  const syncMutation = useMutation({
    mutationFn: () => adminSyncApi.triggerSync(projectUid),
    onSuccess: () => setTimeout(() => refetch(), 1000)
  });

  const recalcMutation = useMutation({
    mutationFn: () => adminSyncApi.recalculate(projectUid),
    onSuccess: () => setTimeout(() => refetch(), 1000)
  });

  const statusCfg = status ? STATUS_CONFIG[status.status] : STATUS_CONFIG.idle;
  const StatusIcon = statusCfg.icon;

  return (
    <Card>
      <CardHeader className='pb-2'>
        <div className='flex items-center justify-between gap-2'>
          <CardTitle className='text-sm font-medium truncate'>{projectName}</CardTitle>
          <div className='flex items-center gap-1.5 shrink-0'>
            {StatusIcon && (
              <StatusIcon
                size={14}
                className={cn(statusCfg.color, status?.status === 'running' ? 'animate-spin' : '')}
                weight='fill'
              />
            )}
            <span className={cn('text-xs', statusCfg.color)}>{statusCfg.label}</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className='space-y-2'>
        {status && (
          <div className='grid grid-cols-2 gap-2 text-xs text-muted-foreground'>
            <div>
              <p className='font-medium text-foreground'>{status.commitsCount}</p>
              <p>коммитов</p>
            </div>
            <div>
              <p className='font-medium text-foreground'>{status.mrsCount}</p>
              <p>MR</p>
            </div>
          </div>
        )}

        {status?.lastSyncAt && (
          <p className='text-xs text-muted-foreground'>
            Синхр.: {new Date(status.lastSyncAt).toLocaleString('ru-RU')}
          </p>
        )}

        {status?.lastError && (
          <div className='rounded border border-red-200 bg-red-50 dark:bg-red-900/20 p-2'>
            <p className='text-xs text-red-600'>{status.lastError}</p>
          </div>
        )}

        <div className='flex gap-2'>
          <Button
            variant='outline'
            size='sm'
            className='flex-1 text-xs h-8 gap-1'
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending || status?.status === 'running'}
          >
            <ArrowsClockwise size={12} className={syncMutation.isPending ? 'animate-spin' : ''} />
            Sync
          </Button>
          <Button
            variant='outline'
            size='sm'
            className='flex-1 text-xs h-8'
            onClick={() => recalcMutation.mutate()}
            disabled={recalcMutation.isPending}
          >
            Пересчёт
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminSyncPage() {
  const { data: projects, isLoading, isError } = useQuery({
    queryKey: ['admin-projects'],
    queryFn: adminProjectsApi.listProjects
  });

  return (
    <div className='p-6 space-y-6 max-w-5xl'>
      <div>
        <h1 className='text-2xl font-bold tracking-tight'>Синхронизация</h1>
        <p className='text-muted-foreground text-sm mt-1'>
          Статус синхронизации данных из GitLab по проектам
        </p>
      </div>

      {isError && (
        <Card>
          <CardContent className='py-8 text-center'>
            <p className='text-sm text-muted-foreground'>Не удалось загрузить проекты</p>
          </CardContent>
        </Card>
      )}

      {isLoading && (
        <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
          {[1, 2, 3].map((i) => <div key={i} className='h-40 bg-muted animate-pulse rounded-lg' />)}
        </div>
      )}

      {!isLoading && projects && projects.length === 0 && (
        <Card>
          <CardContent className='py-10 text-center'>
            <Warning size={32} className='text-muted-foreground mx-auto mb-2' weight='duotone' />
            <p className='font-medium'>Нет подключённых проектов</p>
            <p className='text-sm text-muted-foreground mt-1'>
              Перейдите в раздел Проекты и подключите GitLab-проекты
            </p>
          </CardContent>
        </Card>
      )}

      {!isLoading && projects && projects.length > 0 && (
        <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
          {projects.map((p) => (
            <ProjectSyncCard key={p.uid} projectUid={p.uid} projectName={p.name} />
          ))}
        </div>
      )}

      <div className='rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground space-y-1'>
        <p className='font-medium text-foreground'>Как работает синхронизация</p>
        <p>Cron-джоб запускается каждые 10 минут и собирает инкрементальные данные (коммиты, MR, ревью, теги) из GitLab.</p>
        <p>Кнопка <strong>Sync</strong> — ручной запуск инкрементальной синхронизации для проекта.</p>
        <p>Кнопка <strong>Пересчёт</strong> — пересчёт метрик на уже собранных данных без обращения к GitLab.</p>
      </div>
    </div>
  );
}
