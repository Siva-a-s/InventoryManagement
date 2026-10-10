import { notify } from '../components/notifications'
import { useCallback, useEffect, useRef, useState } from 'react'
import axios from 'axios'
import './Billing.css'
import { downloadInvoicePdf } from '../utils/invoicePdf'

let razorpayScriptPromise

const loadRazorpayCheckout = () => {
  if (window.Razorpay) return Promise.resolve(true)
  if (razorpayScriptPromise) return razorpayScriptPromise

  razorpayScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.async = true
    script.onload = () => {
      if (window.Razorpay) resolve(true)
      else reject(new Error('Razorpay Checkout did not initialize'))
    }
    script.onerror = () => reject(new Error('Could not load Razorpay Checkout'))
    document.body.appendChild(script)
  }).catch((error) => {
    razorpayScriptPromise = null
    throw error
  })

  return razorpayScriptPromise
}

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
  const [paymentBusy, setPaymentBusy] = useState(false)
  const [pendingVerification, setPendingVerification] = useState(null)
  const [paymentNotice, setPaymentNotice] = useState(null)
  const paymentLock = useRef(false)
  const verificationLock = useRef(false)
  const checkoutHandlerStarted = useRef(false)
  const billingLocked = paymentBusy || Boolean(pendingVerification)

  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')

  const formatCurrency = (value) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(Number(value || 0))
  const handleInvoiceDownload = async () => {
    try {
      const filename = await downloadInvoicePdf(selectedBill)
      notify(`Invoice PDF generated: ${filename}`, 'success')
    } catch (error) {
      notify(error.message || 'Could not open the invoice for PDF download', 'error')
    }
  }

  

  const token = localStorage.getItem('token')

  const fetchProducts = useCallback(async () => {
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
      notify(error.response?.data?.message || 'Failed to load products')
    }
  }, [token])

  const fetchBills = useCallback(async () => {
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
    notify(error.response?.data?.message || 'Failed to load bill history')
  }
}, [token])

