'use client'

import { useActionState, useState } from 'react'
import {
  updateProfile,
  addPassenger,
  updatePassenger,
  deletePassenger,
} from '@/app/account/actions'
import type { Database } from '@/types/database.types'

type SavedPassenger = Pick<
  Database['public']['Tables']['saved_passengers']['Row'],
  'id' | 'full_name' | 'phone' | 'email' | 'notes' | 'is_default'
>

type ActionState = { error?: string; success?: boolean } | null

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ProfileFormProps {
  email: string
  profile: {
    full_name: string | null
    phone: string | null
    account_type: string | null
    company_name: string | null
    ico: string | null
    vat_id: string | null
  } | null
  passengers: SavedPassenger[]
}

// ---------------------------------------------------------------------------
// Shared styles (verbatim from app/login/page.tsx)
// ---------------------------------------------------------------------------

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px 14px',
  backgroundColor: 'var(--anthracite)',
  border: '1px solid var(--anthracite-light)',
  borderRadius: '4px',
  color: 'var(--offwhite)',
  fontSize: '14px',
  fontFamily: 'var(--font-montserrat)',
  boxSizing: 'border-box',
  outline: 'none',
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '11px',
  color: 'var(--warmgrey)',
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
  marginBottom: '8px',
}

const fieldWrapStyle: React.CSSProperties = { marginBottom: '16px' }

const errorStyle: React.CSSProperties = {
  color: '#e74c3c',
  fontSize: '12px',
  marginTop: '4px',
}

// ---------------------------------------------------------------------------
// PassengerEditor — hoisted to module scope (CR-03: avoids React remount)
// ---------------------------------------------------------------------------

interface PassengerEditorProps {
  editingId: string | null
  editingPassenger: SavedPassenger | undefined
  addAction: (prevState: ActionState, formData: FormData) => Promise<ActionState>
  updateAction: (prevState: ActionState, formData: FormData) => Promise<ActionState>
  addPending: boolean
  updatePending: boolean
  addState: ActionState
  updateState: ActionState
  onCancel: () => void
}

