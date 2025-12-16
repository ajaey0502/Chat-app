# Chat Application - Setup & Security Guide

## 🔒 Critical Security Issues Fixed

### 1. JWT Secret Management
- **Issue**: Hardcoded JWT secret in production
- **Fix**: Use environment variable `JWT_SECRET`
- **Action Required**: Set `JWT_SECRET` in `.env` file before running in production

### 2. CORS Configuration
- **Issue**: Hardcoded to `localhost:3000`
- **Fix**: Use `CLIENT_URL` environment variable
- **Action Required**: Set `CLIENT_URL` based on your deployment URL

### 3. Password Validation Strengthened
- **Changes**: Increased minimum length from 6 to 8 characters
- **Requirements**: At least 1 uppercase, 1 lowercase, 1 digit, 1 special character (@$!%*?&)

### 4. Cookie Parsing Security
- **Fix**: Proper URL decoding and validation of cookie values
- **Benefit**: Prevents cookie injection attacks

## 📋 Setup Instructions

### Prerequisites
- Node.js (v14+)
- MongoDB running locally (mongodb://localhost:27017)
- npm or yarn

### Installation

1. **Clone and Install Dependencies**
   ```bash
   npm install
   ```

2. **Configure Environment Variables**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` and set:
   ```
   JWT_SECRET=your-strong-random-secret-key-here
   CLIENT_URL=http://localhost:3000
   NODE_ENV=development
   ```

3. **Generate a Strong JWT Secret**
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
   Copy the output and use it as your JWT_SECRET in `.env`

4. **Start MongoDB**
   ```bash
   mongod
   ```

5. **Start Development Server**
   ```bash
   npm start
   ```

6. **Start React App** (in another terminal)
   ```bash
   npm run dev
   ```

## 🐛 Issues Fixed

| # | Issue | Status |
|---|-------|--------|
| 1 | Hardcoded JWT Secret | ✅ FIXED |
| 2 | Missing File Upload Socket Emit | ✅ FIXED |
| 3 | Cookie Parsing Vulnerability | ✅ FIXED |
| 4 | Hardcoded CORS URL | ✅ FIXED |
| 5 | Input Sanitization | ⏸️ DEFERRED |
| 6 | Weak Password Validation | ✅ FIXED |
| 7 | Socket.io Event Mismatch | ✅ FIXED |
| 8 | Missing Error Boundaries | ✅ FIXED |
| 9 | Incomplete File Upload Flow | ✅ FIXED |
| 10 | Missing Room Validation | ✅ FIXED |
| 11 | localStorage Persistence Bug | ✅ FIXED |
| 12 | No Loading State in Chat | ✅ FIXED |
| 13 | Incomplete Error Display | ✅ FIXED |
| 14 | Unused Files | ✅ FIXED |
| 15 | Inconsistent Error Handling | ✅ FIXED |

## 🔐 Production Checklist

Before deploying to production:

- [ ] Set `JWT_SECRET` to a strong random value
- [ ] Set `NODE_ENV=production`
- [ ] Update `CLIENT_URL` to your production URL
- [ ] Set `MONGODB_URI` to your production database
- [ ] Enable HTTPS on your production server
- [ ] Configure proper CORS for your production domain
- [ ] Review and implement input sanitization (Issue #5)
- [ ] Set up proper error logging
- [ ] Configure rate limiting for API endpoints
- [ ] Enable helmet.js for security headers

## 🚀 New Features

### Error Handling
- Global error boundary component catches React errors
- Improved error messages across all pages
- Console logging for debugging

### File Upload Improvements
- File size validation (10MB max)
- Socket.io integration for file upload notifications
- Better error feedback to users

### Session Management
- localStorage now includes timestamp
- Automatic cleanup of stale session data (>24 hours)
- Safe cookie parsing with URL decoding

### Socket.io Enhancements
- Join success and user join notifications
- Better room validation
- Loading indicator while connecting

## 📝 Environment Variables Reference

```
JWT_SECRET         - JWT signing key (REQUIRED for production)
CLIENT_URL         - Frontend URL for CORS (default: http://localhost:3000)
NODE_ENV           - development or production
MONGODB_URI        - MongoDB connection string
PORT               - Server port (default: 8000)
MAX_FILE_SIZE      - Maximum file upload size in bytes
UPLOAD_DIR         - Directory for file uploads
VITE_SOCKET_URL    - Socket.io server URL
```

## 🐛 Troubleshooting

### JWT_SECRET Error
If you see "JWT_SECRET environment variable must be set in production":
1. Create a `.env` file in the root directory
2. Add: `JWT_SECRET=your-secret-key-here`
3. Restart the server

### CORS Errors
If frontend can't reach backend:
1. Check `CLIENT_URL` matches your frontend URL
2. Ensure credentials are included in fetch requests
3. Verify backend is running on correct port

### File Upload Fails
1. Check `/uploads` directory exists and has write permissions
2. Verify file size is under 10MB
3. Check server logs for detailed error messages

## 📚 Additional Resources

- [Express.js Security Best Practices](https://expressjs.com/en/advanced/best-practice-security.html)
- [OWASP Security Top 10](https://owasp.org/www-project-top-ten/)
- [JWT Security](https://tools.ietf.org/html/rfc7519)

## 👥 Support

For issues or questions, please check:
1. Server console logs (`node index.js`)
2. Browser console (F12 DevTools)
3. Network tab in DevTools for API errors
