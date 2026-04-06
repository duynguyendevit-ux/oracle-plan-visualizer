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
  const pathname = usePathname()

  const navigation = [
    { name: '🔍 Execution Plan', href: '/' },
    { name: '📊 Query Analyzer', href: '/query-analyzer' },
    { name: '🎯 Index Advisor', href: '/index-advisor' },
    { name: '⚡ Performance Tips', href: '/performance-tips' },
    { name: '📚 SQL Library', href: '/sql-library' },
  ]

  return (
    <html lang="en">
      <body className="bg-background">
        <div className="flex h-screen overflow-hidden">
          {/* Sidebar */}
          <div className={`${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0 fixed lg:static inset-y-0 left-0 z-50 w-64 bg-warm-50 border-r border-warm-300/60 transition-transform duration-300 ease-in-out`}>
            {/* Logo */}
            <div className="h-16 flex items-center gap-3 px-6 border-b border-warm-300/60">
              <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center shadow-warm">
                <span className="text-xl">🛠️</span>
              </div>
              <div>
                <h1 className="text-lg font-serif font-semibold text-warm-800">DevTools</h1>
                <p className="text-xs text-warm-600">Universal Toolkit</p>
              </div>
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
                  >
                    {item.name}
                  </Link>
                )
              })}
            </nav>

            {/* Footer */}
            <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-warm-300/60">
              <div className="text-xs text-warm-600">
                <p className="font-medium">Oracle DevTools</p>
                <p>v1.0.0</p>
              </div>
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
                  {navigation.find(n => n.href === pathname)?.name || 'DevTools'}
                </h2>
              </div>

              <div className="flex items-center gap-3">
                <button className="p-2 rounded hover:bg-warm-100">
                  <svg className="w-5 h-5 text-warm-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </button>
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
