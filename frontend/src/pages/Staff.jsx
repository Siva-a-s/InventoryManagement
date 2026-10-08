import { useCallback, useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import './Staff.css'

const Staff = () => {
  const [staff, setStaff] = useState([])
  const [loading, setLoading] = useState(true)

  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
  })

  const token = localStorage.getItem('token')

  const headers = useMemo(() => ({
    Authorization: `Bearer ${token}`,
  }), [token])

  const fetchStaff = useCallback(async () => {
    try {
      const response = await axios.get(
        'http://localhost:5000/api/auth/staff',
        { headers }
      )

      setStaff(response.data || [])
    } catch (error) {
      console.log(error.response?.data)
      alert(
        error.response?.data?.message ||
          'Failed to load staff'
      )
    } finally {
      setLoading(false)
    }
  }, [headers])

  useEffect(() => {
    // Initial API loading is an external synchronization effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchStaff()
  }, [fetchStaff])

  const handleChange = (e) => {
    setForm({
      ...form,
      [e.target.name]: e.target.value,
    })
  }

  const addStaff = async (e) => {
    e.preventDefault()

    try {
      await axios.post(
        'http://localhost:5000/api/auth/staff',
        form,
        { headers }
      )

      alert('Staff added successfully')

      setForm({
        name: '',
        email: '',
        password: '',
      })

      fetchStaff()
    } catch (error) {
      alert(
        error.response?.data?.message ||
          'Failed to add staff'
      )
    }
  }

  const deleteStaff = async (id) => {
    const confirmDelete = window.confirm(
      'Are you sure you want to remove this staff member?'
    )

    if (!confirmDelete) return

    try {
      const response = await axios.delete(
        `http://localhost:5000/api/auth/staff/${id}`,
        { headers }
      )

      alert(response.data.message || 'Staff removed successfully')

      fetchStaff()
    } catch (error) {
      alert(
        error.response?.data?.message ||
          'Failed to remove staff'
      )
    }
  }

  return (
    <div className="staff-page">

      <div className="staff-header">
        <div>
          <h1>Staff Management</h1>
          <p>Manage your store staff accounts</p>
        </div>
      </div>

      {/* Add Staff */}
      <div className="staff-card">

        <h3>Add Staff Member</h3>

        <form
          className="staff-form"
          onSubmit={addStaff}
        >

          <div>
            <label>Name</label>

            <input
              type="text"
              name="name"
              value={form.name}
              onChange={handleChange}
              placeholder="Staff name"
              required
            />
          </div>

          <div>
            <label>Email</label>

            <input
              type="email"
              name="email"
              value={form.email}
              onChange={handleChange}
              placeholder="Staff email"
              required
            />
          </div>

          <div>
            <label>Password</label>

            <input
              type="password"
              name="password"
              value={form.password}
              onChange={handleChange}
              placeholder="Password"
              required
            />
          </div>

          <button
            type="submit"
            className="add-staff-button"
          >
            Add Staff
          </button>

        </form>

      </div>

      {/* Staff List */}
      <div className="staff-card">

        <h3>Staff Members</h3>

        {loading ? (
          <p>Loading staff...</p>
        ) : staff.length === 0 ? (
          <p>No staff members found.</p>
        ) : (
          <table className="staff-table">

            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Action</th>
              </tr>
            </thead>

            <tbody>

              {staff.map((user) => (
                <tr key={user._id || user.id}>

                  <td>
                    <strong>
                      {user.name}
                    </strong>
                  </td>

                  <td>{user.email}</td>

                  <td>
                    <span className="role-badge">
                      Staff
                    </span>
                  </td>

                  <td>
                    <button
                      className="delete-staff-button"
                      onClick={() =>
                        deleteStaff(
                          user._id || user.id
                        )
                      }
                    >
                      Remove
                    </button>
                  </td>

                </tr>
              ))}

            </tbody>

          </table>
        )}

      </div>

    </div>
  )
}

export default Staff
