const express = require("express");
const router = express.Router();
const path = require('path');

const User = require("../models/user")
const Room = require("../models/room")
const Message = require("../models/message")
const { authenticateToken } = require("../middleware/auth")
const uploadService = require("../services/uploadService")

router.get("/", authenticateToken, async (req, res) => {
    try {
        const { room } = req.query;
        const username = req.user.username; // Get from JWT token
        
        if (!room) {
            return res.status(400).json({
                success: false,
                error: "Room name is required"
            })
        }

        let roomExists = await Room.findOne({ name: room })

        if (!roomExists) {
            return res.status(404).json({
                success: false,
                error: "Room not found. Please create the room first."
            })
        }
        
        // Check if user can join private room
        if (roomExists.isPrivate && !roomExists.members.includes(username)) {
            return res.status(403).json({
                success: false,
                error: `You don't have access to private room "${room}"`
            })
        }

        // Add user to room members if not already there
        if (!roomExists.members.includes(username)) {
            await Room.updateOne(
                { name: room },
                { $addToSet: { members: username } }
            )
        }

        // Add room to user's rooms
        await User.updateOne(
            { username },
            { $addToSet: { rooms: room } }
        )
        
        return res.json({
            success: true,
            room: roomExists
        })
    } catch (error) {
        console.error('Join room error:', error)
        return res.status(500).json({
            success: false,
            error: "Server error"
        })
    }
});

router.get("/rooms", authenticateToken, async (req, res) => {
    try {
        console.log('🏠 Fetching rooms for user:', req.user.username)
        const username = req.user.username // Get from JWT token
        
        // Get all public rooms and private rooms where user is a member
        const publicRooms = await Room.find({ isPrivate: false }).select('name members isPrivate owner createdAt')
        const privateRooms = await Room.find({ 
            isPrivate: true, 
            members: username 
        }).select('name members isPrivate owner createdAt')

        const allRooms = [...publicRooms, ...privateRooms]
        
        console.log('📋 Found rooms:', allRooms.length)
        
        return res.json({
            success: true,
            rooms: allRooms
        })
    } catch (error) {
        console.error('Get rooms error:', error)
        return res.status(500).json({
            success: false,
            error: "Server error"
        })
    }
})

///////////////////////////////////

router.get("/room-info", authenticateToken, async (req, res) => {
    try {
        const { room } = req.query
        const username = req.user.username
        
        if (!room) {
            return res.status(400).json({
                success: false,
                error: "Room name is required"
            })
        }
        
        // Find room
        const roomDoc = await Room.findOne({ name: room })
        if (!roomDoc) {
            return res.status(404).json({
                success: false,
                error: "Room not found"
            })
        }
        
        // Check if user has access
        if (roomDoc.isPrivate && !roomDoc.members.includes(username)) {
            return res.status(403).json({
                success: false,
                error: "Access denied to private room"
            })
        }
        
        return res.json({
            success: true,
            room: {
                name: roomDoc.name,
                owner: roomDoc.owner,
                isPrivate: roomDoc.isPrivate,
                members: roomDoc.members,
                createdAt: roomDoc.createdAt
            }
        })
    } catch (error) {
        console.error('Get room info error:', error)
        return res.status(500).json({
            success: false,
            error: "Server error"
        })
    }
})

router.post("/createRoom", authenticateToken, async (req, res) => {
    try {
        const { roomName, isPrivate } = req.body
        const owner = req.user.username // Get from JWT token
        
        if (!roomName) {
            return res.status(400).json({
                success: false,
                error: "Room name is required"
            })
        }

        // Check if room already exists
        const existingRoom = await Room.findOne({ name: roomName })
        if (existingRoom) {
            return res.status(409).json({
                success: false,
                error: "Room name already exists"
            })
        }

        const newRoom = await Room.create({
            name: roomName,
            isPrivate: isPrivate || false,
            owner: owner,
            members: [owner]  // Owner is first member
        })

        // Add room to user's rooms
        await User.updateOne(
            { username: owner },
            { $addToSet: { rooms: roomName } }
        )

        return res.json({
            success: true,
            room: newRoom,
            message: "Room created successfully"
        })
    } catch (error) {
        console.error('Create room error:', error)
        return res.status(500).json({
            success: false,
            error: "Server error"
        })
    }
})


///////////////////////////////////

