import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './dark-logo.css'
import App from './App.tsx'
import { GlobalActionFeedback } from './action-feedback'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <GlobalActionFeedback />
  </StrictMode>,
)
