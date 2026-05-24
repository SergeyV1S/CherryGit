import { useState } from 'react';

import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from '@phosphor-icons/react';
import { useNavigate, useParams } from 'react-router';

import { teamsApi } from '@shared/api/teams.api';
import { useAuth } from '@shared/hooks';
import { Badge, Button, Card, CardContent, FormulaBlock } from '@shared/ui';

const METRICS_FORMULAS = [
  {
    name: 'Cycle Time MR — медиана',
    formula: 'median(mergedAt − createdAt) по merged MR за период',
    description: 'Полное время жизни MR. Черновики (draft) исключаются.'
  },
  {
    name: 'Фазы Cycle Time',
    formula: 'До ревью: firstReviewAt − createdAt | В ревью: approvedAt − firstReviewAt | После апрува: mergedAt − approvedAt',
    description: 'Декомпозиция по фазам помогает определить, где теряется время.'
  },
  {
    name: 'MR Size',
    formula: 'linesAdded + linesRemoved → бакеты: ≤50, 51–200, 201–400, 401–800, >800',
    description: 'Распределение по размеру. Большие MR коррелируют с длительным ревью.'
  }
];

const BF_FORMULAS = [
  {
    name: 'Bus Factor по модулю',
    formula: 'count(distinct authors | merged MR touching module, last 90 days)',
    description: 'Число активных контрибьюторов модуля. Красный — 1 автор (критический риск), жёлтый — 2, зелёный — ≥3.'
  },
  {
    name: 'Определение модуля',
    formula: 'Первая директория пути файла (авто) или явная настройка code_modules',
    description: 'Автоматические модули берут первую директорию пути. Явные задаются администратором через code_modules.'
  }
];

import { BusFactorTable } from './components/BusFactorTable';
import { TeamCycleTimeMrCard } from './components/TeamCycleTimeMrCard';
import { TeamDoraPanel } from './components/TeamDoraPanel';
import { TeamMrSizeCard } from './components/TeamMrSizeCard';
import { TeamSelector } from './components/TeamSelector';
import { PeriodSelector } from '../me/components/PeriodSelector';

function getPeriodDates(days: number): { periodStart: Date; periodEnd: Date } {
  const periodEnd = new Date();
  const periodStart = new Date();
  periodStart.setDate(periodStart.getDate() - days);
  return { periodStart, periodEnd };
}

type TabKey = 'metrics' | 'dora' | 'bus-factor';

const DORA_FORMULAS = [
  {
    name: 'Lead Time for Changes',
    formula: 'deployedAt − MIN(commits.committedAt for c in mr_commits)',
    description: 'Время от первого коммита MR до его деплоя в продакшен (отображается медиана и p90).'
  },
  {
    name: 'Deployment Frequency',
    formula: 'count(successful_deploys) / period; per-day категоризация DORA (elite/high/medium/low)',
    description: 'Частота деплоев в продакшен. Парная метрика к Change Failure Rate (FR-06).'
  },
  {
    name: 'Change Failure Rate',
    formula: 'count(deploys с isHotfix OR isRevert) / count(all deploys) × 100%',
    description: 'Доля деплоев, потребовавших хотфикса или отката. Метки определяются админом в настройках проекта.'
  }
];

