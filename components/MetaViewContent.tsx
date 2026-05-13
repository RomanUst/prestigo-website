'use client'

import { useEffect } from 'react'
import { trackMetaEvent } from '@/components/MetaPixel'

export default function MetaViewContent({ contentName }: { contentName: string }) {
  useEffect(() => {
    trackMetaEvent('ViewContent', { content_name: contentName })
  }, [contentName])
  return null
}