router.post("/add-member", authenticateToken, async (req, res) => {
    try {
        const { room, newMembers} = req.body
 
        const membersToAdd = newMembers.split(",").map(u => u.trim())
        
        await Room.updateOne(
            { name: room },
            { $addToSet: { members: { $each: membersToAdd } } }
        )
        
        // Add room to each new member's rooms list
        for (const member of membersToAdd) {
            await User.updateOne(
                { username: member },
                { $addToSet: { rooms: room } }
            )
        }
        
        return res.json({
            success: true,
            message: "Members added successfully"
        })
    } catch (error) {
        console.error('Add member error:', error)
        return res.status(500).json({
            success: false,
            error: "Server error"
        })
    }
});

///////////////////////////////


router.post("/leaveRoom", authenticateToken, async (req, res) => {
    try {
        const { username, room } = req.body
       
        await Room.updateOne(
            { name: room },
            { $pull: { members: username } }
        )
        await User.updateOne(
            { username },
            { $pull: { rooms: room } }    
        )
    
        return res.json({
            success: true,
            message : "Left room successfully"
        })
    } catch (error) {
        return res.status(500).json({
            success: false,
            error: "Server error"
        })
    }
})

////////////////////////////

router.post("/editMessage", authenticateToken, async (req, res) => {
    try {
        const { messageId, newText, room } = req.body
        
        const updatedMessage = await Message.findByIdAndUpdate(
            messageId,
            { $set: { message: newText, edited: true } },
            { new: true }
        )
        
        if (updatedMessage) {
            // Get io instance and emit to room
            const io = req.app.get('io')
            io.to(room).emit('message edited', updatedMessage)
            
            return res.json({
                success: true,
                message: "Message updated successfully"
            })
        } else {
            return res.status(404).json({
                success: false,
                error: "Message not found"
            })
        }
    } catch (error) {
        console.error('Edit message error:', error)
        return res.status(500).json({
            success: false,
            error: "Server error"
        })
    }
})

router.post("/deleteMessage", authenticateToken, async (req, res) => {
    try {
        const { messageId, room } = req.body
        
        const deletedMessage = await Message.findByIdAndDelete(messageId)
        
        if (deletedMessage) {
            // Get io instance and emit to room
            const io = req.app.get('io')
            io.to(room).emit('message deleted', messageId)
            
            return res.json({
                success: true,
                message: "Message deleted successfully"
            })
        } else {
            return res.status(404).json({
                success: false,
                error: "Message not found"
            })
        }
    } catch (error) {
        console.error('Delete message error:', error)
        return res.status(500).json({
            success: false,
            error: "Server error"
        })
    }
})

module.exports = router;

// Route to serve uploaded files
router.get("/uploads/:filename", (req, res) => {
    const filename = req.params.filename
    const filepath = path.join(__dirname, '..', 'uploads', filename)
    res.sendFile(filepath)
})

// File upload route
router.post("/upload", authenticateToken, uploadService.getUploadMiddleware(), async (req, res) => {
    try {
        // Validate upload using the service
        const validation = uploadService.validateUpload(req);
        if (!validation.isValid) {
            return res.status(400).json({
                success: false,
                error: validation.errors[0]
            })
        }

        const { room } = req.body
        const username = req.user.username

        // Check if room exists and user has access
        const roomDoc = await Room.findOne({ name: room })
        if (!roomDoc) {
            return res.status(404).json({
                success: false,
                error: "Room not found"
            })
        }

        if (roomDoc.isPrivate && !roomDoc.members.includes(username)) {
            return res.status(403).json({
                success: false,
                error: "Access denied to private room"
            })
        }

        // Create message with file info using upload service helpers
        const fileUrl = uploadService.generateFileUrl(req.file.filename)
        const fileType = uploadService.getFileType(req.file.mimetype)
        
        const newMessage = await Message.create({
            username: username,
            room: room,
            message: `[${fileType.toUpperCase()}] ${req.file.originalname}`,
            fileUrl: fileUrl,
            fileType: fileType,
            fileName: req.file.originalname
        })

        // Emit the message via socket.io
        const io = req.app.get('io')
        io.to(room).emit("chat message", {
            _id: newMessage._id,
            username: username,
            message: newMessage.message,
            fileUrl: newMessage.fileUrl,
            fileType: newMessage.fileType,
            fileName: newMessage.fileName,
            createdAt: newMessage.createdAt
        })

        return res.json({
            success: true,
            message: "File uploaded successfully",
            file: {
                url: fileUrl,
                type: fileType,
                name: req.file.originalname
            }
        })
    } catch (error) {
        console.error('File upload error:', error)
        return res.status(500).json({
            success: false,
            error: "Server error"
        })
    }
})