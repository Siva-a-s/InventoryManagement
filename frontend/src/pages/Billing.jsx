import React, { useEffect, useState } from 'react'
import axios from 'axios'
import './Billing.css'

const Billing = () => {
  const [products, setProducts] = useState([])
  const [cart, setCart] = useState([])

  const [selectedProduct, setSelectedProduct] = useState('')
  const [quantity, setQuantity] = useState(1)

  const [preview, setPreview] = useState(null)

  const [bills, setBills] = useState([])
const [searchBill, setSearchBill] = useState('')
const [selectedBill, setSelectedBill] = useState(null)

  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [amountPaid, setAmountPaid] = useState('')

  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')

  

  const token = localStorage.getItem('token')

  useEffect(() => {
  fetchProducts()
  fetchBills()
}, [])

  const fetchProducts = async () => {
    try {
      const response = await axios.get(
        'http://localhost:5000/api/products',
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      )

      setProducts(response.data)
    } catch (error) {
      alert(error.response?.data?.message || 'Failed to load products')
    }
  }

  const fetchBills = async () => {
  try {
    const response = await axios.get(
      'http://localhost:5000/api/bills',
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    )

    setBills(response.data.bills || response.data.data || response.data)
  } catch (error) {
    alert(error.response?.data?.message || 'Failed to load bill history')
  }
}

const viewBill = async (id) => {
  try {
    const response = await axios.get(
      `http://localhost:5000/api/bills/${id}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    )

    setSelectedBill(response.data.bill || response.data)
  } catch (error) {
    alert(error.response?.data?.message || 'Failed to load bill details')
  }
}

  const addToCart = () => {
    if (!selectedProduct || quantity < 1) {
      alert('Select a product and quantity')
      return
    }

    setCart([
      ...cart,
      {
        productId: selectedProduct,
        quantity: Number(quantity),
      },
    ])

    setSelectedProduct('')
    setQuantity(1)
    setPreview(null)
  }

  const removeFromCart = (index) => {
    const updatedCart = cart.filter((_, i) => i !== index)

    setCart(updatedCart)
    setPreview(null)
  }

  const previewBill = async () => {
    if (cart.length === 0) {
      alert('Cart is empty')
      return
    }

    try {
      const response = await axios.post(
        'http://localhost:5000/api/bills/preview',
        {
          items: cart,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      )

      setPreview(response.data)

      if (paymentMethod === 'cash') {
        setAmountPaid(response.data.total)
      }
    } catch (error) {
      alert(error.response?.data?.message || 'Could not preview bill')
    }
  }

  const createBill = async () => {
    if (!preview) {
      alert('Preview the bill first')
      return
    }

    if (
      paymentMethod === 'cash' &&
      Number(amountPaid) < preview.total
    ) {
      alert('Amount paid is less than total')
      return
    }

    try {
      const response = await axios.post(
        'http://localhost:5000/api/bills',
        {
          items: cart,
          paymentMethod,
          amountPaid:
            paymentMethod === 'cash'
              ? Number(amountPaid)
              : preview.total,
          customerName,
          customerPhone,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      )

      alert(`Bill generated: ${response.data.bill.billNumber}`)
      fetchBills()
      setCart([])
      setPreview(null)
      setAmountPaid('')
      setCustomerName('')
      setCustomerPhone('')
      setPaymentMethod('cash')
    } catch (error) {
      alert(error.response?.data?.message || 'Could not create bill')
    }
  }

  const filteredBills = bills.filter((bill) => {
  const search = searchBill.toLowerCase()

  return (
    bill.billNumber?.toLowerCase().includes(search) ||
    bill.customerName?.toLowerCase().includes(search)
  )
})

  return (
  <div className="billing-page">

    <div className="billing-header">
      <h1>Billing</h1>
      <p>Create a new customer bill</p>
    </div>

    <div className="billing-grid">

      {/* LEFT SIDE */}
      <div>

        <div className="billing-card">
          <h3>Add Product</h3>

          <div className="billing-form">

            <select
              value={selectedProduct}
              onChange={(e) => setSelectedProduct(e.target.value)}
            >
              <option value="">Select Product</option>

              {products.map((product) => (
                <option key={product._id} value={product._id}>
                  {product.name} - ₹{product.price}
                </option>
              ))}
            </select>

            <input
              type="number"
              min="1"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />

            <button
              className="billing-button"
              onClick={addToCart}
            >
              Add
            </button>

          </div>
        </div>

        <div className="billing-card" style={{ marginTop: '20px' }}>
          <h3>Shopping Cart</h3>

          {cart.length === 0 ? (
            <p className="empty-cart">
              No products added to cart.
            </p>
          ) : (
            <table className="cart-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Qty</th>
                  <th>Action</th>
                </tr>
              </thead>

              <tbody>
                {cart.map((item, index) => {
                  const product = products.find(
                    (p) => p._id === item.productId
                  )

                  return (
                    <tr key={index}>
                      <td>{product?.name}</td>
                      <td>{item.quantity}</td>
                      <td>
                        <button
                          className="remove-button"
                          onClick={() => removeFromCart(index)}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}

          <button
            className="billing-button"
            style={{ marginTop: '15px' }}
            onClick={previewBill}
          >
            Preview Bill
          </button>
        </div>

      </div>

      {/* RIGHT SIDE */}
      <div>

        <div className="billing-card">

          <h3>Bill Summary</h3>

          {!preview ? (
            <p className="empty-cart">
              Add products and preview the bill.
            </p>
          ) : (
            <div className="preview-box">

              {preview.items.map((item, index) => (
                <div className="bill-line" key={index}>
                  <span>
                    {item.name} × {item.quantity}
                  </span>

                  <span>
                    ₹{item.lineTotal}
                  </span>
                </div>
              ))}

              <div className="bill-line">
                <span>Subtotal</span>
                <span>₹{preview.subtotal}</span>
              </div>

              <div className="bill-line">
                <span>Discount</span>
                <span>₹{preview.discount}</span>
              </div>

              <div className="bill-total">
                <span>Total</span>
                <span>₹{preview.total}</span>
              </div>

              <div className="customer-form">
                <h3>Customer Details</h3>

                <input
                  type="text"
                  placeholder="Customer Name"
                  value={customerName}
                  onChange={(e) =>
                    setCustomerName(e.target.value)
                  }
                />

                <input
                  type="text"
                  placeholder="Customer Phone"
                  value={customerPhone}
                  onChange={(e) =>
                    setCustomerPhone(e.target.value)
                  }
                />
              </div>

              <div className="payment-form">
                <h3>Payment Method</h3>

                <select
                  value={paymentMethod}
                  onChange={(e) =>
                    setPaymentMethod(e.target.value)
                  }
                >
                  <option value="cash">Cash</option>
                  <option value="upi">UPI</option>
                  <option value="card">Card</option>
                </select>

                {paymentMethod === 'cash' && (
                  <>
                    <input
                      type="number"
                      placeholder="Amount Paid"
                      value={amountPaid}
                      onChange={(e) =>
                        setAmountPaid(e.target.value)
                      }
                    />

                    {amountPaid &&
                      Number(amountPaid) >= preview.total && (
                        <p>
                          Change: ₹
                          {(
                            Number(amountPaid) -
                            preview.total
                          ).toFixed(2)}
                        </p>
                      )}
                  </>
                )}
              </div>

              <button
                className="generate-button"
                onClick={createBill}
              >
                Generate Bill
              </button>

            </div>
          )}

        </div>

      </div>

    </div>
<div className="billing-card bill-history-card">

  <div className="bill-history-header">
    <div>
      <h3>Bill History</h3>
      <p>View previous customer bills</p>
    </div>

    <input
      type="text"
      placeholder="Search bill or customer..."
      value={searchBill}
      onChange={(e) => setSearchBill(e.target.value)}
    />
  </div>

  {filteredBills.length === 0 ? (
    <p className="empty-cart">
      No bills found.
    </p>
  ) : (
    <div className="bill-history-scroll">

      <table className="bill-history-table">

        <thead>
          <tr>
            <th>Bill No.</th>
            <th>Date</th>
            <th>Customer</th>
            <th>Total</th>
            <th>Payment</th>
            <th>Status</th>
<th>Action</th>
          </tr>
        </thead>

        <tbody>
          {filteredBills.map((bill) => (
            <tr key={bill._id}>

              <td>
                {bill.billNumber}
              </td>

              <td>
                {bill.createdAt
                  ? new Date(
                      bill.createdAt
                    ).toLocaleDateString()
                  : '-'}
              </td>

              <td>
                {bill.customerName || 'Walk-in Customer'}
              </td>

              <td>
                ₹{Number(bill.total || 0).toLocaleString('en-IN')}
              </td>

              <td>
                {bill.paymentMethod?.toUpperCase() || '-'}
              </td>

              <td>
                {bill.status || 'Completed'}
              </td>
              <td>
  <button
    className="view-bill-button"
    onClick={() => viewBill(bill._id)}
  >
    View
  </button>

</td>

            </tr>
          ))}
        </tbody>

      </table>

    </div>
  )}

</div>
{selectedBill && (
  <div className="bill-modal-overlay">

    <div className="bill-modal">

      <div className="bill-modal-header">
        <div>
          <h2>Bill Details</h2>
          <p>
            {selectedBill.billNumber}
          </p>
        </div>

        <button
          className="close-bill-button"
          onClick={() => setSelectedBill(null)}
        >
          ×
        </button>
      </div>

      <div className="bill-details-info">
        <p>
          <strong>Customer:</strong>{' '}
          {selectedBill.customerName || 'Walk-in Customer'}
        </p>

        <p>
          <strong>Date:</strong>{' '}
          {selectedBill.createdAt
            ? new Date(selectedBill.createdAt).toLocaleString()
            : '-'}
        </p>

        <p>
          <strong>Payment:</strong>{' '}
          {selectedBill.paymentMethod?.toUpperCase() || '-'}
        </p>
      </div>

      <h3>Purchased Items</h3>

      <table className="bill-details-table">
        <thead>
          <tr>
            <th>Product</th>
            <th>Qty</th>
            <th>Price</th>
            <th>Total</th>
          </tr>
        </thead>

        <tbody>
          {selectedBill.items?.map((item, index) => (
            <tr key={index}>
              <td>{item.name}</td>
              <td>{item.quantity}</td>
              <td>₹{item.price}</td>
              <td>₹{item.lineTotal}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="bill-details-total">
        <div>
          <span>Subtotal</span>
          <span>₹{selectedBill.subtotal}</span>
        </div>

        <div>
          <span>Discount</span>
          <span>₹{selectedBill.discount}</span>
        </div>

        <div className="final-total">
          <span>Total</span>
          <span>₹{selectedBill.total}</span>
        </div>
      </div>

    </div>

  </div>
)}
  </div>
)
}

export default Billing