import React, { useEffect, useState } from 'react'
import axios from 'axios'
import Layout from '../components/Layout'
import './Products.css'

const Products = () => {

  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [editingProduct, setEditingProduct] = useState(null)

  const [name, setName] = useState('')
  const [category, setCategory] = useState('')
  const [unit, setUnit] = useState('')
  const [price, setPrice] = useState('')
  const [barcode, setBarcode] = useState('')
  const [reorderLevel, setReorderLevel] = useState(10)
  const [expiryAlertDays, setExpiryAlertDays] = useState(30)

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

  const fetchCategories = async () => {
    try {

      const token = localStorage.getItem('token')

      const response = await axios.get(
        'http://localhost:5000/api/categories',
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      )

      console.log('Categories response:', response.data)

      setCategories(response.data.data || response.data)

    } catch (error) {
      console.error('Error fetching categories:', error)
    }
  }

  useEffect(() => {
    fetchProducts()
    fetchCategories()
  }, [])

  const handleAddProduct = async (e) => {

    e.preventDefault()

    try {

      const token = localStorage.getItem('token')

      await axios.post(
        'http://localhost:5000/api/products',
        {
          name,
          category,
          unit,
          price: Number(price),
          barcode: barcode || undefined,
          reorderLevel: Number(reorderLevel),
          expiryAlertDays: Number(expiryAlertDays)
        },
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      )

      alert('Product added successfully')

      setName('')
      setCategory('')
      setUnit('')
      setPrice('')
      setBarcode('')
      setReorderLevel(10)
      setExpiryAlertDays(30)

      setShowForm(false)

      fetchProducts()

    } catch (error) {

      console.error('Error adding product:', error)

      alert(
        error.response?.data?.message ||
        'Failed to add product'
      )
    }
  }

  const handleEditProduct = async (e) => {
  e.preventDefault()

  try {
    const token = localStorage.getItem('token')

    await axios.put(
      `http://localhost:5000/api/products/${editingProduct._id}`,
      {
        name,
        category,
        unit,
        price: Number(price),
        barcode: barcode || undefined,
        reorderLevel: Number(reorderLevel),
        expiryAlertDays: Number(expiryAlertDays)
      },
      {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    )

    alert('Product updated successfully')

    setEditingProduct(null)
    setShowForm(false)

    setName('')
    setCategory('')
    setUnit('')
    setPrice('')
    setBarcode('')
    setReorderLevel(10)
    setExpiryAlertDays(30)

    fetchProducts()

  } catch (error) {
    console.error('Error updating product:', error)

    alert(
      error.response?.data?.message ||
      'Failed to update product'
    )
  }
}

const handleDeleteProduct = async (productId) => {
  const confirmed = window.confirm(
    'Are you sure you want to delete this product?'
  )

  if (!confirmed) {
    return
  }

  try {
    const token = localStorage.getItem('token')

    await axios.delete(
      `http://localhost:5000/api/products/${productId}`,
      {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    )

    alert('Product deleted successfully')

    fetchProducts()

  } catch (error) {
    console.error('Error deleting product:', error)

    alert(
      error.response?.data?.message ||
      'Failed to delete product'
    )
  }
}

 return (
  <Layout>

    <div className="products-page">

      <div className="products-header">
        <h1>Products</h1>

        <button
          className="add-product-button"
          onClick={() => setShowForm(!showForm)}
        >
          + Add Product
        </button>
      </div>

      {showForm && (
       <form
  className="product-form"
  onSubmit={editingProduct ? handleEditProduct : handleAddProduct}
>

        <h2>
  {editingProduct ? 'Edit Product' : 'Add New Product'}
</h2>

          <div className="form-grid">

            <div className="product-form-group">
              <label>Product Name</label>
              <input
                type="text"
                placeholder="Enter product name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div className="product-form-group">
              <label>Category</label>

              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                required
              >
                <option value="">
                  Select Category
                </option>

                {categories.map((cat) => (
                  <option
                    key={cat._id}
                    value={cat._id}
                  >
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="product-form-group">
              <label>Unit</label>

              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                required
              >
                <option value="">
                  Select Unit
                </option>

                <option value="kg">kg</option>
                <option value="pcs">pcs</option>
                <option value="litre">litre</option>
                <option value="box">box</option>
              </select>
            </div>

            <div className="product-form-group">
              <label>Price</label>

              <input
                type="number"
                min="0"
                placeholder="Enter price"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                required
              />
            </div>

            <div className="product-form-group">
              <label>Barcode</label>

              <input
                type="text"
                placeholder="Optional barcode"
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
              />
            </div>

            <div className="product-form-group">
              <label>Reorder Level</label>

              <input
                type="number"
                min="0"
                value={reorderLevel}
                onChange={(e) => setReorderLevel(e.target.value)}
              />
            </div>

            <div className="product-form-group">
              <label>Expiry Alert Days</label>

              <input
                type="number"
                min="1"
                value={expiryAlertDays}
                onChange={(e) => setExpiryAlertDays(e.target.value)}
              />
            </div>

          </div>

          <button
            type="submit"
            className="save-product-button"
          >
            Save Product
          </button>

        </form>
      )}

      <div className="product-list-card">

        <h2>Product List</h2>

        <table className="products-table">

          <thead>
            <tr>
              <th>Name</th>
              <th>Category</th>
              <th>Unit</th>
              <th>Price</th>
              <th>Barcode</th>
              <th>Reorder Level</th>
              <th>Expiry Alert Days</th>
              <th>Actions</th>
            </tr>
          </thead>

          <tbody>

            {products.map((product) => (
              <tr key={product._id}>

                <td>{product.name}</td>

                <td>
                  {product.category?.name || 'N/A'}
                </td>

                <td>{product.unit}</td>

                <td>₹{product.price}</td>

                <td>
                  {product.barcode || 'N/A'}
                </td>

                <td>{product.reorderLevel}</td>

                <td>{product.expiryAlertDays}</td>

                <td>
  <button
    onClick={() => {
      setEditingProduct(product)
      setName(product.name)
      setCategory(product.category?._id || '')
      setUnit(product.unit)
      setPrice(product.price)
      setBarcode(product.barcode || '')
      setReorderLevel(product.reorderLevel)
      setExpiryAlertDays(product.expiryAlertDays)
      setShowForm(true)
    }}
  >
    Edit
  </button>

  <button
    onClick={() => handleDeleteProduct(product._id)}
    style={{ marginLeft: '8px' }}
  >
    Delete
  </button>
</td>

              </tr>
            ))}

          </tbody>

        </table>

      </div>

    </div>

  </Layout>
)
}

export default Products