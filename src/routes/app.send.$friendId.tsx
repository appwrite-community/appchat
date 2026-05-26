import { useEffect, useId, useRef, useState } from 'react'
import type { ChangeEvent, DragEvent } from 'react'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { sendSnap } from '#/lib/appwrite/snaps'

const ACCEPTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

export const Route = createFileRoute('/app/send/$friendId')({
  component: SendSnapPage,
})

function SendSnapPage() {
  const router = useRouter()
  const { friendId } = Route.useParams()
  const fileInputId = useId()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview)
    }
  }, [preview])

  function selectFile(nextFile: File | undefined) {
    if (!nextFile) return
    if (!ACCEPTED_IMAGE_TYPES.has(nextFile.type)) {
      setError('choose a PNG, JPEG, or WebP image')
      return
    }

    setError(null)
    setFile(nextFile)
    setPreview(URL.createObjectURL(nextFile))
  }

  function pick(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    selectFile(f)
    e.target.value = ''
  }

  function onDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    setIsDragging(true)
  }

  function onDragLeave(e: DragEvent<HTMLDivElement>) {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
    setIsDragging(false)
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setIsDragging(false)
    selectFile(e.dataTransfer.files[0])
  }

  function openFilePicker() {
    fileInputRef.current?.click()
  }

  async function send() {
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      await sendSnap(friendId, file)
      await router.navigate({ to: '/app/friends' })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed')
      setBusy(false)
    }
  }

  return (
    <div className="max-w-lg mx-auto px-6 py-8 text-white">
      <h1 className="text-2xl font-bold mb-6">Send a snap</h1>

      <div className="rounded-2xl bg-[var(--appchat-surface)] border border-[var(--appchat-border)] p-5 space-y-4">
        <input
          ref={fileInputRef}
          id={fileInputId}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={pick}
          className="hidden"
        />

        <div
          onDragOver={onDragOver}
          onDragEnter={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          className={`aspect-square rounded-xl border-2 border-dashed transition-colors overflow-hidden ${
            isDragging
              ? 'border-[var(--appchat-yellow)] bg-[var(--appchat-yellow-soft)]'
              : 'border-[var(--appchat-border)] hover:border-[var(--appchat-yellow)]'
          }`}
        >
          {preview ? (
            <button
              type="button"
              onClick={openFilePicker}
              className="relative block w-full h-full group text-left cursor-pointer"
            >
              <img
                src={preview}
                alt=""
                className="w-full h-full object-cover"
              />
              <span className="absolute inset-x-0 bottom-0 px-4 py-3 bg-black/65 text-sm text-white opacity-0 group-hover:opacity-100 transition-opacity">
                Click or drop to replace
              </span>
            </button>
          ) : (
            <button
              type="button"
              onClick={openFilePicker}
              className="w-full h-full flex flex-col items-center justify-center gap-2 text-[var(--appchat-muted)] cursor-pointer"
            >
              <span className="font-display text-lg font-bold text-white">
                Choose a photo
              </span>
              <span className="text-sm">Click or drag an image here</span>
            </button>
          )}
        </div>

        {preview && (
          <button
            type="button"
            onClick={openFilePicker}
            className="inline-block text-sm text-[var(--appchat-muted)] cursor-pointer hover:text-white"
          >
            Choose another
          </button>
        )}

        {error && <p className="text-sm text-red-400">{error}</p>}

        <button
          type="button"
          onClick={send}
          disabled={!file || busy}
          className="w-full rounded-xl bg-[var(--appchat-yellow)] text-black font-semibold py-3 disabled:opacity-50"
        >
          {busy ? 'Sending…' : 'Send'}
        </button>
      </div>
    </div>
  )
}
