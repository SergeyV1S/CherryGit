import { useState } from 'react';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CaretDown, CaretRight, Plus, Trash, Users } from '@phosphor-icons/react';

import { adminTeamsApi } from '@shared/api/admin.api';
import type { AdminTeam, AdminTeamMember } from '@shared/types';
import { Button, Card, CardContent, CardHeader, CardTitle, Input } from '@shared/ui';
import { cn } from '@shared/lib/utils';

const MEMBER_ROLE_LABEL = { DEVELOPER: 'Developer', LEAD: 'Lead' };
const MEMBER_ROLE_COLOR = {
  DEVELOPER: 'bg-gray-100 text-gray-700 border-gray-200',
  LEAD: 'bg-green-100 text-green-700 border-green-200'
};

interface CreateTeamDialogProps {
  onClose: () => void;
}

function CreateTeamDialog({ onClose }: CreateTeamDialogProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => adminTeamsApi.createTeam({ name, description: description || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-teams'] });
      onClose();
    },
    onError: (e: Error) => setError(e.message)
  });

  return (
    <div className='fixed inset-0 bg-black/50 flex items-center justify-center z-50'>
      <div className='bg-background rounded-lg border shadow-lg p-6 w-full max-w-md space-y-4'>
        <h2 className='text-lg font-semibold'>Создать команду</h2>
        <div className='space-y-3'>
          <div>
            <label className='text-sm font-medium'>Название</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder='Backend Team' className='mt-1' />
          </div>
          <div>
            <label className='text-sm font-medium'>Описание (опционально)</label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder='Описание команды' className='mt-1' />
          </div>
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

function MembersPanel({ team }: { team: AdminTeam }) {
  const queryClient = useQueryClient();
  const [userUid, setUserUid] = useState('');
  const [memberRole, setMemberRole] = useState<'DEVELOPER' | 'LEAD'>('DEVELOPER');

  const { data: members, isLoading } = useQuery({
    queryKey: ['admin-team-members', team.uid],
    queryFn: () => adminTeamsApi.listMembers(team.uid)
  });

  const addMutation = useMutation({
    mutationFn: () => adminTeamsApi.addMember(team.uid, { userUid, role: memberRole }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-team-members', team.uid] });
      setUserUid('');
    }
  });

  const removeMutation = useMutation({
    mutationFn: (memberUid: string) => adminTeamsApi.removeMember(team.uid, memberUid),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-team-members', team.uid] })
  });

  if (isLoading) return <div className='h-20 bg-muted animate-pulse rounded mt-3' />;

  return (
    <div className='mt-3 space-y-3'>
      {/* Add member form */}
      <div className='flex gap-2'>
        <Input
          placeholder='UID пользователя'
          value={userUid}
          onChange={(e) => setUserUid(e.target.value)}
          className='flex-1 text-xs h-8'
        />
        <select
          value={memberRole}
          onChange={(e) => setMemberRole(e.target.value as 'DEVELOPER' | 'LEAD')}
          className='rounded-md border border-input bg-background px-2 py-1 text-xs'
        >
          <option value='DEVELOPER'>Developer</option>
          <option value='LEAD'>Lead</option>
        </select>
        <Button size='sm' onClick={() => addMutation.mutate()} disabled={addMutation.isPending || !userUid} className='h-8 text-xs'>
          +
        </Button>
      </div>

      {/* Members list */}
      {members && members.length === 0 && (
        <p className='text-xs text-muted-foreground'>Нет участников</p>
      )}
      {members && members.map((m: AdminTeamMember) => (
        <div key={m.uid} className='flex items-center justify-between py-1.5 border-b last:border-0'>
          <div className='flex items-center gap-2'>
            <span className='text-sm'>{m.firstName} {m.secondName}</span>
            <span className={cn('text-xs border px-1.5 py-0.5 rounded-full', MEMBER_ROLE_COLOR[m.role])}>
              {MEMBER_ROLE_LABEL[m.role]}
            </span>
          </div>
          <button
            onClick={() => removeMutation.mutate(m.uid)}
            className='p-1 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600 transition-colors'
          >
            <Trash size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}

function TeamRow({ team }: { team: AdminTeam }) {
  const [expanded, setExpanded] = useState(false);
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: () => adminTeamsApi.deleteTeam(team.uid),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-teams'] })
  });

  return (
    <div className='border rounded-lg'>
      <div
        className='flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/30 transition-colors'
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? <CaretDown size={16} /> : <CaretRight size={16} />}
        <div className='flex-1 min-w-0'>
          <p className='font-medium text-sm'>{team.name}</p>
          {team.description && (
            <p className='text-xs text-muted-foreground truncate'>{team.description}</p>
          )}
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (confirm(`Удалить команду «${team.name}»?`)) deleteMutation.mutate();
          }}
          className='p-1.5 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600 transition-colors'
        >
          <Trash size={14} />
        </button>
      </div>
      {expanded && (
        <div className='border-t px-4 pb-3'>
          <p className='text-xs text-muted-foreground mt-2 mb-1 font-medium uppercase tracking-wide'>Участники</p>
          <MembersPanel team={team} />
        </div>
      )}
    </div>
  );
}

export default function AdminTeamsPage() {
  const [showCreate, setShowCreate] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-teams'],
    queryFn: adminTeamsApi.listTeams
  });

  return (
    <div className='p-6 space-y-6 max-w-4xl'>
      <div className='flex items-center justify-between'>
        <div>
          <h1 className='text-2xl font-bold tracking-tight'>Команды</h1>
          <p className='text-muted-foreground text-sm mt-1'>Управление командами разработки</p>
        </div>
        <Button className='gap-2' onClick={() => setShowCreate(true)}>
          <Plus size={16} />
          Создать команду
        </Button>
      </div>

      {isError && (
        <Card>
          <CardContent className='py-8 text-center'>
            <p className='text-sm text-muted-foreground'>Не удалось загрузить команды</p>
          </CardContent>
        </Card>
      )}

      {isLoading && (
        <div className='space-y-3'>
          {[1, 2, 3].map((i) => <div key={i} className='h-16 bg-muted animate-pulse rounded-lg' />)}
        </div>
      )}

      {!isLoading && data && data.length === 0 && (
        <Card>
          <CardContent className='py-10 text-center'>
            <Users size={32} className='text-muted-foreground mx-auto mb-2' weight='duotone' />
            <p className='font-medium'>Нет команд</p>
            <p className='text-sm text-muted-foreground mt-1'>Создайте первую команду</p>
          </CardContent>
        </Card>
      )}

      {!isLoading && data && data.length > 0 && (
        <Card>
          <CardHeader className='pb-2'>
            <CardTitle className='text-base'>
              Список команд{' '}
              <span className='text-muted-foreground font-normal text-sm'>({data.length})</span>
            </CardTitle>
          </CardHeader>
          <CardContent className='space-y-2'>
            {data.map((team) => <TeamRow key={team.uid} team={team} />)}
          </CardContent>
        </Card>
      )}

      {showCreate && <CreateTeamDialog onClose={() => setShowCreate(false)} />}
    </div>
  );
}
