import { useState } from 'react';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle, GitBranch, Plus, Trash, Warning, XCircle } from '@phosphor-icons/react';

import { adminGitlabApi } from '@shared/api/admin.api';
import type { GitlabConnection } from '@shared/types';
import { Button, Card, CardContent, CardHeader, CardTitle, Input } from '@shared/ui';
import { cn } from '@shared/lib/utils';

const STATUS_CONFIG = {
  active: { label: 'Активно', icon: CheckCircle, color: 'text-green-600' },
  inactive: { label: 'Неактивно', icon: XCircle, color: 'text-gray-400' },
  error: { label: 'Ошибка', icon: Warning, color: 'text-red-600' }
};

interface CreateConnectionDialogProps {
  onClose: () => void;
}

function CreateConnectionDialog({ onClose }: CreateConnectionDialogProps) {
  const [name, setName] = useState('');
  const [baseUrl, setBaseUrl] = useState('https://gitlab.com');
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => adminGitlabApi.createConnection({ name, baseUrl, token }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-gitlab-connections'] });
      onClose();
    },
    onError: (e: Error) => setError(e.message)
  });

  return (
    <div className='fixed inset-0 bg-black/50 flex items-center justify-center z-50'>
      <div className='bg-background rounded-lg border shadow-lg p-6 w-full max-w-md space-y-4'>
        <h2 className='text-lg font-semibold'>Добавить GitLab подключение</h2>

        <div className='space-y-3'>
          <div>
            <label className='text-sm font-medium'>Название</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder='Корпоративный GitLab' className='mt-1' />
          </div>
          <div>
            <label className='text-sm font-medium'>URL инстанса</label>
            <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder='https://gitlab.com' className='mt-1' />
          </div>
          <div>
            <label className='text-sm font-medium'>Personal Access Token</label>
            <Input value={token} onChange={(e) => setToken(e.target.value)} type='password' placeholder='glpat-...' className='mt-1' />
            <p className='text-xs text-muted-foreground mt-1'>Нужны права: read_api, read_user</p>
          </div>
        </div>

        {error && <p className='text-sm text-red-600'>{error}</p>}
        <p className='text-xs text-muted-foreground'>Токен будет проверен перед сохранением.</p>

        <div className='flex gap-2 justify-end'>
          <Button variant='outline' onClick={onClose}>Отмена</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !name || !baseUrl || !token}
          >
            {mutation.isPending ? 'Проверка...' : 'Добавить'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ConnectionCard({ connection }: { connection: GitlabConnection }) {
  const queryClient = useQueryClient();
  const statusCfg = STATUS_CONFIG[connection.status] ?? STATUS_CONFIG.inactive;
  const StatusIcon = statusCfg.icon;

  const [testResult, setTestResult] = useState<string | null>(null);

  const testMutation = useMutation({
    mutationFn: () => adminGitlabApi.testConnection(connection.uid),
    onSuccess: (data) => {
      setTestResult(data.ok ? `OK: @${data.username}` : `Ошибка: ${data.error}`);
      queryClient.invalidateQueries({ queryKey: ['admin-gitlab-connections'] });
    },
    onError: (e: Error) => setTestResult(`Ошибка: ${e.message}`)
  });

  const deleteMutation = useMutation({
    mutationFn: () => adminGitlabApi.deleteConnection(connection.uid),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-gitlab-connections'] })
  });

  return (
    <Card>
      <CardHeader className='pb-2'>
        <div className='flex items-center justify-between gap-2'>
          <div className='flex items-center gap-2'>
            <GitBranch size={18} className='text-primary' weight='duotone' />
            <CardTitle className='text-base'>{connection.name}</CardTitle>
          </div>
          <div className='flex items-center gap-1.5'>
            <StatusIcon size={16} className={statusCfg.color} weight='fill' />
            <span className={cn('text-xs font-medium', statusCfg.color)}>{statusCfg.label}</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className='space-y-3'>
        <p className='text-sm text-muted-foreground font-mono'>{connection.baseUrl}</p>

        {connection.lastCheckedAt && (
          <p className='text-xs text-muted-foreground'>
            Проверено: {new Date(connection.lastCheckedAt).toLocaleString('ru-RU')}
          </p>
        )}

        {testResult && (
          <p className={cn('text-xs font-medium', testResult.startsWith('OK') ? 'text-green-600' : 'text-red-600')}>
            {testResult}
          </p>
        )}

        <div className='flex gap-2'>
          <Button
            variant='outline'
            size='sm'
            onClick={() => testMutation.mutate()}
            disabled={testMutation.isPending}
            className='flex-1'
          >
            {testMutation.isPending ? 'Проверка...' : 'Проверить токен'}
          </Button>
          <button
            onClick={() => {
              if (confirm(`Удалить подключение «${connection.name}»?`)) {
                deleteMutation.mutate();
              }
            }}
            className='p-2 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600 transition-colors'
          >
            <Trash size={15} />
          </button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminGitlabPage() {
  const [showCreate, setShowCreate] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-gitlab-connections'],
    queryFn: adminGitlabApi.listConnections
  });

  return (
    <div className='p-6 space-y-6 max-w-4xl'>
      <div className='flex items-center justify-between'>
        <div>
          <h1 className='text-2xl font-bold tracking-tight'>GitLab подключения</h1>
          <p className='text-muted-foreground text-sm mt-1'>
            Управление подключениями к GitLab-инстансам
          </p>
        </div>
        <Button className='gap-2' onClick={() => setShowCreate(true)}>
          <Plus size={16} />
          Добавить подключение
        </Button>
      </div>

      {isError && (
        <Card>
          <CardContent className='py-8 text-center'>
            <p className='text-sm text-muted-foreground'>Не удалось загрузить подключения</p>
          </CardContent>
        </Card>
      )}

      {isLoading && (
        <div className='grid gap-4 sm:grid-cols-2'>
          {[1, 2].map((i) => <div key={i} className='h-40 bg-muted animate-pulse rounded-lg' />)}
        </div>
      )}

      {!isLoading && data && data.length === 0 && (
        <Card>
          <CardContent className='py-10 text-center space-y-2'>
            <GitBranch size={32} className='text-muted-foreground mx-auto' weight='duotone' />
            <p className='font-medium'>Нет подключений к GitLab</p>
            <p className='text-sm text-muted-foreground'>
              Добавьте подключение, чтобы начать синхронизацию данных
            </p>
          </CardContent>
        </Card>
      )}

      {!isLoading && data && data.length > 0 && (
        <div className='grid gap-4 sm:grid-cols-2'>
          {data.map((c) => <ConnectionCard key={c.uid} connection={c} />)}
        </div>
      )}

      {/* Info block */}
      <div className='rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground space-y-1'>
        <p className='font-medium text-foreground'>Требования к PAT-токену</p>
        <p>Минимальные права: <strong>read_api</strong>, <strong>read_user</strong>.</p>
        <p>Для деплоев (тегов): <strong>read_repository</strong>.</p>
        <p>Токен хранится в зашифрованном виде (AES-256-GCM).</p>
      </div>

      {showCreate && <CreateConnectionDialog onClose={() => setShowCreate(false)} />}
    </div>
  );
}
