import React from 'react'
import { Link } from 'react-router-dom'

const Sidebar = () => {
  return (
    <div>

      <h2>🛒 Smart Inventory</h2>

      <nav>

        <Link to="/dashboard">
          Dashboard
        </Link>

        <Link to="/products">
          Products
        </Link>

        <p>Categories</p>
        <p>Suppliers</p>
        <p>Inventory</p>
        <p>Purchase Orders</p>
        <p>Billing</p>
        <p>Returns</p>
        <p>Wastage</p>
        <p>Alerts</p>
        <p>Reports</p>
        <p>Staff</p>

      </nav>

      <p>Logout</p>

    </div>
  )
}

export default Sidebar