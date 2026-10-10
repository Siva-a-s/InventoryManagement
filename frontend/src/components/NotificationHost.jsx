import { useEffect, useState } from 'react'
import { AlertCircle, CheckCircle2, Info, TriangleAlert, X } from 'lucide-react'
import './NotificationHost.css'

const icons = { success: CheckCircle2, error: AlertCircle, warning: TriangleAlert, info: Info }

const NotificationHost = () => {
  const [toasts, setToasts] = useState([])
  const [dialog, setDialog] = useState(null)

  useEffect(() => {
    const addToast = (event) => {
      const toast = event.detail
      setToasts((current) => [...current.slice(-3), toast])
      window.setTimeout(() => setToasts((current) => current.filter((item) => item.id !== toast.id)), 3800)
    }
    const showConfirm = (event) => setDialog({ ...event.detail, mode: 'confirm' })
    const showText = (event) => setDialog({ ...event.detail, mode: 'text' })
    window.addEventListener('app:toast', addToast)
    window.addEventListener('app:confirm', showConfirm)
    window.addEventListener('app:request-text', showText)
    return () => {
      window.removeEventListener('app:toast', addToast)
      window.removeEventListener('app:confirm', showConfirm)
      window.removeEventListener('app:request-text', showText)
    }
  }, [])

  const finishDialog = (value) => {
    dialog?.resolve(value)
    setDialog(null)
  }

  return <>
    <div className="toast-stack" aria-live="polite" aria-atomic="false">
      {toasts.map((toast) => {
        const Icon = icons[toast.type] || Info
        return <div className={`app-toast toast-${toast.type}`} key={toast.id} role={toast.type === 'error' ? 'alert' : 'status'} tabIndex="0" onKeyDown={(event) => { if (event.key === 'Enter') setToasts((current) => current.filter((item) => item.id !== toast.id)) }}>
          <Icon size={20} aria-hidden="true" />
          <span>{toast.message}</span>
          <button aria-label="Dismiss notification" onClick={() => setToasts((current) => current.filter((item) => item.id !== toast.id))}><X size={17} /></button>
        </div>
      })}
    </div>
    {dialog && <div className="app-dialog-backdrop" role="presentation">
      <form className="app-dialog" role="dialog" aria-modal="true" aria-labelledby="app-dialog-title" onSubmit={(event) => { event.preventDefault(); finishDialog(dialog.mode === 'text' ? new FormData(event.currentTarget).get('response') : true) }}>
        <h2 id="app-dialog-title">{dialog.mode === 'text' ? 'Please provide a reason' : 'Please confirm'}</h2>
        <p>{dialog.message}</p>
        {dialog.mode === 'text' && <textarea name="response" autoFocus rows="3" />}
        <div><button type="button" className="dialog-cancel" onClick={() => finishDialog(dialog.mode === 'text' ? null : false)}>Cancel</button><button type="submit">{dialog.mode === 'text' ? 'Continue' : 'Confirm'}</button></div>
      </form>
    </div>}
  </>
}

export default NotificationHost
