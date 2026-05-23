import { useState } from 'react';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowsClockwise, Folders, Plus, Trash } from '@phosphor-icons/react';

import { adminGitlabApi, adminProjectsApi } from '@shared/api/admin.api';
import type { AdminProject, GitlabProject } from '@shared/types';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@shared/ui';

interface ConnectProjectDialogProps {
  onClose: () => void;
}

function ConnectProjectDialog({ onClose }: ConnectProjectDialogProps) {
  const [connectionUid, setConnectionUid] = useState('');
  const [selectedProject, setSelectedProject] = useState<GitlabProject | null>(null);
  const [tagPattern, setTagPattern] = useState('v*');
  const [error, setError] = useState('');
  const queryClient = useQueryClient();

  const { data: connections, isLoading: loadingConnections } = useQuery({
    queryKey: ['admin-gitlab-connections'],
    queryFn: adminGitlabApi.listConnections
  });

  const { data: availableProjects, isLoading: loadingProjects } = useQuery({
    queryKey: ['admin-available-projects', connectionUid],
    queryFn: () => adminGitlabApi.fetchAvailableProjects(connectionUid),
    enabled: !!connectionUid
  });

  const mutation = useMutation({
    mutationFn: () => {
      if (!selectedProject) throw new Error('Выберите проект');
      return adminProjectsApi.connectProject({
        connectionUid,
        gitlabProjectId: selectedProject.id,
        name: selectedProject.name,
        nameWithNamespace: selectedProject.nameWithNamespace,
        webUrl: selectedProject.webUrl,
        tagPattern: tagPattern || undefined
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-projects'] });
      onClose();
    },
    onError: (e: Error) => setError(e.message)
  });

  return (
    <div className='fixed inset-0 bg-black/50 flex items-center justify-center z-50'>
      <div className='bg-background rounded-lg border shadow-lg p-6 w-full max-w-lg space-y-4 max-h-[80vh] overflow-y-auto'>
        <h2 className='text-lg font-semibold'>Подключить проект</h2>

        <div>
          <label className='text-sm font-medium'>GitLab подключение</label>
          <select
            value={connectionUid}
            onChange={(e) => { setConnectionUid(e.target.value); setSelectedProject(null); }}
            className='mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm'
          >
            <option value=''>Выберите подключение...</option>
            {loadingConnections && <option disabled>Загрузка...</option>}
            {connections?.map((c) => (
              <option key={c.uid} value={c.uid}>{c.name} ({c.baseUrl})</option>
            ))}
          </select>
        </div>

        {connectionUid && (
          <div>
            <label className='text-sm font-medium'>Проект GitLab</label>
            {loadingProjects && <div className='h-20 bg-muted animate-pulse rounded mt-1' />}
            {availableProjects && (
              <div className='mt-1 border rounded-md max-h-48 overflow-y-auto'>
                {availableProjects.length === 0 && (
                  <p className='p-3 text-sm text-muted-foreground'>Нет доступных проектов</p>
                )}
                {availableProjects.map((p: GitlabProject) => (
                  <div
                    key={p.id}
                    onClick={() => setSelectedProject(p)}
                    className={`p-2.5 cursor-pointer hover:bg-muted/50 text-sm border-b last:border-0 ${selectedProject?.id === p.id ? 'bg-primary/5' : ''}`}
                  >
                    <p className='font-medium'>{p.nameWithNamespace}</p>
                    {p.defaultBranch && (
                      <p className='text-xs text-muted-foreground'>ветка: {p.defaultBranch}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {selectedProject && (
          <div>
            <label className='text-sm font-medium'>Паттерн тегов деплоя</label>
            <input
              value={tagPattern}
              onChange={(e) => setTagPattern(e.target.value)}
              placeholder='v*'
              className='mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono'
            />
            <p className='text-xs text-muted-foreground mt-1'>Пример: v*, release/*, deploy-*</p>
          </div>
        )}

        {error && <p className='text-sm text-red-600'>{error}</p>}

        <div className='flex gap-2 justify-end'>
          <Button variant='outline' onClick={onClose}>Отмена</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !connectionUid || !selectedProject}
          >
            {mutation.isPending ? 'Подключение...' : 'Подключить'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ProjectRow({ project }: { project: AdminProject }) {
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: () => adminProjectsApi.deleteProject(project.uid),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-projects'] })
  });

  const resyncMutation = useMutation({
    mutationFn: () => adminProjectsApi.triggerResync(project.uid)
  });

  return (
    <tr className='border-t hover:bg-muted/30 transition-colors'>
      <td className='px-4 py-3'>
        <p className='font-medium text-sm'>{project.name}</p>
        <p className='text-xs text-muted-foreground'>{project.nameWithNamespace}</p>
      </td>
      <td className='px-4 py-3 text-sm'>
        {project.tagPattern ? (
          <code className='text-xs bg-muted px-1.5 py-0.5 rounded'>{project.tagPattern}</code>
        ) : (
          <span className='text-muted-foreground text-xs'>—</span>
        )}
      </td>
      <td className='px-4 py-3 text-xs text-muted-foreground'>
        {project.syncedAt ? new Date(project.syncedAt).toLocaleString('ru-RU') : '—'}
      </td>
      <td className='px-4 py-3'>
        <div className='flex gap-1'>
          <button
            onClick={() => resyncMutation.mutate()}
            disabled={resyncMutation.isPending}
            className='p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors'
            title='Пересинхронизировать'
          >
            <ArrowsClockwise size={14} className={resyncMutation.isPending ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={() => {
              if (confirm(`Удалить проект «${project.name}»?`)) deleteMutation.mutate();
            }}
            className='p-1.5 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600 transition-colors'
            title='Удалить'
          >
            <Trash size={14} />
          </button>
        </div>
      </td>
    </tr>
  );
}

export default function AdminProjectsPage() {
  const [showConnect, setShowConnect] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-projects'],
    queryFn: adminProjectsApi.listProjects
  });

  return (
    <div className='p-6 space-y-6 max-w-5xl'>
      <div className='flex items-center justify-between'>
        <div>
          <h1 className='text-2xl font-bold tracking-tight'>Проекты</h1>
          <p className='text-muted-foreground text-sm mt-1'>GitLab-проекты, подключённые к системе</p>
        </div>
        <Button className='gap-2' onClick={() => setShowConnect(true)}>
          <Plus size={16} />
          Подключить проект
        </Button>
      </div>

      {isError && (
        <Card>
          <CardContent className='py-8 text-center'>
            <p className='text-sm text-muted-foreground'>Не удалось загрузить проекты</p>
          </CardContent>
        </Card>
      )}

      {isLoading && <div className='h-48 bg-muted animate-pulse rounded-lg' />}

      {!isLoading && data && data.length === 0 && (
        <Card>
          <CardContent className='py-10 text-center'>
            <Folders size={32} className='text-muted-foreground mx-auto mb-2' weight='duotone' />
            <p className='font-medium'>Нет подключённых проектов</p>
            <p className='text-sm text-muted-foreground mt-1'>
              Добавьте GitLab-подключение и затем подключите проекты
            </p>
          </CardContent>
        </Card>
      )}

      {!isLoading && data && data.length > 0 && (
        <Card>
          <CardHeader className='pb-2'>
            <CardTitle className='text-base'>
              Проекты{' '}
              <span className='text-muted-foreground font-normal text-sm'>({data.length})</span>
            </CardTitle>
          </CardHeader>
          <CardContent className='p-0'>
            <div className='overflow-x-auto'>
              <table className='w-full text-sm'>
                <thead>
                  <tr className='bg-muted/50 text-left'>
                    <th className='px-4 py-2.5 font-medium'>Проект</th>
                    <th className='px-4 py-2.5 font-medium'>Паттерн тегов</th>
                    <th className='px-4 py-2.5 font-medium'>Последняя синхронизация</th>
                    <th className='px-4 py-2.5 font-medium w-24'>Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((p) => <ProjectRow key={p.uid} project={p} />)}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {showConnect && <ConnectProjectDialog onClose={() => setShowConnect(false)} />}
    </div>
  );
}
