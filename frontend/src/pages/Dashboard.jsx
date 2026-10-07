import React, { useEffect, useState } from 'react'
import axios from 'axios'
import Layout from '../components/Layout'
import './Dashboard.css'

const Dashboard = () => {
  const [products, setProducts] = useState([])
  const [stock, setStock] = useState([])
  const [bills, setBills] = useState([])
  const [orders, setOrders] = useState([])
  const [alerts, setAlerts] = useState({
    lowStock: [],
    expiry: []
  })

  const token = localStorage.getItem('token')

  useEffect(() => {
    fetchDashboardData()
  }, [])

  const fetchDashboardData = async () => {
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
        axios.get('http://localhost:5000/api/stock', { headers }),
        axios.get('http://localhost:5000/api/bills', { headers }),
        axios.get('http://localhost:5000/api/purchase-orders', { headers }),
        axios.get('http://localhost:5000/api/alerts', { headers })
      ])

      setProducts(
        productsResponse.data.data || productsResponse.data || []
      )

      setStock(
        stockResponse.data.data || stockResponse.data || []
      )

      setBills(
        billsResponse.data.bills ||
        billsResponse.data.data ||
        billsResponse.data ||
        []
      )

      setOrders(
        ordersResponse.data.orders || []
      )

      setAlerts({
        lowStock: alertsResponse.data.lowStock || [],
        expiry: alertsResponse.data.expiry || []
      })
    } catch (error) {
      console.error('Dashboard error:', error)
    }
  }

  // Total available stock
  const totalStock = stock.reduce(
    (total, batch) => total + (batch.remainingQuantity || 0),
    0
  )

  // Today's bills
  const today = new Date().toDateString()

  const todayBills = bills.filter(
    (bill) =>
      bill.createdAt &&
      new Date(bill.createdAt).toDateString() === today
  )

  // Today's sales
  const todaySales = todayBills.reduce(
    (total, bill) => total + (bill.total || 0),
    0
  )

  // Pending purchase orders
  const pendingOrders = orders.filter(
    (order) => order.status === 'pending'
  )

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
          <p>{totalStock}</p>
        </div>

        <div className="dashboard-card">
          <h3>Low Stock</h3>
          <p>{alerts.lowStock.length}</p>
        </div>

        <div className="dashboard-card">
          <h3>Today's Sales</h3>
          <p>₹{todaySales.toFixed(2)}</p>
        </div>

        <div className="dashboard-card">
          <h3>Today's Bills</h3>
          <p>{todayBills.length}</p>
        </div>

        <div className="dashboard-card">
          <h3>Pending Orders</h3>
          <p>{pendingOrders.length}</p>
        </div>

      </div>

      {/* NEEDS ATTENTION */}

      <div className="attention-section">

        <div className="section-header">
          <h2>⚠️ Needs Attention</h2>
        </div>

        {alerts.lowStock.length === 0 &&
         alerts.expiry.length === 0 &&
         pendingOrders.length === 0 ? (

          <div className="no-alerts">
            <span>✓</span>
            <p>Everything looks good. No immediate action required.</p>
          </div>

        ) : (

          <div className="attention-list">

            {alerts.lowStock.map((item, index) => (
              <div className="attention-item low-stock" key={`low-${index}`}>
                <div className="attention-icon">🔴</div>

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
                <div className="attention-icon">🟠</div>

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

            {pendingOrders.map((order, index) => (
              <div className="attention-item pending-order" key={`order-${index}`}>
                <div className="attention-icon">🔵</div>

                <div>
                  <strong>Pending Purchase Order</strong>
                  <p>
                    {order.poNumber || 'Purchase order'} is waiting to be received.
                  </p>
                </div>
              </div>
            ))}

          </div>

        )}

      </div>

    </Layout>
  )
}

export default Dashboard

