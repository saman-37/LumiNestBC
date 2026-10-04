import { Link } from 'react-router'
import { classes } from '../components/Button'
import { PageShell } from '../components/PageShell'

export default function NotFoundPage() {
  return (
    <PageShell>
      <h1 className="mt-4 font-display text-[22px] font-bold">This light is off</h1>
      <p className="mt-1 text-[15px] text-text-3">We couldn't find that page.</p>
      <Link to="/" className={classes('primary', 'lg', 'mt-6')}>
        Back to the map
      </Link>
    </PageShell>
  )
}
