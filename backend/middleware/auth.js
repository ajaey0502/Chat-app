const jwt = require('jsonwebtoken')

// Use environment variable, with fallback for development only
const JWT_SECRET = (() => {
  if (process.env.JWT_SECRET) {
    return process.env.JWT_SECRET
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('CRITICAL: JWT_SECRET environment variable must be set in production!')
  }
  console.warn('WARNING: Using default JWT_SECRET. Set JWT_SECRET environment variable for production!')
  return 'your-secret-key-change-in-production'
})()

const authenticateToken = (req, res, next) => {
  const token = req.cookies.authToken
  
  if (!token) {
    return res.status(401).json({ success: false, error: 'No token provided' })
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET)
    req.user = decoded
    next()
  } catch (error) {
    return res.status(403).json({ success: false, error: 'Invalid token' })
  }
}

// Verify JWT token and return decoded payload or null
const verifyToken = (token) => {
  try {
    return jwt.verify(token, JWT_SECRET)
  } catch (error) {
    return null
  }
}

module.exports = { authenticateToken, verifyToken, JWT_SECRET }
