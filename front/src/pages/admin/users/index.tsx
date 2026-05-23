import { useState } from 'react';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MagnifyingGlass, Pencil, Trash, UserPlus } from '@phosphor-icons/react';

import { adminUsersApi } from '@shared/api/admin.api';
import type { AdminUser, Role } from '@shared/types';
import { Button, Card, CardContent, CardHeader, CardTitle, Input } from '@shared/ui';
import { cn } from '@shared/lib/utils';

const ROLE_LABEL: Record<Role, string> = {
  ADMIN: 'Admin',
  HEAD: 'Head',
  LEAD: 'Lead',
  DEVELOPER: 'Developer'
};

const ROLE_COLOR: Record<Role, string> = {
  ADMIN: 'bg-purple-100 text-purple-700 border-purple-200',
  HEAD: 'bg-blue-100 text-blue-700 border-blue-200',
  LEAD: 'bg-green-100 text-green-700 border-green-200',
  DEVELOPER: 'bg-gray-100 text-gray-700 border-gray-200'
};

interface CreateUserDialogProps {
  onClose: () => void;
  onCreated: (result: { generatedPassword?: string }) => void;
}

function CreateUserDialog({ onClose, onCreated }: CreateUserDialogProps) {
  const [firstName, setFirstName] = useState('');
  const [secondName, setSecondName] = useState('');
  const [mail, setMail] = useState('');
  const [role, setRole] = useState<Role>('DEVELOPER');
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: () => adminUsersApi.createUser({ firstName, secondName, mail, role }),
    onSuccess: (data) => onCreated({ generatedPassword: data.generatedPassword }),
    onError: (e: Error) => setError(e.message)
  });

  return (
    <div className='fixed inset-0 bg-black/50 flex items-center justify-center z-50'>
      <div className='bg-background rounded-lg border shadow-lg p-6 w-full max-w-md space-y-4'>
        <h2 className='text-lg font-semibold'>Добавить пользователя</h2>

        <div className='space-y-3'>
          <div>
            <label className='text-sm font-medium'>Имя</label>
            <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder='Иван' className='mt-1' />
          </div>
          <div>
            <label className='text-sm font-medium'>Фамилия</label>
            <Input value={secondName} onChange={(e) => setSecondName(e.target.value)} placeholder='Иванов' className='mt-1' />
          </div>
          <div>
            <label className='text-sm font-medium'>Email</label>
            <Input value={mail} onChange={(e) => setMail(e.target.value)} placeholder='ivan@company.com' type='email' className='mt-1' />
          </div>
          <div>
            <label className='text-sm font-medium'>Роль</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              className='mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm'
            >
              <option value='DEVELOPER'>Developer</option>
              <option value='LEAD'>Lead</option>
              <option value='HEAD'>Head</option>
              <option value='ADMIN'>Admin</option>
            </select>
          </div>
        </div>

        {error && <p className='text-sm text-red-600'>{error}</p>}
        <p className='text-xs text-muted-foreground'>Пароль будет сгенерирован автоматически и показан один раз.</p>

        <div className='flex gap-2 justify-end'>
          <Button variant='outline' onClick={onClose}>Отмена</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !firstName || !secondName || !mail}
          >
            {mutation.isPending ? 'Создание...' : 'Создать'}
          </Button>
        </div>
      </div>
    </div>
  );
}

interface ChangeRoleDialogProps {
  user: AdminUser;
  onClose: () => void;
}

