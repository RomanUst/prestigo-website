'use client'
import { useState, useEffect } from 'react'
import { KPICard } from '@/components/admin/KPICard'
import { RevenueBarChart, GroupedBarChart } from '@/components/admin/StatsChart'

interface StatsData {
  counts: {
    today: number
    thisWeek: number
    thisMonth: number
  }
  revenue: {
    currentMonth: number
    previousMonth: number
  }
  byVehicleClass: { vehicle_class: string; revenue: number }[]
  byTripType: { trip_type: string; revenue: number }[]
  monthlyRevenue: { month: string; revenue: number }[]
}

function formatCZK(value: number): string {
  return new Intl.NumberFormat('cs-CZ').format(value)
}

export default function StatsPage() {
  const [statsData, setStatsData] = useState<StatsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    fetch('/api/admin/stats')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch stats')
        return res.json()
      })
      .then((data: StatsData) => {
        setStatsData(data)
        setLoading(false)
      })
      .catch(() => {
        setError(true)
        setLoading(false)
      })
  }, [])

  if (loading) {
    return (
      <div style={{ color: 'var(--warmgrey)', fontFamily: 'var(--font-montserrat)', fontSize: '13px', padding: '32px 0' }}>
        Loading...
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ color: 'var(--warmgrey)', fontFamily: 'var(--font-montserrat)', fontSize: '13px', padding: '32px 0' }}>
        Could not load data. Refresh to retry.
      </div>
    )
  }

  if (!statsData) {
    return (
      <div style={{ color: 'var(--warmgrey)', fontFamily: 'var(--font-montserrat)', fontSize: '13px', padding: '32px 0' }}>
        No booking data for this period.
      </div>
    )
  }

  const { counts, revenue, byVehicleClass, byTripType, monthlyRevenue } = statsData

  const vehicleClassChartData = [{
    name: 'Revenue',
    business: byVehicleClass.find((v) => v.vehicle_class === 'business')?.revenue ?? 0,
    first_class: byVehicleClass.find((v) => v.vehicle_class === 'first_class')?.revenue ?? 0,
    business_van: byVehicleClass.find((v) => v.vehicle_class === 'business_van')?.revenue ?? 0,
  }]

  const tripTypeChartData = [{
    name: 'Revenue',
    transfer: byTripType.find((t) => t.trip_type === 'transfer')?.revenue ?? 0,
    hourly: byTripType.find((t) => t.trip_type === 'hourly')?.revenue ?? 0,
    daily: byTripType.find((t) => t.trip_type === 'daily')?.revenue ?? 0,
  }]

  return (
    <div>
      <h1 style={{
        fontFamily: 'var(--font-cormorant)',
        fontSize: '28px',
        fontWeight: 400,
        color: 'var(--offwhite)',
        letterSpacing: '0.08em',
        marginBottom: '32px',
      }}>
        Stats
      </h1>

      {/* KPI Row */}
      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '32px' }}>
        <KPICard label="TODAY" value={String(counts.today)} subLabel="bookings" />
        <KPICard label="THIS WEEK" value={String(counts.thisWeek)} subLabel="bookings" />
        <KPICard label="THIS MONTH" value={String(counts.thisMonth)} subLabel="bookings" />
        <KPICard label="MONTHLY REVENUE" value={formatCZK(revenue.currentMonth)} subLabel="CZK" />
      </div>

      {/* 12-month revenue chart — full width */}
      <div style={{ marginBottom: '24px' }}>
        <RevenueBarChart data={monthlyRevenue} />
      </div>

      {/* 2-column grid for breakdown charts */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
        <GroupedBarChart
          title="REVENUE BY CLASS"
          data={vehicleClassChartData}
          series={[
            { dataKey: 'business', name: 'Business', color: '#B87333' },
            { dataKey: 'first_class', name: 'First Class', color: '#D4924A' },
            { dataKey: 'business_van', name: 'Business Van', color: '#E8B87A' },
          ]}
        />
        <GroupedBarChart
          title="REVENUE BY TRIP TYPE"
          data={tripTypeChartData}
          series={[
            { dataKey: 'transfer', name: 'Transfer', color: '#B87333' },
            { dataKey: 'hourly', name: 'Hourly', color: '#D4924A' },
            { dataKey: 'daily', name: 'Daily', color: '#E8B87A' },
          ]}
        />
      </div>
    </div>
  )
}
