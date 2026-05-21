from __future__ import annotations

import enum

from sqlalchemy import Boolean, Enum as SQLEnum, Integer, String, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class TableStatus(str, enum.Enum):
    available = "available"
    reserved = "reserved"
    occupied = "occupied"
    cleaning = "cleaning"


class TablesMap(Base):
    __tablename__ = "tables_map"

    table_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    table_number: Mapped[str] = mapped_column(String(10), unique=True, nullable=False)
    zone: Mapped[str] = mapped_column(String(20), nullable=False, default="indoor", server_default=text("'indoor'"))
    capacity: Mapped[int] = mapped_column(Integer, nullable=False, default=4, server_default=text("4"))
    status: Mapped[TableStatus] = mapped_column(
        SQLEnum(TableStatus, name="tablestatus"),
        nullable=False,
        default=TableStatus.available,
        server_default=TableStatus.available.value,
    )
    position_x: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default=text("0"))
    position_y: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default=text("0"))

    orders = relationship("Order", back_populates="table")
    cleaner_logs = relationship("CleanerLog", back_populates="table")
    reservations = relationship("Reservation", back_populates="table")


TableMap = TablesMap