'use client'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts'

const CHART_COLORS = {
  copper: '#B87333',
  copperLight: '#D4924A',
  copperPale: '#E8B87A',
}

const AXIS_STYLE = {
  fontSize: 11,
  fontFamily: 'var(--font-montserrat)',
  fill: '#9A958F',
}

const TOOLTIP_STYLE = {
  contentStyle: { backgroundColor: '#1C1C1E', border: '1px solid #3A3A3F', borderRadius: '4px' },
  labelStyle: { color: '#F5F2EE', fontSize: 11, fontFamily: 'var(--font-montserrat)' },
  itemStyle: { color: '#F5F2EE', fontSize: 11, fontFamily: 'var(--font-montserrat)' },
}

const GRID_STYLE = { stroke: '#3A3A3F', strokeDasharray: '3 3' }

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: 'var(--anthracite-mid)',
      border: '1px solid var(--anthracite-light)',
      borderRadius: '4px',
      padding: '24px',
    }}>
      <span style={{
        display: 'block',
        fontFamily: 'var(--font-montserrat)',
        fontSize: '11px',
        textTransform: 'uppercase',
        letterSpacing: '0.4em',
        color: 'var(--copper)',
        marginBottom: '16px',
      }}>
        {title}
      </span>
      <div style={{ height: '280px' }}>
        {children}
      </div>
    </div>
  )
}

export function RevenueBarChart({ data }: { data: { month: string; revenue: number }[] }) {
  return (
    <ChartCard title="12-MONTH REVENUE">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid {...GRID_STYLE} />
          <XAxis dataKey="month" tick={AXIS_STYLE} />
          <YAxis tick={AXIS_STYLE} />
          <Tooltip
            contentStyle={TOOLTIP_STYLE.contentStyle}
            labelStyle={TOOLTIP_STYLE.labelStyle}
            itemStyle={TOOLTIP_STYLE.itemStyle}
            formatter={(value) => [typeof value === 'number' ? `${value.toLocaleString('cs-CZ')} CZK` : String(value), 'Revenue']}
          />
          <Bar dataKey="revenue" fill={CHART_COLORS.copper} radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  )
}

interface GroupedBarChartProps {
  title: string
  data: Record<string, unknown>[]
  series: { dataKey: string; name: string; color: string }[]
}

export function GroupedBarChart({ title, data, series }: GroupedBarChartProps) {
  return (
    <ChartCard title={title}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid {...GRID_STYLE} />
          <XAxis dataKey="name" tick={AXIS_STYLE} />
          <YAxis tick={AXIS_STYLE} />
          <Tooltip
            contentStyle={TOOLTIP_STYLE.contentStyle}
            labelStyle={TOOLTIP_STYLE.labelStyle}
            itemStyle={TOOLTIP_STYLE.itemStyle}
            formatter={(value) => [typeof value === 'number' ? `${value.toLocaleString('cs-CZ')} CZK` : String(value), '']}
          />
          <Legend
            wrapperStyle={{ fontFamily: 'var(--font-montserrat)', fontSize: '11px', color: '#9A958F' }}
          />
          {series.map((s) => (
            <Bar key={s.dataKey} dataKey={s.dataKey} name={s.name} fill={s.color} radius={[2, 2, 0, 0]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  )
}
