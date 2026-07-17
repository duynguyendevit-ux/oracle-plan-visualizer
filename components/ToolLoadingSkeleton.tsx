interface ToolLoadingSkeletonProps {
  panels?: number
}

export default function ToolLoadingSkeleton({ panels = 2 }: ToolLoadingSkeletonProps) {
  return (
    <div className="mx-auto w-full max-w-[1600px] animate-pulse p-4 md:p-6" aria-label="Loading tool">
      <div className="mb-6 h-7 w-52 bg-surface-container-high" />
      <div className={`grid grid-cols-1 gap-4 ${panels > 1 ? 'lg:grid-cols-2' : ''}`}>
        {Array.from({ length: panels }, (_, index) => (
          <div key={index} className="border border-outline-variant/60 bg-surface-container-low">
            <div className="flex h-12 items-center justify-between bg-surface-container px-4">
              <div className="h-4 w-32 bg-surface-container-high" />
              <div className="h-8 w-20 bg-surface-container-high" />
            </div>
            <div className="space-y-3 p-4">
              <div className="h-4 w-4/5 bg-surface-container" />
              <div className="h-4 w-2/3 bg-surface-container" />
              <div className="h-48 bg-surface-container" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
