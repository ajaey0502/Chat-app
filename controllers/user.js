const User = require("../models/user")
const jwt = require('jsonwebtoken')
const { JWT_SECRET } = require("../middleware/auth")

// Generate JWT token
const generateToken = (username) => {
    return jwt.sign(
        { username }, 
        JWT_SECRET, 
        { expiresIn: '7d' } // Token expires in 7 days
    )
}

async function signUp(req, res) {
    try {
        const { username, password } = req.body
        const userExists = await User.findOne({ username })
        
        if (userExists) {
            return res.status(400).json({
                success: false,
                error: "Username already exists"
            })
        }
        
        const newUser = await User.create({
            username,
            password,
            rooms: []
        })
        
        return res.status(201).json({
            success: true,
            message: "User created successfully",
            user: {
                username: newUser.username,
                rooms: newUser.rooms
            }
        })
    } catch (error) {
        return res.status(500).json({
            success: false,
            error: "Server error"
        })
    }
}

async function login(req, res) {
    try {
        const { username, password } = req.body
        const user = await User.findOne({ username, password })

        if (!user) {
            return res.status(401).json({
                success: false,
                error: "Invalid username or password"
            })
        }
        
        // Generate JWT token
        const token = generateToken(username)
        
        // Set HTTP-only cookie
        res.cookie('authToken', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
            sameSite: 'lax'
        })
        
        return res.status(200).json({
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
}

module.exports = { signUp, login }