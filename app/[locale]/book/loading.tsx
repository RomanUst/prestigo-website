import { useTranslations } from 'next-intl'

export default function BookLoading() {
  const t = useTranslations('Common')
  return (
    <main
      style={{
        background: 'var(--anthracite)',
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '560px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
        aria-busy="true"
        aria-label={t('loadingBooking')}
      >
        <div className="skeleton-bar" style={{ height: '36px', width: '60%' }} />
        <div className="skeleton-bar" style={{ height: '52px' }} />
        <div className="skeleton-bar" style={{ height: '52px' }} />
        <div className="skeleton-bar" style={{ height: '52px', width: '75%' }} />
        <div className="skeleton-bar" style={{ height: '120px' }} />
        <div className="skeleton-bar" style={{ height: '44px', width: '40%' }} />
      </div>
    </main>
  )
}
