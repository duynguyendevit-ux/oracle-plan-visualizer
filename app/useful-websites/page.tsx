import { usefulWebsites } from '@/data/useful-websites'

function websiteHost(url: string) {
  return new URL(url).hostname.replace(/^www\./, '')
}

export default function UsefulWebsites() {
  return (
    <div className="mx-auto w-full max-w-7xl p-4 md:p-6">
      <header className="mb-5 border-b border-outline-variant/60 pb-5">
        <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-primary">Tài nguyên chọn lọc</p>
        <h1 className="text-2xl font-semibold text-on-surface md:text-3xl">Web hữu ích</h1>
        <p className="mt-2 max-w-3xl text-sm text-on-surface-variant">
          Danh sách website hỗ trợ kiểm tra, phân tích và xử lý công việc kỹ thuật hằng ngày.
        </p>
      </header>

      <section aria-labelledby="website-list-heading">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 id="website-list-heading" className="text-sm font-semibold text-on-surface">Danh sách website</h2>
          <span className="text-xs text-on-surface-variant">{usefulWebsites.length} website</span>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {usefulWebsites.map((website) => (
            <article key={website.url} className="flex min-h-64 flex-col border border-outline-variant/60 bg-surface-container-low">
              <div className="flex items-start gap-4 border-b border-outline-variant/60 bg-surface-container p-4">
                <div className="flex h-10 w-10 flex-none items-center justify-center bg-primary text-lg font-semibold text-white" aria-hidden="true">
                  {website.name.charAt(0)}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-lg font-semibold text-on-surface">{website.name}</h3>
                  <p className="mt-1 truncate font-mono text-xs text-on-surface-variant">{websiteHost(website.url)}</p>
                </div>
              </div>

              <div className="flex flex-1 flex-col p-4">
                <p className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-primary">{website.category}</p>
                <p className="flex-1 text-sm leading-6 text-on-surface-variant">{website.description}</p>
                <a
                  href={website.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Mở ${website.name} trong tab mới`}
                  className="mt-5 inline-flex min-h-10 w-full items-center justify-center gap-2 bg-primary px-4 text-sm font-semibold text-white transition-colors hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 sm:w-auto sm:self-start"
                >
                  Mở website
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                    <path d="M14 5h5v5M19 5l-8 8M19 13v6H5V5h6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </a>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
