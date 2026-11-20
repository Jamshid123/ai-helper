import React from 'react'
import { useNavigate } from '@tanstack/react-router'
import { ArrowRight, ChevronRight, Laptop, Moon, Sun } from 'lucide-react'
import { useSearch } from '@/context/search-provider'
import { useTheme } from '@/context/theme-provider'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import { useNavGroups } from './layout/use-nav-groups'
import { ScrollArea } from './ui/scroll-area'

export function CommandMenu() {
  const navigate = useNavigate()
  const { setTheme } = useTheme()
  const { open, setOpen } = useSearch()
  const navGroups = useNavGroups()

  const runCommand = React.useCallback(
    (command: () => unknown) => {
      setOpen(false)
      command()
    },
    [setOpen]
  )

  return (
    <CommandDialog modal open={open} onOpenChange={setOpen}>
      <CommandInput placeholder='Раздел или команда…' />
      <CommandList>
        <ScrollArea type='hover' className='h-72 pe-1'>
          <CommandEmpty>Ничего не найдено.</CommandEmpty>
          {navGroups.map((group) =>
            group.items.map((area) => (
              <CommandGroup key={area.title} heading={area.title}>
                {(area.tabs ?? []).map((tab) => (
                  <CommandItem
                    key={tab.url}
                    value={`${area.title} ${tab.title}`}
                    keywords={tab.keywords}
                    onSelect={() => {
                      runCommand(() => navigate({ to: tab.url }))
                    }}
                  >
                    <div className='flex size-4 items-center justify-center'>
                      <ArrowRight className='size-2 text-muted-foreground/80' />
                    </div>
                    {tab.title !== area.title ? (
                      <>
                        {area.title} <ChevronRight /> {tab.title}
                      </>
                    ) : (
                      tab.title
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))
          )}
          <CommandSeparator />
          <CommandGroup heading='Тема'>
            <CommandItem onSelect={() => runCommand(() => setTheme('light'))}>
              <Sun /> <span>Светлая</span>
            </CommandItem>
            <CommandItem onSelect={() => runCommand(() => setTheme('dark'))}>
              <Moon className='scale-90' />
              <span>Тёмная</span>
            </CommandItem>
            <CommandItem onSelect={() => runCommand(() => setTheme('system'))}>
              <Laptop />
              <span>Как в системе</span>
            </CommandItem>
          </CommandGroup>
        </ScrollArea>
      </CommandList>
    </CommandDialog>
  )
}
