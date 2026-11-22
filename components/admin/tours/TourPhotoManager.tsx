'use client'
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties } from 'react'
import { ArrowDown, ArrowUp, ImagePlus, Images, Trash2 } from 'lucide-react'
import { errorStyle, inputBaseStyle, labelStyle } from '@/components/admin/adminFieldStyles'
import { outlineButtonStyle } from '@/components/admin/paymentShared'
import {
  COPY_SAVE_FAILED,
  COPY_SESSION,
  ConfirmDialog,
  FONT,
  accentButtonStyle,
  bodyTextStyle,
  cardStyle,
  cardTitleStyle,
  iconButtonStyle,
  mutedTextStyle,
  ringHandlers,
} from '@/components/admin/tours/tourEditorShared'
import { tourPhotoUrl } from '@/lib/tours/photo-url'
import { TOUR_PHOTO_SOURCES, type TourPhotoRow, type TourPhotoSource } from '@/lib/tours/types'

// Phase 93 (plan 93-10; TRIP-05; D-15; UI-SPEC 7.3 D): the photo card of the tour editor. Upload is browser-direct:
// POST photos/sign (the server decides the path), PUT the file to the signed URL (XHR, for upload progress), then POST
// photos to register the object. File type and size are checked here only for convenience (T-93-27): the sign route and
// the bucket enforce both. Files go one after another so the first photo reliably becomes the cover. After every change
// the editor re-reads the tour, which refreshes the publish checklist.

const MAX_BYTES = 8 * 1024 * 1024
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif']
const ACCEPT = ALLOWED_TYPES.join(',')

const COPY_LAST_PHOTO = 'A published tour needs at least one photo. Add another photo first.'
const COPY_CREDIT_MISSING = 'Add the credit and licence. Needed before publishing.'
const COPY_LINK_INVALID = 'Add a source link that starts with https://.'

const SOURCE_LABELS: Record<TourPhotoSource, string> = {
  own: 'Own photo',
  commons: 'Wikimedia Commons',
  unsplash: 'Unsplash',
  other: 'Other',
}

/** Sources whose link is required (the credit and licence are required for every source but "own"). */
const LINK_REQUIRED: TourPhotoSource[] = ['commons', 'other']

type Upload = { key: number; name: string; progress: number; error: string | null }

/** What the operator edits on one photo row. */
type Details = { source: TourPhotoSource; credit_text: string; license: string; credit_url: string }

function detailsOf(photo: TourPhotoRow): Details {
  return {
    source: photo.source,
    credit_text: photo.credit_text ?? '',
    license: photo.license ?? '',
    credit_url: photo.credit_url ?? '',
  }
}

/** Which credit fields the form shows for a source: none for "own". */
function creditVisible(source: TourPhotoSource): boolean {
  return source !== 'own'
}

function sameDetails(a: Details, b: Details): boolean {
  if (a.source !== b.source) return false
  if (!creditVisible(a.source)) return true
  return a.credit_text === b.credit_text && a.license === b.license && a.credit_url === b.credit_url
}

function isHttps(url: string): boolean {
  if (!url.startsWith('https://')) return false
  try {
    return new URL(url).protocol === 'https:'
  } catch {
    return false
  }
}

/** PUTs the file to the signed URL and reports upload progress (fetch cannot). True when the storage answered 2xx. */
function putFile(url: string, file: File, onProgress: (percent: number) => void): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const xhr = new XMLHttpRequest()
      xhr.open('PUT', url)
      xhr.setRequestHeader('Content-Type', file.type)
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && event.total > 0) onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)))
      }
      xhr.onload = () => resolve(xhr.status >= 200 && xhr.status < 300)
      xhr.onerror = () => resolve(false)
      xhr.onabort = () => resolve(false)
      xhr.send(file)
    } catch {
      resolve(false)
    }
  })
}

export type TourPhotoManagerProps = {
  tourId: string
  photos: TourPhotoRow[]
  /** The photos changed. `next` is the server's new list when the answer carried one. Resolves when the editor has re-read the tour. */
  onPhotosChanged: (next?: TourPhotoRow[]) => void | Promise<void>
  onDirtyChange?: (dirty: boolean) => void
}

const rowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '16px',
  padding: '16px 0',
  borderTop: '1px solid var(--admin-border)',
}

