import React, { useEffect, useState } from 'react'
import axios from 'axios'
import './Reports.css'

const Reports = () => {
  const [report, setReport] = useState(null)
const [productPerformance, setProductPerformance] = useState({
  bestSelling: [],
  fastMoving: [],
})

const [purchaseAnalysis, setPurchaseAnalysis] = useState(null)
const [supplierPurchases, setSupplierPurchases] = useState([])
const [profitability, setProfitability] = useState(null)

const [period, setPeriod] = useState('month')
const [loading, setLoading] = useState(true)

  const token = localStorage.getItem('token')

  const headers = {
    Authorization: `Bearer ${token}`,
  }

  useEffect(() => {
    fetchReports()
  }, [])

  const getTodayDate = () => {
  return new Date().toISOString().split('T')[0]
}

const getStartDate = () => {
  const date = new Date()

  date.setDate(date.getDate() - 30)

  return date.toISOString().split('T')[0]
}

  const fetchReports = async () => {
  try {
    setLoading(true)

const response = await axios.get(
  'http://localhost:5000/api/reports/dashboard',
  { headers }
)

const bestSellingResponse = await axios.get(
  'http://localhost:5000/api/reports/top-products',
  {
    headers,
    params: {
      from: getStartDate(),
      to: getTodayDate(),
      limit: 10,
      sortBy: 'units',
      order: 'desc',
    },
  }
)

const fastMovingResponse = await axios.get(
  'http://localhost:5000/api/reports/fast-moving',
  {
    headers,
    params: {
      from: getStartDate(),
      to: getTodayDate(),
      limit: 10,
    },
  }
)
const purchaseResponse = await axios.get(
  'http://localhost:5000/api/reports/purchase-analysis',
  {
    headers,
    params: {
      from: getStartDate(),
      to: getTodayDate(),
    },
  }
)
const supplierResponse = await axios.get(
  'http://localhost:5000/api/reports/supplier-purchases',
  {
    headers,
    params: {
      from: getStartDate(),
      to: getTodayDate(),
      limit: 10,
    },
  }
)


const profitabilityResponse = await axios.get(
  'http://localhost:5000/api/reports/profitability',
  {
    headers,
    params: {
      from: getStartDate(),
      to: getTodayDate(),
    },
  }
)

setProfitability(
  profitabilityResponse.data.data
)



    setReport(response.data)

    setProductPerformance({
  bestSelling: bestSellingResponse.data.data || [],
  fastMoving: fastMovingResponse.data.data || [],
})
setPurchaseAnalysis(
  purchaseResponse.data.data
)
setSupplierPurchases(
  supplierResponse.data.data || []
)
  } catch (error) {
    console.error(
      'Reports error:',
      error.response?.data || error.message
    )

    alert(
      error.response?.data?.message ||
      'Failed to load reports'
    )
  } finally {
    setLoading(false)
  }
}

  const formatCurrency = (value) => {
    return `₹${Number(value || 0).toLocaleString('en-IN')}`
  }

  if (loading) {
    return (
      <div className="reports-page">
        <p>Loading reports...</p>
      </div>
    )
  }

  if (!report) {
    return (
      <div className="reports-page">
        <p>No report data available.</p>
      </div>
    )
  }

  const selectedSummary = report[period]

  const salesTrend = report.last7Days || []

  const grossSales = selectedSummary?.grossSales || 0
  const refunds = selectedSummary?.refunds || 0
  const netRevenue = selectedSummary?.netRevenue || 0
  const billCount = selectedSummary?.billCount || 0
  const itemsSold = selectedSummary?.itemsSold || 0
  const avgBillValue = selectedSummary?.avgBillValue || 0
  const wastageLoss = selectedSummary?.wastageLoss || 0
  const wastedUnits = selectedSummary?.wastedUnits || 0
  const refundCount = selectedSummary?.refundCount || 0

  return (
    <div className="reports-page">

      {/* Header */}

      <div className="reports-header">

        <div>
          <h1>Business Reports</h1>

          <p>
            Analyse your sales, revenue, returns and business performance.
          </p>
        </div>

        <div className="report-controls">

          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
          >
            <option value="today">Today</option>
            <option value="week">This Week</option>
            <option value="month">This Month</option>
          </select>

          <button
            className="refresh-report-button"
            onClick={fetchReports}
          >
            Refresh
          </button>

        </div>

      </div>

      {/* Business Overview */}

      <div className="report-section">

        <div className="section-heading">

          <div>
            <h2>Business Overview</h2>

            <p>
              Overall business performance for the selected period.
            </p>
          </div>

        </div>

        <div className="report-summary">

          <div className="report-card">
            <span>Gross Sales</span>
            <strong>
              {formatCurrency(grossSales)}
            </strong>
          </div>

          <div className="report-card">
            <span>Returns / Refunds</span>
            <strong>
              {formatCurrency(refunds)}
            </strong>
          </div>

          <div className="report-card highlight-card">
            <span>Net Revenue</span>
            <strong>
              {formatCurrency(netRevenue)}
            </strong>
          </div>

          <div className="report-card">
            <span>Total Bills</span>
            <strong>
              {billCount}
            </strong>
          </div>

          <div className="report-card">
            <span>Items Sold</span>
            <strong>
              {itemsSold}
            </strong>
          </div>

          <div className="report-card">
            <span>Average Bill Value</span>
            <strong>
              {formatCurrency(avgBillValue)}
            </strong>
          </div>

          <div className="report-card">
            <span>Wastage Loss</span>
            <strong>
              {formatCurrency(wastageLoss)}
            </strong>
          </div>

          <div className="report-card">
            <span>Wasted Units</span>
            <strong>
              {wastedUnits}
            </strong>
          </div>

        </div>

      </div>

      {/* Business Health */}

      <div className="report-section">

        <div className="section-heading">

          <div>
            <h2>Business Health</h2>

            <p>
              Important indicators for the selected period.
            </p>
          </div>

        </div>

        <div className="health-grid">

          <div className="health-card">

            <span>Net Revenue</span>

            <strong>
              {formatCurrency(netRevenue)}
            </strong>

            <small>
              Gross sales minus customer refunds
            </small>

          </div>

          <div className="health-card">

            <span>Average Bill</span>

            <strong>
              {formatCurrency(avgBillValue)}
            </strong>

            <small>
              Average value of each completed bill
            </small>

          </div>

          <div className="health-card">

            <span>Return Value</span>

            <strong>
              {formatCurrency(refunds)}
            </strong>

            <small>
              {refundCount} return
              {refundCount !== 1 ? 's' : ''} recorded
            </small>

          </div>

          <div className="health-card">

            <span>Wastage Cost</span>

            <strong>
              {formatCurrency(wastageLoss)}
            </strong>

            <small>
              Cost of stock written off as wastage
            </small>

          </div>

        </div>

      </div>

      {/* Product Performance */}

<div className="report-section">

  <div className="section-heading">

    <div>
      <h2>Product Performance</h2>

      <p>
        Understand which products sell the most and which products move fastest.
      </p>
    </div>

  </div>

  {/* Best Selling + Top Revenue */}

  <div className="performance-grid">

    <div className="performance-card">

      <h3>Best Selling Products</h3>

      <p>
        Products with the highest number of units sold.
      </p>
{!productPerformance.bestSelling.length ? (
      

        <p className="empty-report">
          No sales data available.
        </p>

      ) : (

        <div className="performance-list">

         {productPerformance.bestSelling.map(
            (product, index) => (

              <div
                className="performance-row"
                key={product.product || index}
              >

                <div>
                  <strong>
                    {index + 1}. {product.name}
                  </strong>

                  <small>
                    {product.unitsSold} units sold
                  </small>
                </div>

                <span>
                  {formatCurrency(product.revenue)}
                </span>

              </div>

            )
          )}

        </div>

      )}

    </div>


    <div className="performance-card">

      <h3>Fast-Moving Products</h3>

      <p>
        Products with the highest sell-through rate.
      </p>

      {!productPerformance?.fastMoving?.length ? (

        <p className="empty-report">
          No receiving and sales data available.
        </p>

      ) : (

        <div className="performance-list">

          {productPerformance.fastMoving.map(
            (product, index) => (

              <div
                className="performance-row"
                key={product.product || index}
              >

                <div>
                  <strong>
                    {index + 1}. {product.name}
                  </strong>

                  <small>
                    {product.unitsSold} sold / {product.unitsReceived} received
                  </small>
                </div>

                <span>
                  {product.sellThrough}%
                </span>

              </div>

            )
          )}

        </div>

      )}

    </div>

  </div>

</div>
{/* Purchasing Analysis */}

<div className="report-section">

  <div className="section-heading">

    <div>
      <h2>Purchasing Analysis</h2>

      <p>
        Understand how much the business is spending on stock purchases.
      </p>
    </div>

  </div>

  <div className="report-summary">

    <div className="report-card highlight-card">

      <span>Total Purchase Value</span>

      <strong>
        {formatCurrency(
          purchaseAnalysis?.purchaseValue
        )}
      </strong>

    </div>

    <div className="report-card">

      <span>Received Purchase Orders</span>

      <strong>
        {purchaseAnalysis?.receivedPOs || 0}
      </strong>

    </div>

    <div className="report-card">

      <span>Pending Purchase Orders</span>

      <strong>
        {purchaseAnalysis?.pendingPOs || 0}
      </strong>

    </div>

    <div className="report-card">

      <span>Cancelled Purchase Orders</span>

      <strong>
        {purchaseAnalysis?.cancelledPOs || 0}
      </strong>

    </div>

  </div>

</div>
{/* Supplier Purchase Analysis */}

<div className="report-section">

  <div className="section-heading">

    <div>
      <h2>Supplier Purchase Analysis</h2>

      <p>
        Suppliers ranked by the value of received purchases.
      </p>
    </div>

  </div>

  {!supplierPurchases.length ? (

    <p className="empty-report">
      No supplier purchase data available.
    </p>

  ) : (

    <div className="table-container">

      <table className="report-table">

        <thead>

          <tr>
            <th>Rank</th>
            <th>Supplier</th>
            <th>Purchase Value</th>
            <th>Purchase Orders</th>
            <th>Items Purchased</th>
          </tr>

        </thead>

        <tbody>

          {supplierPurchases.map(
            (supplier, index) => (

              <tr
                key={
                  supplier.supplier ||
                  index
                }
              >

                <td>
                  {index + 1}
                </td>

                <td>
                  <strong>
                    {supplier.name}
                  </strong>
                </td>

                <td>
                  {formatCurrency(
                    supplier.purchaseValue
                  )}
                </td>

                <td>
                  {supplier.purchaseOrders}
                </td>

                <td>
                  {supplier.itemsPurchased}
                </td>

              </tr>

            )
          )}

        </tbody>

      </table>

    </div>

  )}

</div>


<section className="report-section">
  <h2>Profitability Analysis</h2>

  <div className="report-summary">

    <div className="report-card">
      <h3>Net Revenue</h3>
      <p>
        {formatCurrency(profitability?.netRevenue)}
      </p>
    </div>

    <div className="report-card">
      <h3>Cost of Goods Sold</h3>
      <p>
        {formatCurrency(profitability?.cogs)}
      </p>
    </div>

    <div className="report-card">
      <h3>Gross Profit</h3>
      <p>
        {formatCurrency(profitability?.grossProfit)}
      </p>
    </div>

    <div className="report-card">
      <h3>Gross Margin</h3>
      <p>
        {profitability?.grossMargin || 0}%
      </p>
    </div>

  </div>
</section>


      {/* Sales Trend */}

      <div className="report-section">

        <div className="section-heading">

          <div>
            <h2>Sales Trend</h2>

            <p>
              Daily sales performance for the last 7 days.
            </p>
          </div>

        </div>

        {salesTrend.length === 0 ? (

          <p className="empty-report">
            No sales data available.
          </p>

        ) : (

          <div className="table-container">

            <table className="report-table">

              <thead>

                <tr>
                  <th>Date</th>
                  <th>Sales</th>
                  <th>Bills</th>
                  <th>Items Sold</th>
                  <th>Average Bill</th>
                </tr>

              </thead>

              <tbody>

                {salesTrend.map((item, index) => {

                  const sales =
                    item.sales || 0

                  const bills =
                    item.bills || 0

                  const items =
                    item.itemsSold || 0

                  const averageBill =
                    item.avgBillValue ||
                    (bills > 0
                      ? sales / bills
                      : 0)

                  return (
                    <tr
                      key={
                        item._id ||
                        item.date ||
                        index
                      }
                    >

                      <td>
                        {item._id ||
                          item.date ||
                          '-'}
                      </td>

                      <td>
                        {formatCurrency(sales)}
                      </td>

                      <td>
                        {bills}
                      </td>

                      <td>
                        {items}
                      </td>

                      <td>
                        {formatCurrency(
                          averageBill
                        )}
                      </td>

                    </tr>
                  )
                })}

              </tbody>

            </table>

          </div>

        )}

      </div>

    </div>
  )
}

export default Reports