export function Logo({ className = "w-7 h-7" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="32" height="32" rx="8" fill="#F7F8F8" />
      <path d="M8 16L14 10L20 16L26 10" stroke="#08090A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M8 22L14 16L20 22L26 16" stroke="#08090A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.45"/>
    </svg>
  );
}
