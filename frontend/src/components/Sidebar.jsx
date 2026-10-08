import { NavLink } from 'react-router-dom'
import { BarChart3, Bell, Boxes, ClipboardList, LayoutDashboard, Layers, LogOut, Package, ReceiptText, RotateCcw, Trash2, Truck, Users } from 'lucide-react'

const Sidebar = () => {
  const handleLogout = () => {
    localStorage.removeItem('token')
    window.location.href = '/'
  }
  const role = localStorage.getItem('role')

  return (
    <div className="sidebar-inner">

      <div className="brand-lockup"><span className="brand-mark"><Boxes size={23} /></span><span className="brand-copy"><strong>StockFlow</strong><small>INVENTORY MANAGEMENT</small></span></div>

      <h2>Smart Inventory</h2>

      <div className="sidebar-section-label">WORKSPACE</div>
      <nav className="sidebar-nav" aria-label="Main navigation">
{/* Dashboard */}
<NavLink className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`} to="/dashboard"><LayoutDashboard size={19}/><span>Dashboard</span></NavLink>

{/* Owner only */}
{role === 'owner' && (
  <NavLink className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`} to="/products"><Package size={19}/><span>Products</span></NavLink>
)}

{role === 'owner' && (
  <NavLink className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`} to="/categories"><Layers size={19}/><span>Categories</span></NavLink>
)}

{role === 'owner' && (
  <NavLink className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`} to="/suppliers"><Truck size={19}/><span>Suppliers</span></NavLink>
)}

{/* Owner + Staff */}
<NavLink className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`} to="/inventory"><Boxes size={19}/><span>Inventory</span></NavLink>

<NavLink className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`} to="/purchase-orders"><ClipboardList size={19}/><span>Purchase orders</span></NavLink>

<NavLink className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`} to="/billing"><ReceiptText size={19}/><span>Billing</span></NavLink>

<NavLink className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`} to="/returns"><RotateCcw size={19}/><span>Returns</span></NavLink>

{/* Owner only */}
{role === 'owner' && (
  <NavLink className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`} to="/wastage"><Trash2 size={19}/><span>Wastage</span></NavLink>
)}

{/* Owner + Staff */}
<NavLink className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`} to="/alerts"><Bell size={19}/><span>Stock alerts</span></NavLink>

{/* Owner only */}
{role === 'owner' && (
  <NavLink className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`} to="/reports"><BarChart3 size={19}/><span>Reports</span></NavLink>
)}

{role === 'owner' && (
  <NavLink className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`} to="/staff"><Users size={19}/><span>Staff</span></NavLink>
)}

      </nav>

      <button onClick={handleLogout} className="logout-button">
  <LogOut size={20}/><span>Log out</span>
</button>

    </div>
  )
}

export default Sidebar
