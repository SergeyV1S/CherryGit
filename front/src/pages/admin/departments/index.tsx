import { useState } from 'react';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Buildings, Plus, Trash } from '@phosphor-icons/react';

import { adminDepartmentsApi, adminTeamsApi, adminUsersApi } from '@shared/api/admin.api';
import type { AdminDepartment } from '@shared/types';
import { Button, Card, CardContent, CardHeader, CardTitle, Input } from '@shared/ui';

interface CreateDepartmentDialogProps {
  onClose: () => void;
}

function CreateDepartmentDialog({ onClose }: CreateDepartmentDialogProps) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => adminDepartmentsApi.createDepartment({ name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-departments'] });
      onClose();
    },
    onError: (e: Error) => setError(e.message)
  });

  return (
    <div className='fixed inset-0 bg-black/50 flex items-center justify-center z-50'>
      <div className='bg-background rounded-lg border shadow-lg p-6 w-full max-w-sm space-y-4'>
        <h2 className='text-lg font-semibold'>Создать отдел</h2>
        <div>
          <label className='text-sm font-medium'>Название</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder='Backend отдел' className='mt-1' />
        </div>
        {error && <p className='text-sm text-red-600'>{error}</p>}
        <div className='flex gap-2 justify-end'>
          <Button variant='outline' onClick={onClose}>Отмена</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !name}>
            {mutation.isPending ? 'Создание...' : 'Создать'}
          </Button>
        </div>
      </div>
    </div>
  );
}

interface ManageDepartmentDialogProps {
  department: AdminDepartment;
  onClose: () => void;
}

