/**
 * Router — react-router v7 library mode.
 * AppShell is the layout route; all pages lazy-loaded.
 */

import { lazy, Suspense, type ReactElement } from 'react'
import { createBrowserRouter, RouterProvider } from 'react-router'
import AppShell from '@/components/layout/AppShell'
import { Skeleton } from '@/components/ui'

const DashboardPage = lazy(() => import('@/routes/dashboard'))
const OpportunitiesPage = lazy(() => import('@/routes/opportunities'))
const OpportunityDetailPage = lazy(() => import('@/routes/opportunities-detail'))
const TasksPage = lazy(() => import('@/routes/tasks'))
const CompaniesPage = lazy(() => import('@/routes/companies'))
const CompanyDetailPage = lazy(() => import('@/routes/companies-detail'))
const SignalsPage = lazy(() => import('@/routes/signals'))
const AgentsPage = lazy(() => import('@/routes/agents'))
const DailyBriefPage = lazy(() => import('@/routes/daily-brief'))
const ProfilePage = lazy(() => import('@/routes/profile'))

function lazyPage(element: ReactElement) {
  return <Suspense fallback={<PageFallback />}>{element}</Suspense>
}

function PageFallback() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-4 w-96 max-w-full" />
      <Skeleton className="mt-4 h-40 w-full" />
    </div>
  )
}

function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-24 text-center">
      <p className="font-mono text-6xl font-bold text-[var(--color-accent)]">404</p>
      <p className="text-sm text-[var(--color-muted)]">Nothing at this route.</p>
    </div>
  )
}

const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: lazyPage(<DashboardPage />) },
      { path: 'opportunities', element: lazyPage(<OpportunitiesPage />) },
      { path: 'opportunities/:id', element: lazyPage(<OpportunityDetailPage />) },
      { path: 'tasks', element: lazyPage(<TasksPage />) },
      { path: 'companies', element: lazyPage(<CompaniesPage />) },
      { path: 'companies/:id', element: lazyPage(<CompanyDetailPage />) },
      { path: 'signals', element: lazyPage(<SignalsPage />) },
      { path: 'agents', element: lazyPage(<AgentsPage />) },
      { path: 'daily-brief', element: lazyPage(<DailyBriefPage />) },
      { path: 'profile', element: lazyPage(<ProfilePage />) },
      { path: '*', element: <NotFound /> },
    ],
  },
])

export default function App() {
  return <RouterProvider router={router} />
}
