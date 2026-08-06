'use client'

import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { Avatar } from '@dicebear/core'
import { AVATAAARS_STYLE, buildOptions, parseAvatarConfig } from '@/features/avatars/engine'
import type { Household } from '@/lib/types'
import { cn } from '@/lib/cn'
import { pressSpring } from '@/lib/motion'

export function ResidentAvatar({
  house,
  size = 36,
  ring = true,
  className,
  onClick,
}: {
  house: Pick<Household, 'id' | 'name' | 'avatar'>
  size?: number
  ring?: boolean
  className?: string
  onClick?: () => void
}) {
  const config = useMemo(() => parseAvatarConfig(house.avatar), [house.avatar])
  const svg = useMemo(() => {
    if (!config) return null
    // `buildOptions` returns a loose Record; DiceBear's options type is a mapped
    // generic, so cast through the constructor parameter type to stay type-safe.
    const opts = buildOptions(config, `house-${house.id}`, house.name) as ConstructorParameters<typeof Avatar>[1]
    return new Avatar(AVATAAARS_STYLE, opts).toString()
  }, [config, house.id, house.name])

  const ringColor = ring ? 'var(--primary)' : undefined
  const boxShadow = ringColor ? `0 0 0 2px var(--bg), 0 0 0 3px ${ringColor}` : undefined

  const inner = (
    <span
      className={cn('relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full', className)}
      style={{ width: size, height: size, background: svg ? 'transparent' : 'var(--secondary)', boxShadow }}
      aria-hidden="true"
    >
      {svg ? (
        <span
          className="block h-full w-full"
          style={{ display: 'block' }}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      ) : (
        <span
          className="font-display font-semibold leading-none text-[var(--muted)]"
          style={{ fontSize: size * 0.42 }}
        >
          {(house.name.trim()[0] ?? '?').toUpperCase()}
        </span>
      )}
    </span>
  )

  if (!onClick) return inner

  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.94 }}
      transition={pressSpring}
      aria-label={`Customize avatar for ${house.name}`}
      className={cn('cursor-pointer rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]', className)}
    >
      {inner}
    </motion.button>
  )
}
