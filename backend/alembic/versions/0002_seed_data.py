"""Seed initial data

Revision ID: 0002
Revises: 0001
Create Date: 2026-05-21 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from uuid import uuid4
from passlib.context import CryptContext
import datetime

# revision identifiers, used by Alembic.
revision = '0002'
down_revision = '0001'
branch_labels = None
depends_on = None

# Password hashing context
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def upgrade() -> None:
    # Insert categories
    categories = [
        {'name': 'Breakfast', 'icon_url': 'breakfast.svg', 'display_order': 1},
        {'name': 'Lunch', 'icon_url': 'lunch.svg', 'display_order': 2},
        {'name': 'Snacks', 'icon_url': 'snacks.svg', 'display_order': 3},
        {'name': 'Beverages', 'icon_url': 'beverages.svg', 'display_order': 4},
        {'name': 'Homemade', 'icon_url': 'homemade.svg', 'display_order': 5},
    ]
    
    op.bulk_insert('categories', categories)
    
    # Insert 30 tables in a 6x5 grid (A1-F5)
    tables = []
    rows = ['A', 'B', 'C', 'D', 'E', 'F']
    cols = range(1, 6)
    
    table_id = 1
    for row_idx, row in enumerate(rows):
        for col_idx, col in enumerate(cols):
            tables.append({
                'table_id': table_id,
                'table_number': f'{row}{col}',
                'zone': 'indoor',
                'capacity': 4,
                'status': 'available',
                'position_x': col_idx,
                'position_y': row_idx
            })
            table_id += 1
    
    op.bulk_insert('tables_map', tables)
    
    # Insert staff and cleaner users with hashed passwords
    # Password: "password123" hashed with bcrypt
    hashed_password = pwd_context.hash("password123")
    
    users = [
        {
            'user_id': str(uuid4()),
            'full_name': 'Staff User 1',
            'email': 'staff1@bracu.ac.bd',
            'password_hash': hashed_password,
            'role': 'staff',
            'student_id': None,
            'phone': '01700000001',
            'wallet_balance': 0.00,
            'reward_points': 0,
            'is_active': True,
            'created_at': datetime.datetime.utcnow(),
            'updated_at': datetime.datetime.utcnow()
        },
        {
            'user_id': str(uuid4()),
            'full_name': 'Staff User 2',
            'email': 'staff2@bracu.ac.bd',
            'password_hash': hashed_password,
            'role': 'staff',
            'student_id': None,
            'phone': '01700000002',
            'wallet_balance': 0.00,
            'reward_points': 0,
            'is_active': True,
            'created_at': datetime.datetime.utcnow(),
            'updated_at': datetime.datetime.utcnow()
        },
        {
            'user_id': str(uuid4()),
            'full_name': 'Staff User 3',
            'email': 'staff3@bracu.ac.bd',
            'password_hash': hashed_password,
            'role': 'staff',
            'student_id': None,
            'phone': '01700000003',
            'wallet_balance': 0.00,
            'reward_points': 0,
            'is_active': True,
            'created_at': datetime.datetime.utcnow(),
            'updated_at': datetime.datetime.utcnow()
        },
        {
            'user_id': str(uuid4()),
            'full_name': 'Cleaner User 1',
            'email': 'cleaner1@bracu.ac.bd',
            'password_hash': hashed_password,
            'role': 'cleaner',
            'student_id': None,
            'phone': '01700000010',
            'wallet_balance': 0.00,
            'reward_points': 0,
            'is_active': True,
            'created_at': datetime.datetime.utcnow(),
            'updated_at': datetime.datetime.utcnow()
        },
        {
            'user_id': str(uuid4()),
            'full_name': 'Cleaner User 2',
            'email': 'cleaner2@bracu.ac.bd',
            'password_hash': hashed_password,
            'role': 'cleaner',
            'student_id': None,
            'phone': '01700000011',
            'wallet_balance': 0.00,
            'reward_points': 0,
            'is_active': True,
            'created_at': datetime.datetime.utcnow(),
            'updated_at': datetime.datetime.utcnow()
        },
        {
            'user_id': str(uuid4()),
            'full_name': 'Cleaner User 3',
            'email': 'cleaner3@bracu.ac.bd',
            'password_hash': hashed_password,
            'role': 'cleaner',
            'student_id': None,
            'phone': '01700000012',
            'wallet_balance': 0.00,
            'reward_points': 0,
            'is_active': True,
            'created_at': datetime.datetime.utcnow(),
            'updated_at': datetime.datetime.utcnow()
        }
    ]
    
    op.bulk_insert('users', users)


def downgrade() -> None:
    # Delete seed data
    op.execute('DELETE FROM users WHERE email IN (\'staff1@bracu.ac.bd\', \'staff2@bracu.ac.bd\', \'staff3@bracu.ac.bd\', \'cleaner1@bracu.ac.bd\', \'cleaner2@bracu.ac.bd\', \'cleaner3@bracu.ac.bd\')')
    op.execute('DELETE FROM tables_map')
    op.execute('DELETE FROM categories')
