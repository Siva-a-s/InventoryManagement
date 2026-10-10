export const notify = (message, type) => {
  const text = String(message || 'Something went wrong')
  const inferredType = type || (/success|added|updated|deleted|received|generated|recorded|cancelled/i.test(text) ? 'success' : 'error')
  window.dispatchEvent(new CustomEvent('app:toast', { detail: { id: `${Date.now()}-${Math.random()}`, message: text, type: inferredType } }))
}

export const confirmAction = (message) => new Promise((resolve) => {
  window.dispatchEvent(new CustomEvent('app:confirm', { detail: { message, resolve } }))
})

export const requestText = (message) => new Promise((resolve) => {
  window.dispatchEvent(new CustomEvent('app:request-text', { detail: { message, resolve } }))
})
