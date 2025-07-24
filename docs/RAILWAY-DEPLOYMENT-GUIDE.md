# Railway Deployment Guide

This guide covers the complete Railway deployment process for the Startup Research App.

## 🚀 **Initial Setup**

### **1. Install Railway CLI**
```bash
npm install -g @railway/cli
```

### **2. Login to Railway**
```bash
railway login --browserless
# Follow the browser authentication flow
```

### **3. Initialize Project**
```bash
# From project root directory
railway init

# Select "Create new project"
# Choose project name: startup_research_app
```

## ⚙️ **Configuration**

### **1. Environment Variables**
Set all required environment variables:

```bash
railway variables set NODE_ENV=production
railway variables set OPENAI_API_KEY=your_openai_key_here
railway variables set SUPABASE_URL=your_supabase_url
railway variables set SUPABASE_ANON_KEY=your_supabase_anon_key
railway variables set JWT_SECRET=your_jwt_secret
railway variables set PORT=3000
```

### **2. Railway Configuration File**
Create `railway.json` in project root:

```json
{
    "$schema": "https://railway.app/railway.schema.json",
    "build": {
        "builder": "NIXPACKS"
    },
    "deploy": {
        "startCommand": "npm start",
        "restartPolicyType": "ON_FAILURE",
        "restartPolicyMaxRetries": 10
    }
}
```

## 🔧 **Code Modifications for Railway**

### **1. Trust Proxy Setting**
Add to `index.js`:
```javascript
// Trust proxy for Railway deployment (fixes rate limiting issues)
app.set('trust proxy', true);
```

### **2. CORS Configuration**
Update CORS origins in `index.js`:
```javascript
app.use(cors({
    origin: NODE_ENV === 'production'
        ? ['https://startup-research-clean.vercel.app', 
           'https://startupresearchapp-production.up.railway.app']
        : ['http://localhost:3000', 'http://localhost:3001'],
    credentials: true
}));
```

## 🚀 **Deployment**

### **1. Deploy to Railway**
```bash
railway up
```

### **2. Monitor Deployment**
```bash
railway logs
railway status
```

### **3. Get Deployment URL**
The URL will be automatically generated in format:
`https://[service-name]-production.up.railway.app`

## 🔍 **Testing Deployment**

### **1. Health Check**
```bash
curl https://startupresearchapp-production.up.railway.app/api/status
```

### **2. API Testing**
```bash
curl -X POST https://startupresearchapp-production.up.railway.app/api/research \
  -H "Content-Type: application/json" \
  -d '{"company": "Tesla", "analysis_type": "comprehensive"}'
```

### **3. Frontend Testing**
Visit: https://startupresearchapp-production.up.railway.app

## 🛠 **Management Commands**

### **Project Management**
```bash
railway list                    # List all projects
railway status                  # Current project status
railway link                    # Link to existing project
railway unlink                  # Unlink current directory
```

### **Environment Variables**
```bash
railway variables               # List all variables
railway variables set KEY=value # Set a variable
railway variables unset KEY     # Remove a variable
```

### **Logs and Monitoring**
```bash
railway logs                    # View recent logs
railway logs --follow          # Follow logs in real-time
```

### **Deployment Management**
```bash
railway up                      # Deploy current directory
railway redeploy               # Redeploy latest version
railway down                   # Remove latest deployment
```

## 🐛 **Troubleshooting**

### **Common Issues**

1. **Rate Limiting Errors**
   - **Solution**: Add `app.set('trust proxy', true)`
   - **Cause**: Railway uses proxy headers

2. **Environment Variables Not Set**
   - **Solution**: Use `railway variables set` for each required var
   - **Check**: `railway variables` to list current vars

3. **Build Failures**
   - **Solution**: Check `package.json` scripts and dependencies
   - **Logs**: Use `railway logs` to see build output

4. **CORS Errors**
   - **Solution**: Add Railway domain to CORS origins
   - **Update**: CORS configuration in Express app

## 📋 **Deployment Checklist**

- [ ] Railway CLI installed and authenticated
- [ ] Project initialized with Railway
- [ ] All environment variables set
- [ ] `railway.json` configuration file created
- [ ] Trust proxy setting added to Express app
- [ ] CORS origins updated for Railway domain
- [ ] Application deployed successfully
- [ ] Health check endpoint responding
- [ ] API endpoints functional
- [ ] Frontend pages accessible
- [ ] Navigation menu working
- [ ] Advanced features visible

## 🔄 **Continuous Deployment**

For automatic deployments on code changes:

1. **Connect GitHub Repository**
   - Go to Railway dashboard
   - Connect your GitHub repository
   - Enable automatic deployments

2. **GitHub Actions (Optional)**
   ```yaml
   name: Deploy to Railway
   on:
     push:
       branches: [main]
   jobs:
     deploy:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v2
         - name: Deploy to Railway
           run: railway up
   ```

## 🎯 **Success Criteria**

✅ Application accessible via Railway URL  
✅ All API endpoints responding correctly  
✅ Frontend navigation working  
✅ Advanced features visible and functional  
✅ Environment variables properly configured  
✅ No rate limiting or CORS errors  
✅ Logs showing healthy application startup  

---

**Railway deployment successful!** 🎉
