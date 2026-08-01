import { type HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

const variants = {
  default: 'badge-primary',
  secondary: 'badge-secondary',
  outline: 'badge-outline',
  ghost: 'badge-ghost',
  success: 'badge-success',
  warning: 'badge-warning',
  error: 'badge-error',
  info: 'badge-info',
} as const

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: keyof typeof variants
}

export function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  return (
    <span className={cn('badge', variants[variant], className)} {...props} />
  )
}
