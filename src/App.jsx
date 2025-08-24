import React, { useState, useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import Chat from './components/Chat'
import Login from './components/Login'
import Signup from './components/Signup'
import Dashboard from './components/Dashboard'
import './App.css'

function App() {
  const [user, setUser] = useState(null)
  const [currentRoom, setCurrentRoom] = useState(null)
  const [isLoading, setIsLoading] = useState(true)

  // Check for existing authentication on app start
  useEffect(() => {
    checkAuth()
  }, [])

  const checkAuth = async () => {
    try {
      const response = await fetch('/api/me', {
        credentials: 'include'  
      })
      
      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          setUser(data.user.username)
        }
      }
    } catch (error) {
      console.log('No existing authentication found')
    } finally {
      setIsLoading(false)
    }
  }

  const handleLogout = async () => {
    try {
      await fetch('/api/logout', {
        method: 'POST',
        credentials: 'include'
      })
      setUser(null)
      setCurrentRoom(null)
    } catch (error) {
      console.error('Logout error:', error)
    }
  }

  if (isLoading) {
    return (
      <div className="App">
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
          <h2>Loading...</h2>
        </div>
      </div>
    )
  }

  return (
    <Router>
      <div className="App">
        <Routes>
           <Route path="/" element={user ? <Navigate to="/dashboard" /> : <Navigate to="/login" />} />
          <Route path="/login" element={!user ? <Login setUser={setUser} /> : <Navigate to="/dashboard" />} />
          <Route path="/signup" element={!user ? <Signup /> : <Navigate to="/dashboard" />} />
          <Route path="/dashboard" element=
          {user ? <Dashboard setCurrentRoom={setCurrentRoom} 
          username={user} 
          logout={handleLogout} 
          /> : <Navigate to="/login" />} />

          <Route path="/chat"  element={
      user && currentRoom ? 
      (<Chat username={user} room={currentRoom}  /> ) 
      : (<Navigate to="/dashboard" /> )
        } 
          />
        </Routes>
      </div>
    </Router>
  )
}

export default App