function ChangeRoleDialog({ user, onClose }: ChangeRoleDialogProps) {
  const [role, setRole] = useState<Role>(user.role);
  const [error, setError] = useState('');
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => adminUsersApi.changeRole(user.uid, role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      queryClient.invalidateQueries({ queryKey: ['admin-role-stats'] });
      onClose();
    },
    onError: (e: Error) => setError(e.message)
  });

  return (
    <div className='fixed inset-0 bg-black/50 flex items-center justify-center z-50'>
      <div className='bg-background rounded-lg border shadow-lg p-6 w-full max-w-sm space-y-4'>
        <h2 className='text-lg font-semibold'>Изменить роль</h2>
        <p className='text-sm text-muted-foreground'>
          {user.firstName} {user.secondName}
        </p>

        <select
          value={role}
          onChange={(e) => setRole(e.target.value as Role)}
          className='w-full rounded-md border border-input bg-background px-3 py-2 text-sm'
        >
          <option value='DEVELOPER'>Developer</option>
          <option value='LEAD'>Lead</option>
          <option value='HEAD'>Head</option>
          <option value='ADMIN'>Admin</option>
        </select>

        {error && <p className='text-sm text-red-600'>{error}</p>}

        <div className='flex gap-2 justify-end'>
          <Button variant='outline' onClick={onClose}>Отмена</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || role === user.role}>
            {mutation.isPending ? 'Сохранение...' : 'Сохранить'}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function AdminUsersPage() {
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [changeRoleUser, setChangeRoleUser] = useState<AdminUser | null>(null);
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: stats } = useQuery({
    queryKey: ['admin-role-stats'],
    queryFn: adminUsersApi.getRoleStats
  });

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-users', search, roleFilter],
    queryFn: () =>
      adminUsersApi.listUsers({
        search: search || undefined,
        role: roleFilter || undefined,
        limit: 50
      }),
    staleTime: 30_000
  });

  const deleteMutation = useMutation({
    mutationFn: (uid: string) => adminUsersApi.deleteUser(uid),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      queryClient.invalidateQueries({ queryKey: ['admin-role-stats'] });
    }
  });

  const reconcileMutation = useMutation({
    mutationFn: adminUsersApi.reconcileGitlabIdentities,
    onSuccess: (result) => {
      alert(`Reconcile завершён: создано ${result.created} / пропущено ${result.skipped}`);
    }
  });

  const handleCreated = (result: { generatedPassword?: string }) => {
    setShowCreate(false);
    queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    queryClient.invalidateQueries({ queryKey: ['admin-role-stats'] });
    if (result.generatedPassword) setGeneratedPassword(result.generatedPassword);
  };

  return (
    <div className='p-6 space-y-6 max-w-6xl'>
      <div className='flex items-center justify-between'>
        <div>
          <h1 className='text-2xl font-bold tracking-tight'>Пользователи</h1>
          <p className='text-muted-foreground text-sm mt-1'>Управление учётными записями</p>
        </div>
        <div className='flex gap-2'>
          <Button
            variant='outline'
            size='sm'
            onClick={() => reconcileMutation.mutate()}
            disabled={reconcileMutation.isPending}
          >
            {reconcileMutation.isPending ? 'Reconcile...' : 'GitLab Reconcile'}
          </Button>
          <Button className='gap-2' onClick={() => setShowCreate(true)}>
            <UserPlus size={16} />
            Добавить
          </Button>
        </div>
      </div>

      {/* Role stats */}
      {stats && (
        <div className='grid grid-cols-4 gap-3'>
          {(['ADMIN', 'HEAD', 'LEAD', 'DEVELOPER'] as Role[]).map((r) => (
            <Card key={r} className='cursor-pointer' onClick={() => setRoleFilter(roleFilter === r ? '' : r)}>
              <CardContent className='py-3 text-center'>
                <p className='text-2xl font-bold'>{stats[r]}</p>
                <p className={cn('text-xs font-medium mt-0.5', roleFilter === r ? 'text-primary' : 'text-muted-foreground')}>
                  {ROLE_LABEL[r]}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Search + filter */}
      <div className='flex gap-3'>
        <div className='relative flex-1'>
          <MagnifyingGlass size={16} className='text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2' />
          <Input
            placeholder='Поиск по имени или email...'
            className='pl-9'
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {roleFilter && (
          <Button variant='outline' onClick={() => setRoleFilter('')}>
            {ROLE_LABEL[roleFilter as Role]} ×
          </Button>
        )}
      </div>

      {/* Generated password notification */}
      {generatedPassword && (
        <div className='rounded-lg border border-yellow-200 bg-yellow-50 dark:bg-yellow-900/20 p-4'>
          <p className='text-sm font-medium text-yellow-800 dark:text-yellow-200'>
            Пользователь создан. Временный пароль (показывается один раз):
          </p>
          <code className='text-sm font-mono mt-1 block'>{generatedPassword}</code>
          <Button variant='outline' size='sm' className='mt-2' onClick={() => setGeneratedPassword(null)}>
            Закрыть
          </Button>
        </div>
      )}

      {/* Table */}
      <Card>
        <CardHeader className='pb-2'>
          <CardTitle className='text-base'>
            Список пользователей
            {data && <span className='text-muted-foreground font-normal text-sm ml-2'>({data.total})</span>}
          </CardTitle>
        </CardHeader>
        <CardContent className='p-0'>
          {isError && (
            <p className='text-sm text-muted-foreground text-center py-8'>
              Не удалось загрузить пользователей
            </p>
          )}
          {isLoading && <div className='h-40 bg-muted animate-pulse m-4 rounded' />}
          {!isLoading && data && (
            <div className='overflow-x-auto'>
              <table className='w-full text-sm'>
                <thead>
                  <tr className='bg-muted/50 text-left'>
                    <th className='px-4 py-2.5 font-medium'>Пользователь</th>
                    <th className='px-4 py-2.5 font-medium'>Email</th>
                    <th className='px-4 py-2.5 font-medium'>Роль</th>
                    <th className='px-4 py-2.5 font-medium'>Создан</th>
                    <th className='px-4 py-2.5 font-medium w-24'>Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((user) => (
                    <tr key={user.uid} className='border-t hover:bg-muted/30 transition-colors'>
                      <td className='px-4 py-2.5 font-medium'>
                        {user.firstName} {user.secondName}
                      </td>
                      <td className='px-4 py-2.5 text-muted-foreground'>{user.mail}</td>
                      <td className='px-4 py-2.5'>
                        <span className={cn('text-xs border px-2 py-0.5 rounded-full font-medium', ROLE_COLOR[user.role])}>
                          {ROLE_LABEL[user.role]}
                        </span>
                      </td>
                      <td className='px-4 py-2.5 text-muted-foreground text-xs'>
                        {new Date(user.createdAt).toLocaleDateString('ru-RU')}
                      </td>
                      <td className='px-4 py-2.5'>
                        <div className='flex gap-1'>
                          <button
                            onClick={() => setChangeRoleUser(user)}
                            className='p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors'
                            title='Изменить роль'
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            onClick={() => {
                              if (confirm(`Удалить ${user.firstName} ${user.secondName}?`)) {
                                deleteMutation.mutate(user.uid);
                              }
                            }}
                            className='p-1.5 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600 transition-colors'
                            title='Удалить'
                          >
                            <Trash size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {data.items.length === 0 && (
                    <tr>
                      <td colSpan={5} className='px-4 py-8 text-center text-muted-foreground text-sm'>
                        Пользователи не найдены
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {showCreate && (
        <CreateUserDialog
          onClose={() => setShowCreate(false)}
          onCreated={handleCreated}
        />
      )}
      {changeRoleUser && (
        <ChangeRoleDialog user={changeRoleUser} onClose={() => setChangeRoleUser(null)} />
      )}
    </div>
  );
}
