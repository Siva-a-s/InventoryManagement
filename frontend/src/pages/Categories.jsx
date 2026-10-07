import React, { useEffect, useState } from 'react'
import axios from 'axios'
import Layout from '../components/Layout'
import './Categories.css'

const Categories = () => {
  const [categories, setCategories] = useState([])
  const [categorySummary, setCategorySummary] = useState([])

  const [name, setName] = useState('')
  const [search, setSearch] = useState('')

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

      setCategories(response.data)
    } catch (error) {
      console.error('Error fetching categories:', error)
    }
  }

  const fetchCategorySummary = async () => {
    try {
      const token = localStorage.getItem('token')

      const response = await axios.get(
        'http://localhost:5000/api/categories/summary',
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      )

      setCategorySummary(response.data)
    } catch (error) {
      console.error(
        'Error fetching category summary:',
        error
      )
    }
  }

  useEffect(() => {
    fetchCategories()
    fetchCategorySummary()
  }, [])

  const handleAddCategory = async (e) => {
    e.preventDefault()

    try {
      const token = localStorage.getItem('token')

      await axios.post(
        'http://localhost:5000/api/categories',
        { name },
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      )

      alert('Category added successfully')

      setName('')

      fetchCategories()
      fetchCategorySummary()
    } catch (error) {
      console.error('Error adding category:', error)

      alert(
        error.response?.data?.message ||
          'Failed to add category'
      )
    }
  }

  const handleDeleteCategory = async (categoryId) => {
    const confirmed = window.confirm(
      'Are you sure you want to delete this category?'
    )

    if (!confirmed) return

    try {
      const token = localStorage.getItem('token')

      await axios.delete(
        `http://localhost:5000/api/categories/${categoryId}`,
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      )

      alert('Category deleted successfully')

      fetchCategories()
      fetchCategorySummary()
    } catch (error) {
      console.error('Error deleting category:', error)

      alert(
        error.response?.data?.message ||
          'Failed to delete category'
      )
    }
  }

  const filteredCategories = categories.filter((category) =>
    category.name
      .toLowerCase()
      .includes(search.toLowerCase())
  )

  return (
    <Layout>

      <div className="categories-page">

        {/* Header */}
        <div className="categories-header">
          <div>
            <h1>Categories</h1>

            <p>
              Organize and manage your product categories
            </p>
          </div>
        </div>

        {/* Summary */}
        <div className="category-summary">

          <div className="category-card">

            <div className="category-card-title">
              Total Categories
            </div>

            <div className="category-card-value">
              {categories.length}
            </div>

          </div>

        </div>

        {/* Add Category */}
        <div className="category-form-section">

          <div className="section-title">

            <div>
              <h2>Add New Category</h2>

              <p>
                Create a category for organizing products
              </p>
            </div>

          </div>

          <form
            className="category-form"
            onSubmit={handleAddCategory}
          >

            <div className="category-input-group">

              <label>Category Name</label>

              <input
                type="text"
                placeholder="Enter category name"
                value={name}
                onChange={(e) =>
                  setName(e.target.value)
                }
                required
              />

            </div>

            <button
              type="submit"
              className="add-category-btn"
            >
              + Add Category
            </button>

          </form>

        </div>

        {/* Category List */}
        <div className="category-list-section">

          <div className="category-list-header">

            <div>

              <h2>Category List</h2>

              <p>
                {filteredCategories.length}{' '}
                categor
                {filteredCategories.length === 1
                  ? 'y'
                  : 'ies'}{' '}
                found
              </p>

            </div>

            <input
              type="text"
              className="category-search"
              placeholder="Search categories..."
              value={search}
              onChange={(e) =>
                setSearch(e.target.value)
              }
            />

          </div>

          {filteredCategories.length === 0 ? (

            <div className="category-empty">

              <div className="empty-icon">
                📂
              </div>

              <h3>
                {search
                  ? 'No matching categories'
                  : 'No categories yet'}
              </h3>

              <p>
                {search
                  ? 'Try a different search term.'
                  : 'Create your first category using the form above.'}
              </p>

            </div>

          ) : (

            <div className="category-table-wrapper">

              <table className="category-table">

                <thead>

                  <tr>
                    <th>#</th>
                    <th>Category Name</th>
                    <th>Products</th>
                    <th>Available Stock</th>
                    <th>Action</th>
                  </tr>

                </thead>

                <tbody>

                  {filteredCategories.map(
                    (category, index) => {

                      const summary =
                        categorySummary.find(
                          (item) =>
                            item.categoryId ===
                            category._id
                        )

                      return (
                        <tr key={category._id}>

                          <td className="category-number">
                            {index + 1}
                          </td>

                          <td>

                            <div className="category-name">

                              <span className="category-icon">
                                📁
                              </span>

                              <span>
                                {category.name}
                              </span>

                            </div>

                          </td>

                          <td>
                            {summary?.totalTypes || 0}
                          </td>

                          <td>
                            {summary?.totalQuantity || 0}
                          </td>

                          <td>

                            <button
                              className="delete-category-btn"
                              onClick={() =>
                                handleDeleteCategory(
                                  category._id
                                )
                              }
                            >
                              Delete
                            </button>

                          </td>

                        </tr>
                      )
                    }
                  )}

                </tbody>

              </table>

            </div>

          )}

        </div>

      </div>

    </Layout>
  )
}

export default Categories