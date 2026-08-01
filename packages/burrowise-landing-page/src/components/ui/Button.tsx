import { type ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

const variants = {
  default: 'btn-primary',
  secondary: 'btn-secondary',
  destructive: 'btn-error',
  outline: 'btn-outline',
  ghost: 'btn-ghost',
  link: 'btn-link',
} as const

const sizes = {
  default: '',
  sm: 'btn-sm',
  lg: 'btn-lg',
  icon: 'btn-square btn-sm',
} as const

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof variants
  size?: keyof typeof sizes
}

export function Button({
  className,
  variant = 'default',
  size = 'default',
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn('btn', variants[variant], sizes[size], className)}
      {...props}
    />
  )
}
