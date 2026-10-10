import { requestText } from '../components/notifications'
import { notify } from '../components/notifications'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import axios from 'axios'
import Layout from '../components/Layout'
import './PurchaseOrder.css'

const PurchaseOrder = () => {
  const location = useLocation()
  const role = localStorage.getItem('role')
  const token = localStorage.getItem('token')

  const [orders, setOrders] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [products, setProducts] = useState([])

  const [showForm, setShowForm] = useState(false)

  const [supplier, setSupplier] = useState('')
  const [items, setItems] = useState([
    {
      product: '',
      quantity: '',
      unitCost: ''
    }
  ])

  const [loading, setLoading] = useState(false)

const [receivingOrder, setReceivingOrder] = useState(null)
const [receiveItems, setReceiveItems] = useState([])
  const receiveFormRef = useRef(null)
  const receiveHeadingRef = useRef(null)
  const receiptInFlightRef = useRef(false)

  const headers = useMemo(() => ({
    Authorization: `Bearer ${token}`
  }), [token])

const fetchOrders = useCallback(async () => {
  try {
    const response = await axios.get(
      'http://localhost:5000/api/purchase-orders',
      { headers }
    )

    setOrders(response.data.orders || [])
  } catch (error) {
    console.error(error)
  }
}, [headers])
  const fetchSuppliers = useCallback(async () => {
    try {
      const response = await axios.get(
        'http://localhost:5000/api/suppliers?active=true',
        { headers }
      )

      setSuppliers(response.data.data || response.data)
    } catch (error) {
      console.error(error)
    }
  }, [headers])

  const fetchProducts = useCallback(async () => {
    try {
      const response = await axios.get(
        'http://localhost:5000/api/products',
        { headers }
      )

      setProducts(response.data.data || response.data)
    } catch (error) {
      console.error(error)
    }
  }, [headers])

  useEffect(() => {
    // Initial API loading is an external synchronization effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchOrders()
    fetchSuppliers()
    fetchProducts()
  }, [fetchOrders, fetchSuppliers, fetchProducts])

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const productId = params.get('productId')
    if (!productId || !products.some((productItem) => productItem._id === productId)) return
    const suggestedQuantity = Math.max(Number.parseInt(params.get('quantity'), 10) || 1, 1)
    // Apply query-driven form values after products have loaded from the API.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setItems([{ product: productId, quantity: String(suggestedQuantity), unitCost: '' }])
    setSupplier('')
    setShowForm(true)
  }, [location.search, products])

  useEffect(() => {
    if (!receivingOrder) return
    requestAnimationFrame(() => {
      receiveFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      receiveHeadingRef.current?.focus({ preventScroll: true })
    })
  }, [receivingOrder])

  const addItem = () => {
    setItems([
      ...items,
      {
        product: '',
        quantity: '',
        unitCost: ''
      }
    ])
  }

  const removeItem = (index) => {
    if (items.length === 1) return

    const updatedItems = items.filter((_, i) => i !== index)
    setItems(updatedItems)
  }

  const updateItem = (index, field, value) => {
    const updatedItems = [...items]

    updatedItems[index][field] = value

    setItems(updatedItems)
  }

  const resetForm = () => {
    setSupplier('')
    setItems([
      {
        product: '',
        quantity: '',
        unitCost: ''
      }
    ])
    setShowForm(false)
  }

  const handleCreateOrder = async (e) => {
    e.preventDefault()

    if (!supplier) {
      notify('Please select a supplier')
      return
    }

    const validItems = items.filter(
      (item) =>
        item.product &&
        Number(item.quantity) > 0 &&
        Number(item.unitCost) >= 0
    )

    if (validItems.length === 0) {
      notify('Please add at least one valid product')
      return
    }

    try {
      setLoading(true)

      await axios.post(
        'http://localhost:5000/api/purchase-orders',
        {
          supplier,
          items: validItems.map((item) => ({
            product: item.product,
            quantity: Number(item.quantity),
            unitCost: Number(item.unitCost)
          }))
        },
        { headers }
      )

      notify('Purchase order created successfully')

      resetForm()
      fetchOrders()
    } catch (error) {
      console.error(error)

      notify(
        error.response?.data?.message ||
          'Failed to create purchase order'
      )
    } finally {
      setLoading(false)
    }
  }

  const handleReceive = (order) => {
  const receiveData = order.items.map((item) => ({
    itemId: item._id,
    productName: item.product?.name || item.productName || 'Product',
    orderedQuantity: item.quantity,
    receivedQuantity: item.quantity,
    batchNumber: '',
    expiryDate: ''
  }))

  setReceivingOrder(order)
  setReceiveItems(receiveData)
}
const confirmReceive = async () => {
  if (receiptInFlightRef.current) return
  receiptInFlightRef.current = true
  for (const item of receiveItems) {
    if (
      !item.receivedQuantity ||
      Number(item.receivedQuantity) <= 0
    ) {
      notify(`Enter a valid received quantity for ${item.productName}`)
      receiptInFlightRef.current = false
      return
    }

    if (!item.batchNumber.trim()) {
      notify(`Enter batch number for ${item.productName}`)
      receiptInFlightRef.current = false
      return
    }

    if (!item.expiryDate) {
      notify(`Enter expiry date for ${item.productName}`)
      receiptInFlightRef.current = false
      return
    }
  }

  try {
    setLoading(true)

    await axios.patch(
      `http://localhost:5000/api/purchase-orders/${receivingOrder._id}/receive`,
      {
        items: receiveItems.map((item) => ({
          itemId: item.itemId,
          receivedQuantity: Number(item.receivedQuantity),
          batchNumber: item.batchNumber.trim(),
          expiryDate: item.expiryDate
        }))
      },
      { headers }
    )

    notify('Purchase order received successfully')

    setReceivingOrder(null)
    setReceiveItems([])

    fetchOrders()
  } catch (error) {
    console.error(error)

    notify(
      error.response?.data?.message ||
        'Failed to receive purchase order'
    )
  } finally {
    setLoading(false)
    receiptInFlightRef.current = false
  }
}
const updateReceiveItem = (index, field, value) => {
  const updatedItems = [...receiveItems]

  updatedItems[index][field] = value

  setReceiveItems(updatedItems)
}

