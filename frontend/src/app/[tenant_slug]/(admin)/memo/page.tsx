'use client'

import { useState } from 'react'
import { FileText, Loader2, Plus, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'

import apiClient from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface MemoForm {
  ref_no: string
  date: string
  to: string
  from_name: string
  subject: string
  body_paragraphs: string[]
  signatory_name: string
  signatory_title: string
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

export default function MemoPage() {
  const [form, setForm] = useState<MemoForm>({
    ref_no: '',
    date: today(),
    to: '',
    from_name: '',
    subject: '',
    body_paragraphs: [''],
    signatory_name: '',
    signatory_title: '',
  })
  const [generating, setGenerating] = useState(false)

  const set = (field: keyof MemoForm, value: string) =>
    setForm((f) => ({ ...f, [field]: value }))

  const setParagraph = (i: number, val: string) =>
    setForm((f) => {
      const paragraphs = [...f.body_paragraphs]
      paragraphs[i] = val
      return { ...f, body_paragraphs: paragraphs }
    })

  const addParagraph = () =>
    setForm((f) => ({ ...f, body_paragraphs: [...f.body_paragraphs, ''] }))

  const removeParagraph = (i: number) =>
    setForm((f) => ({ ...f, body_paragraphs: f.body_paragraphs.filter((_, idx) => idx !== i) }))

  const handleGenerate = async () => {
    const missing = ['ref_no', 'date', 'to', 'from_name', 'subject', 'signatory_name', 'signatory_title'].find(
      (k) => !form[k as keyof MemoForm]
    )
    if (missing) { toast.error('Please fill in all required fields.'); return }
    if (!form.body_paragraphs.some(Boolean)) { toast.error('Add at least one paragraph.'); return }

    setGenerating(true)
    try {
      const res = await apiClient.post('/memo/generate', {
        ...form,
        body_paragraphs: form.body_paragraphs.filter(Boolean),
      }, { responseType: 'blob' })

      const url = URL.createObjectURL(res.data as Blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `memo_${form.ref_no.replace(/\//g, '-')}.pdf`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Memo downloaded.')
    } catch {
      toast.error('Failed to generate memo.')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <div className="mb-8 flex items-center gap-3">
        <FileText className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-black text-slate-900">Memo Generator</h1>
          <p className="text-sm text-slate-500">Generate an institutional A4 PDF memorandum.</p>
        </div>
      </div>

      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Reference No. <span className="text-red-500">*</span></Label>
            <Input placeholder="SCMS/2026/001" value={form.ref_no} onChange={(e) => set('ref_no', e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Date <span className="text-red-500">*</span></Label>
            <Input type="date" value={form.date} onChange={(e) => set('date', e.target.value)} />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>To <span className="text-red-500">*</span></Label>
            <Input placeholder="Head of Department" value={form.to} onChange={(e) => set('to', e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>From <span className="text-red-500">*</span></Label>
            <Input placeholder="Cafe Manager" value={form.from_name} onChange={(e) => set('from_name', e.target.value)} />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Subject <span className="text-red-500">*</span></Label>
          <Input placeholder="Monthly operations report" value={form.subject} onChange={(e) => set('subject', e.target.value)} />
        </div>

        <div className="space-y-3">
          <Label>Body</Label>
          {form.body_paragraphs.map((p, i) => (
            <div key={i} className="flex gap-2">
              <textarea
                value={p}
                onChange={(e) => setParagraph(i, e.target.value)}
                rows={3}
                placeholder={`Paragraph ${i + 1}…`}
                className="flex-1 rounded-xl border border-black/10 px-4 py-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 resize-none"
              />
              {form.body_paragraphs.length > 1 && (
                <button type="button" onClick={() => removeParagraph(i)} className="text-slate-400 hover:text-red-500">
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={addParagraph}
            className="flex items-center gap-1 text-sm text-primary hover:underline"
          >
            <Plus className="h-4 w-4" /> Add paragraph
          </button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Signatory name <span className="text-red-500">*</span></Label>
            <Input placeholder="Jane Doe" value={form.signatory_name} onChange={(e) => set('signatory_name', e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Signatory title <span className="text-red-500">*</span></Label>
            <Input placeholder="Operations Manager" value={form.signatory_title} onChange={(e) => set('signatory_title', e.target.value)} />
          </div>
        </div>

        <Button
          className="w-full bg-primary text-white hover:opacity-90"
          onClick={handleGenerate}
          disabled={generating}
        >
          {generating ? (
            <span className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Generating…
            </span>
          ) : (
            'Download PDF memo'
          )}
        </Button>
      </div>
    </div>
  )
}
