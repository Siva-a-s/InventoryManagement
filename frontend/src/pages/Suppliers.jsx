import React, { useEffect, useState } from 'react'
import axios from 'axios'
import Layout from '../components/Layout'
import './Suppliers.css'

const Suppliers = () => {
  const [suppliers, setSuppliers] = useState([])
  const [products, setProducts] = useState([])

  const [showForm, setShowForm] = useState(false)
  const [editingSupplier, setEditingSupplier] = useState(null)

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [address, setAddress] = useState('')
  const [selectedProducts, setSelectedProducts] = useState([])
  const [isActive, setIsActive] = useState(true)
  const [search, setSearch] = useState('')

  const fetchSuppliers = async () => {
    try {
      const token = localStorage.getItem('token')

      const response = await axios.get(
        'http://localhost:5000/api/suppliers',
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      )

      setSuppliers(response.data)
    } catch (error) {
      console.error('Error fetching suppliers:', error)
    }
  }

  const fetchProducts = async () => {
    try {
      const token = localStorage.getItem('token')

      const response = await axios.get(
        'http://localhost:5000/api/products',
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      )

      setProducts(response.data.data || response.data)
    } catch (error) {
      console.error('Error fetching products:', error)
    }
  }

  useEffect(() => {
    fetchSuppliers()
    fetchProducts()
  }, [])

  const resetForm = () => {
    setName('')
    setPhone('')
    setEmail('')
    setAddress('')
    setSelectedProducts([])
    setIsActive(true)
    setEditingSupplier(null)
    setShowForm(false)
  }

  const handleProductChange = (e) => {
    const values = Array.from(
      e.target.selectedOptions,
      option => option.value
    )

    setSelectedProducts(values)
  }

  const handleAddSupplier = async (e) => {
    e.preventDefault()

    try {
      const token = localStorage.getItem('token')

      await axios.post(
        'http://localhost:5000/api/suppliers',
        {
          name,
          phone,
          email,
          address,
          products: selectedProducts
        },
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      )

      alert('Supplier added successfully')

      resetForm()
      fetchSuppliers()
    } catch (error) {
      console.error('Error adding supplier:', error)
      alert(
        error.response?.data?.message ||
        'Failed to add supplier'
      )
    }
  }

  const handleEditSupplier = async (e) => {
    e.preventDefault()

    try {
      const token = localStorage.getItem('token')

      await axios.put(
        `http://localhost:5000/api/suppliers/${editingSupplier._id}`,
        {
          name,
          phone,
          email,
          address,
          products: selectedProducts,
          isActive
        },
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      )

      alert('Supplier updated successfully')

      resetForm()
      fetchSuppliers()
    } catch (error) {
      console.error('Error updating supplier:', error)
      alert(
        error.response?.data?.message ||
        'Failed to update supplier'
      )
    }
  }

  const handleDeleteSupplier = async (supplierId) => {
    const confirmed = window.confirm(
      'Are you sure you want to delete this supplier?'
    )

    if (!confirmed) return

    try {
      const token = localStorage.getItem('token')

      await axios.delete(
        `http://localhost:5000/api/suppliers/${supplierId}`,
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      )

      alert('Supplier deleted successfully')

      fetchSuppliers()
    } catch (error) {
      console.error('Error deleting supplier:', error)
      alert(
        error.response?.data?.message ||
        'Failed to delete supplier'
      )
    }
  }

  const startEdit = (supplier) => {
    setEditingSupplier(supplier)

    setName(supplier.name)
    setPhone(supplier.phone || '')
    setEmail(supplier.email || '')
    setAddress(supplier.address || '')

    setSelectedProducts(
      supplier.products?.map(product => product._id) || []
    )

    setIsActive(supplier.isActive)

    setShowForm(true)
  }

  const filteredSuppliers = suppliers.filter((supplier) => {
    const searchText = search.toLowerCase()

    return (
      supplier.name?.toLowerCase().includes(searchText) ||
      supplier.phone?.toLowerCase().includes(searchText) ||
      supplier.email?.toLowerCase().includes(searchText)
    )
  })

  return (
    <Layout>
      <div className="suppliers-page">

        {/* Header */}
        <div className="suppliers-header">
          <div>
            <h1>Suppliers</h1>
            <p>Manage your suppliers and their product relationships</p>
          </div>

          <button
            className="add-supplier-btn"
            onClick={() => {
              setEditingSupplier(null)
              setShowForm(true)
            }}
          >
            + Add Supplier
          </button>
        </div>

        {/* Summary */}
        <div className="supplier-summary">

          <div className="supplier-card">
            <div className="supplier-card-title">
              Total Suppliers
            </div>

            <div className="supplier-card-value">
              {suppliers.length}
            </div>
          </div>

          <div className="supplier-card">
            <div className="supplier-card-title">
              Active Suppliers
            </div>

            <div className="supplier-card-value">
              {suppliers.filter(
                supplier => supplier.isActive
              ).length}
            </div>
          </div>

          <div className="supplier-card">
            <div className="supplier-card-title">
              Inactive Suppliers
            </div>

            <div className="supplier-card-value">
              {suppliers.filter(
                supplier => !supplier.isActive
              ).length}
            </div>
          </div>

        </div>

        {/* Form */}
        {showForm && (
          <form
            className="supplier-form"
            onSubmit={
              editingSupplier
                ? handleEditSupplier
                : handleAddSupplier
            }
          >

            <div className="supplier-form-header">
              <div>
                <h2>
                  {editingSupplier
                    ? 'Edit Supplier'
                    : 'Add New Supplier'}
                </h2>

                <p>
                  {editingSupplier
                    ? 'Update supplier information'
                    : 'Enter supplier details'}
                </p>
              </div>
            </div>

            <div className="supplier-form-grid">

              <div className="form-group">
                <label>Name</label>

                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Supplier name"
                  required
                />
              </div>

              <div className="form-group">
                <label>Phone</label>

                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Phone number"
                />
              </div>

              <div className="form-group">
                <label>Email</label>

                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email address"
                />
              </div>

              <div className="form-group">
                <label>Address</label>

                <textarea
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Supplier address"
                  rows="3"
                />
              </div>

              <div className="form-group full-width">
                <label>
                  Products Supplied
                </label>

                <select
                  multiple
                  value={selectedProducts}
                  onChange={handleProductChange}
                  className="products-select"
                >
                  {products.map((product) => (
                    <option
                      key={product._id}
                      value={product._id}
                    >
                      {product.name}
                    </option>
                  ))}
                </select>

                <small>
                  Hold Ctrl while selecting multiple products.
                </small>
              </div>

              {editingSupplier && (
                <div className="supplier-status-option">
                  <label>
                    <input
                      type="checkbox"
                      checked={isActive}
                      onChange={(e) =>
                        setIsActive(e.target.checked)
                      }
                    />

                    <span>Active Supplier</span>
                  </label>
                </div>
              )}

            </div>

            <div className="supplier-form-actions">

              <button
                type="submit"
                className="save-supplier-btn"
              >
                {editingSupplier
                  ? 'Update Supplier'
                  : 'Add Supplier'}
              </button>

              <button
                type="button"
                className="cancel-supplier-btn"
                onClick={resetForm}
              >
                Cancel
              </button>

            </div>

          </form>
        )}

        {/* Supplier List */}
        <div className="supplier-list-section">

          <div className="supplier-list-header">

            <div>
              <h2>Supplier List</h2>

              <p>
                {filteredSuppliers.length} supplier
                {filteredSuppliers.length === 1
                  ? ''
                  : 's'} found
              </p>
            </div>

            <input
              type="text"
              className="supplier-search"
              placeholder="Search suppliers..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />

          </div>

          {filteredSuppliers.length === 0 ? (
            <div className="supplier-empty">
              <div className="supplier-empty-icon">
                🏢
              </div>

              <h3>
                {search
                  ? 'No matching suppliers'
                  : 'No suppliers yet'}
              </h3>

              <p>
                {search
                  ? 'Try a different search term.'
                  : 'Add your first supplier using the button above.'}
              </p>
            </div>
          ) : (

            <div className="supplier-table-wrapper">

              <table className="supplier-table">

                <thead>
                  <tr>
                    <th>Supplier</th>
                    <th>Contact</th>
                    <th>Products</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>

                <tbody>

                  {filteredSuppliers.map((supplier) => (

                    <tr key={supplier._id}>

                      <td>
                        <div className="supplier-name">
                          <div className="supplier-avatar">
                            {supplier.name
                              ?.charAt(0)
                              ?.toUpperCase()}
                          </div>

                          <div>
                            <strong>
                              {supplier.name}
                            </strong>

                            <span>
                              Supplier
                            </span>
                          </div>
                        </div>
                      </td>

                      <td>
                        <div className="contact-info">

                          <div>
                            {supplier.phone || '-'}
                          </div>

                          <div className="supplier-email">
                            {supplier.email || '-'}
                          </div>

                        </div>
                      </td>

                      <td>
                        {supplier.products?.length > 0 ? (
                          <div className="product-tags">

                            {supplier.products
                              .slice(0, 3)
                              .map((product) => (
                                <span
                                  key={product._id}
                                  className="product-tag"
                                >
                                  {product.name}
                                </span>
                              ))}

                            {supplier.products.length > 3 && (
                              <span className="more-products">
                                +{supplier.products.length - 3}
                              </span>
                            )}

                          </div>
                        ) : (
                          <span className="no-products">
                            No products
                          </span>
                        )}
                      </td>

                      <td>
                        <span
                          className={
                            supplier.isActive
                              ? 'supplier-status active'
                              : 'supplier-status inactive'
                          }
                        >
                          {supplier.isActive
                            ? 'Active'
                            : 'Inactive'}
                        </span>
                      </td>

                      <td>
                        <div className="supplier-actions">

                          <button
                            className="edit-supplier-btn"
                            onClick={() =>
                              startEdit(supplier)
                            }
                          >
                            Edit
                          </button>

                          <button
                            className="delete-supplier-btn"
                            onClick={() =>
                              handleDeleteSupplier(
                                supplier._id
                              )
                            }
                          >
                            Delete
                          </button>

                        </div>
                      </td>

                    </tr>

                  ))}

                </tbody>

              </table>

            </div>

          )}

        </div>

      </div>
    </Layout>
  )
}

export default Suppliers
