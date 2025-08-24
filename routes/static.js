const express = require("express")
const router = express.Router()
const { signUp, login } = require("../controllers/user")
const User = require("../models/user")
const { authenticateToken } = require("../middleware/auth")

// Login && SignUp
router.post("/api/signup", signUp)
router.post("/api/login", login)

// Logout 
router.post("/api/logout", (req, res) => {
    res.clearCookie('authToken')
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