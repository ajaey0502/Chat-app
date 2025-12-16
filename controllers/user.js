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

// Input validation helpers
const validateSignupInput = (username, password) => {
    // Username validation
    if (!username || typeof username !== 'string') {
        return { valid: false, error: 'Username is required' }
    }
    if (username.length < 3 || username.length > 20) {
        return { valid: false, error: 'Username must be between 3 and 20 characters' }
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
        return { valid: false, error: 'Username can only contain letters, numbers, and underscores' }
    }
    
    // Password validation (strong for signup)
    if (!password || typeof password !== 'string') {
        return { valid: false, error: 'Password is required' }
    }
    if (password.length < 8 || password.length > 100) {
        return { valid: false, error: 'Password must be between 8 and 100 characters' }
    }
    // Require at least one uppercase, one lowercase, one digit, and one special character
    if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/.test(password)) {
        return { valid: false, error: 'Password must contain at least one uppercase letter, one lowercase letter, one digit, and one special character (@$!%*?&)' }
    }
    
    return { valid: true }
}

async function signUp(req, res) {
    try {
        const { username, password } = req.body
        
        // Validate input
        const validation = validateSignupInput(username, password)
        if (!validation.valid) {
            return res.status(400).json({
                success: false,
                error: validation.error
            })
        }
        
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
        
        // Validate input
        const validation = validateSignupInput(username, password)
        if (!validation.valid) {
            return res.status(400).json({
                success: false,
                error: validation.error
            })
        }
        
        const user = await User.findOne({ username })

        if (!user) {
            return res.status(401).json({
                success: false,
                error: "Invalid username or password"
            })
        }
        
        // Compare password using bcrypt
        const isPasswordValid = await user.comparePassword(password)
        
        if (!isPasswordValid) {
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