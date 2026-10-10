import { notify } from '../components/notifications'
import { useCallback, useEffect, useState } from 'react'
import axios from 'axios'
import { useNavigate } from 'react-router-dom'
import './Alerts.css'

const Alerts = () => {
  const navigate = useNavigate()
  const isOwner = localStorage.getItem('role') === 'owner'
  const [lowStock, setLowStock] = useState([])
  const [expiry, setExpiry] = useState([])
  const [summary, setSummary] = useState({})

  const token = localStorage.getItem('token')

  const fetchAlerts = useCallback(async () => {
    try {
      const response = await axios.get(
        'http://localhost:5000/api/alerts',
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      )

      setLowStock(response.data.lowStock || [])
      setExpiry(response.data.expiry || [])
      setSummary(response.data.summary || {})
    } catch (error) {
      console.log(error.response?.data)

      notify(
        error.response?.data?.message ||
          'Failed to load alerts'
      )
    }
  }, [token])

  useEffect(() => {
    // Initial API loading is an external synchronization effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchAlerts()
  }, [fetchAlerts])

  return (
    <div className="alerts-page">

      <div className="alerts-header">
        <div>
          <h1>Alerts</h1>
          <p>Monitor low stock and product expiry</p>
        </div>

        <button
          className="refresh-button"
          onClick={fetchAlerts}
        >
          Refresh
        </button>
      </div>

      {/* Summary */}
      <div className="alerts-summary">

        <div className="alert-summary-card">
          <span>Total Alerts</span>
          <strong>{summary.total || 0}</strong>
        </div>

        <div className="alert-summary-card">
          <span>Low Stock</span>
          <strong>{summary.lowStock || 0}</strong>
        </div>

        <div className="alert-summary-card">
          <span>Expiring Soon</span>
          <strong>{summary.expiringSoon || 0}</strong>
        </div>

        <div className="alert-summary-card">
          <span>Expired</span>
          <strong>{summary.expired || 0}</strong>
        </div>

      </div>

      {/* Low Stock */}
      <div className="alerts-card">

        <h3>Low Stock Products</h3>

        {lowStock.length === 0 ? (
          <p className="no-alert-message">
            No low stock products.
          </p>
        ) : (
          <table className="alerts-table">

            <thead>
              <tr>
                <th>Product</th>
                <th>Available batches</th>
                <th>Current Stock</th>
                <th>Reorder Level</th>
                <th>Suggested Order</th>
                <th>Alert</th>
                <th>Action</th>
              </tr>
            </thead>

            <tbody>
              {lowStock.map((item) => (
                <tr key={item.productId}>

                  <td>
                    <strong>{item.name}</strong>
                  </td>

                  <td className="alert-batch-list">
                    {item.batches?.length ? item.batches.map((batch) => <div key={batch.batchId}>
                      <strong>{batch.batchNumber || 'Batch'}</strong>: {batch.remainingQuantity} {item.unit || ''}
                      {batch.expiryDate && <small>Expires {new Date(batch.expiryDate).toLocaleDateString()}</small>}
                    </div>) : 'No non-expired stock batches'}
                  </td>

                  <td>
                    {item.currentStock} {item.unit}
                  </td>

                  <td>
                    {item.reorderLevel} {item.unit}
                  </td>

                  <td>
                    {item.suggestedReorderQty} {item.unit}
                  </td>

                  <td>
                    <span className="alert-badge warning">
                      {item.currentStock === 0
                        ? 'Out of Stock'
                        : 'Low Stock'}
                    </span>
                  </td>

                  <td><button type="button" className="create-po-shortcut" disabled={!isOwner} title={isOwner ? 'Prefill a new purchase order' : 'Only an owner can create purchase orders'} onClick={() => navigate(`/purchase-orders?productId=${encodeURIComponent(item.productId)}&quantity=${encodeURIComponent(item.suggestedReorderQty || 1)}`)}>Create Purchase Order</button>{!isOwner && <small>Owner access required</small>}</td>

                </tr>
              ))}
            </tbody>

          </table>
        )}

      </div>

      {/* Expiry Alerts */}
      <div className="alerts-card">

        <h3>Expiry Alerts</h3>

        {expiry.length === 0 ? (
          <p className="no-alert-message">
            No expiry alerts.
          </p>
        ) : (
          <table className="alerts-table">

            <thead>
              <tr>
                <th>Product</th>
                <th>Batch</th>
                <th>Quantity</th>
                <th>Expiry Date</th>
                <th>Status</th>
              </tr>
            </thead>

            <tbody>
              {expiry.map((item) => (
                <tr key={item.batchId}>

                  <td>
                    <strong>{item.name}</strong>
                  </td>

                  <td>
                    {item.batchNumber || '-'}
                  </td>

                  <td>
                    {item.quantity} {item.unit}
                  </td>

                  <td>
                    {new Date(
                      item.expiryDate
                    ).toLocaleDateString()}
                  </td>

                  <td>
                    <span
                      className={`alert-badge ${
                        item.type === 'EXPIRED'
                          ? 'danger'
                          : 'expiry'
                      }`}
                    >
                      {item.type === 'EXPIRED'
                        ? 'Expired'
                        : 'Expiring Soon'}
                    </span>
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

export default Alerts

