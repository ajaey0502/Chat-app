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
        
        // Validate room parameter - must be string and reasonable length
        if (typeof room !== 'string' || room.length < 1 || room.length > 100) {
            return res.status(400).json({
                success: false,
                error: "Invalid room name format"
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

        // Block banned users from joining (public or private)
        if (roomExists.bannedMembers && roomExists.bannedMembers.includes(username)) {
            return res.status(403).json({
                success: false,
                error: "You are banned from this room"
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
        const requester = req.user.username

        if (!room || !newMembers) {
            return res.status(400).json({
                success: false,
                error: "Room and newMembers are required"
            })
        }

        const roomDoc = await Room.findOne({ name: room })
        if (!roomDoc) {
            return res.status(404).json({
                success: false,
                error: "Room not found"
            })
        }

        // Only the room owner can add (and implicitly unban) members
        if (roomDoc.owner !== requester) {
            return res.status(403).json({
                success: false,
                error: "Only the room owner can add members"
            })
        }

        const membersToAdd = newMembers.split(",").map(u => u.trim()).filter(Boolean)
        if (membersToAdd.length === 0) {
            return res.status(400).json({
                success: false,
                error: "No valid members provided"
            })
        }
        
        await Room.updateOne(
            { name: room },
            { 
                $addToSet: { members: { $each: membersToAdd } },
                $pull: { bannedMembers: { $in: membersToAdd } } // Unban when re-adding
            }
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

// Owner-only ban (public rooms): remove member and prevent rejoin
router.post("/ban", authenticateToken, async (req, res) => {
    try {
        const owner = req.user.username
        const { room, targetUser } = req.body

        if (!room || !targetUser) {
            return res.status(400).json({
                success: false,
                error: "Room and targetUser are required"
            })
        }

        const roomDoc = await Room.findOne({ name: room })
        if (!roomDoc) {
            return res.status(404).json({
                success: false,
                error: "Room not found"
            })
        }

        // Only owner can ban
        if (roomDoc.owner !== owner) {
            return res.status(403).json({
                success: false,
                error: "Only the room owner can ban members"
            })
        }

        // Prevent banning self/owner
        if (targetUser === owner) {
            return res.status(400).json({
                success: false,
                error: "Owner cannot ban themselves"
            })
        }

        // For public rooms: enforce ban list; private rooms already controlled by membership
        if (roomDoc.isPrivate) {
            return res.status(400).json({
                success: false,
                error: "Ban not needed for private rooms"
            })
        }

        await Room.updateOne(
            { name: room },
            {
                $pull: { members: targetUser },
                $addToSet: { bannedMembers: targetUser }
            }
        )

        // Remove room from target user's rooms list
        await User.updateOne(
            { username: targetUser },
            { $pull: { rooms: room } }
        )

        return res.json({
            success: true,
            message: "User banned from room"
        })
    } catch (error) {
        console.error('Ban member error:', error)
        return res.status(500).json({
            success: false,
            error: "Server error"
        })
    }
})

///////////////////////////////

// Owner can transfer room ownership to another member
router.post("/transfer-ownership", authenticateToken, async (req, res) => {
    try {
        const owner = req.user.username
        const { room, newOwner } = req.body

        if (!room || !newOwner) {
            return res.status(400).json({
                success: false,
                error: "Room and newOwner are required"
            })
        }

        const roomDoc = await Room.findOne({ name: room })
        if (!roomDoc) {
            return res.status(404).json({
                success: false,
                error: "Room not found"
            })
        }

        if (roomDoc.owner !== owner) {
            return res.status(403).json({
                success: false,
                error: "Only the room owner can transfer ownership"
            })
        }

        if (!roomDoc.members.includes(newOwner)) {
            return res.status(400).json({
                success: false,
                error: "New owner must be a member of the room"
            })
        }

        await Room.updateOne(
            { name: room },
            { $set: { owner: newOwner } }
        )

        return res.json({
            success: true,
            message: "Ownership transferred successfully",
            newOwner
        })
    } catch (error) {
        console.error('Transfer ownership error:', error)
        return res.status(500).json({
            success: false,
            error: "Server error"
        })
    }
})

///////////////////////////////


router.post("/leaveRoom", authenticateToken, async (req, res) => {
    try {
        const username = req.user.username // Use authenticated user, not body
        const { room } = req.body

        if (!room) {
            return res.status(400).json({
                success: false,
                error: "Room name is required"
            })
        }

        const roomDoc = await Room.findOne({ name: room })
        if (!roomDoc || !roomDoc.members.includes(username)) {
            return res.status(404).json({
                success: false,
                error: "You are not a member of this room"
            })
        }

        // If owner and only member, delete the room (and remove from user's rooms)
        if (roomDoc.owner === username && roomDoc.members.length <= 1) {
            await Message.deleteMany({ room })
            await Room.deleteOne({ name: room })
            await User.updateMany(
                { rooms: room },
                { $pull: { rooms: room } }
            )
            return res.json({
                success: true,
                message: "Room deleted because owner left and was the only member"
            })
        }

        // If owner with other members, require ownership transfer first
        if (roomDoc.owner === username && roomDoc.members.length > 1) {
            return res.status(400).json({
                success: false,
                error: "Transfer ownership to another member before leaving"
            })
        }

        // Non-owner leave flow
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
        console.error('Leave room error:', error)
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