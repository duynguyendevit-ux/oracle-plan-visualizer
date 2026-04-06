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
  ]

  return (
    <html lang="en">
      <body className="bg-background">
        <div className="flex h-screen overflow-hidden">
          {/* Sidebar */}
          <div className={`${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0 fixed lg:static inset-y-0 left-0 z-50 w-64 bg-surface-container-low transition-transform duration-300 ease-in-out`}>
            {/* Logo */}
            <div className="h-16 flex items-center gap-3 px-6 bg-surface-container">
              <div className="w-10 h-10 bg-gradient-to-br from-primary to-primary-container rounded-lg flex items-center justify-center shadow-editorial">
                <span className="text-xl">📊</span>
              </div>
              <div>
                <h1 className="text-lg font-serif font-semibold text-on-surface">Oracle Plan</h1>
                <p className="text-xs font-label text-on-surface-variant">Visualizer</p>
              </div>
            </div>

            {/* Navigation */}
            <nav className="p-6 space-y-2">
              {navigation.map((item) => {
                const isActive = pathname === item.href
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={`block px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                      isActive
                        ? 'bg-primary-container text-primary shadow-editorial'
                        : 'text-on-surface-variant hover:bg-surface-container-high'
                    }`}
                  >
                    {item.name}
                  </Link>
                )
              })}
            </nav>

            {/* Footer */}
            <div className="absolute bottom-0 left-0 right-0 p-6 bg-surface-container">
              <div className="text-xs font-label text-on-surface-variant">
                <p className="font-medium">Oracle Plan Visualizer</p>
                <p className="text-outline">v2.0.0 • Alexandria</p>
              </div>
            </div>
          </div>

          {/* Mobile overlay */}
          {sidebarOpen && (
            <div
              className="fixed inset-0 bg-on-surface/20 backdrop-blur-glass z-40 lg:hidden"
              onClick={() => setSidebarOpen(false)}
            />
          )}

          {/* Main content */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Top bar */}
            <div className="h-16 bg-surface-container-low flex items-center px-6">
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="lg:hidden mr-4 p-2 rounded-lg hover:bg-surface-container-high"
              >
                <svg className="w-6 h-6 text-on-surface" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              
              <div className="flex-1">
                <h2 className="text-2xl font-serif font-semibold text-on-surface">
                  {navigation.find(n => n.href === pathname)?.name || 'Oracle Plan Visualizer'}
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
