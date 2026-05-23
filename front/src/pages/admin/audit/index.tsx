import { ClipboardText, MagnifyingGlass } from '@phosphor-icons/react';

import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input } from '@shared/ui';

export default function AdminAuditPage() {
  return (
    <div className='p-6 space-y-6'>
      <div className='flex items-center justify-between'>
        <div>
          <h1 className='text-2xl font-bold tracking-tight'>Журнал аудита</h1>
          <p className='text-muted-foreground text-sm mt-1'>
            История всех действий в системе
          </p>
        </div>
        <Button variant='outline' className='gap-2'>
          Экспорт CSV
        </Button>
      </div>

      <Card>
        <CardHeader className='pb-3'>
          <CardTitle>Фильтры</CardTitle>
        </CardHeader>
        <CardContent>
          <div className='flex gap-3'>
            <div className='relative flex-1'>
              <MagnifyingGlass
                size={16}
                className='text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2'
              />
              <Input placeholder='Поиск по действию...' className='pl-9' />
            </div>
            <Button variant='outline'>Применить</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className='flex items-center gap-2'>
            <ClipboardText size={20} className='text-primary' weight='duotone' />
            <CardTitle>События</CardTitle>
          </div>
          <CardDescription>Раздел 7.5 — в разработке</CardDescription>
        </CardHeader>
        <CardContent>
          <p className='text-muted-foreground text-sm'>
            Здесь будет таблица событий с фильтрацией по действию, пользователю, сущности и
            периоду, с пагинацией и экспортом в CSV.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
