from sqlalchemy import Column, String, Integer, Float, Boolean, DateTime, Text, ForeignKey, Enum as SQLEnum, CheckConstraint, Numeric, TIMESTAMP
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid
import enum
from app.core.database import Base
from app.models.user import User, UserRole
from app.models.menu import Category, MenuItem
from app.models.order import Order, OrderItem, OrderStatus, PaymentStatus, PaymentMethod
from app.models.table import TablesMap, TableMap, TableStatus


class CleanerStatus(str, enum.Enum):
    assigned = "assigned"
    in_progress = "in_progress"
    done = "done"


class ReservationStatus(str, enum.Enum):
    active = "active"
    completed = "completed"
    cancelled = "cancelled"
class Reservation(Base):
    __tablename__ = "reservations"
    
    reservation_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.user_id"), nullable=False)
    table_id = Column(Integer, ForeignKey("tables_map.table_id"), nullable=False)
    reserved_for = Column(TIMESTAMP(timezone=True), nullable=False)
    duration_mins = Column(Integer, default=60, nullable=False)
    status = Column(SQLEnum(ReservationStatus), default=ReservationStatus.active, nullable=False)
    created_at = Column(TIMESTAMP(timezone=True), default=datetime.utcnow)
    
    # Relationships
    user = relationship("User", back_populates="reservations")
    table = relationship("TablesMap", back_populates="reservations")


class Payment(Base):
    __tablename__ = "payments"
    
    payment_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    order_id = Column(UUID(as_uuid=True), ForeignKey("orders.order_id"), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.user_id"), nullable=False)
    amount = Column(Numeric(10, 2), nullable=False)
    method = Column(SQLEnum(PaymentMethod), nullable=False)
    status = Column(String(20), default="success", nullable=False)
    transaction_ref = Column(String(100), unique=True, nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), default=datetime.utcnow)
    
    # Relationships
    order = relationship("Order", back_populates="payments")
    user = relationship("User", back_populates="payments")


class CleanerLog(Base):
    __tablename__ = "cleaner_logs"
    
    log_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    cleaner_id = Column(UUID(as_uuid=True), ForeignKey("users.user_id"), nullable=False)
    table_id = Column(Integer, ForeignKey("tables_map.table_id"), nullable=False)
    triggered_by_order = Column(UUID(as_uuid=True), ForeignKey("orders.order_id"), nullable=True)
    assigned_at = Column(TIMESTAMP(timezone=True), default=datetime.utcnow)
    cleaned_at = Column(TIMESTAMP(timezone=True), nullable=True)
    status = Column(SQLEnum(CleanerStatus), default=CleanerStatus.assigned, nullable=False)
    
    # Relationships
    cleaner = relationship("User", back_populates="cleaner_logs")
    table = relationship("TablesMap", back_populates="cleaner_logs")
    triggered_order = relationship("Order", back_populates="cleaner_logs")


class RewardLog(Base):
    __tablename__ = "reward_logs"
    
    log_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.user_id"), nullable=False)
    order_id = Column(UUID(as_uuid=True), ForeignKey("orders.order_id"), nullable=True)
    points_earned = Column(Integer, default=0, nullable=False)
    points_redeemed = Column(Integer, default=0, nullable=False)
    description = Column(String(200), nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), default=datetime.utcnow)
    
    # Relationships
    user = relationship("User", back_populates="reward_logs")
    order = relationship("Order", back_populates="reward_logs")


class Notification(Base):
    __tablename__ = "notifications"
    
    notif_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.user_id"), nullable=False)
    type = Column(String(50), nullable=False)
    message = Column(Text, nullable=False)
    is_read = Column(Boolean, default=False, nullable=False)
    created_at = Column(TIMESTAMP(timezone=True), default=datetime.utcnow)
