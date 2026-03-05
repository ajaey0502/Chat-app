const express = require("express")
const router = express.Router()
const rateLimit = require('express-rate-limit')
const { signUp, login } = require("../controllers/user")
const User = require("../models/user")
const { authenticateToken } = require("../middleware/auth")

// Rate limiter for auth routes (login/signup) - prevent brute force
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20, // 20 attempts per window
    message: { success: false, error: 'Too many attempts. Please try again after 15 minutes.' },
    standardHeaders: true,
    legacyHeaders: false,
})

// Login && SignUp
router.post("/api/signup", authLimiter, signUp)
router.post("/api/login", authLimiter, login)

// Logout 
router.post("/api/logout", (req, res) => {
    const isProduction = process.env.NODE_ENV === 'production'
    res.clearCookie('authToken', {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? 'none' : 'lax',
        path: '/'
    })
    return res.json({ success: true, message: "Logged out successfully" })
})

// info - usernames && rooms
router.get("/api/me", authenticateToken, async (req, res) => {
    try {
        const user = await User.findOne({ username: req.user.username });
        if (!user) {
            return res.status(404).json({
                success: false,
                error: "User not found"
            })
        }
        
        return res.json({
            success: true,
            user: {
                username: user.username,
                rooms: user.rooms
            }
        })
    } catch (error) {
        return res.status(500).json({
            success: false,
            error: "Server error"
        })
    }
})

module.exports = router