import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react'

// Phase 93 (plan 93-10; TRIP-05; D-15; UI-SPEC 7.3 D): the photo card. fetch is mocked for sign / register / PATCH / DELETE
// (93-08), XMLHttpRequest is a controllable fake for the direct upload to the signed URL.

import TourPhotoManager from '@/components/admin/tours/TourPhotoManager'
import type { TourPhotoRow } from '@/lib/tours/types'

const ID = '11111111-1111-4111-8111-111111111111'
const P1 = '22222222-2222-4222-8222-222222222221'
const P2 = '22222222-2222-4222-8222-222222222222'

function photo(over: Partial<TourPhotoRow> & { id: string }): TourPhotoRow {
  return {
    tour_id: ID,
    storage_path: `tours/${ID}/${over.id}.jpg`,
    position: 1,
    is_cover: false,
    source: 'own',
    credit_text: null,
    license: null,
    credit_url: null,
    width: null,
    height: null,
    created_at: '2026-11-01T10:00:00.000Z',
    ...over,
  }
}

const TWO = [photo({ id: P1, position: 1, is_cover: true }), photo({ id: P2, position: 2 })]

function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }))
}

class FakeXHR {
  static instances: FakeXHR[] = []
  url = ''
  method = ''
  headers: Record<string, string> = {}
  body: unknown = null
  status = 0
  upload: { onprogress: ((e: { lengthComputable: boolean; loaded: number; total: number }) => void) | null } = { onprogress: null }
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  onabort: (() => void) | null = null
  open(method: string, url: string) {
    this.method = method
    this.url = url
  }
  setRequestHeader(name: string, value: string) {
    this.headers[name] = value
  }
  send(body: unknown) {
    this.body = body
    FakeXHR.instances.push(this)
  }
  progress(loaded: number, total: number) {
    this.upload.onprogress?.({ lengthComputable: true, loaded, total })
  }
  finish(status: number) {
    this.status = status
    this.onload?.()
  }
  fail() {
    this.onerror?.()
  }
}

let fetchMock: ReturnType<typeof vi.fn>
let signAnswer: () => Promise<Response>
let registerAnswer: () => Promise<Response>
let patchAnswer: (photoId: string, body: Record<string, unknown>) => Promise<Response>
let deleteAnswer: (photoId: string) => Promise<Response>
let signCount = 0
const onChanged = vi.fn()
const onDirty = vi.fn()

function calls(method: string, matcher?: RegExp) {
  return fetchMock.mock.calls.filter(([url, init]) => {
    const m = (init as RequestInit | undefined)?.method ?? 'GET'
    return m === method && (!matcher || matcher.test(String(url)))
  })
}

