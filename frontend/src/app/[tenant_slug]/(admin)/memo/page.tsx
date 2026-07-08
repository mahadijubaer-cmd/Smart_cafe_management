'use client'

import { useState } from 'react'
import { FileText, Loader2, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import apiClient from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldContent,
} from '@/components/ui/field'

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
        <FileText className="text-primary" data-icon="inline-start" />
        <div>
          <h1 className="text-2xl font-black">Memo Generator</h1>
          <p className="text-sm text-muted-foreground">Generate an institutional A4 PDF memorandum.</p>
        </div>
      </div>

      <FieldGroup>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel>Reference No. <span className="text-destructive">*</span></FieldLabel>
            <Input placeholder="SCMS/2026/001" value={form.ref_no} onChange={(e) => set('ref_no', e.target.value)} />
          </Field>
          <Field>
            <FieldLabel>Date <span className="text-destructive">*</span></FieldLabel>
            <Input type="date" value={form.date} onChange={(e) => set('date', e.target.value)} />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel>To <span className="text-destructive">*</span></FieldLabel>
            <Input placeholder="Head of Department" value={form.to} onChange={(e) => set('to', e.target.value)} />
          </Field>
          <Field>
            <FieldLabel>From <span className="text-destructive">*</span></FieldLabel>
            <Input placeholder="Cafe Manager" value={form.from_name} onChange={(e) => set('from_name', e.target.value)} />
          </Field>
        </div>

        <Field>
          <FieldLabel>Subject <span className="text-destructive">*</span></FieldLabel>
          <Input placeholder="Monthly operations report" value={form.subject} onChange={(e) => set('subject', e.target.value)} />
        </Field>

        <Field>
          <FieldLabel>Body</FieldLabel>
          <FieldContent className="gap-3">
            {form.body_paragraphs.map((p, i) => (
              <div key={i} className="flex gap-2">
                <Textarea
                  value={p}
                  onChange={(e) => setParagraph(i, e.target.value)}
                  rows={3}
                  placeholder={`Paragraph ${i + 1}…`}
                  className="flex-1 resize-none"
                />
                {form.body_paragraphs.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => removeParagraph(i)}
                    aria-label="Remove paragraph"
                  >
                    <Trash2 />
                  </Button>
                )}
              </div>
            ))}
            <Button type="button" variant="link" className="h-auto justify-start p-0" onClick={addParagraph}>
              <Plus data-icon="inline-start" /> Add paragraph
            </Button>
          </FieldContent>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel>Signatory name <span className="text-destructive">*</span></FieldLabel>
            <Input placeholder="Jane Doe" value={form.signatory_name} onChange={(e) => set('signatory_name', e.target.value)} />
          </Field>
          <Field>
            <FieldLabel>Signatory title <span className="text-destructive">*</span></FieldLabel>
            <Input placeholder="Operations Manager" value={form.signatory_title} onChange={(e) => set('signatory_title', e.target.value)} />
          </Field>
        </div>

        <Button className="w-full" onClick={handleGenerate} disabled={generating}>
          {generating ? (
            <>
              <Loader2 data-icon="inline-start" className="animate-spin" /> Generating…
            </>
          ) : (
            'Download PDF memo'
          )}
        </Button>
      </FieldGroup>
    </div>
  )
}
