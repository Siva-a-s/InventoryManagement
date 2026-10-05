import React from 'react'
import Layout from '../components/Layout'
import './Dashboard.css'

const Dashboard = () => {
  return (
    <Layout>

      <h1>Dashboard</h1>

      <p>Welcome to Smart Inventory Management</p>

      <div className="dashboard-cards">

        <div className="dashboard-card">
          <h3>Total Products</h3>
          <p>0</p>
        </div>

        <div className="dashboard-card">
          <h3>Total Stock</h3>
          <p>0</p>
        </div>

        <div className="dashboard-card">
          <h3>Low Stock</h3>
          <p>0</p>
        </div>

        <div className="dashboard-card">
          <h3>Today's Sales</h3>
          <p>₹0</p>
        </div>

      </div>

    </Layout>
  )
}

export default Dashboard