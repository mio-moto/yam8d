import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { App } from './App.tsx'
import { SettingsProvider } from './features/settings/settings.tsx'
import { enableInputGate } from './features/inputs/inputGate'

const element = document.getElementById('root')
if (!element) {
    throw new Error('Application error.')
}

const useStrict = !import.meta.env.VITE_BUILD_WITHOUT_STRICT

// Initialize global capture-phase input gate once
enableInputGate()

createRoot(element).render(
    useStrict ? (
        <StrictMode>
            <SettingsProvider>
                <App />
            </SettingsProvider>
        </StrictMode>
    ) : (
        <SettingsProvider>
            <App />
        </SettingsProvider>
    ),
)