function PassengerEditor({
  editingId,
  editingPassenger,
  addAction,
  updateAction,
  addPending,
  updatePending,
  addState,
  updateState,
  onCancel,
}: PassengerEditorProps) {
  return (
    <div
      className="animate-step-enter"
      style={{
        backgroundColor: 'var(--anthracite)',
        border: '1px solid rgba(184,115,51,0.3)',
        borderRadius: '4px',
        padding: '24px',
        marginTop: '16px',
      }}
    >
      <form action={editingId ? updateAction : addAction}>
        {/* Hidden passenger id for edit mode */}
        {editingId && (
          <input type="hidden" name="id" value={editingId} />
        )}

        <div style={fieldWrapStyle}>
          <label htmlFor="pax-full-name" style={labelStyle}>
            Full name
          </label>
          <input
            id="pax-full-name"
            name="full_name"
            type="text"
            required
            defaultValue={editingPassenger?.full_name ?? ''}
            style={inputStyle}
          />
        </div>

        <div style={fieldWrapStyle}>
          <label htmlFor="pax-phone" style={labelStyle}>
            Phone
          </label>
          <input
            id="pax-phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            required
            defaultValue={editingPassenger?.phone ?? ''}
            style={inputStyle}
          />
        </div>

        <div style={fieldWrapStyle}>
          <label htmlFor="pax-email" style={labelStyle}>
            Email (optional)
          </label>
          <input
            id="pax-email"
            name="email"
            type="email"
            autoComplete="email"
            defaultValue={editingPassenger?.email ?? ''}
            style={inputStyle}
          />
        </div>

        <div style={fieldWrapStyle}>
          <label htmlFor="pax-notes" style={labelStyle}>
            Notes (optional)
          </label>
          <textarea
            id="pax-notes"
            name="notes"
            rows={3}
            defaultValue={editingPassenger?.notes ?? ''}
            style={{ ...inputStyle, resize: 'vertical' }}
          />
        </div>

        <div style={{ ...fieldWrapStyle, display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* WR-03: sentinel ensures is_default is always in FormData */}
          <input type="hidden" name="is_default" value="false" />
          <input
            id="pax-default"
            name="is_default"
            type="checkbox"
            value="true"
            defaultChecked={editingPassenger?.is_default ?? false}
            style={{ accentColor: 'var(--copper)', width: '16px', height: '16px' }}
          />
          <label
            htmlFor="pax-default"
            style={{ ...labelStyle, marginBottom: 0, cursor: 'pointer' }}
          >
            Set as default passenger
          </label>
        </div>

        {/* Error / success feedback */}
        {(editingId ? updateState?.error : addState?.error) && (
          <p role="alert" style={errorStyle}>
            {editingId ? updateState?.error : addState?.error}
          </p>
        )}

        <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
          <button
            type="submit"
            className="btn-primary"
            disabled={editingId ? updatePending : addPending}
            style={{
              padding: '10px 24px',
              opacity: (editingId ? updatePending : addPending) ? 0.7 : 1,
              cursor: (editingId ? updatePending : addPending) ? 'wait' : 'pointer',
              pointerEvents: (editingId ? updatePending : addPending) ? 'none' : 'auto',
            }}
          >
            {(editingId ? updatePending : addPending) ? 'Saving…' : 'Save passenger'}
          </button>
          <button
            type="button"
            className="btn-ghost"
            onClick={onCancel}
            style={{ padding: '10px 24px' }}
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}

// ---------------------------------------------------------------------------
// ProfileForm
// ---------------------------------------------------------------------------

export default function ProfileForm({ email, profile, passengers }: ProfileFormProps) {
  const [accountType, setAccountType] = useState<'personal' | 'corporate'>(
    (profile?.account_type as 'personal' | 'corporate') ?? 'personal'
  )

  // Profile save action state
  const [profileState, profileAction, profilePending] = useActionState(updateProfile, null)

  // Passenger editor state
  const [editingId, setEditingId] = useState<string | null>(null) // null = adding new
  const [editorOpen, setEditorOpen] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Passenger action states
  const [addState, addAction, addPending] = useActionState(addPassenger, null)
  const [updateState, updateAction, updatePending] = useActionState(updatePassenger, null)
  const [deleteState, deleteAction, deletePending] = useActionState(deletePassenger, null)

  const cardStyle: React.CSSProperties = {
    backgroundColor: 'var(--anthracite-mid)',
    border: '1px solid var(--anthracite-light)',
    borderRadius: '4px',
    padding: '24px',
    marginBottom: '32px',
  }

  // ---------------------------------------------------------------------------
  // Derived values
  // ---------------------------------------------------------------------------

  const editingPassenger = editingId
    ? passengers.find(p => p.id === editingId)
    : undefined

  const handleCancelEditor = () => {
    setEditorOpen(false)
    setEditingId(null)
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: 'var(--anthracite)',
        fontFamily: 'var(--font-montserrat)',
      }}
    >
      <div
        style={{ maxWidth: '1280px', margin: '0 auto', padding: '96px 24px 64px' }}
        className="md:px-12"
      >
        {/* Page heading */}
        <h1
          style={{
            fontFamily: 'var(--font-cormorant)',
            fontSize: '28px',
            fontWeight: 400,
            color: 'var(--offwhite)',
            letterSpacing: '0.12em',
            lineHeight: 1.1,
            marginBottom: '8px',
          }}
        >
          Profile
        </h1>
        <div className="copper-line" style={{ marginBottom: '32px' }} />

        {/* ================================================================
            Section 1 — Contact Details
            ================================================================ */}
        <div style={cardStyle}>
          <span className="label">Contact Details</span>

          <form action={profileAction} style={{ marginTop: '24px' }}>
            {/* Full name */}
            <div style={fieldWrapStyle}>
              <label htmlFor="full-name" style={labelStyle}>
                Full name
              </label>
              <input
                id="full-name"
                name="full_name"
                type="text"
                autoComplete="name"
                defaultValue={profile?.full_name ?? ''}
                style={inputStyle}
              />
            </div>

            {/* Email — read-only */}
            <div style={fieldWrapStyle}>
              <span style={labelStyle}>Email</span>
              <p
                style={{
                  ...inputStyle,
                  color: 'var(--warmgrey)',
                  display: 'block',
                  lineHeight: 'normal',
                }}
              >
                {email}
              </p>
              <p
                style={{
                  fontSize: '12px',
                  color: 'var(--warmgrey)',
                  marginTop: '4px',
                }}
              >
                Email cannot be changed here.
              </p>
            </div>

            {/* Phone */}
            <div style={fieldWrapStyle}>
              <label htmlFor="phone" style={labelStyle}>
                Phone
              </label>
              <input
                id="phone"
                name="phone"
                type="tel"
                autoComplete="tel"
                defaultValue={profile?.phone ?? ''}
                style={inputStyle}
              />
            </div>

            {/* Account type toggle */}
            <div style={fieldWrapStyle}>
              <span style={labelStyle}>Account type</span>
              <div style={{ display: 'flex', gap: '8px' }}>
                {(['personal', 'corporate'] as const).map(type => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setAccountType(type)}
                    style={{
                      flex: 1,
                      padding: '10px 20px',
                      border: `1px solid ${accountType === type ? 'var(--copper)' : 'var(--anthracite-light)'}`,
                      borderRadius: '4px',
                      background: 'transparent',
                      color: accountType === type ? 'var(--offwhite)' : 'var(--warmgrey)',
                      fontSize: '11px',
                      letterSpacing: '0.18em',
                      textTransform: 'uppercase' as const,
                      fontFamily: 'var(--font-montserrat)',
                      cursor: 'pointer',
                      minHeight: '44px',
                      transition: 'border-color 0.15s ease, color 0.15s ease',
                    }}
                  >
                    {type === 'personal' ? 'Personal' : 'Corporate'}
                  </button>
                ))}
              </div>
              <input type="hidden" name="account_type" value={accountType} />
            </div>

            {/* Corporate fields — conditionally in DOM (Accessibility Anchor: no CSS-hidden) */}
            {accountType === 'corporate' && (
              <div
                className="animate-step-enter"
                style={{ marginTop: '8px', marginBottom: '8px' }}
              >
                <span className="label" style={{ marginBottom: '16px', display: 'block' }}>
                  Company Details
                </span>

                <div style={fieldWrapStyle}>
                  <label htmlFor="company-name" style={labelStyle}>
                    Company name
                  </label>
                  <input
                    id="company-name"
                    name="company_name"
                    type="text"
                    autoComplete="organization"
                    defaultValue={profile?.company_name ?? ''}
                    style={inputStyle}
                  />
                </div>

                <div style={fieldWrapStyle}>
                  <label htmlFor="ico" style={labelStyle}>
                    IČO (Company ID)
                  </label>
                  <input
                    id="ico"
                    name="ico"
                    type="text"
                    inputMode="numeric"
                    defaultValue={profile?.ico ?? ''}
                    style={inputStyle}
                  />
                </div>

                <div style={fieldWrapStyle}>
                  <label htmlFor="vat-id" style={labelStyle}>
                    DIČ / VAT ID
                  </label>
                  <input
                    id="vat-id"
                    name="vat_id"
                    type="text"
                    defaultValue={profile?.vat_id ?? ''}
                    style={inputStyle}
                  />
                </div>
              </div>
            )}

            {/* Save button */}
            <button
              type="submit"
              className="btn-primary"
              disabled={profilePending}
              style={{
                width: '100%',
                marginTop: '32px',
                opacity: profilePending ? 0.7 : 1,
                cursor: profilePending ? 'wait' : 'pointer',
                pointerEvents: profilePending ? 'none' : 'auto',
              }}
            >
              {profilePending ? 'Saving…' : 'Save changes'}
            </button>

            {/* Success / error feedback */}
            {profileState?.success && (
              <p
                style={{
                  fontSize: '12px',
                  color: 'var(--copper-light)',
                  letterSpacing: '0.08em',
                  marginTop: '8px',
                }}
              >
                Changes saved.
              </p>
            )}
            {profileState?.error && (
              <p role="alert" style={{ color: '#e74c3c', fontSize: '12px', marginTop: '8px' }}>
                {profileState.error}
              </p>
            )}
          </form>
        </div>

        {/* ================================================================
            Section 2 — Saved Passengers
            ================================================================ */}
        <div style={cardStyle}>
          <span className="label">Saved Passengers</span>

          <div style={{ marginTop: '24px' }}>
            {passengers.length === 0 && !editorOpen ? (
              <p className="body-text">No saved passengers yet.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {passengers.map(passenger => (
                  <div key={passenger.id}>
                    {/* Passenger row */}
                    <div
                      style={{
                        backgroundColor: 'var(--anthracite)',
                        border: '1px solid var(--anthracite-light)',
                        borderRadius: '4px',
                        padding: '12px 16px',
                        display: 'flex',
                        alignItems: 'flex-start',
                        justifyContent: 'space-between',
                      }}
                    >
                      {/* Left: name + sub-line */}
                      <div>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                          }}
                        >
                          <span
                            style={{
                              fontFamily: 'var(--font-montserrat)',
                              fontSize: '14px',
                              fontWeight: 400,
                              color: 'var(--offwhite)',
                            }}
                          >
                            {passenger.full_name}
                          </span>
                          {passenger.is_default && (
                            <span
                              className="font-body font-light text-[9px] tracking-[0.14em] uppercase leading-none"
                              style={{
                                border: '1px solid rgba(184,115,51,0.6)',
                                color: 'var(--copper-light)',
                                padding: '2px 6px',
                              }}
                            >
                              Default
                            </span>
                          )}
                        </div>
                        <p
                          style={{
                            fontFamily: 'var(--font-montserrat)',
                            fontSize: '12px',
                            fontWeight: 300,
                            color: 'var(--warmgrey)',
                            marginTop: '2px',
                          }}
                        >
                          {passenger.phone}
                          {passenger.email ? ` · ${passenger.email}` : ''}
                        </p>
                      </div>

                      {/* Right: Edit + Delete buttons */}
                      <div
                        style={{
                          display: 'flex',
                          gap: '4px',
                          marginLeft: 'auto',
                          flexShrink: 0,
                        }}
                      >
                        {/* Edit button */}
                        <button
                          type="button"
                          aria-label={`Edit ${passenger.full_name}`}
                          onClick={() => {
                            setEditingId(passenger.id)
                            setEditorOpen(true)
                            setDeletingId(null)
                          }}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            minWidth: '44px',
                            minHeight: '44px',
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            color: 'var(--warmgrey)',
                            padding: '0',
                          }}
                          onMouseEnter={e => {
                            ;(e.currentTarget as HTMLButtonElement).style.color =
                              'var(--offwhite)'
                          }}
                          onMouseLeave={e => {
                            ;(e.currentTarget as HTMLButtonElement).style.color =
                              'var(--warmgrey)'
                          }}
                        >
                          {/* Pencil icon 16x16 */}
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                        </button>

                        {/* Delete button */}
                        <button
                          type="button"
                          aria-label={`Delete ${passenger.full_name}`}
                          onClick={() => {
                            setDeletingId(passenger.id)
                            setEditorOpen(false)
                            setEditingId(null)
                          }}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            minWidth: '44px',
                            minHeight: '44px',
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            color: 'var(--warmgrey)',
                            padding: '0',
                          }}
                          onMouseEnter={e => {
                            ;(e.currentTarget as HTMLButtonElement).style.color =
                              'var(--offwhite)'
                          }}
                          onMouseLeave={e => {
                            ;(e.currentTarget as HTMLButtonElement).style.color =
                              'var(--warmgrey)'
                          }}
                        >
                          {/* Trash icon 16x16 */}
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                            <path d="M10 11v6M14 11v6" />
                            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                          </svg>
                        </button>
                      </div>
                    </div>

                    {/* Inline editor for this row */}
                    {editorOpen && editingId === passenger.id && (
                      <PassengerEditor
                        editingId={editingId}
                        editingPassenger={editingPassenger}
                        addAction={addAction}
                        updateAction={updateAction}
                        addPending={addPending}
                        updatePending={updatePending}
                        addState={addState}
                        updateState={updateState}
                        onCancel={handleCancelEditor}
                      />
                    )}

                    {/* Delete confirmation bar */}
                    {deletingId === passenger.id && (
                      <div
                        className="animate-step-enter"
                        style={{
                          background: 'rgba(231, 76, 60, 0.08)',
                          border: '1px solid rgba(231, 76, 60, 0.3)',
                          borderRadius: '4px',
                          padding: '12px 16px',
                          marginTop: '8px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          flexWrap: 'wrap',
                          gap: '12px',
                        }}
                      >
                        <p
                          style={{
                            fontFamily: 'var(--font-montserrat)',
                            fontSize: '13px',
                            color: 'var(--warmgrey)',
                            margin: 0,
                          }}
                        >
                          Remove{' '}
                          <span style={{ color: 'var(--offwhite)' }}>
                            {passenger.full_name}
                          </span>
                          ? This cannot be undone.
                        </p>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <form action={deleteAction}>
                            <input type="hidden" name="id" value={passenger.id} />
                            <button
                              type="submit"
                              disabled={deletePending}
                              style={{
                                color: '#e74c3c',
                                border: '1px solid rgba(231,76,60,0.4)',
                                background: 'transparent',
                                padding: '8px 20px',
                                fontSize: '11px',
                                letterSpacing: '0.18em',
                                textTransform: 'uppercase',
                                fontFamily: 'var(--font-montserrat)',
                                minHeight: '44px',
                                cursor: deletePending ? 'wait' : 'pointer',
                                opacity: deletePending ? 0.7 : 1,
                                borderRadius: '4px',
                              }}
                            >
                              Delete
                            </button>
                          </form>
                          <button
                            type="button"
                            className="btn-ghost"
                            onClick={() => setDeletingId(null)}
                            style={{ padding: '8px 20px' }}
                          >
                            Cancel
                          </button>
                        </div>
                        {deleteState?.error && (
                          <p role="alert" style={{ ...errorStyle, width: '100%', marginTop: 0 }}>
                            {deleteState.error}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Inline editor for adding new passenger */}
            {editorOpen && editingId === null && (
              <PassengerEditor
                editingId={null}
                editingPassenger={undefined}
                addAction={addAction}
                updateAction={updateAction}
                addPending={addPending}
                updatePending={updatePending}
                addState={addState}
                updateState={updateState}
                onCancel={handleCancelEditor}
              />
            )}

            {/* Add passenger button */}
            {!editorOpen && (
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setEditorOpen(true)
                  setEditingId(null)
                  setDeletingId(null)
                }}
                style={{ marginTop: '16px' }}
              >
                Add passenger
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
