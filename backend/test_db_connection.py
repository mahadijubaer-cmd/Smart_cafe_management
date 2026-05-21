"""
Database Connection Test Script
Run this to verify your Neon PostgreSQL connection
"""

import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")


async def test_connection():
    """Test database connection"""
    print("🔍 Testing Neon PostgreSQL Connection...")
    print(f"Database URL: {DATABASE_URL[:50]}...")
    
    try:
        engine = create_async_engine(DATABASE_URL, echo=False)
        
        async with engine.begin() as conn:
            result = await conn.execute("SELECT 1")
            print("✅ Successfully connected to Neon PostgreSQL!")
            return True
            
    except Exception as e:
        print(f"❌ Connection failed: {str(e)}")
        return False
    finally:
        await engine.dispose()


if __name__ == "__main__":
    success = asyncio.run(test_connection())
    exit(0 if success else 1)
