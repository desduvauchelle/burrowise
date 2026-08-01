interface BrandMarkProps {
  className?: string;
}

export function BrandMark({ className }: BrandMarkProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M17 18C17 10.8 21.8 6 27 6c3.2 0 5 2.7 5 6v8"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <path
        d="M47 18C47 10.8 42.2 6 37 6c-3.2 0-5 2.7-5 6v8"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <path
        d="M50 23.5C46.1 19.8 39.7 18 32 18s-14.1 1.8-18 5.5C10.7 26.6 9 30.3 9 34c0 3.2 1.3 6 3.8 8.4C16.6 46 23 47.8 32 47.8c6.6 0 10.8-1.4 13.1-3.5 1.8-1.7 2.7-3.6 2.7-5.7 0-2.4-1.1-4.4-3.4-6-2.5-1.8-6.6-2.7-12.4-2.7-4.8 0-8.1.7-10 2.2-1.4 1.1-2.1 2.4-2.1 3.9 0 1.3.6 2.4 1.7 3.4 1.8 1.5 5.2 2.3 10.4 2.3 3.8 0 6.2-.5 7.4-1.4"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="32" cy="55" r="3.5" fill="currentColor" />
    </svg>
  );
}