const cancelReceive = () => {
  setReceivingOrder(null)
  setReceiveItems([])
}

  const handleCancel = async (id) => {
    const reason = await requestText(
      'Enter cancellation reason:'
    )

    if (!reason) return

    try {
      await axios.patch(
        `http://localhost:5000/api/purchase-orders/${id}/cancel`,
        { reason },
        { headers }
      )

      notify('Purchase order cancelled')

      fetchOrders()
    } catch (error) {
      console.error(error)

      notify(
        error.response?.data?.message ||
          'Failed to cancel purchase order'
      )
    }
  }

 const orderList = Array.isArray(orders)
  ? orders
  : orders?.data || []

const totalOrders = orderList.length

const pendingOrders = orderList.filter(
  (order) => order.status === 'pending'
).length

const receivedOrders = orderList.filter(
  (order) => order.status === 'received'
).length

const cancelledOrders = orderList.filter(
  (order) => order.status === 'cancelled'
).length

  const getStatusClass = (status) => {
    if (status === 'pending') return 'status-pending'
    if (status === 'received') return 'status-received'
    if (status === 'cancelled') return 'status-cancelled'

    return ''
  }

  return (
    <Layout>
      <div className="purchase-page">

        {/* Header */}

        <div className="purchase-header">
          <div>
            <h1>Purchase Orders</h1>
            <p>
              Manage supplier purchases and stock receiving
            </p>
          </div>

          {role === 'owner' && (
            <button
              className="create-btn"
              onClick={() => setShowForm(true)}
            >
              + Create Purchase Order
            </button>
          )}
        </div>

        {/* Summary Cards */}

        <div className="po-summary">

          <div className="po-card">
            <div className="po-card-title">
              Total Orders
            </div>

            <div className="po-card-value">
              {totalOrders}
            </div>
          </div>

          <div className="po-card">
            <div className="po-card-title">
              Pending
            </div>

            <div className="po-card-value">
              {pendingOrders}
            </div>
          </div>

          <div className="po-card">
            <div className="po-card-title">
              Received
            </div>

            <div className="po-card-value">
              {receivedOrders}
            </div>
          </div>

          <div className="po-card">
            <div className="po-card-title">
              Cancelled
            </div>

            <div className="po-card-value">
              {cancelledOrders}
            </div>
          </div>

        </div>

        {/* Create Purchase Order Form */}

        {role === 'owner' && showForm && (
          <form
            className="po-form"
            onSubmit={handleCreateOrder}
          >
            <h2>Create Purchase Order</h2>

            <div className="form-grid">

              <div className="form-group">
                <label>Supplier</label>

                <select
                  value={supplier}
                  onChange={(e) =>
                    setSupplier(e.target.value)
                  }
                  required
                >
                  <option value="">
                    Select Supplier
                  </option>

                  {suppliers.map((supplierItem) => (
                    <option
                      key={supplierItem._id}
                      value={supplierItem._id}
                    >
                      {supplierItem.name}
                    </option>
                  ))}
                </select>
              </div>

            </div>

            <div className="po-items-form">

              <div className="items-form-header">
                <h3>Order Items</h3>

                <button
                  type="button"
                  className="add-item-btn"
                  onClick={addItem}
                >
                  + Add Item
                </button>
              </div>

              {items.map((item, index) => (
                <div
                  className="item-form-row"
                  key={index}
                >

                  <div className="form-group">
                    <label>Product</label>

                    <select
                      value={item.product}
                      onChange={(e) =>
                        updateItem(
                          index,
                          'product',
                          e.target.value
                        )
                      }
                      required
                    >
                      <option value="">
                        Select Product
                      </option>

                      {products.map((product) => (
                        <option
                          key={product._id}
                          value={product._id}
                        >
                          {product.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Quantity</label>

                    <input
                      type="number"
                      min="1"
                      value={item.quantity}
                      onChange={(e) =>
                        updateItem(
                          index,
                          'quantity',
                          e.target.value
                        )
                      }
                      placeholder="Quantity"
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label>Unit Cost</label>

                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.unitCost}
                      onChange={(e) =>
                        updateItem(
                          index,
                          'unitCost',
                          e.target.value
                        )
                      }
                      placeholder="₹ Unit cost"
                      required
                    />
                  </div>

                  {items.length > 1 && (
                    <button
                      type="button"
                      className="remove-item-btn"
                      onClick={() =>
                        removeItem(index)
                      }
                    >
                      Remove
                    </button>
                  )}

                </div>
              ))}

            </div>

            <div className="form-actions">

              <button
                type="submit"
                className="primary-btn"
                disabled={loading}
              >
                {loading
                  ? 'Creating...'
                  : 'Create Order'}
              </button>

              <button
                type="button"
                className="secondary-btn"
                onClick={resetForm}
              >
                Cancel
              </button>

            </div>
          </form>
        )}
{receivingOrder && (
  <div className="receive-form" ref={receiveFormRef}>
    <div className="receive-form-header">
      <div>
        <h2 ref={receiveHeadingRef} tabIndex="-1">Receive Purchase Order</h2>
        <p>
          {receivingOrder.poNumber || `PO-${receivingOrder._id.slice(-6).toUpperCase()}`}
        </p>
      </div>
    </div>

    {receiveItems.map((item, index) => (
      <div className="receive-item" key={item.itemId || index}>

        <h3>{item.productName}</h3>

        <p className="ordered-info">
          Ordered Quantity: {item.orderedQuantity}
        </p>

        <div className="receive-grid">

          <div className="form-group">
            <label>Received Quantity</label>

            <input
              type="number"
              min="1"
              value={item.receivedQuantity}
              onChange={(e) =>
                updateReceiveItem(
                  index,
                  'receivedQuantity',
                  e.target.value
                )
              }
            />
          </div>

          <div className="form-group">
            <label>Batch Number</label>

            <input
              type="text"
              value={item.batchNumber}
              onChange={(e) =>
                updateReceiveItem(
                  index,
                  'batchNumber',
                  e.target.value
                )
              }
              placeholder="Enter batch number"
            />
          </div>


          <div className="form-group">
            <label>Expiry Date</label>

            <input
              type="date"
              value={item.expiryDate}
              onChange={(e) =>
                updateReceiveItem(
                  index,
                  'expiryDate',
                  e.target.value
                )
              }
            />
          </div>

        </div>

      </div>
    ))}

    <div className="form-actions">

     <button
  type="button"
  className="primary-btn"
  onClick={confirmReceive}
  disabled={loading}
>
  {loading ? 'Receiving...' : 'Confirm Receipt'}
</button>

      <button
        type="button"
        className="secondary-btn"
        onClick={cancelReceive}
        disabled={loading}
      >
        Cancel
      </button>

    </div>
  </div>
)}
        {/* Orders List */}

        <div className="orders-section">

          <div className="orders-section-header">
            <h2>Purchase Order History</h2>
          </div>

          {orderList.length === 0 ? (
            <div className="empty-orders">
              <h3>No Purchase Orders</h3>

              <p>
                Purchase orders created from this system
                will appear here.
              </p>
            </div>
          ) : (
            orderList.map((order) => (
              <div
                className="order-item"
                key={order._id}
              >

                {/* Order Header */}

                <div className="order-top">

                  <div>
                    <div className="order-number">
                      {order.poNumber || `PO-${order._id.slice(-6).toUpperCase()}`}
                    </div>

                    <div className="order-date">
                      {order.createdAt
                        ? new Date(
                            order.createdAt
                          ).toLocaleDateString()
                        : 'Date unavailable'}
                    </div>
                  </div>

                  <span
                    className={`status-badge ${getStatusClass(
                      order.status
                    )}`}
                  >
                    {order.status}
                  </span>

                </div>

                {/* Order Information */}

                <div className="order-info">

                  <div className="info-box">
                    <span className="info-label">
                      Supplier
                    </span>

                    <span className="info-value">
                      {order.supplier?.name ||
                        'Unknown Supplier'}
                    </span>
                  </div>

                  {order.status === 'received' && <div className="info-box">
                    <span className="info-label">Received by</span>
                    <span className="info-value">{order.receivedByName || order.receivedBy?.name || 'Not recorded'}</span>
                    <small>{order.receivedAt ? new Date(order.receivedAt).toLocaleString() : 'Date not recorded'}</small>
                  </div>}

                  <div className="info-box">
                    <span className="info-label">
                      Total Amount
                    </span>

                    <span className="info-value">
                      ₹
                      {Number(
                        order.totalAmount || 0
                      ).toLocaleString('en-IN')}
                    </span>
                  </div>

                  <div className="info-box">
                    <span className="info-label">
                      Items
                    </span>

                    <span className="info-value">
                      {order.items?.length || 0} products
                    </span>
                  </div>

                </div>

                {/* Items */}

                <div className="order-items">

                  <h4>Order Items</h4>

                  {order.items?.map(
                    (item, index) => (
                      <div
                        className="item-row"
                        key={index}
                      >

                        <span>
                          {item.product?.name ||
                            item.productName ||
                            'Product'}
                        </span>

                        <span>
                          {item.quantity}{' '}
                          {item.product?.unit || ''}
                        </span>

                      </div>
                    )
                  )}

                </div>

                {/* Actions */}

                {order.status === 'pending' && (
                  <div className="order-actions">

                    <button
                      className="receive-btn"
                      disabled={loading}
                      onClick={() =>
                        handleReceive(order)
                      }
                    >
                      Receive Order
                    </button>

                    {role === 'owner' && (
                      <button
                        className="cancel-btn"
                        onClick={() =>
                          handleCancel(order._id)
                        }
                      >
                        Cancel Order
                      </button>
                    )}

                  </div>
                )}

              </div>
            ))
          )}

        </div>

      </div>
    </Layout>
  )
}

export default PurchaseOrder
