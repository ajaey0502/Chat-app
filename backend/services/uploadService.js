const multer = require('multer');
const path = require('path');
const fs = require('fs');

class UploadService {
    constructor() {
        this.setupStorage();
        this.setupFileFilter();
        this.setupUpload();
    }

    setupStorage() {
        this.storage = multer.diskStorage({
            destination: function (req, file, cb) {
                const uploadDir = 'uploads/';
                // Ensure uploads directory exists
                if (!fs.existsSync(uploadDir)) {
                    fs.mkdirSync(uploadDir, { recursive: true });
                }
                cb(null, uploadDir)
            },
            filename: function (req, file, cb) {
                // Generate unique filename with timestamp
                const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
                cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname))
            }
        });
    }

    setupFileFilter() {
        this.fileFilter = (req, file, cb) => {
            const allowedTypes = /jpeg|jpg|png|gif|mp4|mov|avi|webm|webp|pdf/
            const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase())
            const mimetype = allowedTypes.test(file.mimetype) || file.mimetype === 'application/pdf'
            
            if (mimetype && extname) {
                return cb(null, true)
            } else {
                cb(new Error('Only images, videos, and PDFs are allowed!'))
            }
        }
    }

    setupUpload() {
        this.upload = multer({ 
            storage: this.storage,
            fileFilter: this.fileFilter,
            limits: {
                fileSize: 50 * 1024 * 1024 // 50MB limit
            }
        });
    }

    getUploadMiddleware() {
        return this.upload.single('file');
    }

    getFileType(mimetype) {
        if (mimetype.startsWith('image/')) return 'image';
        if (mimetype.startsWith('video/')) return 'video';
        if (mimetype === 'application/pdf') return 'pdf';
        return 'file';
    }

    generateFileUrl(filename) {
        return `/uploads/${filename}`;
    }

    deleteFile(filename) {
        const filepath = path.join(__dirname, '..', 'uploads', filename);
        if (fs.existsSync(filepath)) {
            fs.unlinkSync(filepath);
            return true;
        }
        return false;
    }

    // Helper method to validate file upload requirements
    validateUpload(req) {
        const errors = [];
        
        if (!req.file) {
            errors.push('No file uploaded');
        }
        
        if (!req.body.room) {
            errors.push('Room name is required');
        }
        
        return {
            isValid: errors.length === 0,
            errors
        };
    }
}

module.exports = new UploadService();
