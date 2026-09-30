import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { initTheme } from './styles/theme.js'
import { registerServiceWorker } from './utils/install.js'
import './styles/typography.js'
import './styles/index.css'

initTheme()
registerServiceWorker()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
