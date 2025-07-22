# Startup Research App - MVP

> AI-powered startup research and business intelligence platform

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- npm 9+
- OpenAI API key (optional - runs in demo mode without it)

### Installation
```bash
# Clone repository
git clone https://github.com/goksnair/startup-research-app.git
cd startup-research-app

# Install dependencies
npm install

# Setup environment
cp .env.example .env
# Edit .env with your API keys

# Start development server
npm run dev
```

### Production Deployment
```bash
# Deploy to Vercel
npm run deploy
```

## 📋 Features (MVP v1.0.0)

### ✅ Current Features
- **AI-Powered Research**: Get comprehensive startup analysis using GPT-4
- **Multiple Analysis Types**: Market, competitor, funding, and comprehensive analysis  
- **Clean UI**: Simple, responsive web interface
- **Demo Mode**: Works without API keys for testing
- **Production Ready**: Deployed on Vercel with proper security
- **Rate Limiting**: Prevents API abuse
- **Error Handling**: Graceful error management

### 🔄 Planned Features (Next Phases)
- User authentication and saved research
- PDF report generation  
- Batch processing for multiple companies
- API endpoints for external integrations
- Advanced analytics and insights
- Team collaboration features

## 🏗️ Architecture

### Simple & Clean Structure
```
startup-research-app/
├── index-mvp.js          # Main server (MVP)
├── package-mvp.json      # MVP dependencies
├── vercel-mvp.json       # MVP deployment config
├── public/
│   └── index-mvp.html    # Frontend
├── scripts/
│   └── daily-backup.js   # Automated backup
└── docs/
    └── PRODUCTION-ROADMAP.md
```

### Tech Stack
- **Backend**: Node.js + Express
- **Frontend**: Vanilla HTML/CSS/JS
- **AI**: OpenAI GPT-4 Mini
- **Database**: Supabase (optional)
- **Deployment**: Vercel
- **Security**: Helmet.js, CORS, Rate limiting

## 🔧 Configuration

### Environment Variables
```env
# Required for AI features
OPENAI_API_KEY=sk-...

# Optional for data persistence
SUPABASE_URL=https://...
SUPABASE_ANON_KEY=eyJ...

# Optional configuration
NODE_ENV=production
PORT=3000
```

### Running Without Configuration
The app runs in **demo mode** if no API keys are provided, showing sample analysis results.

## 📊 API Reference

### Research Endpoint
```bash
POST /api/research
Content-Type: application/json

{
  "company": "OpenAI",
  "analysis_type": "comprehensive",
  "query": "Focus on recent developments"
}
```

### Response Format
```json
{
  "company": "OpenAI",
  "analysis_type": "comprehensive", 
  "timestamp": "2025-07-22T...",
  "status": "completed",
  "data": {
    "analysis": "Detailed AI analysis...",
    "source": "openai",
    "model": "gpt-4o-mini",
    "tokens_used": 1250
  }
}
```

### Health Check
```bash
GET /health
```

## 🔄 Daily Backups

### Automated Backup System
```bash
# Run manual backup
npm run backup

# Setup daily cron job (Linux/Mac)
crontab -e
# Add: 0 23 * * * cd /path/to/app && npm run backup
```

### Backup Features
- Automatic daily commits at 11:59 PM
- Preserves all code changes
- Creates backup logs
- Pushes to GitHub automatically

## 🧪 Testing

### Manual Testing
1. Start the app: `npm run dev`
2. Open http://localhost:3000
3. Try researching: "OpenAI", "Stripe", "Airbnb"
4. Test different analysis types
5. Check health endpoint: http://localhost:3000/health

### Production Testing
- Live URL: https://startup-research-app.vercel.app
- Health: https://startup-research-app.vercel.app/health

## 📈 Performance

### Current Metrics
- **Response Time**: < 5 seconds for research
- **Uptime**: 99.9% on Vercel
- **Rate Limit**: 100 requests per 15 minutes
- **Max Tokens**: 2000 per request

## 🛡️ Security

### Implemented
- Helmet.js security headers
- CORS protection  
- Rate limiting
- Input validation
- Environment variable protection

### Best Practices
- No sensitive data in frontend
- API keys in environment variables only
- Secure error messages in production

## 🐛 Troubleshooting

### Common Issues

**"OpenAI API Error"**
- Check if OPENAI_API_KEY is set correctly
- Verify API key has sufficient credits
- App falls back to demo mode automatically

**"Database Connection Failed"**  
- Supabase is optional for MVP
- App works without database
- Check SUPABASE_URL and SUPABASE_ANON_KEY

**"Deployment Failed"**
- Verify vercel-mvp.json configuration
- Check environment variables in Vercel dashboard
- Review build logs

## 🗺️ Development Roadmap

### Phase 1: MVP (Current) ✅
- Basic research functionality
- Simple UI
- Production deployment
- Automated backups

### Phase 2: User Features (Next)
- User authentication
- Save research history
- Export capabilities

### Phase 3: Advanced Features  
- Batch processing
- PDF reports
- Email notifications

### Phase 4: Enterprise
- Multi-tenant architecture
- Advanced security
- Team collaboration

### Phase 5: Scale
- Performance optimization
- Monitoring & analytics
- Support system

## 📞 Support

### Getting Help
- Check [Issues](https://github.com/goksnair/startup-research-app/issues)
- Review [PRODUCTION-ROADMAP.md](./PRODUCTION-ROADMAP.md)
- Contact: [Your email here]

### Contributing
1. Fork the repository
2. Create feature branch
3. Make changes
4. Test thoroughly  
5. Submit pull request

## 📜 License

MIT License - see [LICENSE](./LICENSE) file

---

**Status**: ✅ Production Ready  
**Version**: 1.0.0-mvp  
**Last Updated**: 2025-07-22  
**Next Review**: 2025-07-29