beforeEach(() => {
  FakeXHR.instances = []
  signCount = 0
  onChanged.mockReset()
  onChanged.mockResolvedValue(undefined)
  onDirty.mockClear()
  signAnswer = () => {
    signCount += 1
    const path = `tours/${ID}/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa${signCount}.jpg`
    return json({ path, token: 't', signedUrl: `https://storage.example.test/upload/sign/tour-photos/${path}?token=t` })
  }
  registerAnswer = () => json({ photo: photo({ id: P1 }) }, 201)
  patchAnswer = () => json({ photos: TWO })
  deleteAnswer = () => json({ photos: [TWO[0]] })
  fetchMock = vi.fn((url: string, init?: RequestInit) => {
    if (/\/photos\/sign$/.test(url) && init?.method === 'POST') return signAnswer()
    if (/\/photos$/.test(url) && init?.method === 'POST') return registerAnswer()
    const m = /\/photos\/([0-9a-f-]{36})$/.exec(url)
    if (m && init?.method === 'PATCH') return patchAnswer(m[1], JSON.parse(String(init.body)))
    if (m && init?.method === 'DELETE') return deleteAnswer(m[1])
    return json({}, 404)
  })
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal('XMLHttpRequest', FakeXHR)
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://proj.supabase.test')
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

function renderManager(photos: TourPhotoRow[] = TWO) {
  return render(<TourPhotoManager tourId={ID} photos={photos} onPhotosChanged={onChanged} onDirtyChange={onDirty} />)
}

function file(name: string, type: string, size = 1000) {
  const f = new File(['x'], name, { type })
  Object.defineProperty(f, 'size', { value: size })
  return f
}

function choose(files: File[]) {
  fireEvent.change(screen.getByTestId('tour-photo-input'), { target: { files } })
}

describe('TourPhotoManager: empty state and header', () => {
  it('shows the empty state', () => {
    renderManager([])
    expect(screen.getByText('No photos yet.')).toBeDefined()
    expect(screen.getByText('Add at least one photo before publishing.')).toBeDefined()
    expect(screen.queryByRole('list', { name: 'Tour photos' })).toBeNull()
  })

  it('offers a multiple file input restricted to jpeg, png, webp and avif, and the helper', () => {
    renderManager([])
    const input = screen.getByTestId('tour-photo-input') as HTMLInputElement
    expect(input.type).toBe('file')
    expect(input.multiple).toBe(true)
    expect(input.accept).toBe('image/jpeg,image/png,image/webp,image/avif')
    expect(screen.getByRole('button', { name: 'Add photos' })).toBeDefined()
    expect(
      screen.getByText('Landscape photos at least 1600 px wide look best. JPG, PNG, WebP or AVIF, up to 8 MB each.'),
    ).toBeDefined()
  })
})

describe('TourPhotoManager: upload', () => {
  it('signs, PUTs and registers each file one after another, with progress per file', async () => {
    renderManager([])
    choose([file('a.jpg', 'image/jpeg', 2000), file('b.png', 'image/png', 3000)])

    // first file: sign, then the PUT to the signed URL with its Content-Type
    await waitFor(() => expect(FakeXHR.instances).toHaveLength(1))
    const first = FakeXHR.instances[0]
    expect(first.method).toBe('PUT')
    expect(first.url).toContain('https://storage.example.test/upload/sign/tour-photos/tours/')
    expect(first.headers['Content-Type']).toBe('image/jpeg')
    expect(JSON.parse(String((calls('POST', /photos\/sign$/)[0][1] as RequestInit).body))).toEqual({ contentType: 'image/jpeg', size: 2000 })

    // both files are listed, each with its own progress bar
    expect(screen.getByRole('progressbar', { name: 'Uploading a.jpg' })).toBeDefined()
    expect(screen.getByRole('progressbar', { name: 'Uploading b.png' })).toBeDefined()
    first.progress(1000, 2000)
    await waitFor(() => expect(screen.getByRole('progressbar', { name: 'Uploading a.jpg' }).getAttribute('aria-valuenow')).toBe('50'))
    expect(screen.getByRole('progressbar', { name: 'Uploading b.png' }).getAttribute('aria-valuenow')).toBe('0')
    expect(calls('POST', /photos$/)).toHaveLength(0)

    first.finish(200)
    await waitFor(() => expect(calls('POST', /photos$/)).toHaveLength(1))
    const registered = JSON.parse(String((calls('POST', /photos$/)[0][1] as RequestInit).body))
    expect(registered.path).toMatch(new RegExp(`^tours/${ID}/`))
    expect(registered.source).toBe('own')

    // the second file starts only after the first is registered and the list was re-read
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(FakeXHR.instances).toHaveLength(2))
    expect(FakeXHR.instances[1].headers['Content-Type']).toBe('image/png')
    FakeXHR.instances[1].finish(200)
    await waitFor(() => expect(calls('POST', /photos$/)).toHaveLength(2))
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.queryByRole('progressbar')).toBeNull())
  })

  it('reports unsaved work to the editor while a file uploads', async () => {
    renderManager([])
    choose([file('a.jpg', 'image/jpeg')])
    await waitFor(() => expect(onDirty).toHaveBeenLastCalledWith(true))
    await waitFor(() => expect(FakeXHR.instances).toHaveLength(1))
    FakeXHR.instances[0].finish(200)
    await waitFor(() => expect(onDirty).toHaveBeenLastCalledWith(false))
  })

  it('refuses a 9 MB file without any request', async () => {
    renderManager([])
    choose([file('huge.jpg', 'image/jpeg', 9 * 1024 * 1024)])
    expect(await screen.findByText('huge.jpg is larger than 8 MB.')).toBeDefined()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(FakeXHR.instances).toHaveLength(0)
  })

  it('accepts exactly 8 MB', async () => {
    renderManager([])
    choose([file('edge.jpg', 'image/jpeg', 8 * 1024 * 1024)])
    await waitFor(() => expect(signCount).toBe(1))
  })

  it('refuses a GIF without any request', async () => {
    renderManager([])
    choose([file('anim.gif', 'image/gif')])
    expect(await screen.findByText('anim.gif is not a supported image. Use JPG, PNG, WebP or AVIF.')).toBeDefined()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('still uploads the good file of a mixed choice', async () => {
    renderManager([])
    choose([file('anim.gif', 'image/gif'), file('ok.webp', 'image/webp')])
    expect(await screen.findByText('anim.gif is not a supported image. Use JPG, PNG, WebP or AVIF.')).toBeDefined()
    await waitFor(() => expect(FakeXHR.instances).toHaveLength(1))
    expect(FakeXHR.instances[0].headers['Content-Type']).toBe('image/webp')
  })

  it('shows the per-file error when the PUT fails, and does not register', async () => {
    renderManager([])
    choose([file('a.jpg', 'image/jpeg')])
    await waitFor(() => expect(FakeXHR.instances).toHaveLength(1))
    FakeXHR.instances[0].fail()
    expect(await screen.findByText('Upload failed for a.jpg. Try again.')).toBeDefined()
    expect(calls('POST', /photos$/)).toHaveLength(0)
    expect(onChanged).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss a.jpg' }))
    expect(screen.queryByText('Upload failed for a.jpg. Try again.')).toBeNull()
  })

  it('shows the per-file error when storage answers with an error status', async () => {
    renderManager([])
    choose([file('a.jpg', 'image/jpeg')])
    await waitFor(() => expect(FakeXHR.instances).toHaveLength(1))
    FakeXHR.instances[0].finish(400)
    expect(await screen.findByText('Upload failed for a.jpg. Try again.')).toBeDefined()
  })

  it('shows the per-file error when the sign step fails, and does not PUT', async () => {
    signAnswer = () => json({ error: 'x' }, 500)
    renderManager([])
    choose([file('a.jpg', 'image/jpeg')])
    expect(await screen.findByText('Upload failed for a.jpg. Try again.')).toBeDefined()
    expect(FakeXHR.instances).toHaveLength(0)
  })

  it('shows the per-file error when the registration fails', async () => {
    registerAnswer = () => json({ error: 'x', code: 'OBJECT_MISSING' }, 422)
    renderManager([])
    choose([file('a.jpg', 'image/jpeg')])
    await waitFor(() => expect(FakeXHR.instances).toHaveLength(1))
    FakeXHR.instances[0].finish(200)
    expect(await screen.findByText('Upload failed for a.jpg. Try again.')).toBeDefined()
    expect(onChanged).not.toHaveBeenCalled()
  })
})

describe('TourPhotoManager: photo rows', () => {
  it('lists the photos with thumbnail, position, cover radio and ordered controls', () => {
    renderManager()
    const rows = within(screen.getByRole('list', { name: 'Tour photos' })).getAllByRole('listitem')
    expect(rows).toHaveLength(2)

    const img = within(rows[0]).getByRole('img', { name: 'Photo 1' }) as HTMLImageElement
    expect(img.getAttribute('src')).toBe(`https://proj.supabase.test/storage/v1/object/public/tour-photos/tours/${ID}/${P1}.jpg`)
    expect(img.getAttribute('width')).toBe('128')
    expect(img.getAttribute('height')).toBe('96')

    expect((within(rows[0]).getByRole('radio', { name: 'Use photo 1 as cover' }) as HTMLInputElement).checked).toBe(true)
    expect((within(rows[1]).getByRole('radio', { name: 'Use photo 2 as cover' }) as HTMLInputElement).checked).toBe(false)
    expect((within(rows[0]).getByRole('button', { name: 'Move photo 1 up' }) as HTMLButtonElement).disabled).toBe(true)
    expect((within(rows[0]).getByRole('button', { name: 'Move photo 1 down' }) as HTMLButtonElement).disabled).toBe(false)
    expect((within(rows[1]).getByRole('button', { name: 'Move photo 2 down' }) as HTMLButtonElement).disabled).toBe(true)
    expect((within(rows[0]).getByLabelText('Source of photo 1') as HTMLSelectElement).value).toBe('own')
  })

  it('offers the four sources', () => {
    renderManager()
    const select = screen.getByLabelText('Source of photo 1') as HTMLSelectElement
    expect(Array.from(select.options).map((o) => o.textContent)).toEqual(['Own photo', 'Wikimedia Commons', 'Unsplash', 'Other'])
  })

  it('setting a cover PATCHes is_cover and hands the new list to the editor', async () => {
    renderManager()
    fireEvent.click(screen.getByRole('radio', { name: 'Use photo 2 as cover' }))
    await waitFor(() => expect(calls('PATCH')).toHaveLength(1))
    expect(calls('PATCH')[0][0]).toBe(`/api/admin/tours/${ID}/photos/${P2}`)
    expect(JSON.parse(String((calls('PATCH')[0][1] as RequestInit).body))).toEqual({ is_cover: true })
    await waitFor(() => expect(onChanged).toHaveBeenCalledWith(TWO))
  })

  it('move buttons PATCH the direction', async () => {
    renderManager()
    fireEvent.click(screen.getByRole('button', { name: 'Move photo 1 down' }))
    await waitFor(() => expect(calls('PATCH')).toHaveLength(1))
    expect(calls('PATCH')[0][0]).toBe(`/api/admin/tours/${ID}/photos/${P1}`)
    expect(JSON.parse(String((calls('PATCH')[0][1] as RequestInit).body))).toEqual({ move: 'down' })
    fireEvent.click(await screen.findByRole('button', { name: 'Move photo 2 up' }))
    await waitFor(() => expect(calls('PATCH')).toHaveLength(2))
    expect(JSON.parse(String((calls('PATCH')[1][1] as RequestInit).body))).toEqual({ move: 'up' })
  })

  it('shows an error on the row when a PATCH fails', async () => {
    patchAnswer = () => json({ error: 'x' }, 500)
    renderManager()
    fireEvent.click(screen.getByRole('button', { name: 'Move photo 1 down' }))
    expect(await screen.findByText('Could not save. Nothing was changed. Try again.')).toBeDefined()
    expect(onChanged).not.toHaveBeenCalled()
  })
})

describe('TourPhotoManager: credits', () => {
  it('an own photo shows no credit fields and no missing message', () => {
    renderManager()
    expect(screen.queryByLabelText('Author / credit of photo 1')).toBeNull()
    expect(screen.queryByText('Add the credit and licence. Needed before publishing.')).toBeNull()
  })

  it('another source shows credit, licence and link, with the missing message until both are filled', () => {
    renderManager()
    fireEvent.change(screen.getByLabelText('Source of photo 2'), { target: { value: 'unsplash' } })
    expect(screen.getByLabelText('Author / credit of photo 2')).toBeDefined()
    expect(screen.getByLabelText('Licence of photo 2')).toBeDefined()
    expect(screen.getByLabelText('Source link of photo 2')).toBeDefined()
    expect(screen.getByText('Add the credit and licence. Needed before publishing.')).toBeDefined()

    fireEvent.change(screen.getByLabelText('Author / credit of photo 2'), { target: { value: 'Jane Doe' } })
    expect(screen.getByText('Add the credit and licence. Needed before publishing.')).toBeDefined()
    fireEvent.change(screen.getByLabelText('Licence of photo 2'), { target: { value: 'CC BY-SA 4.0' } })
    expect(screen.queryByText('Add the credit and licence. Needed before publishing.')).toBeNull()
  })

  it('Save photo details appears only when dirty and PATCHes the changed fields', async () => {
    renderManager()
    expect(screen.queryByRole('button', { name: /Save photo details/ })).toBeNull()
    fireEvent.change(screen.getByLabelText('Source of photo 2'), { target: { value: 'unsplash' } })
    fireEvent.change(screen.getByLabelText('Author / credit of photo 2'), { target: { value: ' Jane Doe ' } })
    fireEvent.change(screen.getByLabelText('Licence of photo 2'), { target: { value: 'Unsplash licence' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save photo details for photo 2' }))

    await waitFor(() => expect(calls('PATCH')).toHaveLength(1))
    expect(JSON.parse(String((calls('PATCH')[0][1] as RequestInit).body))).toEqual({
      source: 'unsplash',
      credit_text: 'Jane Doe',
      license: 'Unsplash licence',
    })
    await waitFor(() => expect(onChanged).toHaveBeenCalled())
  })

  it('Wikimedia Commons and Other need an https link', async () => {
    renderManager()
    fireEvent.change(screen.getByLabelText('Source of photo 2'), { target: { value: 'commons' } })
    fireEvent.change(screen.getByLabelText('Author / credit of photo 2'), { target: { value: 'Jane' } })
    fireEvent.change(screen.getByLabelText('Licence of photo 2'), { target: { value: 'CC0' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save photo details for photo 2' }))
    expect(await screen.findByText('Add a source link that starts with https://.')).toBeDefined()
    expect(calls('PATCH')).toHaveLength(0)

    fireEvent.change(screen.getByLabelText('Source link of photo 2'), { target: { value: 'http://example.test/x' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save photo details for photo 2' }))
    expect(await screen.findByText('Add a source link that starts with https://.')).toBeDefined()
    expect(calls('PATCH')).toHaveLength(0)

    fireEvent.change(screen.getByLabelText('Source link of photo 2'), { target: { value: 'https://commons.wikimedia.org/wiki/File:X.jpg' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save photo details for photo 2' }))
    await waitFor(() => expect(calls('PATCH')).toHaveLength(1))
    expect(JSON.parse(String((calls('PATCH')[0][1] as RequestInit).body)).credit_url).toBe('https://commons.wikimedia.org/wiki/File:X.jpg')
  })

  it('shows saved credits and the missing message for a stored non-own photo', () => {
    renderManager([photo({ id: P1, is_cover: true, source: 'commons', credit_text: 'Jane', license: null, credit_url: 'https://c.example/x' })])
    expect((screen.getByLabelText('Author / credit of photo 1') as HTMLInputElement).value).toBe('Jane')
    expect(screen.getByText('Add the credit and licence. Needed before publishing.')).toBeDefined()
  })

  it('reports unsaved details to the editor', () => {
    renderManager()
    fireEvent.change(screen.getByLabelText('Source of photo 2'), { target: { value: 'other' } })
    expect(onDirty).toHaveBeenLastCalledWith(true)
    fireEvent.change(screen.getByLabelText('Source of photo 2'), { target: { value: 'own' } })
    expect(onDirty).toHaveBeenLastCalledWith(false)
  })
})

describe('TourPhotoManager: delete', () => {
  it('asks first, with Keep photo focused, and DELETEs on confirm', async () => {
    renderManager()
    fireEvent.click(screen.getByRole('button', { name: 'Delete photo 2' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Delete this photo?')).toBeDefined()
    expect(within(dialog).getByText('It is removed from the site at once.')).toBeDefined()
    await waitFor(() => expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Keep photo' })))
    expect(calls('DELETE')).toHaveLength(0)

    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete photo' }))
    await waitFor(() => expect(calls('DELETE')).toHaveLength(1))
    expect(calls('DELETE')[0][0]).toBe(`/api/admin/tours/${ID}/photos/${P2}`)
    await waitFor(() => expect(onChanged).toHaveBeenCalledWith([TWO[0]]))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('Keep photo sends nothing', async () => {
    renderManager()
    fireEvent.click(screen.getByRole('button', { name: 'Delete photo 1' }))
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Keep photo' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(calls('DELETE')).toHaveLength(0)
  })

  it('a 409 LAST_PHOTO shows the refusal', async () => {
    deleteAnswer = () => json({ error: 'x', code: 'LAST_PHOTO' }, 409)
    renderManager([photo({ id: P1, is_cover: true })])
    fireEvent.click(screen.getByRole('button', { name: 'Delete photo 1' }))
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete photo' }))
    expect(await screen.findByText('A published tour needs at least one photo. Add another photo first.')).toBeDefined()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(onChanged).not.toHaveBeenCalled()
  })

  it('another failure keeps the dialog open with the save error', async () => {
    deleteAnswer = () => json({ error: 'x' }, 500)
    renderManager()
    fireEvent.click(screen.getByRole('button', { name: 'Delete photo 1' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete photo' }))
    expect(await within(dialog).findByText('Could not save. Nothing was changed. Try again.')).toBeDefined()
  })
})
