import React, { useEffect, useState } from 'react'
import axios from 'axios'
import './Reports.css'

const Reports = () => {
  const [sales, setSales] = useState(null)
  const [wastage, setWastage] = useState(null)
  const [returns, setReturns] = useState([])

  const [loading, setLoading] = useState(true)

  const token = localStorage.getItem('token')

  const headers = {
    Authorization: `Bearer ${token}`,
  }

  useEffect(() => {
    fetchReports()
  }, [])

  const fetchReports = async () => {
    try {
      setLoading(true)

      const [salesResponse, wastageResponse, returnsResponse] =
        await Promise.all([
          axios.get(
            'http://localhost:5000/api/bills/summary/today',
            { headers }
          ),

          axios.get(
            'http://localhost:5000/api/wastage/summary',
            { headers }
          ),

          axios.get(
            'http://localhost:5000/api/returns',
            { headers }
          ),
        ])

      setSales(salesResponse.data)
      setWastage(wastageResponse.data)

      setReturns(
        returnsResponse.data.returns ||
        returnsResponse.data.data ||
        []
      )
    } catch (error) {
      console.log(error.response?.data)

      alert(
        error.response?.data?.message ||
          'Failed to load reports'
      )
    } finally {
      setLoading(false)
    }
  }

  const totalRefunds = returns.reduce(
    (total, item) =>
      total + Number(item.totalRefund || 0),
    0
  )

  const totalSales =
    sales?.totalSales ||
    sales?.total ||
    sales?.sales ||
    0

  const totalBills =
    sales?.totalBills ||
    sales?.count ||
    sales?.billCount ||
    0

  const cashSales =
    sales?.byPayment?.cash ||
    sales?.cash ||
    0

  const upiSales =
    sales?.byPayment?.upi ||
    sales?.upi ||
    0

  const cardSales =
    sales?.byPayment?.card ||
    sales?.card ||
    0

  const totalWastage =
    wastage?.totalLoss ||
    wastage?.totalCost ||
    0

  const salesByDay =
    sales?.salesByDay ||
    sales?.byDay ||
    []

  if (loading) {
    return (
      <div className="reports-page">
        <p>Loading reports...</p>
      </div>
    )
  }

  return (
    <div className="reports-page">

      {/* Header */}
      <div className="reports-header">
        <div>
          <h1>Reports</h1>
          <p>View sales, returns and wastage summary</p>
        </div>

        <button
          className="refresh-report-button"
          onClick={fetchReports}
        >
          Refresh
        </button>
      </div>

      {/* Main Summary */}
      <div className="report-summary">

        <div className="report-card">
          <span>Total Sales</span>
          <strong>₹{totalSales}</strong>
        </div>

        <div className="report-card">
          <span>Total Bills</span>
          <strong>{totalBills}</strong>
        </div>

        <div className="report-card">
          <span>Total Returns</span>
          <strong>₹{totalRefunds}</strong>
        </div>

        <div className="report-card">
          <span>Wastage Loss</span>
          <strong>₹{totalWastage}</strong>
        </div>

      </div>

      {/* Payment Summary */}
      <div className="report-section">

        <h3>Payment Summary</h3>

        <div className="payment-grid">

          <div className="payment-card">
            <span>Cash</span>
            <strong>₹{cashSales}</strong>
          </div>

          <div className="payment-card">
            <span>UPI</span>
            <strong>₹{upiSales}</strong>
          </div>

          <div className="payment-card">
            <span>Card</span>
            <strong>₹{cardSales}</strong>
          </div>

        </div>

      </div>

      {/* Sales By Day */}
      <div className="report-section">

        <h3>Sales by Day</h3>

        {salesByDay.length === 0 ? (
          <p className="empty-report">
            No daily sales data available.
          </p>
        ) : (
          <table className="report-table">

            <thead>
              <tr>
                <th>Date</th>
                <th>Sales</th>
                <th>Bills</th>
              </tr>
            </thead>

            <tbody>
              {salesByDay.map((item, index) => (
                <tr key={item._id || item.date || index}>

                  <td>
                    {item.date
                      ? new Date(
                          item.date
                        ).toLocaleDateString()
                      : '-'}
                  </td>

                  <td>
                    ₹
                    {item.totalSales ||
                      item.total ||
                      item.sales ||
                      0}
                  </td>

                  <td>
                    {item.totalBills ||
                      item.count ||
                      item.bills ||
                      0}
                  </td>

                </tr>
              ))}
            </tbody>

          </table>
        )}

      </div>

      {/* Returns */}
      <div className="report-section">

        <h3>Recent Returns</h3>

        {returns.length === 0 ? (
          <p className="empty-report">
            No returns found.
          </p>
        ) : (
          <table className="report-table">

            <thead>
              <tr>
                <th>Bill</th>
                <th>Refund</th>
                <th>Method</th>
                <th>Date</th>
              </tr>
            </thead>

            <tbody>
              {returns.slice(0, 10).map((item) => (
                <tr key={item._id}>

                  <td>
                    {item.bill?.billNumber ||
                      item.billNumber ||
                      '-'}
                  </td>

                  <td>
                    ₹{item.totalRefund || 0}
                  </td>

                  <td>
                    {item.refundMethod?.toUpperCase() ||
                      '-'}
                  </td>

                  <td>
                    {item.createdAt
                      ? new Date(
                          item.createdAt
                        ).toLocaleDateString()
                      : '-'}
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

export default Reports

