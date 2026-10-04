import type { AnchorHTMLAttributes, ButtonHTMLAttributes } from 'react'

export type Variant = 'primary' | 'outline-green' | 'outline' | 'surface' | 'danger'
type Size = 'lg' | 'md'

// Primary actions are 56px (lg); secondary actions are 48px (md).
const BASE =
  'inline-flex w-full select-none items-center justify-center gap-2 rounded-[12px] px-4 font-semibold ' +
  'transition-[background-color,border-color,filter,transform] duration-150 active:scale-[0.98] ' +
  'disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100'

const SIZES: Record<Size, string> = {
  lg: 'min-h-14 text-[16px]',
  md: 'min-h-12 text-[15px]',
}

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-green-strong text-white hover:brightness-[0.92]',
  'outline-green': 'border border-green-strong bg-surface text-green-strong hover:bg-green-tint',
  outline: 'border border-border-strong bg-surface text-text hover:bg-surface-2',
  surface: 'border border-border bg-surface text-text shadow-[var(--shadow-card)] hover:bg-surface-2',
  danger: 'border border-red-tint-border bg-surface text-red-text hover:bg-red-tint',
}

export function classes(variant: Variant = 'primary', size: Size = 'lg', extra = '') {
  return `${BASE} ${SIZES[size]} ${VARIANTS[variant]} ${extra}`
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }

export function Button({ variant = 'primary', size = 'lg', className = '', type = 'button', ...props }: ButtonProps) {
  return <button type={type} className={classes(variant, size, className)} {...props} />
}

type LinkButtonProps = AnchorHTMLAttributes<HTMLAnchorElement> & { variant?: Variant; size?: Size }

export function LinkButton({ variant = 'primary', size = 'lg', className = '', ...props }: LinkButtonProps) {
  return <a className={classes(variant, size, className)} {...props} />
}
