'use client'

import { useEffect, useRef, useState } from 'react'
import { toast } from '@/lib/toast'

interface WorkspaceSnapshot {
  id: string
  name: string
  createdAt: number
  data: Record<string, string>
}

const workspacesKey = 'mydevtools:workspaces:v1'

function isManagedKey(key: string) {
  return key.startsWith('mydevtools:session:')
    || key.startsWith('mydevtools:transfer:')
    || key === 'env-to-k8s-state-v1'
    || key === 'theme'
    || key === 'sidebarCollapsed'
    || key === 'mydevtools:favorites:v1'
    || key === 'mydevtools:recent:v1'
}

function collectWorkspaceData() {
  const data: Record<string, string> = {}
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index)
    if (key && isManagedKey(key)) data[key] = localStorage.getItem(key) ?? ''
  }
  return data
}

function loadWorkspaces(): WorkspaceSnapshot[] {
  try {
    const saved = JSON.parse(localStorage.getItem(workspacesKey) || '[]') as unknown
    return Array.isArray(saved) ? saved as WorkspaceSnapshot[] : []
  } catch {
    return []
  }
}

export default function WorkspaceManager({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState('')
  const [workspaces, setWorkspaces] = useState<WorkspaceSnapshot[]>([])
  const nameRef = useRef<HTMLInputElement>(null)
  const importRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setWorkspaces(loadWorkspaces())
    window.setTimeout(() => nameRef.current?.focus(), 0)
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose, open])

  const storageUsage = (() => {
    if (!open) return 0
    let bytes = 0
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index) ?? ''
      bytes += new Blob([key, localStorage.getItem(key) ?? '']).size
    }
    return bytes
  })()

  if (!open) return null

  const persist = (next: WorkspaceSnapshot[]) => {
    setWorkspaces(next)
    localStorage.setItem(workspacesKey, JSON.stringify(next))
  }

  const saveWorkspace = () => {
    const snapshot: WorkspaceSnapshot = {
      id: crypto.randomUUID(),
      name: name.trim() || `Workspace ${new Date().toLocaleString()}`,
      createdAt: Date.now(),
      data: collectWorkspaceData(),
    }
    persist([snapshot, ...workspaces].slice(0, 10))
    setName('')
    toast.success('Workspace saved')
  }

  const restoreWorkspace = (workspace: WorkspaceSnapshot) => {
    Object.keys(localStorage).filter(isManagedKey).forEach((key) => localStorage.removeItem(key))
    Object.entries(workspace.data).forEach(([key, value]) => {
      if (isManagedKey(key) && typeof value === 'string') localStorage.setItem(key, value)
    })
    toast.success('Workspace restored')
    window.setTimeout(() => window.location.reload(), 250)
  }

  const downloadWorkspace = (workspace: WorkspaceSnapshot) => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(workspace, null, 2)], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `${workspace.name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'workspace'}.json`
    link.click()
    URL.revokeObjectURL(url)
    toast.success('Workspace downloaded')
  }

  const importWorkspace = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Workspace file is too large', 'Maximum size is 2 MB.')
      return
    }
    try {
      const parsed = JSON.parse(await file.text()) as Partial<WorkspaceSnapshot>
      if (!parsed.data || typeof parsed.data !== 'object') throw new Error('Workspace data is missing.')
      const data = Object.fromEntries(Object.entries(parsed.data).filter(([key, value]) => isManagedKey(key) && typeof value === 'string'))
      const snapshot: WorkspaceSnapshot = {
        id: crypto.randomUUID(),
        name: typeof parsed.name === 'string' && parsed.name.trim() ? parsed.name.trim() : file.name.replace(/\.json$/i, ''),
        createdAt: Date.now(),
        data,
      }
      persist([snapshot, ...workspaces].slice(0, 10))
      toast.success('Workspace imported')
    } catch (cause) {
      toast.error('Unable to import workspace', cause instanceof Error ? cause.message : undefined)
    }
  }

  const resetSessions = () => {
    Object.keys(localStorage)
      .filter((key) => key.startsWith('mydevtools:session:') || key.startsWith('mydevtools:transfer:') || key === 'env-to-k8s-state-v1')
      .forEach((key) => localStorage.removeItem(key))
    toast.success('Tool sessions cleared')
  }

  return (
    <div className="fixed inset-0 z-[95] flex items-start justify-center bg-black/55 px-4 pt-[8vh]" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <div role="dialog" aria-modal="true" aria-label="Workspace manager" className="flex max-h-[82vh] w-full max-w-2xl flex-col border border-outline-variant/60 bg-surface-container-low shadow-warm-lg">
        <div className="flex h-14 flex-none items-center justify-between border-b border-outline-variant/60 px-4">
          <div>
            <h2 className="text-base font-semibold text-on-surface">Workspace Manager</h2>
            <p className="text-xs text-on-surface-variant">{(storageUsage / 1024).toFixed(1)} KB local storage</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close workspace manager" className="h-9 w-9 text-on-surface-variant hover:bg-surface-container">×</button>
        </div>

        <div className="flex flex-none gap-2 border-b border-outline-variant/60 p-4">
          <input ref={nameRef} value={name} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') saveWorkspace() }} placeholder="Workspace name" aria-label="Workspace name" className="h-10 min-w-0 flex-1 px-3 text-sm" />
          <button type="button" onClick={saveWorkspace} className="h-10 bg-primary px-4 text-sm font-semibold text-white">Save snapshot</button>
          <input ref={importRef} type="file" accept="application/json,.json" onChange={importWorkspace} className="hidden" />
          <button type="button" onClick={() => importRef.current?.click()} className="h-10 border border-outline-variant px-4 text-sm font-semibold text-on-surface">Import</button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {workspaces.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-on-surface-variant">No workspace snapshots saved.</div>
          ) : workspaces.map((workspace) => (
            <div key={workspace.id} className="grid gap-3 border-b border-outline-variant/50 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-on-surface">{workspace.name}</div>
                <div className="mt-1 text-xs text-on-surface-variant">{new Date(workspace.createdAt).toLocaleString()} · {Object.keys(workspace.data).length} entries</div>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => restoreWorkspace(workspace)} className="h-8 bg-primary px-3 text-xs font-semibold text-white">Restore</button>
                <button type="button" onClick={() => downloadWorkspace(workspace)} className="h-8 border border-outline-variant px-3 text-xs font-semibold text-on-surface">Download</button>
                <button type="button" onClick={() => persist(workspaces.filter((item) => item.id !== workspace.id))} className="h-8 border border-tertiary/40 px-3 text-xs font-semibold text-tertiary">Delete</button>
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-none items-center justify-between border-t border-outline-variant/60 p-4">
          <span className="text-xs text-on-surface-variant">Up to 10 named snapshots</span>
          <button type="button" onClick={resetSessions} className="h-9 border border-tertiary/40 px-3 text-xs font-semibold text-tertiary">Reset tool sessions</button>
        </div>
      </div>
    </div>
  )
}