function ManageDepartmentDialog({ department, onClose }: ManageDepartmentDialogProps) {
  const queryClient = useQueryClient();
  const [teamUid, setTeamUid] = useState('');
  const [userUid, setUserUid] = useState('');

  const { data: teams } = useQuery({
    queryKey: ['admin-dept-teams', department.uid],
    queryFn: () =>
      adminTeamsApi.listTeams().then((all) => all.filter((t) => t.departmentUid === department.uid))
  });

  const { data: heads } = useQuery({
    queryKey: ['admin-dept-heads', department.uid],
    queryFn: () => adminUsersApi.listUsers({ role: 'HEAD' }).then((r) => r.items)
  });

  const attachTeam = useMutation({
    mutationFn: () => adminDepartmentsApi.attachTeam(department.uid, teamUid),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-dept-teams', department.uid] });
      queryClient.invalidateQueries({ queryKey: ['admin-teams'] });
      setTeamUid('');
    }
  });

  const assignHead = useMutation({
    mutationFn: () => adminDepartmentsApi.assignHead(department.uid, userUid),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-dept-heads', department.uid] });
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      setUserUid('');
    }
  });

  return (
    <div className='fixed inset-0 bg-black/50 flex items-center justify-center z-50'>
      <div className='bg-background rounded-lg border shadow-lg p-6 w-full max-w-lg space-y-5 max-h-[80vh] overflow-y-auto'>
        <div className='flex items-center justify-between'>
          <h2 className='text-lg font-semibold'>{department.name}</h2>
          <Button variant='outline' size='sm' onClick={onClose}>Закрыть</Button>
        </div>

        {/* Teams */}
        <div>
          <p className='text-sm font-medium mb-2'>Команды отдела</p>
          <div className='space-y-1 mb-3'>
            {teams && teams.length === 0 && (
              <p className='text-xs text-muted-foreground'>Нет команд</p>
            )}
            {teams && teams.map((t) => (
              <div key={t.uid} className='flex items-center justify-between text-sm py-1'>
                <span>{t.name}</span>
                <button
                  onClick={() =>
                    adminDepartmentsApi.detachTeam(department.uid, t.uid).then(() => {
                      queryClient.invalidateQueries({ queryKey: ['admin-dept-teams', department.uid] });
                      queryClient.invalidateQueries({ queryKey: ['admin-teams'] });
                    })
                  }
                  className='p-1 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600 transition-colors'
                >
                  <Trash size={13} />
                </button>
              </div>
            ))}
          </div>
          <div className='flex gap-2'>
            <Input
              placeholder='UID команды'
              value={teamUid}
              onChange={(e) => setTeamUid(e.target.value)}
              className='flex-1 text-xs h-8'
            />
            <Button size='sm' onClick={() => attachTeam.mutate()} disabled={attachTeam.isPending || !teamUid} className='h-8 text-xs'>
              Привязать
            </Button>
          </div>
        </div>

        {/* Heads */}
        <div>
          <p className='text-sm font-medium mb-2'>Руководители</p>
          <div className='space-y-1 mb-3'>
            {heads && heads.filter((u) => u.departmentUid === department.uid).length === 0 && (
              <p className='text-xs text-muted-foreground'>Нет руководителей</p>
            )}
            {heads && heads.filter((u) => u.departmentUid === department.uid).map((u) => (
              <div key={u.uid} className='flex items-center justify-between text-sm py-1'>
                <span>{u.firstName} {u.secondName}</span>
                <button
                  onClick={() =>
                    adminDepartmentsApi.unassignHead(department.uid, u.uid).then(() => {
                      queryClient.invalidateQueries({ queryKey: ['admin-dept-heads', department.uid] });
                    })
                  }
                  className='p-1 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600 transition-colors'
                >
                  <Trash size={13} />
                </button>
              </div>
            ))}
          </div>
          <div className='flex gap-2'>
            <Input
              placeholder='UID пользователя (HEAD)'
              value={userUid}
              onChange={(e) => setUserUid(e.target.value)}
              className='flex-1 text-xs h-8'
            />
            <Button size='sm' onClick={() => assignHead.mutate()} disabled={assignHead.isPending || !userUid} className='h-8 text-xs'>
              Назначить
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AdminDepartmentsPage() {
  const [showCreate, setShowCreate] = useState(false);
  const [manageDept, setManageDept] = useState<AdminDepartment | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-departments'],
    queryFn: adminDepartmentsApi.listDepartments
  });

  const deleteMutation = useMutation({
    mutationFn: (uid: string) => adminDepartmentsApi.deleteDepartment(uid),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-departments'] })
  });

  return (
    <div className='p-6 space-y-6 max-w-4xl'>
      <div className='flex items-center justify-between'>
        <div>
          <h1 className='text-2xl font-bold tracking-tight'>Отделы</h1>
          <p className='text-muted-foreground text-sm mt-1'>Структура организации</p>
        </div>
        <Button className='gap-2' onClick={() => setShowCreate(true)}>
          <Plus size={16} />
          Создать отдел
        </Button>
      </div>

      {isError && (
        <Card>
          <CardContent className='py-8 text-center'>
            <p className='text-sm text-muted-foreground'>Не удалось загрузить отделы</p>
          </CardContent>
        </Card>
      )}

      {isLoading && (
        <div className='space-y-3'>
          {[1, 2].map((i) => <div key={i} className='h-20 bg-muted animate-pulse rounded-lg' />)}
        </div>
      )}

      {!isLoading && data && data.length === 0 && (
        <Card>
          <CardContent className='py-10 text-center'>
            <Buildings size={32} className='text-muted-foreground mx-auto mb-2' weight='duotone' />
            <p className='font-medium'>Нет отделов</p>
            <p className='text-sm text-muted-foreground mt-1'>Создайте первый отдел</p>
          </CardContent>
        </Card>
      )}

      {!isLoading && data && data.length > 0 && (
        <Card>
          <CardHeader className='pb-2'>
            <CardTitle className='text-base'>
              Список отделов{' '}
              <span className='text-muted-foreground font-normal text-sm'>({data.length})</span>
            </CardTitle>
          </CardHeader>
          <CardContent className='p-0'>
            <table className='w-full text-sm'>
              <thead>
                <tr className='bg-muted/50 text-left'>
                  <th className='px-4 py-2.5 font-medium'>Название</th>
                  <th className='px-4 py-2.5 font-medium'>Команды</th>
                  <th className='px-4 py-2.5 font-medium'>Руководители</th>
                  <th className='px-4 py-2.5 font-medium w-32'>Действия</th>
                </tr>
              </thead>
              <tbody>
                {data.map((dept) => (
                  <tr key={dept.uid} className='border-t hover:bg-muted/30 transition-colors'>
                    <td className='px-4 py-3 font-medium'>{dept.name}</td>
                    <td className='px-4 py-3 text-muted-foreground'>{dept.teamsCount}</td>
                    <td className='px-4 py-3 text-muted-foreground'>{dept.headsCount}</td>
                    <td className='px-4 py-3'>
                      <div className='flex gap-1'>
                        <Button
                          variant='outline'
                          size='sm'
                          className='h-7 text-xs'
                          onClick={() => setManageDept(dept)}
                        >
                          Управление
                        </Button>
                        <button
                          onClick={() => {
                            if (confirm(`Расформировать отдел «${dept.name}»? Команды не удаляются.`)) {
                              deleteMutation.mutate(dept.uid);
                            }
                          }}
                          className='p-1.5 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600 transition-colors'
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
        </Card>
      )}

      {showCreate && <CreateDepartmentDialog onClose={() => setShowCreate(false)} />}
      {manageDept && <ManageDepartmentDialog department={manageDept} onClose={() => setManageDept(null)} />}
    </div>
  );
}
