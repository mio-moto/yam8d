import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { App } from './App.tsx'

const element = document.getElementById('root')
if (!element) {
  throw new Error('Application error.')
}

const useStrict = !import.meta.env.VITE_BUILD_WITHOUT_STRICT

createRoot(element).render(useStrict ? (
  <StrictMode>
    <App />
  </StrictMode>
) : (
  <App />
))
