import { useNavigate } from 'react-router';

import { Users } from '@phosphor-icons/react';

import type { TeamListItem } from '@shared/types';
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@shared/ui';

interface TeamSelectorProps {
  teams: TeamListItem[];
}

export function TeamSelector({ teams }: TeamSelectorProps) {
  const navigate = useNavigate();

  return (
    <div className='space-y-4'>
      <div>
        <h1 className='text-2xl font-bold tracking-tight'>Дашборд команды</h1>
        <p className='text-muted-foreground text-sm mt-1'>Выберите команду для просмотра метрик</p>
      </div>

      {teams.length === 0 ? (
        <Card>
          <CardContent className='flex flex-col items-center gap-3 py-10 text-center'>
            <Users size={40} className='text-muted-foreground' weight='duotone' />
            <div>
              <p className='font-medium'>Вы не состоите ни в одной команде</p>
              <p className='text-sm text-muted-foreground mt-1'>
                Обратитесь к администратору для добавления в команду
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-3'>
          {teams.map((team) => (
            <Card
              key={team.uid}
              className='cursor-pointer hover:border-primary/50 transition-colors'
              onClick={() => navigate(`/teams/${team.uid}`)}
            >
              <CardHeader className='pb-2'>
                <CardTitle className='text-base'>{team.name}</CardTitle>
              </CardHeader>
              <CardContent>
                {team.myRole && (
                  <Badge variant={team.myRole === 'LEAD' ? 'success' : 'secondary'} className='text-xs'>
                    {team.myRole === 'LEAD' ? 'Тимлид' : 'Разработчик'}
                  </Badge>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
