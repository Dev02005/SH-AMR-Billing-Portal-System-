import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Title,
  Tooltip,
} from 'chart.js';
import { Bar, Doughnut, Line } from 'react-chartjs-2';
import { rupees } from '../../../utils/format';

ChartJS.register(
  CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend,
  ArcElement, PointElement, LineElement, Filler,
);

// One palette for every chart so a payment method keeps its colour across the page.
const SERIES = [
  { fill: 'rgba(255, 213, 79, 0.8)', stroke: 'rgba(255, 179, 0, 1)' },
  { fill: 'rgba(76, 175, 80, 0.8)', stroke: 'rgba(56, 142, 60, 1)' },
  { fill: 'rgba(33, 150, 243, 0.8)', stroke: 'rgba(13, 110, 253, 1)' },
  { fill: 'rgba(211, 47, 47, 0.8)', stroke: 'rgba(168, 27, 27, 1)' },
  { fill: 'rgba(255, 152, 0, 0.8)', stroke: 'rgba(230, 124, 0, 1)' },
  { fill: 'rgba(156, 39, 176, 0.8)', stroke: 'rgba(120, 25, 135, 1)' },
];

const BASE_OPTIONS = { responsive: true, maintainAspectRatio: false };

function ChartCard({ title, hasData, emptyText, children }) {
  return (
    <div className="chart-container">
      <div className="chart-title">{title}</div>
      <div className="chart-canvas">
        {hasData ? children : <div className="chart-placeholder">{emptyText}</div>}
      </div>
    </div>
  );
}

export default function AnalyticsCharts({ topItems = [], paymentTotals = {}, trend = [] }) {
  const paymentLabels = Object.keys(paymentTotals);

  const itemsChart = {
    labels: topItems.map((item) => item.name),
    datasets: [{
      label: 'Quantity sold',
      data: topItems.map((item) => item.qty),
      backgroundColor: SERIES[0].fill,
      borderColor: SERIES[0].stroke,
      borderWidth: 2,
    }],
  };

  const paymentChart = {
    labels: paymentLabels,
    datasets: [{
      data: paymentLabels.map((label) => paymentTotals[label]),
      backgroundColor: paymentLabels.map((_, i) => SERIES[i % SERIES.length].fill),
      borderColor: paymentLabels.map((_, i) => SERIES[i % SERIES.length].stroke),
      borderWidth: 2,
    }],
  };

  const trendChart = {
    labels: trend.map((point) => point.label),
    datasets: [{
      label: 'Sales',
      data: trend.map((point) => point.total),
      borderColor: SERIES[0].stroke,
      backgroundColor: 'rgba(255, 213, 79, 0.12)',
      borderWidth: 2,
      fill: true,
      tension: 0.4,
      pointBackgroundColor: SERIES[0].stroke,
      pointBorderColor: '#fff',
      pointBorderWidth: 2,
      pointRadius: 4,
    }],
  };

  return (
    <>
      <div className="charts-grid">
        <ChartCard title="Top items by quantity" hasData={topItems.length > 0} emptyText="No sales in this period">
          <Bar
            data={itemsChart}
            options={{ ...BASE_OPTIONS, indexAxis: 'y', plugins: { legend: { display: false } } }}
          />
        </ChartCard>

        <ChartCard title="Payment methods" hasData={paymentLabels.length > 0} emptyText="No payment data">
          <Doughnut data={paymentChart} options={BASE_OPTIONS} />
        </ChartCard>

        <ChartCard title="Sales trend (last 7 days)" hasData={trend.length > 0} emptyText="No trend data">
          <Line data={trendChart} options={BASE_OPTIONS} />
        </ChartCard>
      </div>

      <div className="payment-breakdown">
        <h3>Payment breakdown</h3>
        {paymentLabels.length === 0 && <div className="no-data">No data</div>}
        {paymentLabels.map((method) => (
          <div key={method} className="payment-item">
            <span className="payment-method">{method}</span>
            <span className="payment-amount">{rupees(paymentTotals[method])}</span>
          </div>
        ))}
      </div>
    </>
  );
}
