import { notify } from '../components/notifications'
import { confirmAction } from '../components/notifications'
import { useCallback, useEffect, useState } from 'react'
import axios from 'axios'
import './Returns.css'

const Returns = () => {
  const [bills, setBills] = useState([])
  const [bill, setBill] = useState(null)
  const [returnHistory, setReturnHistory] = useState([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const [historyError, setHistoryError] = useState('')
  const [viewingReturn, setViewingReturn] = useState(null)
  const [writingOffReturn, setWritingOffReturn] = useState(false)
  const [requestingRefund, setRequestingRefund] = useState(false)
  const isOwner = localStorage.getItem('role') === 'owner'

  const [selectedItems, setSelectedItems] = useState({})
  const [refundMethod, setRefundMethod] = useState('cash')
  const [note, setNote] = useState('')
  const [searchBill, setSearchBill] = useState('')

  const token = localStorage.getItem('token')

  const fetchBills = useCallback(async () => {
    try {
      const response = await axios.get(
        'http://localhost:5000/api/bills',
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      )

      setBills(response.data)
    } catch (error) {
      notify(
        error.response?.data?.message ||
          'Failed to load bills'
      )
    }
  }, [token])

  const fetchReturnHistory = useCallback(async () => {
    setHistoryLoading(true)
    setHistoryError('')

    try {
      const response = await axios.get(
        'http://localhost:5000/api/returns',
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      )

      setReturnHistory(response.data.returns || [])
      return response.data.returns || []
    } catch (error) {
      setHistoryError(
        error.response?.data?.message || 'Failed to load return history'
      )
    } finally {
      setHistoryLoading(false)
    }
  }, [token])

  const viewReturn = async (returnId) => {
    try {
      const response = await axios.get(`http://localhost:5000/api/returns/${returnId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      setViewingReturn(response.data)
    } catch (error) {
      notify(error.response?.data?.message || 'Could not load return details')
    }
  }

  const isEligibleForWastage = (item) => {
    const allocations = item.originalBatches || []
    return !item.restocked && !item.wastageWrittenOff && allocations.length > 0 &&
      allocations.reduce((sum, allocation) => sum + Number(allocation.quantity || 0), 0) === Number(item.quantity) &&
      allocations.every((allocation) => allocation.batch && Number(allocation.unitCost) > 0)
  }

  const writeOffReturn = async () => {
    if (!viewingReturn || writingOffReturn) return
    setWritingOffReturn(true)
    const confirmed = await confirmAction(`Write eligible non-restocked items from ${viewingReturn.returnNumber} off as wastage? This will not change sellable stock.`)
    if (!confirmed) {
      setWritingOffReturn(false)
      return
    }
    try {
      const response = await axios.post(`http://localhost:5000/api/returns/${viewingReturn._id}/write-off-wastage`, {}, {
        headers: { Authorization: `Bearer ${token}` },
      })
      notify(`${response.data.message}. ${response.data.writtenOffUnits} units recorded.`, 'success')
      const [detailResponse] = await Promise.all([
        axios.get(`http://localhost:5000/api/returns/${viewingReturn._id}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetchReturnHistory(),
      ])
      setViewingReturn(detailResponse.data)
    } catch (error) {
      notify(error.response?.data?.message || 'Could not write off returned items')
    } finally {
      setWritingOffReturn(false)
    }
  }

  const requestRazorpayRefund = async () => {
    if (!viewingReturn || requestingRefund) return
    setRequestingRefund(true)
    try {
      const response = await axios.post(
        `http://localhost:5000/api/returns/${viewingReturn._id}/razorpay-refund`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      )
      const refundStatus = response.data.return?.razorpayRefund?.status
      notify(response.data.message || 'Refund status updated', refundStatus === 'processed' ? 'success' : refundStatus === 'failed' ? 'error' : 'info')
      const [detailResponse] = await Promise.all([
        axios.get(`http://localhost:5000/api/returns/${viewingReturn._id}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetchReturnHistory(),
      ])
      setViewingReturn(detailResponse.data)
    } catch (error) {
      if (!error.response) {
        notify('The refund request could not be confirmed. Its status may be uncertain; retry the same return to check safely.', 'warning')
      } else {
        notify(error.response.data?.message || 'Could not process the refund', 'error')
      }
      try {
        const [detailResponse] = await Promise.all([
          axios.get(`http://localhost:5000/api/returns/${viewingReturn._id}`, { headers: { Authorization: `Bearer ${token}` } }),
          fetchReturnHistory(),
        ])
        setViewingReturn(detailResponse.data)
      } catch {
        // Keep the current details visible when a refresh also fails.
      }
    } finally {
      setRequestingRefund(false)
    }
  }

  useEffect(() => {
    // Initial API loading is an external synchronization effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchBills()
    fetchReturnHistory()
  }, [fetchBills, fetchReturnHistory])

  const selectBill = async (billNumber) => {
    try {
      const response = await axios.get(
        `http://localhost:5000/api/bills/${billNumber}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      )

      setBill(response.data)
      setSelectedItems({})
    } catch (error) {
      notify(
        error.response?.data?.message ||
          'Failed to load bill'
      )
    }
  }

  const updateItem = (productId, field, value) => {
    setSelectedItems((prev) => ({
      ...prev,
      [productId]: {
        ...prev[productId],
        [field]: value,
      },
    }))
  }

  const processReturn = async () => {
    const items = Object.entries(selectedItems)
      .filter(([, item]) => Number(item.quantity) > 0)
      .map(([productId, item]) => ({
        productId,
        quantity: Number(item.quantity),
        reason: item.reason || 'other',
        restock: item.restock === true,
      }))

    if (items.length === 0) {
      notify('Select at least one product to return')
      return
    }

    try {
      const response = await axios.post(
        'http://localhost:5000/api/returns',
        {
          billId: bill._id,
          items,
          refundMethod,
          note,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      )

      notify(
        `Return processed successfully. Refund: ₹${response.data.return.totalRefund}`
      )

      setBill(null)
      setSelectedItems({})
      setRefundMethod('cash')
      setNote('')

      fetchBills()
      fetchReturnHistory()
    } catch (error) {
      notify(
        error.response?.data?.message ||
          'Could not process return'
      )
    }
  }

  const filteredBills = bills.filter((item) =>
    item.billNumber
      ?.toLowerCase()
      .includes(searchBill.toLowerCase())
  )

  return (
    <div className="returns-page">

      {/* Header */}
      <div className="returns-header">
        <div>
          <h1>Returns</h1>
          <p>Select a bill to process a customer return</p>
        </div>
      </div>

      {/* Recent Bills */}
      <div className="return-card">

        <div className="bills-header">
          <div>
            <h3>Recent Bills</h3>
            <p>
              Search and select a bill to process a return
            </p>
          </div>

          <input
            type="text"
            className="bill-search-input"
            placeholder="Search bill number..."
            value={searchBill}
            onChange={(e) =>
              setSearchBill(e.target.value)
            }
          />
        </div>

        {filteredBills.length === 0 ? (
          <div className="no-bills">
            <p>
              {searchBill
                ? 'No matching bills found.'
                : 'No bills available.'}
            </p>
          </div>
        ) : (
          <div className="bills-scroll-container">

            <table className="bills-table">

              <thead>
                <tr>
                  <th>Bill Number</th>
                  <th>Total</th>
                  <th>Payment</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>

              <tbody>
                {filteredBills.map((item) => (
                  <tr key={item._id}>

                    <td>
                      <strong>
                        {item.billNumber}
                      </strong>
                    </td>

                    <td>
                      ₹{item.total}
                    </td>

                    <td>
                      {item.paymentMethod?.toUpperCase()}
                    </td>

                    <td>
                      <span className="status-badge">
                        {item.status}
                      </span>
                    </td>

                    <td>
                      <button
                        className="select-bill-button"
                        onClick={() =>
                          selectBill(item.billNumber)
                        }
                        disabled={
                          item.status === 'cancelled'
                        }
                      >
                        Select
                      </button>
                    </td>

                  </tr>
                ))}
              </tbody>

            </table>

          </div>
        )}

        {filteredBills.length > 5 && (
          <div className="bill-scroll-hint">
            Scroll to view more bills
          </div>
        )}

      </div>

      {/* Selected Bill */}
      {bill && (
        <div className="return-card">

          <div className="selected-bill-header">

            <div>
              <h3>{bill.billNumber}</h3>
              <p>Bill Total: ₹{bill.total}</p>
            </div>

            <span className="selected-status">
              {bill.status}
            </span>

          </div>

          <h3>Products</h3>

          {bill.items.map((item) => {
            const selected =
              selectedItems[item.product]

            return (
              <div
                className="return-item"
                key={item.product}
              >

                <div className="return-product">

                  <strong>{item.name}</strong>

                  <span>
                    ₹{item.price} × {item.quantity}
                  </span>

                </div>

                <div className="return-controls">

                  <input
                    type="number"
                    min="0"
                    max={item.quantity}
                    placeholder="Qty"
                    value={
                      selected?.quantity || ''
                    }
                    onChange={(e) =>
                      updateItem(
                        item.product,
                        'quantity',
                        e.target.value
                      )
                    }
                  />

                  <select
                    value={
                      selected?.reason ||
                      'changed_mind'
                    }
                    onChange={(e) =>
                      updateItem(
                        item.product,
                        'reason',
                        e.target.value
                      )
                    }
                  >
                    <option value="changed_mind">
                      Changed Mind
                    </option>

                    <option value="wrong_item">
                      Wrong Item
                    </option>

                    <option value="quality_issue">
                      Quality Issue
                    </option>

                    <option value="damaged">
                      Damaged
                    </option>

                    <option value="expired">
                      Expired
                    </option>

                    <option value="other">
                      Other
                    </option>
                  </select>

                  <label className="restock-check">

                    <input
                      type="checkbox"
                      checked={
                        selected?.restock === true
                      }
                      onChange={(e) =>
                        updateItem(
                          item.product,
                          'restock',
                          e.target.checked
                        )
                      }
                      disabled={
                        selected?.reason === 'damaged' ||
                        selected?.reason === 'expired'
                      }
                    />

                    Restock

                  </label>

                </div>

              </div>
            )
          })}

          <div className="return-details">

            <div>
              <label>Refund Method</label>

              <select
                value={refundMethod}
                onChange={(e) =>
                  setRefundMethod(e.target.value)
                }
              >
                <option value="cash">
                  Cash
                </option>

                <option value="upi">
                  UPI
                </option>

                <option value="card">
                  Card
                </option>

                <option value="store_credit">
                  Store Credit
                </option>
                <option value="razorpay">
                  Razorpay
                </option>
              </select>
            </div>

            <div>
              <label>Note</label>

              <input
                type="text"
                placeholder="Optional note"
                value={note}
                onChange={(e) =>
                  setNote(e.target.value)
                }
              />
            </div>

          </div>

          <button
            className="process-return"
            onClick={processReturn}
          >
            Process Return
          </button>

        </div>
      )}

      <div className="return-card">
        <div className="bills-header">
          <div>
            <h3>Return History</h3>
            <p>Previously processed customer returns</p>
          </div>
        </div>

        {historyLoading ? (
          <div className="no-bills"><p>Loading return history...</p></div>
        ) : historyError ? (
          <div className="no-bills return-history-error">
            <p>{historyError}</p>
            <button className="select-bill-button" onClick={fetchReturnHistory}>
              Try again
            </button>
          </div>
        ) : returnHistory.length === 0 ? (
          <div className="no-bills"><p>No returns have been processed yet.</p></div>
        ) : (
          <div className="bills-scroll-container return-history-scroll">
            <table className="bills-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Bill</th>
                  <th>Product</th>
                  <th>Quantity</th>
                  <th>Reason</th>
                  <th>Refund</th>
                  <th>Restocked</th>
                  <th>Processed by</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {returnHistory.flatMap((record) =>
                  record.items.map((item, index) => (
                    <tr key={`${record._id}-${index}`}>
                      <td>{new Date(record.createdAt).toLocaleDateString('en-GB', {
                        day: '2-digit', month: 'short', year: 'numeric',
                      })}</td>
                      <td><strong>{record.bill?.billNumber || '—'}</strong></td>
                      <td>{item.name || item.product?.name || 'Product'}</td>
                      <td>{item.quantity} {item.product?.unit || ''}</td>
                      <td>{(item.reason || 'other').replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())}</td>
                      <td>₹{Number(item.refundAmount).toLocaleString('en-IN')}</td>
                      <td>
                        <span className={item.restocked ? 'status-badge' : 'return-not-restocked'}>
                          {item.restocked ? 'Yes' : 'No'}
                        </span>
                      </td>
                      <td>{record.processedByName || record.processedBy?.name || 'Not recorded'}</td>
                      <td><button className="select-bill-button" onClick={() => viewReturn(record._id)}>View</button></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {viewingReturn && <div className="return-detail-overlay" role="presentation" onClick={() => setViewingReturn(null)}>
        <section className="return-detail-panel" role="dialog" aria-modal="true" aria-labelledby="return-detail-title" onClick={(event) => event.stopPropagation()}>
          <header className="return-detail-header"><div><h2 id="return-detail-title">Return {viewingReturn.returnNumber || 'Details'}</h2><p>Original bill: {viewingReturn.bill?.billNumber || 'Not recorded'}</p></div><button type="button" aria-label="Close return details" onClick={() => setViewingReturn(null)}>×</button></header>
          <div className="return-detail-meta">
            <p><strong>Processed by:</strong> {viewingReturn.processedByName || viewingReturn.processedBy?.name || 'Not recorded'}</p>
            <p><strong>Date and time:</strong> {viewingReturn.createdAt ? new Date(viewingReturn.createdAt).toLocaleString() : 'Not recorded'}</p>
            <p><strong>Refund method:</strong> {viewingReturn.refundMethod || 'Not recorded'}</p>
            <p><strong>Total refund:</strong> INR {Number(viewingReturn.totalRefund || 0).toLocaleString('en-IN')}</p>
            {viewingReturn.note && <p><strong>Note:</strong> {viewingReturn.note}</p>}
            {viewingReturn.razorpayRefund && <>
              <p><strong>Razorpay refund amount:</strong> INR {(Number(viewingReturn.razorpayRefund.amount || 0) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
              <p><strong>Razorpay refund status:</strong> {viewingReturn.razorpayRefund.status}</p>
              {viewingReturn.razorpayRefund.status === 'pending' && <p>Refund processing is pending. Use the same action to check again; it reuses the original request safely.</p>}
              {viewingReturn.razorpayRefund.status === 'failed' && <p className="return-wastage-note">Razorpay reports this refund failed. Review it in the Razorpay dashboard before taking further action.</p>}
              {viewingReturn.razorpayRefund.refundId && <p><strong>Razorpay reference:</strong> {viewingReturn.razorpayRefund.refundId}</p>}
              {viewingReturn.razorpayRefund.updatedAt && <p><strong>Refund updated:</strong> {new Date(viewingReturn.razorpayRefund.updatedAt).toLocaleString()}</p>}
            </>}
          </div>
          <div className="return-detail-items">{viewingReturn.items?.map((item, index) => <article key={`${item.product?._id || item.product}-${index}`}>
            <h3>{item.name || item.product?.name || 'Product details unavailable'}</h3>
            <p><strong>Product:</strong> {item.name || item.product?.name || 'Product details unavailable'}</p>
            <p><strong>Returned quantity:</strong> {item.quantity} {item.product?.unit || ''}</p>
            <p><strong>Reason:</strong> {(item.reason || 'other').replaceAll('_', ' ')}</p>
            <p><strong>Refund:</strong> INR {Number(item.refundAmount || 0).toLocaleString('en-IN')}</p>
            <p><strong>Restocked:</strong> {item.restocked ? 'Yes' : 'No'}</p>
            <p><strong>Original batches:</strong> {(item.originalBatches || []).length ? item.originalBatches.map((allocation) => `${allocation.batch?.batchNumber || 'Batch'} (${allocation.quantity}; cost ${allocation.unitCost ?? 'N/A'})`).join(', ') : 'N/A'}</p>
            {item.wastageWrittenOff && <p><strong>Wastage recorded:</strong> {item.wastageWrittenOffAt ? new Date(item.wastageWrittenOffAt).toLocaleString() : 'Yes'} by {item.wastageWrittenOffBy?.name || 'Not recorded'}</p>}
            {!item.restocked && !item.wastageWrittenOff && (isEligibleForWastage(item) ? null : <p className="return-wastage-note">Wastage write-off is unavailable because original batch or positive cost data was not recorded.</p>)}
          </article>)}</div>
          {isOwner && viewingReturn.refundMethod === 'razorpay' &&
            viewingReturn.bill?.status === 'completed' && viewingReturn.bill?.paymentMethod === 'razorpay' &&
            viewingReturn.razorpayRefund?.status !== 'processed' && viewingReturn.razorpayRefund?.status !== 'failed' &&
            <button type="button" className="process-return" onClick={requestRazorpayRefund} disabled={requestingRefund}>
              {requestingRefund ? 'Checking refund status...' : viewingReturn.razorpayRefund ? 'Retry / check Razorpay refund' : 'Initiate Razorpay refund'}
            </button>}
          {isOwner && viewingReturn.items?.some(isEligibleForWastage) && <button type="button" className="process-return" onClick={writeOffReturn} disabled={writingOffReturn}>{writingOffReturn ? 'Recording wastage...' : 'Record eligible items as wastage'}</button>}
        </section>
      </div>}

    </div>
  )
}

export default Returns