export default function TourPhotoManager({ tourId, photos, onPhotosChanged, onDirtyChange }: TourPhotoManagerProps) {
  const [uploads, setUploads] = useState<Upload[]>([])
  const [edits, setEdits] = useState<Record<string, Details>>({})
  const [busyId, setBusyId] = useState<string | null>(null)
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({})
  const [listError, setListError] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<TourPhotoRow | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const nextKey = useRef(0)
  const uploading = useRef(false)
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const dirtyIds = useMemo(
    () => photos.filter((p) => edits[p.id] !== undefined && !sameDetails(edits[p.id], detailsOf(p))).map((p) => p.id),
    [photos, edits],
  )
  const inFlight = uploads.some((u) => u.error === null)
  const anyDirty = dirtyIds.length > 0 || inFlight
  useEffect(() => {
    onDirtyChange?.(anyDirty)
  }, [anyDirty, onDirtyChange])

  const failMessage = (status: number) => (status === 401 || status === 403 ? COPY_SESSION : COPY_SAVE_FAILED)

  const setUpload = useCallback((key: number, patch: Partial<Upload>) => {
    setUploads((prev) => prev.map((u) => (u.key === key ? { ...u, ...patch } : u)))
  }, [])

  /** One file: sign, PUT, register. Returns true when the photo exists on the server. */
  const uploadOne = useCallback(
    async (key: number, file: File): Promise<boolean> => {
      const failed = `Upload failed for ${file.name}. Try again.`
      try {
        const signRes = await fetch(`/api/admin/tours/${tourId}/photos/sign`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contentType: file.type, size: file.size }),
        })
        if (!signRes.ok) {
          setUpload(key, { error: signRes.status === 401 || signRes.status === 403 ? COPY_SESSION : failed })
          return false
        }
        const sign = (await signRes.json()) as { path?: string; signedUrl?: string }
        if (typeof sign.path !== 'string' || typeof sign.signedUrl !== 'string') {
          setUpload(key, { error: failed })
          return false
        }
        const stored = await putFile(sign.signedUrl, file, (progress) => setUpload(key, { progress }))
        if (!stored) {
          setUpload(key, { error: failed })
          return false
        }
        setUpload(key, { progress: 100 })
        const regRes = await fetch(`/api/admin/tours/${tourId}/photos`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: sign.path, source: 'own' }),
        })
        if (!regRes.ok) {
          setUpload(key, { error: regRes.status === 401 || regRes.status === 403 ? COPY_SESSION : failed })
          return false
        }
        return true
      } catch {
        setUpload(key, { error: failed })
        return false
      }
    },
    [tourId, setUpload],
  )

  async function onFilesChosen(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    // Allow choosing the same file again.
    e.target.value = ''
    if (files.length === 0 || uploading.current) return

    const batch: Array<{ key: number; file: File }> = []
    const rows: Upload[] = []
    for (const file of files) {
      const key = nextKey.current++
      let error: string | null = null
      if (!ALLOWED_TYPES.includes(file.type)) error = `${file.name} is not a supported image. Use JPG, PNG, WebP or AVIF.`
      else if (file.size > MAX_BYTES) error = `${file.name} is larger than 8 MB.`
      rows.push({ key, name: file.name, progress: 0, error })
      if (!error) batch.push({ key, file })
    }
    setUploads((prev) => [...prev.filter((u) => u.error === null), ...rows])
    setListError(null)
    if (batch.length === 0) return

    uploading.current = true
    let registered = false
    try {
      for (const { key, file } of batch) {
        if (!alive.current) return
        const ok = await uploadOne(key, file)
        if (ok) {
          registered = true
          // The row disappears once the list shows the photo.
          if (alive.current) await onPhotosChanged()
          if (alive.current) setUploads((prev) => prev.filter((u) => u.key !== key))
        }
      }
    } finally {
      uploading.current = false
    }
    if (registered && alive.current) setListError(null)
  }

  function setDetails(photo: TourPhotoRow, patch: Partial<Details>) {
    setEdits((prev) => ({ ...prev, [photo.id]: { ...(prev[photo.id] ?? detailsOf(photo)), ...patch } }))
    setRowErrors((prev) => {
      if (!prev[photo.id]) return prev
      const next = { ...prev }
      delete next[photo.id]
      return next
    })
  }

  async function patchPhoto(photo: TourPhotoRow, body: Record<string, unknown>): Promise<boolean> {
    setBusyId(photo.id)
    setRowErrors((prev) => {
      const next = { ...prev }
      delete next[photo.id]
      return next
    })
    setListError(null)
    try {
      const res = await fetch(`/api/admin/tours/${tourId}/photos/${photo.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!alive.current) return false
      if (!res.ok) {
        setRowErrors((prev) => ({ ...prev, [photo.id]: failMessage(res.status) }))
        return false
      }
      const json = (await res.json().catch(() => null)) as { photos?: TourPhotoRow[] } | null
      await onPhotosChanged(Array.isArray(json?.photos) ? json.photos : undefined)
      return true
    } catch {
      if (alive.current) setRowErrors((prev) => ({ ...prev, [photo.id]: COPY_SAVE_FAILED }))
      return false
    } finally {
      if (alive.current) setBusyId(null)
    }
  }

  async function saveDetails(photo: TourPhotoRow) {
    const edit = edits[photo.id]
    if (!edit || busyId) return
    const base = detailsOf(photo)
    const link = edit.credit_url.trim()
    if (creditVisible(edit.source) && ((LINK_REQUIRED.includes(edit.source) && !isHttps(link)) || (link !== '' && !isHttps(link)))) {
      setRowErrors((prev) => ({ ...prev, [photo.id]: COPY_LINK_INVALID }))
      return
    }
    const body: Record<string, unknown> = {}
    if (edit.source !== base.source) body.source = edit.source
    if (creditVisible(edit.source)) {
      if (edit.credit_text !== base.credit_text) body.credit_text = edit.credit_text.trim() || null
      if (edit.license !== base.license) body.license = edit.license.trim() || null
      if (edit.credit_url !== base.credit_url) body.credit_url = link || null
    }
    if (Object.keys(body).length === 0) return
    const ok = await patchPhoto(photo, body)
    if (ok && alive.current) {
      setEdits((prev) => {
        const next = { ...prev }
        delete next[photo.id]
        return next
      })
    }
  }

  async function confirmDelete() {
    const target = deleteTarget
    if (!target || deleteBusy) return
    setDeleteBusy(true)
    setDeleteError(null)
    try {
      const res = await fetch(`/api/admin/tours/${tourId}/photos/${target.id}`, { method: 'DELETE' })
      if (!alive.current) return
      if (res.ok) {
        const json = (await res.json().catch(() => null)) as { photos?: TourPhotoRow[] } | null
        setEdits((prev) => {
          const next = { ...prev }
          delete next[target.id]
          return next
        })
        setDeleteTarget(null)
        await onPhotosChanged(Array.isArray(json?.photos) ? json.photos : undefined)
        return
      }
      const body = (await res.json().catch(() => null)) as { code?: string } | null
      if (res.status === 409 && body?.code === 'LAST_PHOTO') {
        setDeleteTarget(null)
        setListError(COPY_LAST_PHOTO)
        return
      }
      setDeleteError(failMessage(res.status))
    } catch {
      if (alive.current) setDeleteError(COPY_SAVE_FAILED)
    } finally {
      if (alive.current) setDeleteBusy(false)
    }
  }

  function dismissUpload(key: number) {
    setUploads((prev) => prev.filter((u) => u.key !== key))
  }

  return (
    <section aria-label="Photos" style={cardStyle}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
        <h2 style={{ ...cardTitleStyle, margin: 0 }}>Photos</h2>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          style={{ ...accentButtonStyle, display: 'inline-flex', alignItems: 'center', gap: '8px' }}
        >
          <ImagePlus size={16} aria-hidden="true" /> Add photos
        </button>
        <input
          ref={inputRef}
          data-testid="tour-photo-input"
          type="file"
          multiple
          accept={ACCEPT}
          tabIndex={-1}
          onChange={(e) => void onFilesChosen(e)}
          style={{ display: 'none' }}
        />
      </div>
      <p style={{ ...mutedTextStyle, margin: '8px 0 16px' }}>
        Landscape photos at least 1600 px wide look best. JPG, PNG, WebP or AVIF, up to 8 MB each.
      </p>

      {uploads.length > 0 && (
        <ul style={{ listStyle: 'none', margin: '0 0 16px', padding: 0, display: 'grid', gap: '12px' }}>
          {uploads.map((u) => (
            <li key={u.key}>
              <div style={{ ...bodyTextStyle, display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                <span style={{ overflowWrap: 'anywhere' }}>{u.name}</span>
                {u.error === null && <span style={{ fontVariantNumeric: 'tabular-nums' }}>{`${u.progress}%`}</span>}
              </div>
              {u.error === null ? (
                <div
                  role="progressbar"
                  aria-label={`Uploading ${u.name}`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={u.progress}
                  style={{ height: '4px', marginTop: '4px', borderRadius: '2px', background: 'var(--admin-hover)', overflow: 'hidden' }}
                >
                  <div style={{ width: `${u.progress}%`, height: '100%', background: 'var(--admin-accent)' }} />
                </div>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px' }}>
                  <p role="alert" style={{ ...errorStyle, margin: '4px 0 0' }}>
                    {u.error}
                  </p>
                  <button type="button" aria-label={`Dismiss ${u.name}`} onClick={() => dismissUpload(u.key)} style={{ ...outlineButtonStyle, minHeight: '36px', padding: '0 12px' }}>
                    Dismiss
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {listError && (
        <p role="alert" style={{ ...errorStyle, margin: '0 0 16px' }}>
          {listError}
        </p>
      )}

      {photos.length === 0 && uploads.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '32px 16px', border: '1px solid var(--admin-border)', borderRadius: 'var(--admin-radius-lg)' }}>
          <Images size={24} aria-hidden="true" style={{ color: 'var(--admin-text-muted)' }} />
          <p style={{ ...bodyTextStyle, marginTop: '8px' }}>No photos yet.</p>
          <p style={{ ...mutedTextStyle, marginTop: '4px' }}>Add at least one photo before publishing.</p>
        </div>
      ) : (
        <div role="list" aria-label="Tour photos">
          {photos.map((photo, index) => {
            const n = index + 1
            const edit = edits[photo.id] ?? detailsOf(photo)
            const dirty = dirtyIds.includes(photo.id)
            const url = tourPhotoUrl(photo.storage_path)
            const rowBusy = busyId === photo.id
            const creditMissing = creditVisible(edit.source) && (edit.credit_text.trim() === '' || edit.license.trim() === '')
            const error = rowErrors[photo.id]
            const id = `tp-${photo.id}`
            return (
              <div key={photo.id} role="listitem" aria-label={`Photo ${n}`} style={rowStyle}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-start' }}>
                  <div
                    style={{
                      width: '128px',
                      height: '96px',
                      borderRadius: 'var(--admin-radius-sm)',
                      overflow: 'hidden',
                      background: 'var(--admin-hover)',
                    }}
                  >
                    {url && (
                      // eslint-disable-next-line @next/next/no-img-element -- admin thumbnail of a public bucket object; no optimisation needed
                      <img src={url} alt={`Photo ${n}`} width={128} height={96} style={{ width: '128px', height: '96px', objectFit: 'cover', display: 'block' }} />
                    )}
                  </div>
                  <span style={{ ...mutedTextStyle, fontVariantNumeric: 'tabular-nums' }}>{n}</span>
                </div>

                <div style={{ flex: '1 1 280px', minWidth: 0 }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                    <label style={{ ...bodyTextStyle, display: 'inline-flex', alignItems: 'center', gap: '8px', minHeight: '44px' }}>
                      <input
                        type="radio"
                        name="tour-photo-cover"
                        checked={photo.is_cover}
                        disabled={rowBusy}
                        aria-label={`Use photo ${n} as cover`}
                        onChange={() => {
                          if (!photo.is_cover) void patchPhoto(photo, { is_cover: true })
                        }}
                        style={{ width: '18px', height: '18px', accentColor: 'var(--admin-accent)' }}
                      />
                      Cover
                    </label>
                    <button
                      type="button"
                      aria-label={`Move photo ${n} up`}
                      disabled={index === 0 || rowBusy}
                      onClick={() => void patchPhoto(photo, { move: 'up' })}
                      style={{ ...iconButtonStyle, opacity: index === 0 ? 0.4 : 1 }}
                    >
                      <ArrowUp size={16} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Move photo ${n} down`}
                      disabled={index === photos.length - 1 || rowBusy}
                      onClick={() => void patchPhoto(photo, { move: 'down' })}
                      style={{ ...iconButtonStyle, opacity: index === photos.length - 1 ? 0.4 : 1 }}
                    >
                      <ArrowDown size={16} aria-hidden="true" />
                    </button>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: '12px' }}>
                    <div>
                      <label htmlFor={`${id}-source`} style={labelStyle}>
                        Source
                      </label>
                      <select
                        id={`${id}-source`}
                        aria-label={`Source of photo ${n}`}
                        value={edit.source}
                        onChange={(e) => setDetails(photo, { source: e.target.value as TourPhotoSource })}
                        {...ringHandlers}
                        style={{ ...inputBaseStyle, fontWeight: 400, appearance: 'auto', fontFamily: FONT }}
                      >
                        {TOUR_PHOTO_SOURCES.map((s) => (
                          <option key={s} value={s}>
                            {SOURCE_LABELS[s]}
                          </option>
                        ))}
                      </select>
                    </div>
                    {creditVisible(edit.source) && (
                      <>
                        <div>
                          <label htmlFor={`${id}-credit`} style={labelStyle}>
                            Author / credit
                          </label>
                          <input
                            id={`${id}-credit`}
                            aria-label={`Author / credit of photo ${n}`}
                            type="text"
                            autoComplete="off"
                            maxLength={200}
                            value={edit.credit_text}
                            onChange={(e) => setDetails(photo, { credit_text: e.target.value })}
                            {...ringHandlers}
                            style={{ ...inputBaseStyle, fontWeight: 400 }}
                          />
                        </div>
                        <div>
                          <label htmlFor={`${id}-license`} style={labelStyle}>
                            Licence
                          </label>
                          <input
                            id={`${id}-license`}
                            aria-label={`Licence of photo ${n}`}
                            type="text"
                            autoComplete="off"
                            maxLength={80}
                            placeholder="CC BY-SA 4.0"
                            value={edit.license}
                            onChange={(e) => setDetails(photo, { license: e.target.value })}
                            {...ringHandlers}
                            style={{ ...inputBaseStyle, fontWeight: 400 }}
                          />
                        </div>
                        <div>
                          <label htmlFor={`${id}-link`} style={labelStyle}>
                            Source link
                          </label>
                          <input
                            id={`${id}-link`}
                            aria-label={`Source link of photo ${n}`}
                            type="url"
                            autoComplete="off"
                            maxLength={500}
                            placeholder="https://"
                            value={edit.credit_url}
                            onChange={(e) => setDetails(photo, { credit_url: e.target.value })}
                            {...ringHandlers}
                            style={{ ...inputBaseStyle, fontWeight: 400 }}
                          />
                        </div>
                      </>
                    )}
                  </div>

                  {creditMissing && (
                    <p style={{ ...errorStyle, marginTop: '8px' }}>{COPY_CREDIT_MISSING}</p>
                  )}
                  {error && (
                    <p role="alert" style={{ ...errorStyle, marginTop: '8px' }}>
                      {error}
                    </p>
                  )}

                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px', marginTop: '12px' }}>
                    {dirty && (
                      <button
                        type="button"
                        disabled={rowBusy}
                        aria-label={`Save photo details for photo ${n}`}
                        onClick={() => void saveDetails(photo)}
                        style={{ ...outlineButtonStyle, opacity: rowBusy ? 0.6 : 1 }}
                      >
                        {rowBusy ? 'Saving…' : 'Save photo details'}
                      </button>
                    )}
                    <button
                      type="button"
                      aria-label={`Delete photo ${n}`}
                      disabled={rowBusy}
                      onClick={() => {
                        setDeleteError(null)
                        setDeleteTarget(photo)
                      }}
                      style={{ ...outlineButtonStyle, display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                    >
                      <Trash2 size={14} aria-hidden="true" /> Delete photo
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <ConfirmDialog
        isOpen={deleteTarget !== null}
        title="Delete this photo?"
        tone="danger"
        confirmLabel="Delete photo"
        cancelLabel="Keep photo"
        busy={deleteBusy}
        error={deleteError}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleteTarget(null)}
      >
        It is removed from the site at once.
      </ConfirmDialog>
    </section>
  )
}
