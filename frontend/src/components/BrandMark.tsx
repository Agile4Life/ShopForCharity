export function BrandMark({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M24 4C31-2 36 7 33 13C43 10 49 19 40 24C49 31 42 39 34 36C36 47 26 52 22 42C15 51 5 44 9 35C-2 36-4 25 7 22C-3 15 5 5 14 10C12 0 22-3 24 4Z"
        fill="currentColor"
      />
      <circle cx="23" cy="24" r="12" fill="var(--paper)" />
      <path
        d="M19 21V23M27 21V23M18 27Q23 33 29 26"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
