'use client'

import './globals.css'
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import ToastViewport from '@/components/ToastViewport'
import WorkspaceManager from '@/components/WorkspaceManager'

const navigation = [
  { name: 'Log Analyzer', href: '/log-analyzer', keywords: 'logs rancher kubectl pod errors', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
  { name: 'Execution Plan Visual', href: '/', keywords: 'oracle sql explain xplan cost', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
  { name: 'SQL Extractor', href: '/sql-extractor', keywords: 'hibernate query bind log format', icon: 'M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4' },
  { name: 'Excel Tools', href: '/excel-tools', keywords: 'xlsx csv analyzer formula calculator', icon: 'M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z' },
  { name: 'Activity Diagram', href: '/activity-diagram', keywords: 'uml drawio flow chart svg', icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
  { name: 'Env to K8s', href: '/env-to-k8s', keywords: 'environment kubernetes yaml properties config', icon: 'M4 7h16M4 12h16M4 17h7m5-1 2 2 4-4' },
  { name: 'Cron Generator', href: '/cron-expression', keywords: 'cron crontab schedule expression timer job', icon: 'M12 8v4l3 2m6-2a9 9 0 11-18 0 9 9 0 0118 0z' },
  { name: 'Nginx Redirects', href: '/nginx-redirect', keywords: 'nginx redirect generator rewrite 301 302 308 server config', icon: 'M5 12h13m-5-5 5 5-5 5M5 5v14' },
  { name: 'Hash Generator', href: '/hash-generator', keywords: 'md5 sha checksum digest', icon: 'M7 20l4-16m2 16 4-16M6 9h14M4 15h14' },
  { name: 'Diff Viewer', href: '/diff-viewer', keywords: 'compare text changes', icon: 'M8 7h12m0 0-4-4m4 4-4 4m0 6H4m0 0 4 4m-4-4 4-4' },
  { name: 'URL Encoder', href: '/url-encoder', keywords: 'base64 encode decode uri', icon: 'M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1' },
]

const favoritesKey = 'mydevtools:favorites:v1'
const recentKey = 'mydevtools:recent:v1'

function readStringArray(key: string) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '[]') as unknown
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

function ToolIcon({ path }: { path: string }) {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={path} />
    </svg>
  )
}

function isTextEntry(target: EventTarget | null) {
  const element = target as HTMLElement | null
  return element?.tagName === 'INPUT' || element?.tagName === 'TEXTAREA' || element?.tagName === 'SELECT' || element?.isContentEditable
}

function matchesTool(item: (typeof navigation)[number], query: string) {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return true
  const searchable = `${item.name} ${item.keywords}`.toLowerCase()
  return tokens.every((token) => searchable.includes(token))
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [isDarkMode, setIsDarkMode] = useState(false)
  const [sidebarQuery, setSidebarQuery] = useState('')
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [paletteQuery, setPaletteQuery] = useState('')
  const [activePaletteIndex, setActivePaletteIndex] = useState(0)
  const [favorites, setFavorites] = useState<string[]>([])
  const [recent, setRecent] = useState<string[]>([])
  const [workspaceOpen, setWorkspaceOpen] = useState(false)
  const paletteInputRef = useRef<HTMLInputElement>(null)
  const paletteDialogRef = useRef<HTMLDivElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme')
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    const nextTheme = savedTheme ? savedTheme === 'dark' : prefersDark
    const savedSidebar = localStorage.getItem('sidebarCollapsed')

    setSidebarCollapsed(savedSidebar ? JSON.parse(savedSidebar) : false)
    setFavorites(readStringArray(favoritesKey))
    setRecent(readStringArray(recentKey))
    setIsDarkMode(nextTheme)
    document.documentElement.classList.toggle('dark', nextTheme)
  }, [])

  const filteredNavigation = useMemo(() => {
    return navigation.filter((item) => matchesTool(item, sidebarQuery))
  }, [sidebarQuery])

  const paletteItems = useMemo(() => {
    return navigation
      .filter((item) => matchesTool(item, paletteQuery))
      .sort((left, right) => {
        const favoriteDelta = Number(favorites.includes(right.href)) - Number(favorites.includes(left.href))
        if (favoriteDelta !== 0) return favoriteDelta
        const leftRecent = recent.indexOf(left.href)
        const rightRecent = recent.indexOf(right.href)
        if (leftRecent === -1 && rightRecent === -1) return 0
        if (leftRecent === -1) return 1
        if (rightRecent === -1) return -1
        return leftRecent - rightRecent
      })
  }, [favorites, paletteQuery, recent])

  useEffect(() => {
    if (!pathname) return
    setRecent((current) => {
      const next = [pathname, ...current.filter((href) => href !== pathname)].slice(0, 5)
      localStorage.setItem(recentKey, JSON.stringify(next))
      return next
    })
  }, [pathname])

  const closePalette = () => {
    setPaletteOpen(false)
    setPaletteQuery('')
    window.setTimeout(() => previousFocusRef.current?.focus(), 0)
  }

  const openPalette = () => {
    previousFocusRef.current = document.activeElement as HTMLElement | null
    setPaletteOpen(true)
    setActivePaletteIndex(0)
  }

  const openTool = (href: string) => {
    closePalette()
    setSidebarOpen(false)
    router.push(href)
  }

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k' && !isTextEntry(event.target)) {
        event.preventDefault()
        openPalette()
      }

      if (event.key === 'Escape' && paletteOpen) {
        event.preventDefault()
        closePalette()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [paletteOpen])

  useEffect(() => {
    if (!paletteOpen) return
    paletteInputRef.current?.focus()

    const dialog = paletteDialogRef.current
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || !dialog) return
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>('input, button:not([disabled])'))
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    dialog?.addEventListener('keydown', trapFocus)
    return () => dialog?.removeEventListener('keydown', trapFocus)
  }, [paletteOpen])

  useEffect(() => {
    setActivePaletteIndex(0)
  }, [paletteQuery])

  const toggleSidebarCollapsed = () => {
    const nextValue = !sidebarCollapsed
    setSidebarCollapsed(nextValue)
    setSidebarQuery('')
    localStorage.setItem('sidebarCollapsed', JSON.stringify(nextValue))
  }

  const toggleDarkMode = () => {
    const nextTheme = !isDarkMode
    setIsDarkMode(nextTheme)
    localStorage.setItem('theme', nextTheme ? 'dark' : 'light')
    document.documentElement.classList.toggle('dark', nextTheme)
  }

  const toggleFavorite = (href: string) => {
    setFavorites((current) => {
      const next = current.includes(href) ? current.filter((item) => item !== href) : [...current, href]
      localStorage.setItem(favoritesKey, JSON.stringify(next))
      return next
    })
  }

  const handlePaletteKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      if (paletteItems.length > 0) setActivePaletteIndex((index) => Math.min(index + 1, paletteItems.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActivePaletteIndex((index) => Math.max(index - 1, 0))
    } else if (event.key === 'Enter' && paletteItems[activePaletteIndex]) {
      event.preventDefault()
      openTool(paletteItems[activePaletteIndex].href)
    }
  }

  const currentTool = navigation.find((item) => item.href === pathname)

  return (
    <html lang="en" className={isDarkMode ? 'dark' : ''} suppressHydrationWarning>
      <body>
        <div className="flex h-screen overflow-hidden">
          <div className={`${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} fixed inset-y-0 left-0 z-50 flex flex-col border-r border-outline-variant/60 bg-surface-container-low transition-all duration-300 lg:static lg:translate-x-0 ${sidebarCollapsed ? 'w-20' : 'w-72'}`}>
            <div className="flex h-16 flex-none items-center gap-3 border-b border-outline-variant/60 bg-surface-container px-5">
              <div className={`flex h-10 w-10 flex-none items-center justify-center overflow-hidden ${sidebarCollapsed ? 'mx-auto' : ''}`}>
                <video autoPlay loop muted playsInline className="h-full w-full object-cover">
                  <source src="/logo.webm" type="video/webm" />
                </video>
              </div>
              {!sidebarCollapsed && (
                <div className="min-w-0">
                  <h1 className="truncate text-lg font-semibold text-on-surface">MyDevTools</h1>
                  <p className="truncate text-xs italic text-on-surface/60">Làm ko bug đời ko nể</p>
                </div>
              )}
            </div>

            {!sidebarCollapsed && (
              <div className="flex-none px-4 pt-4">
                <label className="relative block">
                  <span className="sr-only">Search tools</span>
                  <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-on-surface-variant" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                    <circle cx="11" cy="11" r="7" strokeWidth="2" />
                    <path d="m20 20-3.5-3.5" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                  <input
                    type="search"
                    value={sidebarQuery}
                    onChange={(event) => setSidebarQuery(event.target.value)}
                    placeholder="Search tools"
                    className="h-10 w-full border border-outline-variant/60 bg-surface-container pl-10 pr-3 text-sm text-on-surface"
                  />
                </label>
              </div>
            )}

            <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto p-4" aria-label="Tools">
              {filteredNavigation.map((item) => {
                const isActive = pathname === item.href
                return (
                  <div key={item.name} className="group relative flex items-center">
                    <Link
                      href={item.href}
                      onClick={() => setSidebarOpen(false)}
                      className={`flex min-h-11 min-w-0 flex-1 items-center gap-3 py-3 pl-4 pr-12 text-sm font-medium transition-colors ${isActive ? 'bg-primary/10 text-primary' : 'text-on-surface hover:bg-surface-container'}`}
                    >
                      <span className="flex-none"><ToolIcon path={item.icon} /></span>
                      {!sidebarCollapsed && <span className="min-w-0 truncate">{item.name}</span>}
                    </Link>
                    {!sidebarCollapsed && (
                      <button type="button" onClick={() => { toggleFavorite(item.href); setSidebarOpen(false) }} aria-label={`${favorites.includes(item.href) ? 'Remove' : 'Add'} ${item.name} ${favorites.includes(item.href) ? 'from' : 'to'} favorites`} title="Favorite" className="absolute right-2 h-8 w-8 text-on-surface-variant opacity-100 hover:text-primary lg:opacity-0 lg:group-hover:opacity-100 lg:focus:opacity-100">
                        {favorites.includes(item.href) ? '★' : '☆'}
                      </button>
                    )}
                    {sidebarCollapsed && (
                      <span className="pointer-events-none absolute left-full z-50 ml-3 whitespace-nowrap bg-surface-container-highest px-3 py-2 text-sm text-on-surface opacity-0 shadow-warm-lg transition-opacity group-hover:opacity-100">{item.name}</span>
                    )}
                  </div>
                )
              })}
              {filteredNavigation.length === 0 && !sidebarCollapsed && (
                <div className="px-4 py-8 text-center text-sm text-on-surface-variant">No tools match “{sidebarQuery}”.</div>
              )}
            </nav>

            <div className="flex-none border-t border-outline-variant/60 p-4">
              <button
                type="button"
                onClick={toggleSidebarCollapsed}
                className="hidden min-h-10 w-full items-center justify-center gap-2 px-3 text-sm font-medium text-on-surface hover:bg-surface-container lg:flex"
                title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              >
                <svg className={`h-5 w-5 transition-transform ${sidebarCollapsed ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                </svg>
                {!sidebarCollapsed && <span>Collapse</span>}
              </button>
              {!sidebarCollapsed && <p className="mt-3 text-xs text-on-surface/60">MyDevTools v2.0.0</p>}
            </div>
          </div>

          {sidebarOpen && <button type="button" aria-label="Close navigation menu" className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setSidebarOpen(false)} />}

          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            <header className="flex h-14 flex-none items-center border-b border-outline-variant/60 bg-surface-container-low px-4 lg:h-16 lg:px-6">
              <button type="button" onClick={() => setSidebarOpen(!sidebarOpen)} className="mr-3 inline-flex h-10 w-10 items-center justify-center text-on-surface hover:bg-surface-container lg:hidden" aria-label="Toggle menu">
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
              </button>
              <h2 className="min-w-0 flex-1 truncate text-base font-semibold text-on-surface lg:text-xl">{currentTool?.name || 'MyDevTools'}</h2>
              <button type="button" onClick={() => setWorkspaceOpen(true)} aria-label="Open workspace manager" title="Workspace Manager" className="mr-2 inline-flex h-10 w-10 items-center justify-center border border-outline-variant/60 bg-surface-container text-on-surface hover:bg-surface-container-high">
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><path d="M4 7h16v12H4zM8 7V5h8v2" strokeWidth="2" strokeLinejoin="round" /></svg>
              </button>
              <button
                type="button"
                onClick={openPalette}
                className="mr-2 inline-flex h-10 items-center gap-2 border border-outline-variant/60 bg-surface-container px-3 text-sm text-on-surface hover:bg-surface-container-high"
                aria-label="Open command palette"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><circle cx="11" cy="11" r="7" strokeWidth="2" /><path d="m20 20-3.5-3.5" strokeWidth="2" strokeLinecap="round" /></svg>
                <span className="hidden md:inline">Open tool</span>
                <kbd className="hidden border border-outline-variant/60 px-1.5 py-0.5 font-mono text-xs text-on-surface-variant lg:inline">Ctrl K</kbd>
              </button>
              <button type="button" onClick={toggleDarkMode} aria-label={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'} aria-pressed={isDarkMode} title={isDarkMode ? 'Light mode' : 'Dark mode'} className="inline-flex h-10 w-10 items-center justify-center border border-outline-variant/60 bg-surface-container text-on-surface hover:bg-surface-container-high focus:outline-none focus:ring-2 focus:ring-primary">
                {isDarkMode ? (
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v2m0 14v2m9-9h-2M5 12H3m15.364 6.364-1.414-1.414M7.05 7.05 5.636 5.636m12.728 0L16.95 7.05M7.05 16.95l-1.414 1.414M12 8a4 4 0 100 8 4 4 0 000-8z" /></svg>
                ) : (
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" /></svg>
                )}
              </button>
            </header>
            <main className="flex-1 overflow-auto pb-safe">{children}</main>
          </div>
        </div>

        {paletteOpen && (
          <div className="fixed inset-0 z-[90] flex items-start justify-center bg-black/55 px-4 pt-[10vh]" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closePalette() }}>
            <div ref={paletteDialogRef} role="dialog" aria-modal="true" aria-label="Command palette" className="w-full max-w-xl border border-outline-variant/60 bg-surface-container-low shadow-warm-lg">
              <div className="flex items-center border-b border-outline-variant/60 px-4">
                <svg className="h-5 w-5 flex-none text-on-surface-variant" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><circle cx="11" cy="11" r="7" strokeWidth="2" /><path d="m20 20-3.5-3.5" strokeWidth="2" strokeLinecap="round" /></svg>
                <input
                  ref={paletteInputRef}
                  type="search"
                  value={paletteQuery}
                  onChange={(event) => setPaletteQuery(event.target.value)}
                  onKeyDown={handlePaletteKeyDown}
                  placeholder="Search tools or actions"
                  className="h-14 min-w-0 flex-1 border-0 bg-transparent px-3 text-base text-on-surface outline-none"
                  aria-autocomplete="list"
                  aria-controls="command-palette-results"
                  aria-activedescendant={paletteItems[activePaletteIndex] ? `palette-${activePaletteIndex}` : undefined}
                />
                <kbd className="border border-outline-variant/60 px-2 py-1 font-mono text-xs text-on-surface-variant">Esc</kbd>
              </div>
              <div id="command-palette-results" role="listbox" className="max-h-[min(26rem,60vh)] overflow-y-auto p-2">
                {paletteItems.map((item, index) => (
                  <button
                    key={item.href}
                    id={`palette-${index}`}
                    type="button"
                    role="option"
                    aria-selected={index === activePaletteIndex}
                    onMouseEnter={() => setActivePaletteIndex(index)}
                    onClick={() => openTool(item.href)}
                    className={`flex min-h-12 w-full items-center gap-3 px-3 text-left text-sm ${index === activePaletteIndex ? 'bg-primary text-white' : 'text-on-surface hover:bg-surface-container'}`}
                  >
                    <ToolIcon path={item.icon} />
                    <span className="min-w-0 flex-1 truncate font-medium">{item.name}</span>
                    <span className={`text-xs ${index === activePaletteIndex ? 'text-white/75' : 'text-on-surface-variant'}`}>
                      {favorites.includes(item.href) ? 'Favorite' : recent.includes(item.href) ? 'Recent' : 'Open'}
                    </span>
                  </button>
                ))}
                {paletteItems.length === 0 && <div className="px-4 py-10 text-center text-sm text-on-surface-variant">No matching tools found.</div>}
              </div>
            </div>
          </div>
        )}
        <WorkspaceManager open={workspaceOpen} onClose={() => setWorkspaceOpen(false)} />
        <ToastViewport />
      </body>
    </html>
  )
}