function TeamDashboard({ teamUid }: { teamUid: string }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [periodDays, setPeriodDays] = useState(30);
  const [activeTab, setActiveTab] = useState<TabKey>('metrics');

  const { periodStart, periodEnd } = getPeriodDates(periodDays);
  const membership = user?.teams.find((t) => t.uid === teamUid);

  const { data: ctData, isLoading: ctLoading } = useQuery({
    queryKey: ['team-cycle-time-mr', teamUid, periodDays],
    queryFn: () => teamsApi.getCycleTimeMr(teamUid, periodStart, periodEnd),
    enabled: activeTab === 'metrics'
  });

  const { data: mrSizeData, isLoading: mrSizeLoading } = useQuery({
    queryKey: ['team-mr-size', teamUid, periodDays],
    queryFn: () => teamsApi.getMrSize(teamUid, periodStart, periodEnd),
    enabled: activeTab === 'metrics'
  });

  const { data: bfData, isLoading: bfLoading } = useQuery({
    queryKey: ['team-bus-factor', teamUid],
    queryFn: () => teamsApi.getBusFactor(teamUid, 90),
    enabled: activeTab === 'bus-factor'
  });

  const teamName = membership?.name ?? 'Команда';

  return (
    <div className='p-6 space-y-6 max-w-5xl'>
      {/* Header */}
      <div className='flex items-center gap-3'>
        <Button variant='ghost' size='icon-sm' onClick={() => navigate('/teams')}>
          <ArrowLeft size={16} />
        </Button>
        <div className='flex-1'>
          <div className='flex items-center gap-2'>
            <h1 className='text-2xl font-bold tracking-tight'>{teamName}</h1>
            {membership && (
              <Badge variant={membership.myRole === 'LEAD' ? 'success' : 'secondary'}>
                {membership.myRole === 'LEAD' ? 'Тимлид' : 'Разработчик'}
              </Badge>
            )}
          </div>
          <p className='text-muted-foreground text-sm mt-0.5'>Командные метрики разработки</p>
        </div>
      </div>

      {/* Tabs */}
      <div className='flex items-center gap-4 border-b'>
        <button
          onClick={() => setActiveTab('metrics')}
          className={`pb-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'metrics'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Метрики
        </button>
        <button
          onClick={() => setActiveTab('dora')}
          className={`pb-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'dora'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          DORA
        </button>
        <button
          onClick={() => setActiveTab('bus-factor')}
          className={`pb-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'bus-factor'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Bus Factor
        </button>
      </div>

      {/* Metrics tab */}
      {activeTab === 'metrics' && (
        <div className='space-y-6'>
          <div className='flex justify-end'>
            <PeriodSelector selected={periodDays} onChange={setPeriodDays} />
          </div>

          {(ctLoading || mrSizeLoading) && (
            <div className='grid gap-4 md:grid-cols-2'>
              <div className='h-80 bg-muted animate-pulse rounded-lg' />
              <div className='h-80 bg-muted animate-pulse rounded-lg' />
            </div>
          )}

          {!ctLoading && !mrSizeLoading && ctData && mrSizeData && (
            <div className='grid gap-4 md:grid-cols-2'>
              <TeamCycleTimeMrCard value={ctData.value} />
              <TeamMrSizeCard value={mrSizeData.value} />
            </div>
          )}

          {!ctLoading && !mrSizeLoading && (!ctData || !mrSizeData) && (
            <Card>
              <CardContent className='py-8 text-center'>
                <p className='text-sm text-muted-foreground'>
                  Не удалось загрузить метрики. Убедитесь, что у команды есть проекты и они
                  синхронизированы.
                </p>
              </CardContent>
            </Card>
          )}

          <FormulaBlock entries={METRICS_FORMULAS} />
        </div>
      )}

      {/* DORA tab */}
      {activeTab === 'dora' && (
        <div className='space-y-6'>
          <div className='flex justify-end'>
            <PeriodSelector selected={periodDays} onChange={setPeriodDays} />
          </div>
          <TeamDoraPanel
            teamUid={teamUid}
            periodStart={periodStart}
            periodEnd={periodEnd}
          />
          <FormulaBlock entries={DORA_FORMULAS} />
        </div>
      )}

      {/* Bus Factor tab */}
      {activeTab === 'bus-factor' && (
        <div className='space-y-4'>
          {bfLoading && <div className='h-80 bg-muted animate-pulse rounded-lg' />}

          {!bfLoading && bfData && <BusFactorTable value={bfData.value} />}

          {!bfLoading && !bfData && (
            <Card>
              <CardContent className='py-8 text-center'>
                <p className='text-sm text-muted-foreground'>
                  Не удалось загрузить Bus Factor. Убедитесь, что у команды есть проекты и они
                  синхронизированы.
                </p>
              </CardContent>
            </Card>
          )}

          <FormulaBlock entries={BF_FORMULAS} />
        </div>
      )}
    </div>
  );
}

export default function TeamsPage() {
  const params = useParams();
  const teamUid = params.teamUid;

  const { data: teams, isLoading } = useQuery({
    queryKey: ['teams-list'],
    queryFn: () => teamsApi.listTeams()
  });

  if (isLoading) {
    return (
      <div className='p-6 space-y-4'>
        <div className='h-8 w-64 bg-muted animate-pulse rounded' />
        <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-3'>
          {[1, 2, 3].map((i) => (
            <div key={i} className='h-24 bg-muted animate-pulse rounded-lg' />
          ))}
        </div>
      </div>
    );
  }

  if (teamUid) {
    return <TeamDashboard teamUid={teamUid} />;
  }

  return (
    <div className='p-6'>
      <TeamSelector teams={teams ?? []} />
    </div>
  );
}
