import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// Self-hosted fonts (offline-first, no CDN)
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/playfair-display/500.css'
import '@fontsource/playfair-display/600.css'
import '@fontsource/playfair-display/700.css'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/500.css'
import '@fontsource/noto-sans-ethiopic/400.css'
import '@fontsource/noto-sans-ethiopic/700.css'
import '@fontsource/space-grotesk/400.css'
import '@fontsource/space-grotesk/600.css'
import '@fontsource/fraunces/500.css'
import '@fontsource/press-start-2p/400.css'
import '@fontsource/vt323/400.css'
// Newspaper edition fonts
import '@fontsource/unifrakturmaguntia/400.css'
import '@fontsource/playfair-display-sc/700.css'
import '@fontsource/playfair-display-sc/900.css'
import '@fontsource/lora/400.css'
import '@fontsource/lora/500.css'
import '@fontsource/lora/600.css'
import '@fontsource/lora/700.css'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
import '@fontsource/ibm-plex-mono/600.css'

import './index.css'
import App from './App.tsx'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)