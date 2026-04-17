'use client'

import './globals.css'
import { useState } from 'react'
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
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('darkMode')
      return saved ? JSON.parse(saved) : false
    }
    return false
  })
  const pathname = usePathname()

  // Save preferences to localStorage
  const toggleDarkMode = () => {
    const newValue = !darkMode
    setDarkMode(newValue)
    localStorage.setItem('darkMode', JSON.stringify(newValue))
  }

  const toggleSidebarCollapsed = () => {
    const newValue = !sidebarCollapsed
    setSidebarCollapsed(newValue)
    localStorage.setItem('sidebarCollapsed', JSON.stringify(newValue))
  }

  const navigation = [
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
      name: 'Log Analyzer', 
      href: '/log-analyzer',
      icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
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
      name: 'K8s Config', 
      href: '/k8s-config',
      icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
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
    <html lang="en" className={darkMode ? 'dark' : ''}>
      <body>
        <div className="flex h-screen overflow-hidden">
          {/* Sidebar */}
          <div className={`${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0 fixed lg:static inset-y-0 left-0 z-50 ${sidebarCollapsed ? 'w-20' : 'w-64'} ${darkMode ? 'bg-dark-surface-container-low border-dark-outline-variant/20' : 'bg-surface-container-low border-outline-variant/60'} border-r transition-all duration-300 ease-in-out`}>
            {/* Logo */}
            <div className={`h-16 flex items-center gap-3 px-6 ${darkMode ? 'bg-dark-surface-container border-dark-outline-variant/20' : 'bg-surface-container border-outline-variant/60'} border-b`}>
              {!sidebarCollapsed && (
                <>
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center overflow-hidden">
                    <video autoPlay loop muted playsInline className="w-full h-full object-cover">
                      <source src="/logo.webm" type="video/webm" />
                    </video>
                  </div>
                  <div>
                    <h1 className={`text-lg font-serif font-semibold ${darkMode ? 'text-dark-on-surface' : 'text-on-surface'}`}>MyDevTools</h1>
                    <p className={`text-xs ${darkMode ? 'text-dark-on-surface/60' : 'text-on-surface/60'} italic`}>Làm ko bug đời ko nể</p>
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
                    className={`relative flex items-center gap-3 px-4 py-3 rounded text-sm font-medium transition-colors group ${
                      isActive
                        ? darkMode ? 'bg-dark-primary-container text-dark-on-primary' : 'bg-primary/10 text-primary'
                        : darkMode ? 'text-dark-on-surface hover:bg-dark-surface-container' : 'text-on-surface hover:bg-surface-container'
                    }`}
                  >
                    <span className="flex-shrink-0">{item.icon}</span>
                    {!sidebarCollapsed && <span>{item.name}</span>}
                    {sidebarCollapsed && (
                      <span className={`absolute left-full ml-2 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-50 ${
                        darkMode ? 'bg-dark-surface-container-highest text-dark-on-surface shadow-lg' : 'bg-surface-container-highest text-on-surface shadow-lg'
                      }`}>
                        {item.name}
                      </span>
                    )}
                  </Link>
                )
              })}
            </nav>

            {/* Toggle Button */}
            <div className="absolute bottom-20 left-0 right-0 px-4">
              <button
                onClick={toggleSidebarCollapsed}
                className={`w-full px-4 py-2 rounded text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                  darkMode ? 'text-dark-on-surface hover:bg-dark-surface-container' : 'text-on-surface hover:bg-surface-container'
                }`}
              >
                {sidebarCollapsed ? '➡️' : '⬅️'}
                {!sidebarCollapsed && <span>Collapse</span>}
              </button>
            </div>

            {/* Footer */}
            <div className={`absolute bottom-0 left-0 right-0 p-4 ${darkMode ? 'border-dark-outline-variant/20' : 'border-outline-variant/60'} border-t`}>
              {!sidebarCollapsed && (
                <div className={`text-xs ${darkMode ? 'text-dark-on-surface/60' : 'text-on-surface/60'}`}>
                  <p className="font-medium">MyDevTools</p>
                  <p>v2.0.0</p>
                </div>
              )}
            </div>
          </div>

          {/* Mobile overlay */}
          {sidebarOpen && (
            <div
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 lg:hidden transition-opacity"
              onClick={() => setSidebarOpen(false)}
            />
          )}

          {/* Main content */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Top bar */}
            <div className={`h-14 lg:h-16 ${darkMode ? 'bg-dark-surface-container-low border-dark-outline-variant/20' : 'bg-surface-container-low border-outline-variant/60'} border-b flex items-center px-4 lg:px-6`}>
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className={`lg:hidden mr-3 p-2 rounded-lg active:scale-95 transition-transform ${
                  darkMode ? 'hover:bg-dark-surface-container' : 'hover:bg-surface-container'
                }`}
                aria-label="Toggle menu"
              >
                <svg className={`w-6 h-6 ${darkMode ? 'text-dark-on-surface' : 'text-on-surface'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              
              <div className="flex-1 min-w-0">
                <h2 className={`text-base lg:text-xl font-serif font-semibold truncate ${darkMode ? 'text-dark-on-surface' : 'text-on-surface'}`}>
                  {navigation.find(n => n.href === pathname)?.name || 'MyDevTools'}
                </h2>
              </div>
              
              {/* Dark Mode Toggle */}
              <button
                onClick={toggleDarkMode}
                className={`p-2 lg:p-2.5 rounded-lg transition-colors active:scale-95 ${
                  darkMode ? 'text-dark-primary hover:bg-dark-surface-container' : 'text-primary hover:bg-surface-container'
                }`}
                title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                aria-label={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              >
                <span className="text-xl">{darkMode ? '☀️' : '🌙'}</span>
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
