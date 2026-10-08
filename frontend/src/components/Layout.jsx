import { Link, useLocation } from 'react-router-dom'
import { Bell, ChevronRight } from 'lucide-react'
import Sidebar from './Sidebar'
import './Layout.css'

const pageNames = {
  '/dashboard': 'Dashboard',
  '/products': 'Products',
  '/categories': 'Categories',
  '/suppliers': 'Suppliers',
  '/inventory': 'Inventory',
  '/purchase-orders': 'Purchase orders',
  '/billing': 'Billing',
  '/returns': 'Returns',
  '/wastage': 'Wastage',
  '/alerts': 'Stock alerts',
  '/reports': 'Reports',
  '/staff': 'Staff',
}

const Layout = ({ children }) => {
  const { pathname } = useLocation()
  const pageName = pageNames[pathname] || 'Workspace'

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <Sidebar />
      </aside>
      <div className="workspace-content">
        <header className="topbar">
          <div className="breadcrumb"><span>Workspace</span><ChevronRight size={16} /><strong>{pageName}</strong></div>
          <div className="topbar-actions">
            <span className="topbar-role">{localStorage.getItem('role') || 'User'}</span>
            <Link className="topbar-alert-link" to="/alerts" aria-label="Open stock alerts"><Bell size={19} /></Link>
          </div>
        </header>
        <main className="main-content">{children}</main>
      </div>
    </div>
  )
}

export default Layout
