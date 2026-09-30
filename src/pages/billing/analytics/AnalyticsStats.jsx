import { rupees } from '../../../utils/format';

const CARDS = [
  { key: 'revenue', label: 'Revenue', className: 'stat-revenue' },
  { key: 'billCount', label: 'Bills', className: 'stat-count', plain: true },
  { key: 'average', label: 'Avg bill', className: 'stat-avg' },
  { key: 'peakHour', label: 'Peak hour', className: '', plain: true, small: true },
  { key: 'weekRevenue', label: 'Week revenue', className: 'stat-week', small: true },
  { key: 'monthRevenue', label: 'Month revenue', className: 'stat-month', small: true },
];

export default function AnalyticsStats(values) {
  return (
    <div className="stats-grid">
      {CARDS.map(({ key, label, className, plain, small }) => (
        <div key={key} className={`stat-card ${className}`}>
          <div className="stat-label">{label}</div>
          <div className={`stat-value ${small ? 'stat-value-small' : ''}`}>
            {plain ? values[key] : rupees(values[key])}
          </div>
        </div>
      ))}
    </div>
  );
}
