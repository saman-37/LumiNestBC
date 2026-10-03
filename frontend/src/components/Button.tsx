import type { AnchorHTMLAttributes, ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'secondary' | 'danger'

// Every button is at least 56px tall (min-h-14).
const BASE =
  'inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl px-5 text-lg font-semibold ' +
  'transition-colors disabled:cursor-not-allowed disabled:opacity-50 ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-light'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-light text-ink-on-light hover:bg-light-soft',
  secondary: 'border border-line bg-surface-2 text-ink hover:bg-line',
  danger: 'border border-stale/60 bg-transparent text-stale hover:bg-stale/10',
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }

export function Button({ variant = 'primary', className = '', type = 'button', ...props }: ButtonProps) {
  return <button type={type} className={`${BASE} ${VARIANTS[variant]} ${className}`} {...props} />
}

type LinkButtonProps = AnchorHTMLAttributes<HTMLAnchorElement> & { variant?: Variant }

export function LinkButton({ variant = 'primary', className = '', ...props }: LinkButtonProps) {
  return <a className={`${BASE} ${VARIANTS[variant]} ${className}`} {...props} />
}
