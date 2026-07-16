'use client'

import './globals.css'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('sidebarCollapsed')
      return saved ? JSON.parse(saved) : false
    }
    return false
  })
  const [isDarkMode, setIsDarkMode] = useState(false)
  const pathname = usePathname()

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme')
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    const nextTheme = savedTheme ? savedTheme === 'dark' : prefersDark

    setIsDarkMode(nextTheme)
    document.documentElement.classList.toggle('dark', nextTheme)
  }, [])

  const toggleSidebarCollapsed = () => {
    const newValue = !sidebarCollapsed
    setSidebarCollapsed(newValue)
    localStorage.setItem('sidebarCollapsed', JSON.stringify(newValue))
  }

  const toggleDarkMode = () => {
    const nextTheme = !isDarkMode
    setIsDarkMode(nextTheme)
    localStorage.setItem('theme', nextTheme ? 'dark' : 'light')
    document.documentElement.classList.toggle('dark', nextTheme)
  }

  const navigation = [
    {
      name: 'Log Analyzer',
      href: '/log-analyzer',
      icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
    },
    { 
      name: 'Execution Plan Visual', 
      href: '/',
      icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
    },
    { 
      name: 'SQL Extractor', 
      href: '/sql-extractor',
      icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" /></svg>
    },
    { 
      name: 'Excel Tools', 
      href: '/excel-tools',
      icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
    },
    { 
      name: 'Activity Diagram', 
      href: '/activity-diagram',
      icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
    },
    {
      name: 'Env to K8s',
      href: '/env-to-k8s',
      icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7h16M4 12h16M4 17h7m5-1l2 2 4-4" /></svg>
    },
    { 
      name: 'Hash Generator', 
      href: '/hash-generator',
      icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" /></svg>
    },
    { 
      name: 'Diff Viewer', 
      href: '/diff-viewer',
      icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>
    },
    { 
      name: 'URL Encoder', 
      href: '/url-encoder',
      icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
    },
  ]

  return (
    <html lang="en" className={isDarkMode ? 'dark' : ''} suppressHydrationWarning>
      <body>
        <div className="flex h-screen overflow-hidden">
          {/* Sidebar */}
          <div className={`${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0 fixed lg:static inset-y-0 left-0 z-50 ${sidebarCollapsed ? 'w-20' : 'w-64'} bg-surface-container-low border-outline-variant/60 border-r transition-all duration-300 ease-in-out`}>
            {/* Logo */}
            <div className={`h-16 flex items-center gap-3 px-6 bg-surface-container border-outline-variant/60 border-b`}>
              {!sidebarCollapsed && (
                <>
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center overflow-hidden">
                    <video autoPlay loop muted playsInline className="w-full h-full object-cover">
                      <source src="/logo.webm" type="video/webm" />
                    </video>
                  </div>
                  <div>
                    <h1 className={`text-lg font-serif font-semibold text-on-surface`}>MyDevTools</h1>
                    <p className={`text-xs text-on-surface/60 italic`}>Làm ko bug đời ko nể</p>
                  </div>
                </>
              )}
              {sidebarCollapsed && (
                <div className="w-10 h-10 rounded-lg flex items-center justify-center overflow-hidden mx-auto">
                  <video autoPlay loop muted playsInline className="w-full h-full object-cover">
                    <source src="/logo.webm" type="video/webm" />
                  </video>
                </div>
              )}
            </div>

            {/* Navigation */}
            <nav className="p-4 space-y-1">
              {navigation.map((item) => {
                const isActive = pathname === item.href
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    onClick={() => setSidebarOpen(false)}
                    className={`relative flex items-center gap-3 px-4 py-3 rounded text-sm font-medium transition-colors group ${
                      isActive
                        ? 'bg-primary/10 text-primary'
                        : 'text-on-surface hover:bg-surface-container'
                    }`}
                  >
                    <span className="flex-shrink-0">{item.icon}</span>
                    {!sidebarCollapsed && <span>{item.name}</span>}
                    {sidebarCollapsed && (
                      <span className={`absolute left-full ml-2 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-50 ${
                        'bg-surface-container-highest text-on-surface shadow-lg'
                      }`}>
                        {item.name}
                      </span>
                    )}
                  </Link>
                )
              })}
            </nav>

            {/* Toggle Button */}
            <div className="absolute bottom-20 left-0 right-0 px-4 hidden lg:block">
              <button
                onClick={toggleSidebarCollapsed}
                className={`w-full px-4 py-2.5 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 group ${
                  'text-on-surface hover:bg-surface-container'
                }`}
                title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              >
                <svg 
                  className={`w-5 h-5 transition-transform duration-300 ${
                    sidebarCollapsed ? 'rotate-180' : ''
                  }`}
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                    strokeWidth={2} 
                    d="M11 19l-7-7 7-7m8 14l-7-7 7-7" 
                  />
                </svg>
                {!sidebarCollapsed && <span className="group-hover:translate-x-[-2px] transition-transform">Collapse</span>}
              </button>
            </div>

            {/* Footer */}
            <div className={`absolute bottom-0 left-0 right-0 p-4 border-outline-variant/60 border-t`}>
              {!sidebarCollapsed && (
                <div className={`text-xs text-on-surface/60`}>
                  <p className="font-medium">MyDevTools</p>
                  <p>v2.0.0</p>
                </div>
              )}
            </div>
          </div>

          {/* Mobile overlay */}
          {sidebarOpen && (
            <button
              type="button"
              aria-label="Close navigation menu"
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 lg:hidden transition-opacity"
              onClick={() => setSidebarOpen(false)}
            />
          )}

          {/* Main content */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Top bar */}
            <div className={`h-14 lg:h-16 bg-surface-container-low border-outline-variant/60 border-b flex items-center px-4 lg:px-6`}>
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className={`lg:hidden mr-3 p-2 rounded-lg active:scale-95 transition-transform ${
                  'hover:bg-surface-container'
                }`}
                aria-label="Toggle menu"
              >
                <svg className={`w-6 h-6 text-on-surface`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              
              <div className="flex-1 min-w-0">
                <h2 className={`text-base lg:text-xl font-serif font-semibold truncate text-on-surface`}>
                  {navigation.find(n => n.href === pathname)?.name || 'MyDevTools'}
                </h2>
              </div>
              
              <button
                type="button"
                onClick={toggleDarkMode}
                aria-label={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
                aria-pressed={isDarkMode}
                title={isDarkMode ? 'Light mode' : 'Dark mode'}
                className="ml-3 inline-flex h-10 w-10 items-center justify-center border border-outline-variant/60 bg-surface-container text-on-surface transition-colors hover:bg-surface-container-high focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background dark:border-dark-outline-variant dark:bg-dark-surface-container dark:text-dark-on-surface dark:hover:bg-dark-surface-container-high dark:focus:ring-offset-dark-surface"
              >
                {isDarkMode ? (
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v2m0 14v2m9-9h-2M5 12H3m15.364 6.364-1.414-1.414M7.05 7.05 5.636 5.636m12.728 0L16.95 7.05M7.05 16.95l-1.414 1.414M12 8a4 4 0 100 8 4 4 0 000-8z" />
                  </svg>
                ) : (
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
                  </svg>
                )}
              </button>
            </div>

            {/* Page content */}
            <main className="flex-1 overflow-auto pb-safe">
              {children}
            </main>
          </div>
        </div>
      </body>
    </html>
  )
}
