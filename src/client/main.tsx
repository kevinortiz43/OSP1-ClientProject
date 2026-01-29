import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import Faqs from './components/Faqs.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <>
    <Faqs/>
    </>
  </StrictMode>,
)