useEffect(() => {
  // Initial API loading is an external synchronization effect.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  fetchProducts()
  fetchBills()
}, [fetchProducts, fetchBills])

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
    notify(error.response?.data?.message || 'Failed to load bill details')
  }
}

  const addToCart = () => {
    if (!selectedProduct || quantity < 1) {
      notify('Select a product and quantity')
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
      notify('Cart is empty')
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
      notify(error.response?.data?.message || 'Could not preview bill')
    }
  }

  const verifyRazorpayPayment = async (verification) => {
    if (verificationLock.current) return
    verificationLock.current = true
    setPaymentBusy(true)
    setPaymentNotice({ type: 'pending', message: 'Verifying payment with StockFlow…' })

    try {
      const response = await axios.post(
        'http://localhost:5000/api/bills/razorpay/verify',
        {
          orderId: verification.orderId,
          paymentId: verification.paymentId,
          signature: verification.signature,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      )

      const bill = response.data.bill
      if (!bill?._id || !bill.billNumber) {
        setPaymentNotice({
          type: 'unresolved',
          message: 'StockFlow did not confirm a completed bill. Do not start another payment; retry verification or contact the owner.',
        })
        paymentLock.current = false
        return
      }

      setPendingVerification(null)
      setPaymentNotice(null)
      setCart([])
      setPreview(null)
      setAmountPaid('')
      setCustomerName('')
      setCustomerPhone('')
      setPaymentMethod('cash')
      setSelectedBill(bill)
      await Promise.all([fetchBills(), fetchProducts()])
      notify(`Payment confirmed. Bill ${bill.billNumber} generated for ${formatCurrency(bill.total)}.`, 'success')
    } catch (error) {
      const apiMessage = error.response?.data?.message || ''
      const stockPreventedBill = error.response?.status === 409 &&
        /Not enough stock|Stock changed while billing|bill completion is pending/i.test(apiMessage)

      setPaymentNotice({
        type: stockPreventedBill ? 'unresolved' : 'uncertain',
        message: stockPreventedBill
          ? `Payment was captured, but stock prevented bill completion: ${apiMessage} The bill is not completed. Retry verification after an owner resolves the stock issue, or contact the owner.`
          : 'StockFlow could not confirm the payment status. Do not start another payment. Retry verification safely or contact the owner.',
      })
    } finally {
      verificationLock.current = false
      paymentLock.current = false
      setPaymentBusy(false)
    }
  }

  const startRazorpayPayment = async () => {
    if (paymentLock.current || pendingVerification) return
    paymentLock.current = true
    checkoutHandlerStarted.current = false
    setPaymentBusy(true)
    setPaymentNotice(null)

    try {
      await loadRazorpayCheckout()
      const orderResponse = await axios.post(
        'http://localhost:5000/api/bills/razorpay/order',
        {
          items: cart,
          customerName,
          customerPhone,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      )
      const { orderId, amount, currency, keyId } = orderResponse.data

      if (!orderId || !amount || !currency || !keyId || !window.Razorpay) {
        throw new Error('The server returned incomplete Razorpay checkout details')
      }

      const checkout = new window.Razorpay({
        key: keyId,
        amount,
        currency,
        name: 'StockFlow',
        description: 'Inventory purchase',
        order_id: orderId,
        prefill: {
          name: customerName,
          contact: customerPhone,
        },
        theme: { color: '#16a34a' },
        handler: (result) => {
          checkoutHandlerStarted.current = true
          const verification = {
            orderId: result.razorpay_order_id,
            paymentId: result.razorpay_payment_id,
            signature: result.razorpay_signature,
          }
          setPendingVerification(verification)
          verifyRazorpayPayment(verification)
        },
        modal: {
          ondismiss: () => {
            if (!checkoutHandlerStarted.current) {
              paymentLock.current = false
              setPaymentBusy(false)
              notify('Checkout closed. Your cart was kept. If you completed payment but received no confirmation, contact the owner before retrying.', 'error')
            }
          },
        },
      })

      checkout.on('payment.failed', () => {
        notify('Razorpay reported that the payment did not complete. Your cart was kept.', 'error')
      })
      checkout.open()
    } catch (error) {
      paymentLock.current = false
      setPaymentBusy(false)
      const message = error.response?.data?.message || 'Could not start Razorpay Checkout. Your cart was kept.'
      setPaymentNotice({ type: 'error', message })
      notify(message, 'error')
    }
  }

  const createBill = async () => {
    if (paymentMethod === 'razorpay') {
      await startRazorpayPayment()
      return
    }

    if (!preview) {
      notify('Preview the bill first')
      return
    }

    if (
      paymentMethod === 'cash' &&
      Number(amountPaid) < preview.total
    ) {
      notify('Amount paid is less than total')
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

      notify(`Bill generated: ${response.data.bill.billNumber}`)
      fetchBills()
      setCart([])
      setPreview(null)
      setAmountPaid('')
      setCustomerName('')
      setCustomerPhone('')
      setPaymentMethod('cash')
    } catch (error) {
      notify(error.response?.data?.message || 'Could not create bill')
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
              disabled={billingLocked}
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
              disabled={billingLocked}
            />

            <button
              className="billing-button"
              onClick={addToCart}
              disabled={billingLocked}
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
                          disabled={billingLocked}
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
            disabled={billingLocked}
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
                    {formatCurrency(item.lineTotal)}
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
                  disabled={billingLocked}
                />

                <input
                  type="text"
                  placeholder="Customer Phone"
                  value={customerPhone}
                  onChange={(e) =>
                    setCustomerPhone(e.target.value)
                  }
                  disabled={billingLocked}
                />
              </div>

              <div className="payment-form">
                <h3>Payment Method</h3>

                <select
                  value={paymentMethod}
                  onChange={(e) =>
                    setPaymentMethod(e.target.value)
                  }
                  disabled={billingLocked}
                >
                  <option value="cash">Cash</option>
                  <option value="upi">UPI</option>
                  <option value="card">Card</option>
                  <option value="razorpay">Razorpay</option>
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
                      disabled={billingLocked}
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
                disabled={billingLocked}
              >
                {paymentBusy
                  ? (pendingVerification ? 'Verifying Payment…' : 'Opening Razorpay…')
                  : paymentMethod === 'razorpay' ? 'Pay with Razorpay' : 'Generate Bill'}
              </button>

              {paymentNotice && (
                <div className={`billing-payment-notice ${paymentNotice.type}`} role="status" aria-live="polite">
                  <p>{paymentNotice.message}</p>
                  {pendingVerification && !paymentBusy && (
                    <button
                      type="button"
                      className="billing-button"
                      onClick={() => verifyRazorpayPayment(pendingVerification)}
                    >
                      Retry Payment Verification
                    </button>
                  )}
                </div>
              )}

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

    <div className="bill-modal invoice-modal" role="dialog" aria-modal="true" aria-labelledby="invoice-title">

      <div className="bill-modal-header">
        <div>
          <h2 id="invoice-title">Retail Invoice</h2>
          <p>
            {selectedBill.billNumber}
          </p>
        </div>

        <button
          className="close-bill-button"
          aria-label="Close invoice details"
          onClick={() => setSelectedBill(null)}
        >
          ×
        </button>
      </div>

      <div className="invoice-toolbar"><span>Saved bill details</span><button type="button" className="billing-button" onClick={handleInvoiceDownload}>Download Invoice (PDF)</button></div>

      <div className="bill-details-info">
        <p>
          <strong>Customer:</strong>{' '}
          {selectedBill.customerName || 'Walk-in Customer'}
        </p>

        <p>
          <strong>Cashier:</strong>{' '}{selectedBill.cashierName || selectedBill.cashier?.name || 'Not recorded'}
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
        <p><strong>Bill status:</strong> {selectedBill.status || 'Not recorded'}</p>
        <p><strong>Customer contact:</strong> {selectedBill.customerPhone || '—'}</p>
      </div>

      <h3>Purchased Items</h3>

      <div className="invoice-table-scroll"><table className="bill-details-table">
        <thead>
          <tr>
            <th>S.No.</th>
            <th>Product</th>
            <th>Qty</th>
            <th>Unit</th>
            <th>Price</th>
            <th>Discount</th>
            <th>Total</th>
          </tr>
        </thead>

        <tbody>
          {selectedBill.items?.map((item, index) => (
            <tr key={index}>
              <td>{index + 1}</td>
              <td>{item.name}</td>
              <td>{item.quantity}</td>
              <td>{item.unit || '—'}</td>
              <td>{formatCurrency(item.price)}</td>
              <td>{formatCurrency(item.discountAmount)}{item.offerName && <small className="invoice-offer-name">{item.offerName}</small>}</td>
              <td>{formatCurrency(item.lineTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table></div>

      <div className="bill-details-total">
        <div>
          <span>Subtotal</span>
          <span>{formatCurrency(selectedBill.subtotal)}</span>
        </div>

        <div>
          <span>Discount</span>
          <span>{formatCurrency(selectedBill.discount)}</span>
        </div>

        <div className="final-total">
          <span>Total</span>
          <span>{formatCurrency(selectedBill.total)}</span>
        </div>
        <div><span>Amount paid</span><span>{formatCurrency(selectedBill.amountPaid)}</span></div>
        <div><span>Change given</span><span>{formatCurrency(selectedBill.changeGiven)}</span></div>
      </div>
      <p className="invoice-thank-you">Thank you for shopping with us.</p>

    </div>

  </div>
)}
  </div>
)
}

export default Billing
