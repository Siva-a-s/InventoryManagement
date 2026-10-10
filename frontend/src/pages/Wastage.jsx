import { confirmAction } from '../components/notifications'
import { notify } from '../components/notifications'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import axios from 'axios'
import './Wastage.css'

const formatExpiryDate = (batch) => {
  const expiryDate = batch.expiryDate ? new Date(batch.expiryDate) : null
  return expiryDate && !Number.isNaN(expiryDate.getTime())
    ? expiryDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : 'N/A'
}

const Wastage = () => {
  const [batches, setBatches] = useState([])
  const [batchDropdownOpen, setBatchDropdownOpen] = useState(false)
  const [batchSearch, setBatchSearch] = useState('')
  const [activeBatchIndex, setActiveBatchIndex] = useState(0)
  const [expiredBatches, setExpiredBatches] = useState([])
  const [writingOffExpired, setWritingOffExpired] = useState(false)
  const [entries, setEntries] = useState([])
  const [summary, setSummary] = useState(null)
  const batchDropdownRef = useRef(null)
  const batchSearchRef = useRef(null)

  const [form, setForm] = useState({
    batchId: '',
    quantity: '',
    reason: 'damaged',
    notes: '',
  })

  const token = localStorage.getItem('token')

  const headers = useMemo(() => ({
    Authorization: `Bearer ${token}`,
  }), [token])

  const filteredBatches = useMemo(() => {
    const search = batchSearch.trim().toLowerCase()
    if (!search) return batches
    return batches.filter((batch) =>
      `${batch.product?.name || ''} ${batch.batchNumber || ''}`
        .toLowerCase()
        .includes(search)
    )
  }, [batches, batchSearch])

  const selectedBatch = batches.find((batch) => batch._id === form.batchId)

  useEffect(() => {
    if (!batchDropdownOpen) return undefined

    const closeOnOutsideClick = (event) => {
      if (!batchDropdownRef.current?.contains(event.target)) {
        setBatchDropdownOpen(false)
      }
    }

    document.addEventListener('mousedown', closeOnOutsideClick)
    document.addEventListener('touchstart', closeOnOutsideClick)
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick)
      document.removeEventListener('touchstart', closeOnOutsideClick)
    }
  }, [batchDropdownOpen])

  useEffect(() => {
    if (batchDropdownOpen) batchSearchRef.current?.focus()
  }, [batchDropdownOpen])

  const selectBatch = (batch) => {
    setForm((current) => ({ ...current, batchId: batch._id }))
    setBatchDropdownOpen(false)
    setBatchSearch('')
  }

  const handleBatchKeyDown = (event) => {
    if (event.key === 'Escape') {
      setBatchDropdownOpen(false)
      return
    }

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!batchDropdownOpen) {
        setBatchDropdownOpen(true)
        return
      }
      if (!filteredBatches.length) return
      const direction = event.key === 'ArrowDown' ? 1 : -1
      setActiveBatchIndex((index) =>
        (index + direction + filteredBatches.length) % filteredBatches.length
      )
    }

    if (event.key === 'Enter' && batchDropdownOpen) {
      event.preventDefault()
      const batch = filteredBatches[activeBatchIndex]
      if (batch) selectBatch(batch)
    }
  }

  const fetchData = useCallback(async () => {
    try {
      const [batchResponse, allExpiredBatches, wastageResponse, summaryResponse] =
        await Promise.all([
          axios.get('http://localhost:5000/api/stock', {
            headers,
          }),
          (async () => {
            const expired = []
            let page = 1
            let hasMore = true
            while (hasMore) {
              const response = await axios.get('http://localhost:5000/api/stock', {
                params: { status: 'expired', page, limit: 100 },
                headers,
              })
              expired.push(...(response.data.data || []))
              hasMore = page < (response.data.pages || 1)
              page += 1
            }
            return expired
          })(),
          axios.get('http://localhost:5000/api/wastage', {
            headers,
          }),
          axios.get('http://localhost:5000/api/wastage/summary', {
            headers,
          }),
        ])

      setBatches(batchResponse.data.data || batchResponse.data)
      setExpiredBatches(allExpiredBatches)
      setEntries(wastageResponse.data.entries || [])
      setSummary(summaryResponse.data)
    } catch (error) {
      notify(
        error.response?.data?.message ||
          'Failed to load wastage data'
      )
    }
  }, [headers])

  useEffect(() => {
    // Initial API loading is an external synchronization effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData()
  }, [fetchData])

  const handleChange = (e) => {
    setForm({
      ...form,
      [e.target.name]: e.target.value,
    })
  }

  const recordWastage = async (e) => {
    e.preventDefault()

    if (!form.batchId || !form.quantity) {
      notify('Please select a batch and enter quantity')
      return
    }

    try {
      await axios.post(
        'http://localhost:5000/api/wastage',
        {
          batchId: form.batchId,
          quantity: Number(form.quantity),
          reason: form.reason,
          notes: form.notes,
        },
        {
          headers,
        }
      )

      notify('Wastage recorded successfully')

      setForm({
        batchId: '',
        quantity: '',
        reason: 'damaged',
        notes: '',
      })

      fetchData()
    } catch (error) {
      notify(
        error.response?.data?.message ||
          'Failed to record wastage'
      )
    }
  }

  const writeOffExpired = async () => {
    if (writingOffExpired || expiredBatches.length === 0) return
    setWritingOffExpired(true)
    if (!await confirmAction('Write off all expired stock?')) {
      setWritingOffExpired(false)
      return
    }

    try {
      const response = await axios.post(
        'http://localhost:5000/api/wastage/write-off-expired',
        {},
        {
          headers,
        }
      )

      notify(`Expired stock written off successfully.\nUnits: ${response.data.unitsWrittenOff}\nLoss: ₹${response.data.totalLoss}`)

      fetchData()
    } catch (error) {
      notify(
        error.response?.data?.message ||
          'Failed to write off expired stock'
      )
    } finally {
      setWritingOffExpired(false)
    }
  }

  return (
    <div className="wastage-page">

      <div className="wastage-header">
        <div>
          <h1>Wastage Management</h1>
          <p>Record damaged, spoiled, lost and expired stock</p>
        </div>

        <button
          className="expired-button"
          onClick={writeOffExpired}
          disabled={expiredBatches.length === 0 || writingOffExpired}
        >
          {writingOffExpired ? 'Writing off...' : `Write Off Expired Stock (${expiredBatches.reduce((sum, batch) => sum + Number(batch.remainingQuantity || 0), 0)} units)`}
        </button>
      </div>

      <section className="wastage-card expired-review-card" aria-labelledby="expired-review-title">
        <h3 id="expired-review-title">Expired inventory awaiting review</h3>
        {expiredBatches.length === 0 ? <p>No expired quantities are awaiting write-off.</p> : <>
          <p>{expiredBatches.length} batches contain {expiredBatches.reduce((sum, batch) => sum + Number(batch.remainingQuantity || 0), 0)} units excluded from sellable stock.</p>
          <div className="wastage-table-scroll"><table className="wastage-table"><thead><tr><th>Product</th><th>Batch</th><th>Quantity awaiting write-off</th><th>Expiry date</th></tr></thead><tbody>
            {expiredBatches.map((batch) => <tr key={batch._id}><td>{batch.product?.name || 'N/A'}</td><td>{batch.batchNumber || 'N/A'}</td><td>{batch.remainingQuantity}</td><td>{batch.expiryDate ? new Date(batch.expiryDate).toLocaleDateString() : 'N/A'}</td></tr>)}
          </tbody></table></div>
          <p>Stock remains recorded in the batch until an owner confirms the write-off.</p>
        </>}
      </section>

      {/* Summary */}
      <div className="wastage-summary">

        <div className="summary-card">
          <span>Total Wasted Units</span>
          <strong>
            {summary?.totalUnits || 0}
          </strong>
        </div>

        <div className="summary-card">
          <span>Total Loss</span>
          <strong>
            ₹{summary?.totalLoss || 0}
          </strong>
        </div>

        <div className="summary-card">
          <span>Wastage Entries</span>
          <strong>
            {entries.length}
          </strong>
        </div>

      </div>

      {/* Record Wastage */}
      <div className="wastage-card">

        <h3>Record Wastage</h3>

        <form
          className="wastage-form"
          onSubmit={recordWastage}
        >

          <div>
            <label id="wastage-batch-label">Stock Batch</label>
            <div className="wastage-batch-dropdown" ref={batchDropdownRef}>
              <button
                type="button"
                className="wastage-batch-trigger"
                aria-labelledby="wastage-batch-label"
                aria-haspopup="listbox"
                aria-expanded={batchDropdownOpen}
                aria-controls="wastage-batch-listbox"
                aria-required="true"
                onClick={() => setBatchDropdownOpen((open) => !open)}
                onKeyDown={handleBatchKeyDown}
              >
                {selectedBatch ? (
                  <span className="wastage-batch-selected">
                    <strong>{selectedBatch.product?.name || 'Product unavailable'}</strong>
                    <span>Batch: {selectedBatch.batchNumber || 'Unavailable'}</span>
                  </span>
                ) : (
                  <span className="wastage-batch-placeholder">Select a stock batch</span>
                )}
                <span className="wastage-batch-chevron" aria-hidden="true">▾</span>
              </button>

              {batchDropdownOpen && (
                <div className="wastage-batch-menu">
                  <input
                    ref={batchSearchRef}
                    type="search"
                    className="wastage-batch-search"
                    aria-label="Search stock batches by product or batch number"
                    placeholder="Search product or batch number"
                    value={batchSearch}
                    onChange={(event) => {
                      setBatchSearch(event.target.value)
                      setActiveBatchIndex(0)
                    }}
                    onKeyDown={handleBatchKeyDown}
                  />
                  <div
                    id="wastage-batch-listbox"
                    className="wastage-batch-options"
                    role="listbox"
                    aria-label="Available stock batches"
                  >
                    {filteredBatches.length ? filteredBatches.map((batch, index) => (
                      <button
                        type="button"
                        key={batch._id}
                        role="option"
                        aria-selected={form.batchId === batch._id}
                        className={`wastage-batch-option${form.batchId === batch._id ? ' is-selected' : ''}${index === activeBatchIndex ? ' is-active' : ''}`}
                        onMouseEnter={() => setActiveBatchIndex(index)}
                        onClick={() => selectBatch(batch)}
                      >
                        <span className="wastage-batch-option-primary">
                          <strong>{batch.product?.name || 'Product unavailable'}</strong>
                          <span>{batch.remainingQuantity ?? 'N/A'}{batch.product?.unit ? ` ${batch.product.unit}` : ''}</span>
                        </span>
                        <span className="wastage-batch-option-secondary">
                          <span>Batch {batch.batchNumber || 'Unavailable'}</span>
                          <span>Expires {formatExpiryDate(batch)}</span>
                        </span>
                      </button>
                    )) : (
                      <p className="wastage-batch-empty" role="status">No stock batches match your search.</p>
                    )}
                  </div>
                </div>
              )}
              <input type="hidden" name="batchId" value={form.batchId} required />
            </div>
          </div>

          <div>
            <label>Quantity</label>

            <input
              type="number"
              name="quantity"
              min="1"
              value={form.quantity}
              onChange={handleChange}
              placeholder="Enter quantity"
              required
            />
          </div>

          <div>
            <label>Reason</label>

            <select
              name="reason"
              value={form.reason}
              onChange={handleChange}
            >
              <option value="damaged">Damaged</option>
              <option value="spoiled">Spoiled</option>
              <option value="lost">Lost</option>
              <option value="expired">Expired</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div>
            <label>Notes</label>

            <input
              type="text"
              name="notes"
              value={form.notes}
              onChange={handleChange}
              placeholder="Optional note"
            />
          </div>

          <button
            type="submit"
            className="record-button"
          >
            Record Wastage
          </button>

        </form>
      </div>

      {/* Wastage History */}
      <div className="wastage-card">

        <h3>Wastage History</h3>

        {entries.length === 0 ? (
          <p>No wastage records found.</p>
        ) : (
          <div className="wastage-table-scroll"><table className="wastage-table">

            <thead>
              <tr>
                <th>Product</th>
                <th>Batch</th>
                <th>Expiry date</th>
                <th>Quantity</th>
                <th>Reason</th>
                <th>Source</th>
                <th>Unit Cost</th>
                <th>Total Cost</th>
                <th>Date</th>
                <th>Recorded by</th>
              </tr>
            </thead>

            <tbody>
              {entries.map((entry) => (
                <tr key={entry._id}>

                  <td>
                    {entry.product?.name || 'Unknown'}
                  </td>

                  <td>{entry.batch?.batchNumber || 'N/A'}</td>
                  <td>{entry.batch?.expiryDate ? new Date(entry.batch.expiryDate).toLocaleDateString() : 'N/A'}</td>

                  <td>{entry.quantity}</td>

                  <td>
                    <span className="reason-badge">
                      {entry.reason || 'N/A'}
                    </span>
                  </td>

                  <td>{entry.sourceType === 'return' ? `Return ${entry.sourceReturn?.returnNumber || ''}` : entry.sourceType === 'expired' || entry.automatic ? 'Expired stock write-off' : 'Manual'}</td>

                  <td>{Number(entry.unitCost) > 0 ? `INR ${Number(entry.unitCost).toLocaleString('en-IN')}` : 'N/A'}</td>

                  <td>{Number(entry.unitCost) > 0 ? `INR ${Number(entry.totalCost || 0).toLocaleString('en-IN')}` : 'N/A'}</td>

                  <td>
                    {new Date(
                      entry.createdAt
                    ).toLocaleString()}
                  </td>

                  <td>{entry.recordedByName || entry.recordedBy?.name || 'N/A'}</td>

                </tr>
              ))}
            </tbody>

          </table></div>
        )}

      </div>

    </div>
  )
}

export default Wastage
