import { useCallback, useEffect, useState } from 'react'
import axios from 'axios'
import Layout from '../components/Layout'
import './Dashboard.css'

const Dashboard = () => {
  const [products, setProducts] = useState([])
  const [stock, setStock] = useState({ availableStock: 0 })
  const [todaySales, setTodaySales] = useState({ totalSales: 0, totalBills: 0 })
  const [pendingOrders, setPendingOrders] = useState(0)
  const [alerts, setAlerts] = useState({
    lowStock: [],
    expiry: []
  })

  const token = localStorage.getItem('token')

  const fetchDashboardData = useCallback(async () => {
    try {
      const headers = {
        Authorization: `Bearer ${token}`
      }

      const [
        productsResponse,
        stockResponse,
        billsResponse,
        ordersResponse,
        alertsResponse
      ] = await Promise.all([
        axios.get('http://localhost:5000/api/products', { headers }),
        axios.get('http://localhost:5000/api/stock/summary', { headers }),
        axios.get('http://localhost:5000/api/bills/summary/today', { headers }),
        axios.get('http://localhost:5000/api/purchase-orders/summary', { headers }),
        axios.get('http://localhost:5000/api/alerts', { headers })
      ])

      setProducts(
        productsResponse.data.data || productsResponse.data || []
      )

      setStock(stockResponse.data)
      setTodaySales(billsResponse.data)
      setPendingOrders(ordersResponse.data.pendingOrders || 0)

      setAlerts({
        lowStock: alertsResponse.data.lowStock || [],
        expiry: alertsResponse.data.expiry || []
      })
    } catch (error) {
      console.error('Dashboard error:', error)
    }
  }, [token])

  useEffect(() => {
    // Initial API loading is an external synchronization effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchDashboardData()
  }, [fetchDashboardData])

  return (
    <Layout>

      <div className="dashboard-header">
        <div>
          <h1>Dashboard</h1>
          <p>Welcome to Smart Inventory Management</p>
        </div>
      </div>

      {/* SUMMARY CARDS */}

      <div className="dashboard-cards">

        <div className="dashboard-card">
          <h3>Total Products</h3>
          <p>{products.length}</p>
        </div>

        <div className="dashboard-card">
          <h3>Total Stock</h3>
          <p>{stock.availableStock || 0}</p>
        </div>

        <div className="dashboard-card">
          <h3>Low Stock</h3>
          <p>{alerts.lowStock.length}</p>
        </div>

        <div className="dashboard-card">
          <h3>Today's Sales</h3>
          <p>₹{Number(todaySales.totalSales || 0).toFixed(2)}</p>
        </div>

        <div className="dashboard-card">
          <h3>Today's Bills</h3>
          <p>{todaySales.totalBills || 0}</p>
        </div>

        <div className="dashboard-card">
          <h3>Pending Orders</h3>
          <p>{pendingOrders}</p>
        </div>

      </div>

      {/* NEEDS ATTENTION */}

      <div className="attention-section">

        <div className="section-header">
          <h2>Needs Attention</h2>
        </div>

        {alerts.lowStock.length === 0 &&
         alerts.expiry.length === 0 &&
         pendingOrders === 0 ? (

          <div className="no-alerts">
            <span>✓</span>
            <p>Everything looks good. No immediate action required.</p>
          </div>

        ) : (

          <div className="attention-list">

            {alerts.lowStock.map((item, index) => (
              <div className="attention-item low-stock" key={`low-${index}`}>
                <div className="attention-icon">!</div>
                <div>
                  <strong>Low Stock</strong>
                  <p>
                    {item.product?.name ||
                     item.name ||
                     'Product'} needs to be restocked.
                  </p>
                </div>
              </div>
            ))}

            {alerts.expiry.map((item, index) => (
              <div className="attention-item expiry-alert" key={`expiry-${index}`}>
                <div className="attention-icon">!</div>
                <div>
                  <strong>Expiring Soon</strong>
                  <p>
                    {item.product?.name ||
                     item.name ||
                     'Product'} is approaching expiry.
                  </p>
                </div>
              </div>
            ))}

            {pendingOrders > 0 && (
              <div className="attention-item pending-order">
                <div className="attention-icon">!</div>
                <div>
                  <strong>Pending Purchase Orders</strong>
                  <p>{pendingOrders} purchase order(s) are waiting to be received.</p>
                </div>
              </div>
            )}

          </div>

        )}

      </div>

    </Layout>
  )
}

export default Dashboard

