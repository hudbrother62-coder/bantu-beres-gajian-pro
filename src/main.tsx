import PasswordRecovery from './password-recovery'
import { supabase } from './lib/supabase'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './dark-logo.css'
import './mobile-fixes.css'
import App from './App.tsx'
import { GlobalActionFeedback } from './action-feedback'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {new URLSearchParams(window.location.search).has('bbreset') ? <PasswordRecovery client={supabase} /> : <App />}
    <GlobalActionFeedback />
  </StrictMode>,
)
