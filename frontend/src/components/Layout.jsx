import React from 'react'
import Sidebar from './Sidebar'
import './Layout.css'

const Layout = ({ children }) => {
  return (
    <div className="app-layout">

      <aside className="sidebar">
        <Sidebar />
      </aside>

      <main className="main-content">
        {children}
      </main>

    </div>
  )
}

export default Layout