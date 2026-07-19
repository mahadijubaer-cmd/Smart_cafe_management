"""Initial schema creation

Revision ID: 0001
Revises: 
Create Date: 2026-05-21 11:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '0001'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create ENUM types. create_type=False on each is required: without it, SQLAlchemy
    # re-issues CREATE TYPE for every table whose column reuses the same enum object (e.g.
    # paymentMethod_enum is used by both `orders` and `payments` below), which fails with
    # "type already exists" the moment a second table references it — or even on the very
    # first table, depending on dialect DDL-event ordering. Only ever caught when this
    # migration runs against a truly empty database (previously always built via
    # Base.metadata.create_all() in dev, never via `alembic upgrade head` from scratch).
    userRole_enum = postgresql.ENUM('student', 'staff', 'cleaner', 'admin', name='userrole', create_type=False)
    userRole_enum.create(op.get_bind(), checkfirst=True)

    orderStatus_enum = postgresql.ENUM('pending', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled', name='orderstatus', create_type=False)
    orderStatus_enum.create(op.get_bind(), checkfirst=True)

    paymentStatus_enum = postgresql.ENUM('pending', 'paid', 'refunded', name='paymentstatus', create_type=False)
    paymentStatus_enum.create(op.get_bind(), checkfirst=True)

    paymentMethod_enum = postgresql.ENUM('wallet', 'simulation', name='paymentmethod', create_type=False)
    paymentMethod_enum.create(op.get_bind(), checkfirst=True)

    tableStatus_enum = postgresql.ENUM('available', 'reserved', 'occupied', 'cleaning', name='tablestatus', create_type=False)
    tableStatus_enum.create(op.get_bind(), checkfirst=True)

    cleanerStatus_enum = postgresql.ENUM('assigned', 'in_progress', 'done', name='cleanerstatus', create_type=False)
    cleanerStatus_enum.create(op.get_bind(), checkfirst=True)

    reservationStatus_enum = postgresql.ENUM('active', 'completed', 'cancelled', name='reservationstatus', create_type=False)
    reservationStatus_enum.create(op.get_bind(), checkfirst=True)
    
    # 1. Create users table (no dependencies)
    op.create_table(
        'users',
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('full_name', sa.String(100), nullable=False),
        sa.Column('email', sa.String(150), nullable=False),
        sa.Column('password_hash', sa.String(255), nullable=False),
        sa.Column('role', userRole_enum, server_default='student', nullable=False),
        sa.Column('student_id', sa.String(20), nullable=True),
        sa.Column('phone', sa.String(15), nullable=True),
        sa.Column('wallet_balance', sa.Numeric(10, 2), server_default='0.00', nullable=False),
        sa.Column('reward_points', sa.Integer(), server_default='0', nullable=False),
        sa.Column('is_active', sa.Boolean(), server_default='true', nullable=False),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.Column('updated_at', sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.PrimaryKeyConstraint('user_id'),
        sa.UniqueConstraint('email')
    )
    op.create_index(op.f('ix_users_email'), 'users', ['email'], unique=True)
    
    # 2. Create categories table (no dependencies)
    op.create_table(
        'categories',
        sa.Column('category_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(50), nullable=False),
        sa.Column('icon_url', sa.String(255), nullable=True),
        sa.Column('display_order', sa.Integer(), server_default='0', nullable=True),
        sa.Column('is_active', sa.Boolean(), server_default='true', nullable=False),
        sa.PrimaryKeyConstraint('category_id'),
        sa.UniqueConstraint('name')
    )
    
    # 3. Create menu_items table (depends on categories, users)
    op.create_table(
        'menu_items',
        sa.Column('item_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('category_id', sa.Integer(), nullable=False),
        sa.Column('listed_by', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('price', sa.Numeric(8, 2), nullable=False),
        sa.Column('image_url', sa.String(255), nullable=True),
        sa.Column('is_available', sa.Boolean(), server_default='true', nullable=False),
        sa.Column('is_homemade', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('prep_time_mins', sa.Integer(), server_default='10', nullable=False),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.ForeignKeyConstraint(['category_id'], ['categories.category_id'], ),
        sa.ForeignKeyConstraint(['listed_by'], ['users.user_id'], ),
        sa.PrimaryKeyConstraint('item_id')
    )
    
    # 4. Create tables_map table (no dependencies)
    op.create_table(
        'tables_map',
        sa.Column('table_id', sa.Integer(), nullable=False),
        sa.Column('table_number', sa.String(10), nullable=False),
        sa.Column('zone', sa.String(20), server_default='indoor', nullable=False),
        sa.Column('capacity', sa.Integer(), server_default='4', nullable=False),
        sa.Column('status', tableStatus_enum, server_default='available', nullable=False),
        sa.Column('position_x', sa.Integer(), server_default='0', nullable=False),
        sa.Column('position_y', sa.Integer(), server_default='0', nullable=False),
        sa.PrimaryKeyConstraint('table_id'),
        sa.UniqueConstraint('table_number')
    )
    
    # 5. Create orders table (depends on users, tables_map)
    op.create_table(
        'orders',
        sa.Column('order_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('table_id', sa.Integer(), nullable=True),
        sa.Column('time_slot', sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column('status', orderStatus_enum, server_default='pending', nullable=False),
        sa.Column('total_amount', sa.Numeric(10, 2), server_default='0.00', nullable=False),
        sa.Column('discount_amount', sa.Numeric(10, 2), server_default='0.00', nullable=False),
        sa.Column('payment_status', paymentStatus_enum, server_default='pending', nullable=False),
        sa.Column('payment_method', paymentMethod_enum, nullable=True),
        sa.Column('special_notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.Column('updated_at', sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.user_id'], ),
        sa.ForeignKeyConstraint(['table_id'], ['tables_map.table_id'], ),
        sa.PrimaryKeyConstraint('order_id')
    )
    
    # 6. Create order_items table (depends on orders, menu_items)
    op.create_table(
        'order_items',
        sa.Column('order_item_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('order_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('item_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('quantity', sa.Integer(), nullable=False),
        sa.Column('unit_price', sa.Numeric(8, 2), nullable=False),
        sa.ForeignKeyConstraint(['item_id'], ['menu_items.item_id'], ),
        sa.ForeignKeyConstraint(['order_id'], ['orders.order_id'], ),
        sa.PrimaryKeyConstraint('order_item_id')
    )
    
    # 7. Create reservations table (depends on users, tables_map)
    op.create_table(
        'reservations',
        sa.Column('reservation_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('table_id', sa.Integer(), nullable=False),
        sa.Column('reserved_for', sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column('duration_mins', sa.Integer(), server_default='60', nullable=False),
        sa.Column('status', reservationStatus_enum, server_default='active', nullable=False),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.ForeignKeyConstraint(['table_id'], ['tables_map.table_id'], ),
        sa.ForeignKeyConstraint(['user_id'], ['users.user_id'], ),
        sa.PrimaryKeyConstraint('reservation_id')
    )
    
    # 8. Create cleaner_logs table (depends on users, tables_map, orders)
    op.create_table(
        'cleaner_logs',
        sa.Column('log_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('cleaner_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('table_id', sa.Integer(), nullable=False),
        sa.Column('triggered_by_order', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('assigned_at', sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.Column('cleaned_at', sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column('status', cleanerStatus_enum, server_default='assigned', nullable=False),
        sa.ForeignKeyConstraint(['cleaner_id'], ['users.user_id'], ),
        sa.ForeignKeyConstraint(['table_id'], ['tables_map.table_id'], ),
        sa.ForeignKeyConstraint(['triggered_by_order'], ['orders.order_id'], ),
        sa.PrimaryKeyConstraint('log_id')
    )
    
    # 9. Create payments table (depends on orders, users)
    op.create_table(
        'payments',
        sa.Column('payment_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('order_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('amount', sa.Numeric(10, 2), nullable=False),
        sa.Column('method', paymentMethod_enum, nullable=False),
        sa.Column('status', sa.String(20), server_default='success', nullable=False),
        sa.Column('transaction_ref', sa.String(100), nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.ForeignKeyConstraint(['order_id'], ['orders.order_id'], ),
        sa.ForeignKeyConstraint(['user_id'], ['users.user_id'], ),
        sa.PrimaryKeyConstraint('payment_id'),
        sa.UniqueConstraint('transaction_ref')
    )
    
    # 10. Create reward_logs table (depends on users, orders)
    op.create_table(
        'reward_logs',
        sa.Column('log_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('order_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('points_earned', sa.Integer(), server_default='0', nullable=False),
        sa.Column('points_redeemed', sa.Integer(), server_default='0', nullable=False),
        sa.Column('description', sa.String(200), nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.ForeignKeyConstraint(['order_id'], ['orders.order_id'], ),
        sa.ForeignKeyConstraint(['user_id'], ['users.user_id'], ),
        sa.PrimaryKeyConstraint('log_id')
    )
    
    # 11. Create notifications table (depends on users)
    op.create_table(
        'notifications',
        sa.Column('notif_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('type', sa.String(50), nullable=False),
        sa.Column('message', sa.Text(), nullable=False),
        sa.Column('is_read', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.user_id'], ),
        sa.PrimaryKeyConstraint('notif_id')
    )


def downgrade() -> None:
    # Drop tables in reverse order
    op.drop_table('notifications')
    op.drop_table('reward_logs')
    op.drop_table('payments')
    op.drop_table('cleaner_logs')
    op.drop_table('reservations')
    op.drop_table('order_items')
    op.drop_table('orders')
    op.drop_table('tables_map')
    op.drop_table('menu_items')
    op.drop_table('categories')
    op.drop_table('users')
    
    # Drop ENUM types
    postgresql.ENUM(name='userrole').drop(op.get_bind())
    postgresql.ENUM(name='orderstatus').drop(op.get_bind())
    postgresql.ENUM(name='paymentstatus').drop(op.get_bind())
    postgresql.ENUM(name='paymentmethod').drop(op.get_bind())
    postgresql.ENUM(name='tablestatus').drop(op.get_bind())
    postgresql.ENUM(name='cleanerstatus').drop(op.get_bind())
    postgresql.ENUM(name='reservationstatus').drop(op.get_bind())
