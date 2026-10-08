import { useCallback, useEffect, useState } from 'react'
import axios from 'axios'
import './Returns.css'

const Returns = () => {
  const [bills, setBills] = useState([])
  const [bill, setBill] = useState(null)

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
      alert(
        error.response?.data?.message ||
          'Failed to load bills'
      )
    }
  }, [token])

  useEffect(() => {
    // Initial API loading is an external synchronization effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchBills()
  }, [fetchBills])

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
      alert(
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
      alert('Select at least one product to return')
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

      alert(
        `Return processed successfully. Refund: ₹${response.data.return.totalRefund}`
      )

      setBill(null)
      setSelectedItems({})
      setRefundMethod('cash')
      setNote('')

      fetchBills()
    } catch (error) {
      alert(
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

    </div>
  )
}

export default Returns
