'use client'
import { useEffect, useRef, useState } from 'react'
import { BadgeShell, type BadgeFamily } from './StatusBadge'
import { Modal } from './Modal'
import type { Driver } from './DriverForm'

// Phase 94 plan 94-04 (DCAB-03; UI-SPEC E16, D-06): the Cabinet cell of the admin drivers list. One status chip and
// the actions that fit it: Invite / Resend invite / Disable access / Enable access. Admin theme tokens only.

type CabinetPatch = Pick<Driver, 'cabinet_enabled' | 'cabinet_invited_at'>

type CabinetAction = 'invite' | 'enable' | 'disable'

type DriverCabinetCellProps = {
  driver: Driver
  onChanged: (patch: Partial<Driver>) => void
}

const SUCCESS_MS = 4000

const textButtonStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  padding: '0',
  minHeight: '44px',
  cursor: 'pointer',
  fontFamily: 'var(--font-montserrat)',
  fontSize: 'var(--admin-fs-body)',
  fontWeight: 'var(--admin-fw-strong)',
  textAlign: 'left',
}

const messageStyle: React.CSSProperties = {
  fontFamily: 'var(--font-montserrat)',
  fontSize: 'var(--admin-fs-label)',
  fontWeight: 'var(--admin-fw-strong)',
  maxWidth: '240px',
}

function chipFor(driver: Driver): { family: BadgeFamily; label: string } {
  if (driver.cabinet_enabled) return { family: 'ok', label: 'Invited' }
  if (driver.cabinet_invited_at) return { family: 'danger', label: 'Disabled' }
  return { family: 'neutral', label: 'Not invited' }
}

function TextButton({
  label,
  color,
  disabled,
  onClick,
}: {
  label: string
  color: string
  disabled?: boolean
  onClick: () => void
}) {
  const [hover, setHover] = useState(false)
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        ...textButtonStyle,
        color,
        textDecoration: hover && !disabled ? 'underline' : 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.7 : 1,
      }}
    >
      {label}
    </button>
  )
}

