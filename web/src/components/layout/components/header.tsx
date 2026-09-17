import { SidebarTrigger } from '@/components/ui/sidebar'
import { cn } from '@/lib/utils'

type HeaderProps = React.HTMLAttributes<HTMLElement>

export function Header({ className, children, ...props }: HeaderProps) {
  return (
    <header
      className={cn(
        'sticky top-0 z-40 h-[var(--app-header-height,3rem)] w-full shrink-0 bg-transparent',
        className
      )}
      {...props}
    >
      <div className='flex h-full min-w-0 items-center gap-1.5 px-2 sm:gap-2 sm:px-3'>
        <div
          data-slot='sidebar-trigger-slot'
          className='flex size-8 shrink-0 items-center justify-center'
        >
          <SidebarTrigger variant='ghost' className='size-8' />
        </div>
        <div className='flex min-w-0 flex-1 items-center gap-1.5 sm:gap-2'>
          {children}
        </div>
      </div>
    </header>
  )
}
