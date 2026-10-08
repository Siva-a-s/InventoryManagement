import { useCallback, useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import './Wastage.css'

const Wastage = () => {
  const [batches, setBatches] = useState([])
  const [entries, setEntries] = useState([])
  const [summary, setSummary] = useState(null)

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

  const fetchData = useCallback(async () => {
    try {
      const [batchResponse, wastageResponse, summaryResponse] =
        await Promise.all([
          axios.get('http://localhost:5000/api/stock', {
            headers,
          }),
          axios.get('http://localhost:5000/api/wastage', {
            headers,
          }),
          axios.get('http://localhost:5000/api/wastage/summary', {
            headers,
          }),
        ])

      setBatches(batchResponse.data.data || batchResponse.data)
      setEntries(wastageResponse.data.entries || [])
      setSummary(summaryResponse.data)
    } catch (error) {
      alert(
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
      alert('Please select a batch and enter quantity')
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

      alert('Wastage recorded successfully')

      setForm({
        batchId: '',
        quantity: '',
        reason: 'damaged',
        notes: '',
      })

      fetchData()
    } catch (error) {
      alert(
        error.response?.data?.message ||
          'Failed to record wastage'
      )
    }
  }

  const writeOffExpired = async () => {
    if (!window.confirm('Write off all expired stock?')) {
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

      alert(`Expired stock written off successfully.\nUnits: ${response.data.unitsWrittenOff}\nLoss: ₹${response.data.totalLoss}`)

      fetchData()
    } catch (error) {
      alert(
        error.response?.data?.message ||
          'Failed to write off expired stock'
      )
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
        >
          Write Off Expired Stock
        </button>
      </div>

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
            <label>Stock Batch</label>

            <select
              name="batchId"
              value={form.batchId}
              onChange={handleChange}
              required
            >
              <option value="">
                Select batch
              </option>

              {batches.map((batch) => (
                <option
                  key={batch._id}
                  value={batch._id}
                >
                  {batch.product?.name || 'Product'} -
                  Available: {batch.remainingQuantity}
                </option>
              ))}
            </select>
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
          <table className="wastage-table">

            <thead>
              <tr>
                <th>Product</th>
                <th>Quantity</th>
                <th>Reason</th>
                <th>Unit Cost</th>
                <th>Total Cost</th>
                <th>Date</th>
              </tr>
            </thead>

            <tbody>
              {entries.map((entry) => (
                <tr key={entry._id}>

                  <td>
                    {entry.product?.name || 'Unknown'}
                  </td>

                  <td>{entry.quantity}</td>

                  <td>
                    <span className="reason-badge">
                      {entry.reason}
                    </span>
                  </td>

                  <td>₹{entry.unitCost}</td>

                  <td>₹{entry.totalCost}</td>

                  <td>
                    {new Date(
                      entry.createdAt
                    ).toLocaleDateString()}
                  </td>

                </tr>
              ))}
            </tbody>

          </table>
        )}

      </div>

    </div>
  )
}

export default Wastage
