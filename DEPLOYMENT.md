# Deployment Guide

## Prerequisites
✅ Backend deployed on Render
✅ MongoDB Atlas connected

## Deploy Frontend to Vercel

### Option 1: Using Vercel Dashboard (Recommended)

1. **Push your code to GitHub** (if not already)
   ```bash
   git add .
   git commit -m "Prepare for deployment"
   git push
   ```

2. **Go to [Vercel Dashboard](https://vercel.com/new)**
   - Click "Add New Project"
   - Import your GitHub repository
   - Select the repository

3. **Configure Project Settings**
   - **Framework Preset:** Vite
   - **Root Directory:** `frontend`
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`

4. **Add Environment Variables**
   Click "Environment Variables" and add:
   - `VITE_API_URL` = `https://your-backend-name.onrender.com`
   - `VITE_SOCKET_URL` = `https://your-backend-name.onrender.com`
   
   Replace `your-backend-name` with your actual Render service name

5. **Deploy**
   - Click "Deploy"
   - Wait for deployment to complete
   - You'll get a URL like: `https://your-app.vercel.app`

### Option 2: Using Vercel CLI

1. **Install Vercel CLI**
   ```bash
   npm i -g vercel
   ```

2. **Navigate to frontend directory**
   ```bash
   cd frontend
   ```

3. **Login to Vercel**
   ```bash
   vercel login
   ```

4. **Deploy**
   ```bash
   vercel
   ```
   
   Follow the prompts:
   - Set up and deploy? **Y**
   - Which scope? *Select your account*
   - Link to existing project? **N**
   - What's your project's name? *Enter a name*
   - In which directory is your code located? **.**
   - Want to override settings? **Y**
   - Build Command: `npm run build`
   - Output Directory: `dist`
   - Development Command: `npm run dev`

5. **Set environment variables**
   ```bash
   vercel env add VITE_API_URL
   ```
   Enter your Render backend URL when prompted
   
   ```bash
   vercel env add VITE_SOCKET_URL
   ```
   Enter your Render backend URL when prompted

6. **Deploy to production**
   ```bash
   vercel --prod
   ```

## Update Backend Configuration

After deploying frontend, update your Render backend:

1. **Go to [Render Dashboard](https://dashboard.render.com/)**
2. Select your backend service
3. Go to "Environment" tab
4. Update `CLIENT_URL` to your Vercel URL:
   ```
   CLIENT_URL=https://your-app.vercel.app
   ```
5. Save changes (Render will automatically redeploy)

## Verify Deployment

1. **Visit your Vercel URL**
2. **Open browser console** (F12)
3. **Try to sign up/login**
4. **Check for any CORS errors**

### If you see CORS errors:
- Verify `CLIENT_URL` in Render matches your Vercel URL exactly
- Check that both `VITE_API_URL` and `VITE_SOCKET_URL` in Vercel point to your Render backend
- Redeploy backend after updating `CLIENT_URL`

## Custom Domain (Optional)

### Add domain to Vercel:
1. Go to Project Settings → Domains
2. Add your custom domain
3. Follow DNS configuration instructions

### Update Render after adding custom domain:
Update `CLIENT_URL` environment variable to include both URLs:
```
CLIENT_URL=https://your-app.vercel.app,https://yourdomain.com
```

## Troubleshooting

### Frontend can't connect to backend
- Check browser console for errors
- Verify environment variables in Vercel dashboard
- Make sure URLs don't have trailing slashes

### Socket.io connection failed
- Check that `VITE_SOCKET_URL` is set correctly
- Verify WebSocket support on Render (should work by default)
- Check browser console for connection errors

### 404 errors
- Make sure `vercel.json` is present in frontend directory
- Verify build completed successfully
- Check Vercel deployment logs

### CORS errors
- Verify `CLIENT_URL` in Render matches your Vercel domain exactly
- Check that credentials are enabled in CORS config
- Redeploy backend after any CORS changes

## Environment Variables Summary

### Vercel (Frontend)
- `VITE_API_URL`: Your Render backend URL
- `VITE_SOCKET_URL`: Your Render backend URL

### Render (Backend)
- `NODE_ENV`: production
- `MONGODB_URI`: Your MongoDB Atlas connection string
- `JWT_SECRET`: Secure random string
- `CLIENT_URL`: Your Vercel frontend URL
- `PORT`: 8000 (or leave default)
- `MAX_FILE_SIZE`: 10485760
- `UPLOAD_DIR`: uploads

## Notes

- Free tier Render services sleep after 15 minutes of inactivity
- First request after sleep may take 30-50 seconds
- Consider upgrading to paid tier for production apps
- Vercel free tier is sufficient for most apps