export function DriverCabinetCell({ driver, onChanged }: DriverCabinetCellProps) {
  const [running, setRunning] = useState<CabinetAction | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [disableError, setDisableError] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const keepRef = useRef<HTMLButtonElement>(null)
  const busyRef = useRef(false)

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  // Initial focus on the safe choice of the disable confirmation.
  useEffect(() => {
    if (confirmOpen) keepRef.current?.focus()
  }, [confirmOpen])

  function showSuccess(text: string) {
    if (timerRef.current) clearTimeout(timerRef.current)
    setSuccess(text)
    timerRef.current = setTimeout(() => setSuccess(null), SUCCESS_MS)
  }

  async function post(action: CabinetAction): Promise<{ ok: boolean; patch: CabinetPatch | null }> {
    try {
      const res = await fetch(`/api/admin/drivers/${driver.id}/cabinet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      let json: { driver?: { cabinet_enabled?: boolean; cabinet_invited_at?: string | null } } | null = null
      try {
        json = await res.json()
      } catch {
        json = null
      }
      const d = json?.driver
      const patch: CabinetPatch | null =
        d && typeof d.cabinet_enabled === 'boolean'
          ? { cabinet_enabled: d.cabinet_enabled, cabinet_invited_at: d.cabinet_invited_at ?? null }
          : null
      return { ok: res.ok, patch }
    } catch {
      return { ok: false, patch: null }
    }
  }

  async function run(action: 'invite' | 'enable') {
    if (busyRef.current) return
    busyRef.current = true
    setRunning(action)
    setError(null)
    setSuccess(null)
    const { ok, patch } = await post(action)
    // A 502 on invite still sets the flag: the chip follows the server.
    if (patch) onChanged(patch)
    if (ok) {
      showSuccess(action === 'invite' ? `Invitation sent to ${driver.email}` : 'Access enabled.')
    } else {
      setError(action === 'invite' ? 'Could not send the invitation. Try again.' : 'Could not enable access. Try again.')
    }
    busyRef.current = false
    setRunning(null)
  }

  async function confirmDisable() {
    if (busyRef.current) return
    busyRef.current = true
    setRunning('disable')
    setDisableError(null)
    const { ok, patch } = await post('disable')
    if (ok) {
      if (patch) onChanged(patch)
      else onChanged({ cabinet_enabled: false })
      setConfirmOpen(false)
    } else {
      setDisableError('Could not disable access. Try again.')
    }
    busyRef.current = false
    setRunning(null)
  }

  function closeConfirm() {
    if (running === 'disable') return // not dismissable while saving
    setConfirmOpen(false)
    setDisableError(null)
  }

  const chip = chipFor(driver)
  const invitePending = running === 'invite'
  const enablePending = running === 'enable'
  const saving = running === 'disable'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '4px', minWidth: '160px' }}>
      <BadgeShell family={chip.family} label={chip.label} />

      {!driver.cabinet_enabled && !driver.cabinet_invited_at && (
        <TextButton
          label={invitePending ? 'Sending…' : 'Invite'}
          color="var(--admin-accent-text)"
          disabled={running !== null}
          onClick={() => run('invite')}
        />
      )}

      {driver.cabinet_enabled && (
        <>
          <TextButton
            label={invitePending ? 'Sending…' : 'Resend invite'}
            color="var(--admin-accent-text)"
            disabled={running !== null}
            onClick={() => run('invite')}
          />
          <TextButton
            label="Disable access"
            color="var(--status-danger-fg)"
            disabled={running !== null}
            onClick={() => {
              setDisableError(null)
              setConfirmOpen(true)
            }}
          />
        </>
      )}

      {!driver.cabinet_enabled && driver.cabinet_invited_at && (
        <TextButton
          label={enablePending ? 'Enabling…' : 'Enable access'}
          color="var(--admin-accent-text)"
          disabled={running !== null}
          onClick={() => run('enable')}
        />
      )}

      {success && (
        <div role="status" style={{ ...messageStyle, color: 'var(--status-ok-fg)' }}>
          {success}
        </div>
      )}
      {error && (
        <div role="alert" style={{ ...messageStyle, color: 'var(--status-danger-fg)' }}>
          {error}
        </div>
      )}

      <Modal isOpen={confirmOpen} onClose={closeConfirm} title="Disable cabinet access">
        <p
          style={{
            fontFamily: 'var(--font-montserrat)',
            fontSize: 'var(--admin-fs-body)',
            fontWeight: 400,
            color: 'var(--admin-text)',
            margin: '0 0 16px',
          }}
        >
          {`${driver.name} is signed out on their next tap and stops receiving notifications. Rides already assigned, and the links in old emails, keep working. You can enable access again at any time.`}
        </p>
        {disableError && (
          <div role="alert" style={{ ...messageStyle, color: 'var(--status-danger-fg)', maxWidth: 'none', marginBottom: '12px' }}>
            {disableError}
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', flexWrap: 'wrap' }}>
          <button
            ref={keepRef}
            type="button"
            onClick={closeConfirm}
            disabled={saving}
            style={{
              background: 'transparent',
              border: '1px solid var(--admin-border-strong)',
              borderRadius: 'var(--admin-radius-sm)',
              color: 'var(--admin-text)',
              fontFamily: 'var(--font-montserrat)',
              fontSize: 'var(--admin-fs-body)',
              fontWeight: 'var(--admin-fw-strong)',
              padding: '8px 24px',
              minHeight: '44px',
              cursor: saving ? 'not-allowed' : 'pointer',
              opacity: saving ? 0.7 : 1,
            }}
          >
            Keep access
          </button>
          <button
            type="button"
            onClick={confirmDisable}
            disabled={saving}
            style={{
              backgroundColor: 'var(--admin-danger-solid)',
              color: 'var(--admin-on-danger)',
              border: 'none',
              borderRadius: 'var(--admin-radius-sm)',
              fontFamily: 'var(--font-montserrat)',
              fontSize: 'var(--admin-fs-body)',
              fontWeight: 'var(--admin-fw-strong)',
              padding: '8px 24px',
              minHeight: '44px',
              cursor: saving ? 'not-allowed' : 'pointer',
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? 'Disabling…' : 'Disable access'}
          </button>
        </div>
      </Modal>
    </div>
  )
}
