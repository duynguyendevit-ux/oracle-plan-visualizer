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
  const [darkMode, setDarkMode] = useState(false)
  const pathname = usePathname()

  const navigation = [
    { name: '🔍 Execution Plan Visual', href: '/' },
    { name: '📝 SQL Extractor', href: '/sql-extractor' },
    { name: '🐛 Log Analyzer', href: '/log-analyzer' },
    { name: '⚙️ K8s Config', href: '/k8s-config' },
    { name: '🔐 Hash Generator', href: '/hash-generator' },
    { name: '📝 Diff Viewer', href: '/diff-viewer' },
    { name: '🌍 URL Encoder', href: '/url-encoder' },
  ]

  return (
    <html lang="en" className={darkMode ? 'dark' : ''}>
      <body className={darkMode ? 'bg-gray-900' : 'bg-background'}>
        <div className={`flex h-screen overflow-hidden ${darkMode ? 'dark' : ''}`}>
          {/* Sidebar */}
          <div className={`${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0 fixed lg:static inset-y-0 left-0 z-50 ${sidebarCollapsed ? 'w-20' : 'w-64'} ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-warm-50 border-warm-300/60'} border-r transition-all duration-300 ease-in-out`}>
            {/* Logo */}
            <div className={`h-16 flex items-center gap-3 px-6 ${darkMode ? 'bg-gray-700 border-gray-600' : 'bg-warm-100/50 border-warm-300/60'} border-b`}>
              {!sidebarCollapsed && (
                <>
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center overflow-hidden">
                    <video autoPlay loop muted playsInline className="w-full h-full object-cover">
                      <source src="/logo.webm" type="video/webm" />
                    </video>
                  </div>
                  <div>
                    <h1 className={`text-lg font-serif font-semibold ${darkMode ? 'text-white' : 'text-warm-800'}`}>MyDevTools</h1>
                    <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-warm-600'} italic`}>Làm ko bug đời ko nể</p>
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
                        ? darkMode ? 'bg-gray-700 text-blue-400' : 'bg-primary/10 text-primary'
                        : darkMode ? 'text-gray-300 hover:bg-gray-700' : 'text-warm-700 hover:bg-warm-100'
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
            <div className={`absolute bottom-0 left-0 right-0 p-4 ${darkMode ? 'border-gray-700' : 'border-warm-300/60'} border-t`}>
              {!sidebarCollapsed && (
                <div className={`text-xs ${darkMode ? 'text-gray-400' : 'text-warm-600'}`}>
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
            <div className={`h-16 ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-warm-50 border-warm-300/60'} border-b flex items-center px-6`}>
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
              
              {/* Dark Mode Toggle */}
              <button
                onClick={() => setDarkMode(!darkMode)}
                className={`p-2 rounded-lg transition-colors ${
                  darkMode ? 'text-yellow-400 hover:bg-gray-700' : 'text-gray-700 hover:bg-warm-100'
                }`}
                title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              >
                {darkMode ? '☀️' : '🌙'}
              </button>
            </div>

            {/* Page content */}
            <main className={`flex-1 overflow-auto ${darkMode ? 'bg-gray-900' : 'bg-background'}`}>
              {children}
            </main>
          </div>
        </div>
      </body>
    </html>
  )
}
