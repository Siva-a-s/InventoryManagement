import React from 'react'
import { Link } from 'react-router-dom'

const Sidebar = () => {
  const handleLogout = () => {
  localStorage.removeItem('token')
  window.location.href = '/'
}
const role = localStorage.getItem('role')

  return (
    <div>

      <h2>🛒 Smart Inventory</h2>

      <nav>
{/* Dashboard */}
<Link to="/dashboard">Dashboard</Link>

{/* Owner only */}
{role === 'owner' && (
  <Link to="/products">Products</Link>
)}

{role === 'owner' && (
  <Link to="/categories">Categories</Link>
)}

{role === 'owner' && (
  <Link to="/suppliers">Suppliers</Link>
)}

{/* Owner + Staff */}
<Link to="/inventory">Inventory</Link>

<Link to="/purchase-orders">Purchase Orders</Link>

<Link to="/billing">Billing</Link>

<Link to="/returns">Returns</Link>

{/* Owner only */}
{role === 'owner' && (
  <Link to="/wastage">Wastage</Link>
)}

{/* Owner + Staff */}
<Link to="/alerts">Alerts</Link>

{/* Owner only */}
{role === 'owner' && (
  <Link to="/reports">Reports</Link>
)}

{role === 'owner' && (
  <Link to="/staff">Staff</Link>
)}

      </nav>

      <button onClick={handleLogout} className="logout-button">
  Logout
</button>

    </div>
  )
}

export default Sidebar