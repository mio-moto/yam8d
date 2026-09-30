import { createRoot } from 'react-dom/client'
import './index.css'
import './app/style/scrollbars.css'
import { App } from './App.tsx'
import { SettingsProvider } from './features/settings/settings.tsx'
import { enableInputGate } from './features/inputs/inputGate'

const element = document.getElementById('root')
if (!element) {
    throw new Error('Application error.')
}

// Initialize global capture-phase input gate once
enableInputGate()

createRoot(element).render(
    <SettingsProvider>
        <App />
    </SettingsProvider>,
)
