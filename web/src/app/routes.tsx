import { Navigate, type RouteObject } from 'react-router'
import { Layout } from './Layout'
import { CertificateListPage } from '../pages/CertificateListPage'
import { CertificateDetailPage } from '../pages/CertificateDetailPage'
import { BulkIssuePage } from '../pages/BulkIssuePage'
import { AuditLogPage } from '../pages/AuditLogPage'
import { NotFoundPage } from '../pages/NotFoundPage'

/** Route table shared by the browser router (main.tsx) and memory routers in tests. */
export const routes: RouteObject[] = [
  {
    element: <Layout />,
    children: [
      { index: true, element: <Navigate to="/certificates" replace /> },
      { path: 'certificates', element: <CertificateListPage /> },
      { path: 'certificates/:id', element: <CertificateDetailPage /> },
      { path: 'bulk-issue', element: <BulkIssuePage /> },
      { path: 'audit', element: <AuditLogPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]
