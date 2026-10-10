import { confirmAction } from '../components/notifications'
import { notify } from '../components/notifications'
import { useEffect, useState } from 'react'
import axios from 'axios'
import Layout from '../components/Layout'
import './Inventory.css'

const Inventory = () => {
  const [batches, setBatches] = useState([])
  const [products, setProducts] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [historyExpanded, setHistoryExpanded] = useState(false)
  const [historyLoaded, setHistoryLoaded] = useState(false)
  const [wastageEntries, setWastageEntries] = useState([])
  const [historyProduct, setHistoryProduct] = useState('')
  const [historyType, setHistoryType] = useState('all')
  const [historyDate, setHistoryDate] = useState('')

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

      setBatches([...new Map(allBatches.map((batch) => [String(batch._id), batch])).values()])
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

  const toggleHistory = async () => {
    if (historyExpanded) {
      setHistoryExpanded(false)
      return
    }
    setHistoryExpanded(true)
    if (historyLoaded) return

    try {
      const token = localStorage.getItem('token')
      if (role === 'owner') {
        const entries = []
        let page = 1
        let pages = 1
        do {
          const response = await axios.get('http://localhost:5000/api/wastage', {
            params: { page, limit: 100 },
            headers: { Authorization: `Bearer ${token}` }
          })
          entries.push(...(response.data.entries || []))
          pages = response.data.pages || 1
          page += 1
        } while (page <= pages)
        setWastageEntries(entries)
      }
      setHistoryLoaded(true)
    } catch (error) {
      console.error('Error fetching inventory history:', error)
      notify(error.response?.data?.message || 'Failed to load inventory history')
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

      notify('Stock added successfully')

      resetForm()
      fetchBatches()
    } catch (error) {
      console.error('Error adding stock:', error)
      notify(error.response?.data?.message || 'Failed to add stock')
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

      notify('Stock batch updated successfully')

      setEditingBatch(null)
      fetchBatches()
    } catch (error) {
      console.error('Error updating stock:', error)
      notify(
        error.response?.data?.message ||
        'Failed to update stock batch'
      )
    }
  }

  // Delete stock batch
  const handleDelete = async (batchId) => {
    const confirmed = await confirmAction(
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

      notify('Stock batch deleted successfully')

      fetchBatches()
    } catch (error) {
      console.error('Error deleting stock:', error)
      notify(
        error.response?.data?.message ||
        'Failed to delete stock batch'
      )
    }
  }

  // Summary values
  const availableBatches = batches.filter((batch) =>
    Number(batch.remainingQuantity || 0) > 0 &&
    batch.product && batch.product.isActive !== false &&
    (!batch.expiryDate || new Date(batch.expiryDate) > new Date())
  )
  const totalBatches = batches.length
  const availableBatchCount = new Set(availableBatches.map((batch) => String(batch._id))).size
  const totalAvailable = availableBatches.reduce(
    (total, batch) => total + Number(batch.remainingQuantity || 0), 0
  )

  const lowStockBatches = availableBatches.filter(
    (batch) =>
      Number(batch.remainingQuantity || 0) <= 10
  ).length

  const expiredBatches = batches.filter(
    (batch) =>
      batch.remainingQuantity > 0 &&
      batch.expiryDate &&
      new Date(batch.expiryDate) < new Date()
  ).length

  const filteredBatches = availableBatches.filter((batch) => {

  const productName = batch.product?.name?.toLowerCase() || ''

  const matchesProduct =
    productName.includes(searchProduct.toLowerCase())

  const matchesSupplier =
    !selectedSupplier ||
    batch.supplier?._id === selectedSupplier

  const matchesStatus = stockStatus === 'all' || stockStatus === 'available'

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

  const historyEvents = [
    ...batches.map((batch) => ({
      id: `batch-${batch._id}`,
      date: batch.createdAt,
      product: batch.product?.name || 'Product details unavailable',
      productId: batch.product?._id || '',
      batchNumber: batch.batchNumber || 'Not recorded',
      type: batch.sourceType === 'purchase_order' ? 'purchase_order' : 'manual',
      typeLabel: batch.sourceType === 'purchase_order' ? 'Purchase order receipt' : 'Manual stock addition',
      quantity: batch.quantity,
      remaining: batch.remainingQuantity,
      expiry: batch.expiryDate,
      supplier: batch.supplier?.name || 'Not recorded',
      reference: batch.sourceType === 'purchase_order'
        ? batch.purchaseOrder?.poNumber || 'Purchase order reference unavailable'
        : batch.invoiceNumber || '—',
      staff: batch.receivedByName || batch.receivedBy?.name || 'Not recorded',
      awaitingWriteoff: Number(batch.remainingQuantity || 0) > 0 && batch.expiryDate && new Date(batch.expiryDate) < new Date(),
      expiredWriteoffRecorded: wastageEntries.some((entry) =>
        String(entry.batch?._id || entry.batch) === String(batch._id) &&
        (entry.sourceType === 'expired' || entry.reason === 'expired')
      )
    })),
    ...wastageEntries.map((entry) => ({
      id: `wastage-${entry._id}`,
      date: entry.createdAt,
      product: entry.product?.name || 'Product details unavailable',
      productId: entry.product?._id || '',
      batchNumber: entry.batch?.batchNumber || 'Not recorded',
      type: entry.sourceType === 'manual' ? 'wastage' : entry.sourceType || 'wastage',
      typeLabel: entry.sourceType === 'return' ? 'Return write-off' : entry.sourceType === 'expired' ? 'Expired stock write-off' : 'Manual write-off',
      quantity: entry.quantity,
      remaining: null,
      expiry: entry.batch?.expiryDate,
      supplier: '—',
      reference: entry.sourceReturn?.returnNumber || entry.reason || '—',
      staff: entry.recordedByName || entry.recordedBy?.name || 'Not recorded',
      awaitingWriteoff: false
    }))
  ].filter((event) => {
    const eventDay = event.date ? new Date(event.date).toLocaleDateString('en-CA') : ''
    return (!historyProduct || event.productId === historyProduct) &&
      (historyType === 'all' || event.type === historyType) &&
      (!historyDate || eventDay === historyDate)
  }).sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))

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
              Available Batches
            </span>

            <strong>
              {availableBatchCount}
            </strong>
          </div>

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
    <option value="all">All Available Stock</option>
    <option value="available">Available</option>
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
<th>Added by</th>
<th>Expiry</th>

                  {role === 'owner' && (
                    <th>Actions</th>
                  )}
                </tr>
              </thead>

              <tbody>

                {filteredBatches.length === 0 ? (
                  <tr>
                    <td
                      colSpan={role === 'owner' ? '10' : '9'}
                      className="empty-stock"
                    >
                      No currently sellable stock batches found
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
  {batch.createdAt
    ? new Date(batch.createdAt).toLocaleString()
    : '-'}
</td>

<td>
  <div>{batch.receivedByName || batch.receivedBy?.name || 'Not recorded'}</div>
  <small>{batch.sourceType === 'purchase_order' ? 'Purchase order' : 'Manual stock'}</small>
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

        <section className="stock-section inventory-history-section">
          <div className="stock-section-header inventory-history-header">
            <div>
              <h2>Inventory History</h2>
              <p>Receipt and write-off quantities are transaction amounts; current remaining quantity is today’s batch balance, not the balance at that transaction time. Sales movements and historical balances are not stored as a complete ledger.</p>
            </div>
            <button type="button" className="history-toggle-btn" onClick={toggleHistory}>
              {historyExpanded ? 'Hide History' : 'View History'}
            </button>
          </div>
          {historyExpanded && <div className="inventory-history-content">
            <div className="inventory-filters history-filters">
              <select value={historyProduct} onChange={(event) => setHistoryProduct(event.target.value)}>
                <option value="">All Products</option>
                {products.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}
              </select>
              <select value={historyType} onChange={(event) => setHistoryType(event.target.value)}>
                <option value="all">All transaction types</option>
                <option value="manual">Manual additions</option>
                <option value="purchase_order">Purchase order receipts</option>
                {role === 'owner' && <>
                  <option value="expired">Expired write-offs</option>
                  <option value="return">Return write-offs</option>
                </>}
                {role === 'owner' && <option value="wastage">Manual write-offs</option>}
              </select>
              <input type="date" aria-label="Filter history by date" value={historyDate} onChange={(event) => setHistoryDate(event.target.value)} />
            </div>
            <div className="stock-table-wrapper">
              <table className="stock-table inventory-history-table">
                <thead><tr><th>Date and time</th><th>Product</th><th>Batch</th><th>Transaction</th><th>Transaction quantity</th><th>Current remaining quantity</th><th>Expiry / status</th><th>Supplier / reference</th><th>Recorded by</th></tr></thead>
                <tbody>
                  {!historyLoaded ? <tr><td colSpan="9" className="empty-stock">Loading recorded history…</td></tr> : historyEvents.length === 0 ? <tr><td colSpan="9" className="empty-stock">No recorded transactions match these filters</td></tr> : historyEvents.map((event) => <tr key={event.id}>
                    <td>{event.date ? new Date(event.date).toLocaleString() : 'Not recorded'}</td>
                    <td>{event.product}</td>
                    <td>{event.batchNumber}</td>
                    <td>{event.typeLabel}</td>
                    <td>{event.type === 'manual' || event.type === 'purchase_order' ? `+${event.quantity}` : `−${event.quantity}`}</td>
                    <td>{event.remaining ?? 'Not recorded at transaction time'}</td>
                    <td>{event.awaitingWriteoff ? 'Expired — awaiting write-off' : event.expiredWriteoffRecorded ? 'Expired — formally written off' : event.expiry ? new Date(event.expiry).toLocaleDateString() : 'No expiry recorded'}</td>
                    <td>{event.supplier}{event.reference !== '—' ? ` · ${event.reference}` : ''}</td>
                    <td>{event.staff}</td>
                  </tr>)}
                </tbody>
              </table>
            </div>
            {role !== 'owner' && <p className="history-permission-note">Recorded write-off history is available to owners only.</p>}
          </div>}
        </section>

      </div>

    </Layout>
  )
}

export default Inventory
