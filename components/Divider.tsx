export default function Divider() {
  return (
    <div
      aria-hidden="true"
      style={{
        height: '1px',
        background: 'linear-gradient(to right, transparent 0%, var(--copper) 50%, transparent 100%)',
      }}
    />
  )
}
