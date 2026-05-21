# SCMS Project Setup - Quick Reference

## ✅ What's Been Set Up

### 1. Backend (FastAPI + Python)
- ✅ FastAPI application with async support
- ✅ SQLAlchemy ORM with PostgreSQL async driver (asyncpg)
- ✅ Pydantic v2 for data validation
- ✅ JWT authentication framework
- ✅ CORS middleware configured
- ✅ Complete database models (Users, Orders, Menu, etc.)
- ✅ Modular structure: routers, services, models, schemas
- ✅ Docker containerization

### 2. Frontend (Next.js 14)
- ✅ Next.js with App Router
- ✅ TypeScript support
- ✅ Tailwind CSS styling
- ✅ Zustand state management
- ✅ Axios API client with JWT interceptor
- ✅ Type definitions for models
- ✅ Jest testing setup
- ✅ Docker containerization

### 3. Database (Neon PostgreSQL)
- ✅ Connection configured in .env
- ✅ SSL/TLS enabled (required by Neon)
- ✅ Connection pooling setup
- ✅ All tables will auto-create on startup

### 4. DevOps
- ✅ docker-compose.yml for local dev
- ✅ .env file with Neon credentials
- ✅ .gitignore configured
- ✅ setup.sh and setup.bat scripts

---

## 🚀 To Start Working

### Windows (PowerShell)
```powershell
cd d:\Smart_cafe_management_system
docker compose up --build
```

### Mac/Linux
```bash
cd /path/to/Smart_cafe_management_system
docker compose up --build
```

### Access Points
- **Frontend:** http://localhost:3000
- **Backend API:** http://localhost:8000/docs
- **Health Check:** http://localhost:8000/health

---

## 📋 Database Tables Auto-Created

When the backend starts, these tables are automatically created:

1. **users** - User accounts (student, staff, cleaner, admin)
2. **categories** - Menu categories
3. **menu_items** - Food items
4. **tables_map** - Cafe table layout (30 pre-configured tables)
5. **orders** - Customer orders
6. **order_items** - Items in orders
7. **reservations** - Table reservations
8. **payments** - Payment transactions
9. **cleaner_logs** - Cleaning assignments
10. **reward_logs** - Reward points
11. **notifications** - User notifications

---

## 🔧 Common Tasks

### Run Tests
```bash
# Backend
docker compose exec backend pytest

# Frontend
docker compose exec frontend npm test
```

### View Backend Logs
```bash
docker compose logs -f backend
```

### Access Backend Container
```bash
docker compose exec backend bash
```

### Restart Services
```bash
docker compose restart

# Or just backend
docker compose restart backend
```

### Stop Everything
```bash
docker compose down
```

---

## 📝 Important Files

| File | Purpose |
|------|---------|
| `.env` | Environment variables (Neon credentials here) |
| `docker-compose.yml` | Container configuration |
| `backend/app/main.py` | FastAPI entry point |
| `backend/app/models/models.py` | SQLAlchemy ORM models |
| `frontend/src/app/page.tsx` | Home page |
| `README.md` | Full documentation |

---

## ⚡ Next Steps

1. **Start containers:** `docker compose up --build`
2. **Wait for startup** (~1-2 minutes first time)
3. **Visit frontend:** http://localhost:3000
4. **Test API:** http://localhost:8000/docs
5. **Verify health:** http://localhost:8000/health
6. **Check logs** if anything fails
7. **Start coding!**

---

## 🔑 Your Neon Connection

**All configured - No action needed!**

```
Host: ep-late-queen-ap701c5-pooler.c-7.us-east-1.aws.neon.tech
Database: neondb
User: neondb_owner
Region: US East 1 (AWS)
SSL: Required
```

---

## 💡 Development Tips

- **Backend changes** → Auto-reload with `--reload` flag
- **Frontend changes** → Auto-reload via Next.js dev server
- **Database schema changes** → Create Python model, restart backend
- **New dependencies** → Update requirements.txt or package.json, rebuild
- **Use Copilot** → Ask to generate API endpoints, components, etc.

---

## 📞 Having Issues?

1. **Check logs:** `docker compose logs`
2. **Verify Docker:** `docker version`
3. **Test DB:** `docker compose exec backend python test_db_connection.py`
4. **Rebuild:** `docker compose up --build`
5. **Clean restart:** `docker compose down && docker compose up --build`

---

**Project is ready! Start building! 🎉**
