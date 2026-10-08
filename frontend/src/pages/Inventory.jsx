import { useEffect, useState } from 'react'
import axios from 'axios'
import Layout from '../components/Layout'
import './Inventory.css'

const Inventory = () => {
  const [batches, setBatches] = useState([])
  const [products, setProducts] = useState([])
  const [suppliers, setSuppliers] = useState([])

  const [showForm, setShowForm] = useState(false)

  // Add Stock form
  const [product, setProduct] = useState('')
  const [quantity, setQuantity] = useState('')
  const [batchNumber, setBatchNumber] = useState('')
  const [costPrice, setCostPrice] = useState('')
  const [expiryDate, setExpiryDate] = useState('')
  const [purchaseDate, setPurchaseDate] = useState('')
  const [supplier, setSupplier] = useState('')
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [notes, setNotes] = useState('')

  // Edit Stock
  const [editingBatch, setEditingBatch] = useState(null)
  const [editQuantity, setEditQuantity] = useState('')
  const [editCostPrice, setEditCostPrice] = useState('')
  const [editExpiryDate, setEditExpiryDate] = useState('')
  const [editBatchNumber, setEditBatchNumber] = useState('')
  const [editNotes, setEditNotes] = useState('')

const [searchProduct, setSearchProduct] = useState('')
const [selectedSupplier, setSelectedSupplier] = useState('')
const [stockStatus, setStockStatus] = useState('all')
const [expiryFilter, setExpiryFilter] = useState('all')

  const role = localStorage.getItem('role')

  const fetchBatches = async () => {
    try {
      const token = localStorage.getItem('token')

      const allBatches = []
      let page = 1
      let pages = 1
      do {
        const response = await axios.get(
          'http://localhost:5000/api/stock',
          {
            params: { status: 'all', page, limit: 100 },
            headers: { Authorization: `Bearer ${token}` }
          }
        )
        allBatches.push(...(response.data.data || []))
        pages = response.data.pages || 1
        page += 1
      } while (page <= pages)

      setBatches(allBatches)
    } catch (error) {
      console.error('Error fetching stock:', error)
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

  const fetchSuppliers = async () => {
    try {
      const token = localStorage.getItem('token')

      const response = await axios.get(
        'http://localhost:5000/api/suppliers?active=true',
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

  useEffect(() => {
    // These async loaders update state after their API requests complete.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchBatches()
    fetchProducts()
    fetchSuppliers()
  }, [])

  const resetForm = () => {
    setProduct('')
    setQuantity('')
    setBatchNumber('')
    setCostPrice('')
    setExpiryDate('')
    setPurchaseDate('')
    setSupplier('')
    setInvoiceNumber('')
    setNotes('')
    setShowForm(false)
  }

  // Add new stock
  const handleAddStock = async (e) => {
    e.preventDefault()

    try {
      const token = localStorage.getItem('token')

      await axios.post(
        'http://localhost:5000/api/stock',
        {
          product,
          quantity: Number(quantity),
          batchNumber: batchNumber || undefined,
          costPrice: costPrice ? Number(costPrice) : undefined,
          expiryDate: expiryDate || undefined,
          purchaseDate: purchaseDate || undefined,
          supplier: supplier || undefined,
          invoiceNumber: invoiceNumber || undefined,
          notes: notes || undefined
        },
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      )

      alert('Stock added successfully')

      resetForm()
      fetchBatches()
    } catch (error) {
      console.error('Error adding stock:', error)
      alert(error.response?.data?.message || 'Failed to add stock')
    }
  }

  // Open edit form
  const handleEdit = (batch) => {
    setEditingBatch(batch)

    setEditQuantity(batch.quantity || '')
    setEditCostPrice(batch.costPrice || '')
    setEditBatchNumber(batch.batchNumber || '')
    setEditNotes(batch.notes || '')

    setEditExpiryDate(
      batch.expiryDate
        ? new Date(batch.expiryDate).toISOString().split('T')[0]
        : ''
    )
  }

  // Update stock batch
  const handleUpdateStock = async (e) => {
    e.preventDefault()

    try {
      const token = localStorage.getItem('token')

      await axios.put(
        `http://localhost:5000/api/stock/${editingBatch._id}`,
        {
          quantity: Number(editQuantity),
          costPrice: editCostPrice
            ? Number(editCostPrice)
            : undefined,
          batchNumber: editBatchNumber || undefined,
          expiryDate: editExpiryDate || undefined,
          notes: editNotes || undefined
        },
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      )

      alert('Stock batch updated successfully')

      setEditingBatch(null)
      fetchBatches()
    } catch (error) {
      console.error('Error updating stock:', error)
      alert(
        error.response?.data?.message ||
        'Failed to update stock batch'
      )
    }
  }

  // Delete stock batch
  const handleDelete = async (batchId) => {
    const confirmed = window.confirm(
      'Are you sure you want to delete this stock batch?'
    )

    if (!confirmed) return

    try {
      const token = localStorage.getItem('token')

      await axios.delete(
        `http://localhost:5000/api/stock/${batchId}`,
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      )

      alert('Stock batch deleted successfully')

      fetchBatches()
    } catch (error) {
      console.error('Error deleting stock:', error)
      alert(
        error.response?.data?.message ||
        'Failed to delete stock batch'
      )
    }
  }

  // Summary values
  const totalBatches = batches.length

  const totalAvailable = batches.reduce(
    (total, batch) => total + (
      batch.expiryDate && new Date(batch.expiryDate) < new Date()
        ? 0
        : Number(batch.remainingQuantity || 0)
    ),
    0
  )

  const lowStockBatches = batches.filter(
    (batch) =>
      Number(batch.remainingQuantity || 0) <= 10
  ).length

  const expiredBatches = batches.filter(
    (batch) =>
      batch.remainingQuantity > 0 &&
      batch.expiryDate &&
      new Date(batch.expiryDate) < new Date()
  ).length

  const filteredBatches = batches.filter((batch) => {

  const productName = batch.product?.name?.toLowerCase() || ''

  const matchesProduct =
    productName.includes(searchProduct.toLowerCase())

  const matchesSupplier =
    !selectedSupplier ||
    batch.supplier?._id === selectedSupplier

  const matchesStatus =
    stockStatus === 'all' ||
    (stockStatus === 'available' && batch.remainingQuantity > 0 && (!batch.expiryDate || new Date(batch.expiryDate) >= new Date())) ||
    (stockStatus === 'depleted' && batch.remainingQuantity === 0) ||
    (
      stockStatus === 'expired' &&
      batch.remainingQuantity > 0 &&
      batch.expiryDate &&
      new Date(batch.expiryDate) < new Date()
    )

  const matchesExpiry =
    expiryFilter === 'all' ||
    (
      expiryFilter === 'expiring' &&
      batch.expiryDate &&
      new Date(batch.expiryDate) >= new Date() &&
      new Date(batch.expiryDate) <=
        new Date(new Date().getTime() + 30 * 24 * 60 * 60 * 1000)
    )

  return (
    matchesProduct &&
    matchesSupplier &&
    matchesStatus &&
    matchesExpiry
  )
})

  return (
    <Layout>

      <div className="inventory-page">

        {/* Header */}

        <div className="inventory-header">

          <div>
            <h1>Inventory</h1>

            <p>
              Manage your stock batches and available inventory
            </p>
          </div>

          <button
            className="add-stock-btn"
            onClick={() => setShowForm(true)}
          >
            + Add Stock
          </button>

        </div>

        {/* Summary Cards */}

        <div className="inventory-summary">

          <div className="inventory-card">
            <span className="inventory-card-label">
              Total Batches
            </span>

            <strong>
              {totalBatches}
            </strong>
          </div>

          <div className="inventory-card">
            <span className="inventory-card-label">
              Available Stock
            </span>

            <strong>
              {totalAvailable}
            </strong>
          </div>

          <div className="inventory-card">
            <span className="inventory-card-label">
              Low Stock
            </span>

            <strong>
              {lowStockBatches}
            </strong>
          </div>

          <div className="inventory-card">
            <span className="inventory-card-label">
              Expired Batches
            </span>

            <strong>
              {expiredBatches}
            </strong>
          </div>

        </div>

        {/* Add Stock Form */}

        {showForm && (
          <form
            className="inventory-form"
            onSubmit={handleAddStock}
          >

            <div className="form-header">
              <div>
                <h2>Add Stock</h2>
                <p>
                  Add a new stock batch to inventory
                </p>
              </div>
            </div>

            <div className="inventory-form-grid">

              <div className="inventory-form-group">
                <label>Product</label>

                <select
                  value={product}
                  onChange={(e) =>
                    setProduct(e.target.value)
                  }
                  required
                >
                  <option value="">
                    Select Product
                  </option>

                  {products.map((item) => (
                    <option
                      key={item._id}
                      value={item._id}
                    >
                      {item.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="inventory-form-group">
                <label>Quantity</label>

                <input
                  type="number"
                  min="1"
                  value={quantity}
                  onChange={(e) =>
                    setQuantity(e.target.value)
                  }
                  placeholder="Enter quantity"
                  required
                />
              </div>

              <div className="inventory-form-group">
                <label>Batch Number</label>

                <input
                  type="text"
                  value={batchNumber}
                  onChange={(e) =>
                    setBatchNumber(e.target.value)
                  }
                  placeholder="Optional"
                />
              </div>

              <div className="inventory-form-group">
                <label>Cost Price</label>

                <input
                  type="number"
                  min="0"
                  value={costPrice}
                  onChange={(e) =>
                    setCostPrice(e.target.value)
                  }
                  placeholder="₹ Cost price"
                />
              </div>

              <div className="inventory-form-group">
                <label>Purchase Date</label>

                <input
                  type="date"
                  value={purchaseDate}
                  onChange={(e) =>
                    setPurchaseDate(e.target.value)
                  }
                />
              </div>

              <div className="inventory-form-group">
                <label>Expiry Date</label>

                <input
                  type="date"
                  value={expiryDate}
                  onChange={(e) =>
                    setExpiryDate(e.target.value)
                  }
                />
              </div>

              <div className="inventory-form-group">
                <label>Supplier</label>

                <select
                  value={supplier}
                  onChange={(e) =>
                    setSupplier(e.target.value)
                  }
                >
                  <option value="">
                    Select Supplier
                  </option>

                  {suppliers.map((item) => (
                    <option
                      key={item._id}
                      value={item._id}
                    >
                      {item.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="inventory-form-group">
                <label>Invoice Number</label>

                <input
                  type="text"
                  value={invoiceNumber}
                  onChange={(e) =>
                    setInvoiceNumber(e.target.value)
                  }
                  placeholder="Optional"
                />
              </div>

              <div className="inventory-form-group full-width">
                <label>Notes</label>

                <textarea
                  value={notes}
                  onChange={(e) =>
                    setNotes(e.target.value)
                  }
                  placeholder="Additional notes..."
                  rows="3"
                />
              </div>

            </div>

            <div className="inventory-form-actions">

              <button
                type="submit"
                className="save-stock-btn"
              >
                Add Stock
              </button>

              <button
                type="button"
                className="cancel-stock-btn"
                onClick={resetForm}
              >
                Cancel
              </button>

            </div>

          </form>
        )}

        {/* Edit Stock Form */}

        {editingBatch && role === 'owner' && (
          <form
            className="inventory-form"
            onSubmit={handleUpdateStock}
          >

            <div className="form-header">
              <div>
                <h2>Edit Stock Batch</h2>

                <p>
                  Correct details for{' '}
                  <strong>
                    {editingBatch.product?.name || 'this batch'}
                  </strong>
                </p>
              </div>
            </div>

            <div className="inventory-form-grid">

              <div className="inventory-form-group">
                <label>Quantity</label>

                <input
                  type="number"
                  min="1"
                  value={editQuantity}
                  onChange={(e) =>
                    setEditQuantity(e.target.value)
                  }
                  required
                />
              </div>

              <div className="inventory-form-group">
                <label>Cost Price</label>

                <input
                  type="number"
                  min="0"
                  value={editCostPrice}
                  onChange={(e) =>
                    setEditCostPrice(e.target.value)
                  }
                />
              </div>

              <div className="inventory-form-group">
                <label>Batch Number</label>

                <input
                  type="text"
                  value={editBatchNumber}
                  onChange={(e) =>
                    setEditBatchNumber(e.target.value)
                  }
                />
              </div>

              <div className="inventory-form-group">
                <label>Expiry Date</label>

                <input
                  type="date"
                  value={editExpiryDate}
                  onChange={(e) =>
                    setEditExpiryDate(e.target.value)
                  }
                />
              </div>

              <div className="inventory-form-group full-width">
                <label>Notes</label>

                <textarea
                  value={editNotes}
                  onChange={(e) =>
                    setEditNotes(e.target.value)
                  }
                  rows="3"
                />
              </div>

            </div>

            <div className="inventory-form-actions">

              <button
                type="submit"
                className="save-stock-btn"
              >
                Save Changes
              </button>

              <button
                type="button"
                className="cancel-stock-btn"
                onClick={() => setEditingBatch(null)}
              >
                Cancel
              </button>

            </div>

          </form>
        )}

        {/* Stock Table */}

        <div className="stock-section">

          <div className="stock-section-header">
            <div>
              <h2>Stock Batches</h2>

              <p>
                Current inventory by stock batch
              </p>
            </div>
          </div>

          <div className="stock-table-wrapper">


<div className="inventory-filters">

  <input
    type="text"
    placeholder="Search product..."
    value={searchProduct}
    onChange={(e) => setSearchProduct(e.target.value)}
  />

  <select
    value={selectedSupplier}
    onChange={(e) => setSelectedSupplier(e.target.value)}
  >
    <option value="">All Suppliers</option>

    {suppliers.map((supplier) => (
      <option key={supplier._id} value={supplier._id}>
        {supplier.name}
      </option>
    ))}
  </select>

  <select
    value={stockStatus}
    onChange={(e) => setStockStatus(e.target.value)}
  >
    <option value="all">All Stock</option>
    <option value="available">Available</option>
    <option value="depleted">Depleted</option>
    <option value="expired">Expired</option>
  </select>

  <select
    value={expiryFilter}
    onChange={(e) => setExpiryFilter(e.target.value)}
  >
    <option value="all">All Expiry</option>
    <option value="expiring">Expiring Soon</option>
  </select>

</div>




            <table className="stock-table">

              <thead>
                <tr>
                  <th>Product</th>
<th>Batch</th>
<th>Quantity</th>
<th>Available</th>
<th>Cost Price</th>
<th>Supplier</th>
<th>Received</th>
<th>Expiry</th>

                  {role === 'owner' && (
                    <th>Actions</th>
                  )}
                </tr>
              </thead>

              <tbody>

                {batches.length === 0 ? (
                  <tr>
                    <td
                      colSpan={role === 'owner' ? '8' : '7'}
                      className="empty-stock"
                    >
                      No stock batches found
                    </td>
                  </tr>
                ) : (
                  filteredBatches.map((batch) => {

                    const isExpired =
                      batch.expiryDate &&
                      new Date(batch.expiryDate) < new Date()

                    const isLowStock =
                      Number(batch.remainingQuantity || 0) <= 10

                    return (
                      <tr key={batch._id}>

                        <td>
                          <div className="product-name">
                            {batch.product?.name || '-'}
                          </div>

                          <div className="product-unit">
                            {batch.product?.unit || ''}
                          </div>
                        </td>

                        <td>
                          {batch.batchNumber || '-'}
                        </td>

                        <td>
                          {batch.quantity}
                        </td>

                        <td>
                          <span
                            className={
                              isLowStock
                                ? 'stock-low'
                                : 'stock-available'
                            }
                          >
                            {batch.remainingQuantity}
                          </span>
                        </td>

                        <td>
                          ₹{batch.costPrice || 0}
                        </td>

<td>
  {batch.supplier?.name || '-'}
</td>

<td>
  {batch.purchaseDate
    ? new Date(batch.purchaseDate).toLocaleDateString()
    : '-'}
</td>

<td>
  <span className={isExpired ? 'expiry-expired' : 'expiry-normal'}>
    {batch.expiryDate
      ? new Date(batch.expiryDate).toLocaleDateString()
      : '-'}
  </span>
</td>

                        {role === 'owner' && (
                          <td>
                            <div className="stock-actions">

                              <button
                                type="button"
                                className="edit-stock-btn"
                                onClick={() =>
                                  handleEdit(batch)
                                }
                              >
                                Edit
                              </button>

                              <button
                                type="button"
                                className="delete-stock-btn"
                                onClick={() =>
                                  handleDelete(batch._id)
                                }
                              >
                                Delete
                              </button>

                            </div>
                          </td>
                        )}

                      </tr>
                    )
                  })
                )}

              </tbody>

            </table>

          </div>

        </div>

      </div>

    </Layout>
  )
}

export default Inventory
