import { type InputHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
}

export function Input({ className, label, id, ...props }: InputProps) {
  if (label) {
    return (
      <div className="form-control w-full">
        <label className="label" htmlFor={id}>
          <span className="label-text">{label}</span>
        </label>
        <input
          id={id}
          className={cn('input input-bordered w-full', className)}
          {...props}
        />
      </div>
    )
  }

  return (
    <input
      id={id}
      className={cn('input input-bordered w-full', className)}
      {...props}
    />
  )
}
