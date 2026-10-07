import React, { useState } from 'react'
import axios from 'axios'
import { useNavigate } from 'react-router-dom'
import './Login.css'

const Login = () => {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')

  const navigate = useNavigate()

  const handleLogin = async (e) => {
    e.preventDefault()

    try {
      const response = await axios.post(
        'http://localhost:5000/api/auth/login',
        {
          email,
          password
        }
      )

      console.log('Login response:', response.data)

      localStorage.setItem('token', response.data.token)
localStorage.setItem('role', response.data.user.role)

      navigate('/dashboard')

    } catch (error) {
      console.error('Login error:', error)

      setMessage(
        error.response?.data?.message || 'Login failed'
      )
    }
  }

  return (
    <div className="login-page">

      <div className="login-box">

        <h1>Smart Inventory</h1>

        <p className="login-subtitle">
          Inventory Management System
        </p>

        <form onSubmit={handleLogin}>

          <div className="form-group">
            <label>Email</label>

            <input
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label>Password</label>

            <input
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button
            type="submit"
            className="login-button"
          >
            Login
          </button>

        </form>

        {message && (
          <p>{message}</p>
        )}

      </div>

    </div>
  )
}

export default Login