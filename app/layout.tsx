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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const pathname = usePathname()

  const navigation = [
    { name: '🔍 Execution Plan', href: '/' },
    { name: '📝 SQL Extractor', href: '/sql-extractor' },
    { name: '🐛 Log Analyzer', href: '/log-analyzer' },
  ]

  return (
    <html lang="en">
      <body className="bg-background">
        <div className="flex h-screen overflow-hidden">
          {/* Sidebar */}
          <div className={`${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0 fixed lg:static inset-y-0 left-0 z-50 ${sidebarCollapsed ? 'w-20' : 'w-64'} bg-warm-50 border-r border-warm-300/60 transition-all duration-300 ease-in-out`}>
            {/* Logo */}
            <div className="h-16 flex items-center gap-3 px-6 bg-warm-100/50 border-b border-warm-300/60">
              {!sidebarCollapsed && (
                <>
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center overflow-hidden">
                    <video autoPlay loop muted playsInline className="w-full h-full object-cover">
                      <source src="/logo.webm" type="video/webm" />
                    </video>
                  </div>
                  <div>
                    <h1 className="text-lg font-serif font-semibold text-warm-800">MyDevTools</h1>
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
                    className={`block px-4 py-3 rounded text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-primary/10 text-primary'
                        : 'text-warm-700 hover:bg-warm-100'
                    }`}
                    title={sidebarCollapsed ? item.name : undefined}
                  >
                    {sidebarCollapsed ? item.name.split(' ')[0] : item.name}
                  </Link>
                )
              })}
            </nav>

            {/* Toggle Button */}
            <div className="absolute bottom-20 left-0 right-0 px-4">
              <button
                onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                className="w-full px-4 py-2 rounded text-sm font-medium text-warm-700 hover:bg-warm-100 transition-colors flex items-center justify-center gap-2"
              >
                {sidebarCollapsed ? '➡️' : '⬅️'}
                {!sidebarCollapsed && <span>Collapse</span>}
              </button>
            </div>

            {/* Footer */}
            <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-warm-300/60">
              {!sidebarCollapsed && (
                <div className="text-xs text-warm-600">
                  <p className="font-medium">MyDevTools</p>
                  <p>v2.0.0</p>
                </div>
              )}
            </div>
          </div>

          {/* Mobile overlay */}
          {sidebarOpen && (
            <div
              className="fixed inset-0 bg-warm-900/20 z-40 lg:hidden"
              onClick={() => setSidebarOpen(false)}
            />
          )}

          {/* Main content */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Top bar */}
            <div className="h-16 bg-warm-50 border-b border-warm-300/60 flex items-center px-6">
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="lg:hidden mr-4 p-2 rounded hover:bg-warm-100"
              >
                <svg className="w-6 h-6 text-warm-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              
              <div className="flex-1">
                <h2 className="text-xl font-serif font-semibold text-warm-800">
                  {navigation.find(n => n.href === pathname)?.name || 'MyDevTools'}
                </h2>
              </div>
            </div>

            {/* Page content */}
            <main className="flex-1 overflow-auto bg-background">
              {children}
            </main>
          </div>
        </div>
      </body>
    </html>
  )
}
