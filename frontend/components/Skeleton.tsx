/** Skeleton placeholder components for loading states. */

interface SkeletonProps {
  className?: string;
}

/** Single skeleton line / block. */
export function Skeleton({ className = "" }: SkeletonProps) {
  return <div className={`skeleton ${className}`} aria-hidden="true" />;
}

/** Full skeleton table body — replaces the "Loading…" <tr>. */
export function SkeletonRows({ rows = 5, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={r} className="border-b last:border-0" style={{ borderColor: "var(--gridline)" }}>
          {Array.from({ length: cols }).map((_, c) => (
            <td key={c} className="px-4 py-3">
              <Skeleton className={`h-4 ${c === 0 ? "w-3/4" : "w-1/2"}`} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

/** Skeleton stat card. */
export function SkeletonCard() {
  return (
    <div className="rounded-lg border p-5" style={{ borderColor: "var(--border)", backgroundColor: "var(--surface-1)" }}>
      <Skeleton className="mb-2 h-8 w-16" />
      <Skeleton className="h-3 w-24" />
    </div>
  );
}
