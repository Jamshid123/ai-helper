import { StrictMode } from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { I18nProvider } from './app/i18n'
import { routeTree } from './routeTree.gen'
import './index.css'

// тема — как в системе пользователя (светлая/тёмная), меняется на лету
const dark = window.matchMedia('(prefers-color-scheme: dark)')
const applyScheme = () => (document.documentElement.dataset.scheme = dark.matches ? 'dark' : 'light')
applyScheme()
dark.addEventListener('change', applyScheme)

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 10_000, retry: 1 } },
})
const router = createRouter({ routeTree, defaultPreload: 'intent' })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <RouterProvider router={router} />
      </I18nProvider>
    </QueryClientProvider>
  </StrictMode>
)
