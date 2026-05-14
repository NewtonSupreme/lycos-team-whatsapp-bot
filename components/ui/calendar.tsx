'use client';

import * as React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { DayPicker } from 'react-day-picker';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn('p-4', className)}
      classNames={{
        months: 'flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0',
        month: 'space-y-4 px-1',
        month_caption: 'flex justify-center pt-1 relative items-center mb-2',
        caption_label: 'text-sm font-semibold tracking-tight text-foreground',
        nav: 'space-x-1 flex items-center',
        button_previous: cn(
          buttonVariants({ variant: 'ghost' }),
          'h-8 w-8 bg-transparent p-0 hover:bg-accent text-muted-foreground hover:text-foreground transition-colors absolute left-1'
        ),
        button_next: cn(
          buttonVariants({ variant: 'ghost' }),
          'h-8 w-8 bg-transparent p-0 hover:bg-accent text-muted-foreground hover:text-foreground transition-colors absolute right-1'
        ),
        month_grid: 'w-full border-collapse space-y-1',
        weekdays: 'flex justify-between',
        weekday:
          'text-muted-foreground rounded-md w-9 font-medium text-[0.75rem] uppercase tracking-wider text-center flex-1',
        week: 'flex w-full mt-2 justify-between',
        day: cn(
          'relative p-0 text-center text-sm focus-within:relative focus-within:z-20 flex-1',
          props.mode === 'range'
            ? '[&:has(>.day-range-end)]:rounded-r-md [&:has(>.day-range-start)]:rounded-l-md'
            : '[&:has([aria-selected])]:rounded-md'
        ),
        day_button: cn(
          buttonVariants({ variant: 'ghost' }),
          'h-9 w-9 p-0 font-normal transition-all duration-200',
          'aria-selected:bg-primary aria-selected:text-white dark:aria-selected:text-primary-foreground aria-selected:opacity-100 aria-selected:hover:bg-primary/90 aria-selected:hover:text-white dark:aria-selected:hover:text-primary-foreground aria-selected:font-bold aria-selected:scale-110'
        ),
        range_start: 'day-range-start',
        range_end: 'day-range-end',
        selected: 'bg-transparent',
        today: 'text-primary font-black border-2 border-primary/30 ring-2 ring-primary/10 bg-primary/5 rounded-md',
        outside:
          'day-outside text-muted-foreground/30 aria-selected:bg-accent/50 aria-selected:text-muted-foreground/30 aria-selected:opacity-30',
        disabled: 'text-muted-foreground opacity-50',
        range_middle:
          'aria-selected:bg-accent aria-selected:text-accent-foreground',
        hidden: 'invisible',
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation }) => {
          const Icon = orientation === 'left' ? ChevronLeft : ChevronRight;
          return <Icon className="h-5 w-5" />;
        },
      }}
      {...props}
    />
  );
}
Calendar.displayName = 'Calendar';

export { Calendar };
