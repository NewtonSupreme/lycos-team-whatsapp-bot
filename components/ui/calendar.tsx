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
          'h-8 w-8 bg-transparent p-0 hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors absolute left-1'
        ),
        button_next: cn(
          buttonVariants({ variant: 'ghost' }),
          'h-8 w-8 bg-transparent p-0 hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors absolute right-1'
        ),
        month_grid: 'w-full border-collapse space-y-1',
        weekdays: 'flex justify-between',
        weekday:
          'text-muted-foreground rounded-md w-9 font-medium text-[0.75rem] uppercase tracking-wider text-center flex-1',
        week: 'flex w-full mt-2 justify-between',
        day: cn(
          'relative p-0 text-center text-sm focus-within:relative focus-within:z-20 [&:has([aria-selected])]:bg-accent/50 first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md flex-1',
          props.mode === 'range'
            ? '[&:has(>.day-range-end)]:rounded-r-md [&:has(>.day-range-start)]:rounded-l-md'
            : '[&:has([aria-selected])]:rounded-md'
        ),
        day_button: cn(
          buttonVariants({ variant: 'ghost' }),
          'h-9 w-9 p-0 font-normal aria-selected:opacity-100 hover:bg-white/10 rounded-md transition-all duration-200'
        ),
        range_start: 'day-range-start',
        range_end: 'day-range-end',
        selected:
          'bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground shadow-[0_0_15px_rgba(249,115,22,0.3)] font-bold',
        today: 'bg-white/5 text-primary font-bold border border-primary/20',
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
