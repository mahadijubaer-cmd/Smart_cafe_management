from __future__ import annotations

from pydantic import BaseModel, Field


class MemoRequest(BaseModel):
    ref_no: str = Field(..., max_length=50)
    date: str = Field(..., description="Date string, e.g. '2026-06-28'")
    to: str = Field(..., max_length=200)
    from_name: str = Field(..., max_length=200)
    subject: str = Field(..., max_length=300)
    body_paragraphs: list[str] = Field(..., min_length=1)
    signatory_name: str = Field(..., max_length=150)
    signatory_title: str = Field(..., max_length=150)
