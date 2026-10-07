import React from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'

import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Products from './pages/Products'
import Categories from './pages/Categories'
import Suppliers from './pages/Suppliers'
import Inventory from './pages/Inventory'
import PurchaseOrder from './pages/PurchaseOrder'
import Billing from './pages/Billing'
import Returns from './pages/Returns'
import Wastage from './pages/Wastage'
import Alerts from './pages/Alerts'
import Reports from './pages/Reports'
import Staff from './pages/Staff'

import Layout from './components/Layout'

const App = () => {
  return (
    <BrowserRouter>

      <Routes>

        <Route path="/" element={<Login />} />

        <Route path="/dashboard" element={<Dashboard />} />

        <Route path="/products" element={<Products />} />
        
        <Route path="/categories" element={<Categories />} />

        <Route path="/suppliers" element={<Suppliers />} />

        <Route path="/inventory" element={<Inventory />} />
        <Route path="/purchase-orders" element={<PurchaseOrder />}
/>
         <Route
          path="/billing"
          element={
            <Layout>
              <Billing />
            </Layout>
          }
        />

        <Route
  path="/returns"
  element={
    <Layout>
      <Returns />
    </Layout>
  }
/>
<Route
  path="/wastage"
  element={
    <Layout>
      <Wastage />
    </Layout>
  }
/>

<Route
  path="/alerts"
  element={
    <Layout>
      <Alerts />
    </Layout>
  }
/>

<Route
  path="/reports"
  element={
    <Layout>
      <Reports />
    </Layout>
  }
/>

<Route
  path="/staff"
  element={
    <Layout>
      <Staff />
    </Layout>
  }
/>


        
      </Routes>

    </BrowserRouter>
  )
}

export default App