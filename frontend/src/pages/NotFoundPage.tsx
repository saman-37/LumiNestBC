import { Link } from 'react-router'
import { PageShell } from '../components/PageShell'

export default function NotFoundPage() {
  return (
    <PageShell>
      <h1 className="text-2xl font-bold">Page not found</h1>
      <Link to="/" className="mt-6 flex min-h-14 items-center justify-center rounded-2xl bg-light text-lg font-semibold text-ink-on-light">
        Back to the map
      </Link>
    </PageShell>
  )
}
