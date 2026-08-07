'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

type RouterContextValue = {
  path: string
  navigate: (to: string) => void
}

const RouterContext = createContext<RouterContextValue>({ path: '/', navigate: () => {} })

function currentPath(): string {
  const h = window.location.hash.replace(/^#/, '')
  return h || '/'
}

export function HashRouter({ children }: { children: ReactNode }) {
  const [path, setPath] = useState<string>(currentPath)

  useEffect(() => {
    const onHashChange = () => setPath(currentPath())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  const navigate = (to: string) => {
    window.location.hash = to
  }

  return <RouterContext.Provider value={{ path, navigate }}>{children}</RouterContext.Provider>
}

export function useRouter() {
  return useContext(RouterContext)
}

export function Route({
  path,
  children,
}: {
  path: string
  children: ReactNode
}) {
  const { path: current } = useRouter()
  const active = current === path || (path !== '/' && current.startsWith(path))
  return active ? <>{children}</> : null
}

/** Renders `children` when `current` matches no exact route (catch-all / 404). */
export function FallbackRoute({ children, knownPaths }: { children: ReactNode; knownPaths: string[] }) {
  const { path: current } = useRouter()
  const matched = knownPaths.some((p) => current === p || (p !== '/' && current.startsWith(p)))
  return matched ? null : <>{children}</>
}

export function Link({
  to,
  children,
  className,
  activeClassName,
}: {
  to: string
  children: ReactNode
  className?: string
  activeClassName?: string
}) {
  const { path, navigate } = useRouter()
  const isActive = path === to
  return (
    <a
      href={`#${to}`}
      onClick={(e) => {
        e.preventDefault()
        navigate(to)
      }}
      className={`${className ?? ''} ${isActive && activeClassName ? activeClassName : ''}`}
      data-active={isActive || undefined}
    >
      {children}
    </a>
  )
}