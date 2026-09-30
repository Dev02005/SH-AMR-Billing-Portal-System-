import { useCallback, useEffect, useState } from 'react';
import { downloadSalesWorkbook, fetchBills } from '../../../api';
import { errorMessage } from '../../../api/client';
import CustomDatePicker from '../../../components/ui/CustomDatePicker';
import { useNotify } from '../../../components/notifications/notification-context';
import AnalyticsBillRegister from './AnalyticsBillRegister';
import AnalyticsCharts from './AnalyticsCharts';
import AnalyticsStats from './AnalyticsStats';
import AnalyticsTables from './AnalyticsTables';
import { saveBlob } from '../../../utils/download';
import { toDateInput } from '../../../utils/format';
import useSalesStats from './useSalesStats';
import './analytics.css';

const DATE_MODES = [
  ['today', 'Today'],
  ['week', 'This week'],
  ['month', 'This month'],
  ['custom', 'Pick date'],
  ['range', 'Date range'],
];

export default function AnalyticsDashboard() {
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [mode, setMode] = useState('today');
  const [customDate, setCustomDate] = useState('');
  const [rangeFrom, setRangeFrom] = useState('');
  const [rangeTo, setRangeTo] = useState('');

  const [showDownload, setShowDownload] = useState(false);
  const [downloadFrom, setDownloadFrom] = useState(() => {
    const first = new Date();
    first.setDate(1);
    return toDateInput(first);
  });
  const [downloadTo, setDownloadTo] = useState(() => toDateInput(new Date()));
  const [downloadError, setDownloadError] = useState('');
  const [downloading, setDownloading] = useState(false);
  const notify = useNotify();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setBills(await fetchBills());
      setError('');
    } catch (err) {
      setError(errorMessage(err, 'Could not load the bill history'));
    } finally {
      setLoading(false);
    }
  }, []);

  /* After a delete the page must not flash back to "Loading analytics…" —
     just refresh the data behind the visible UI. */
  const refreshQuietly = useCallback(async () => {
    try {
      setBills(await fetchBills());
      setError('');
    } catch {
      /* keep showing the previous list; the row action already reported */
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const open = () => { setDownloadError(''); setShowDownload(true); };
    window.addEventListener('analytics:download', open);
    return () => window.removeEventListener('analytics:download', open);
  }, []);

  const stats = useSalesStats(bills, { mode, customDate, rangeFrom, rangeTo });

  const exportReport = async () => {
    if (!downloadFrom || !downloadTo) { setDownloadError('Pick both dates.'); return; }
    if (downloadFrom > downloadTo) { setDownloadError('The From date must come first.'); return; }

    setDownloading(true);
    setDownloadError('');
    try {
      const { blob, filename } = await downloadSalesWorkbook(downloadFrom, downloadTo);
      saveBlob(blob, filename);
      setShowDownload(false);
      notify(`Report saved: ${filename}`, 'success');
    } catch (err) {
      setDownloadError(errorMessage(err, 'Could not build the report'));
    } finally {
      setDownloading(false);
    }
  };

  if (loading) {
    return <main className="analytics-container"><p className="analytics-message">Loading analytics…</p></main>;
  }

  return (
    <main className="analytics-container">
      <div className="analytics-content">
        {error && (
          <p className="analytics-message analytics-message-error">
            {error} <button type="button" className="date-btn" onClick={load}>Retry</button>
          </p>
        )}

        <div className="date-picker-panel">
          <div className="date-controls">
            {DATE_MODES.map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={`date-btn ${mode === value ? 'active' : ''}`}
                onClick={() => setMode(value)}
              >
                {label}
              </button>
            ))}
          </div>

          {mode === 'custom' && (
            <div className="range-controls">
              <div className="calendar-picker-wrapper">
                <span className="calendar-label">Date</span>
                <CustomDatePicker className="custom-date-input" value={customDate} onChange={setCustomDate} />
              </div>
            </div>
          )}

          {mode === 'range' && (
            <div className="range-controls">
              <div className="calendar-picker-wrapper">
                <span className="calendar-label">From</span>
                <CustomDatePicker className="custom-date-input" value={rangeFrom} onChange={setRangeFrom} />
              </div>
              <div className="calendar-picker-wrapper">
                <span className="calendar-label">To</span>
                <CustomDatePicker className="custom-date-input" value={rangeTo} onChange={setRangeTo} />
              </div>
            </div>
          )}
        </div>

        <AnalyticsStats
          revenue={stats.revenue}
          billCount={stats.billCount}
          average={stats.average}
          peakHour={stats.peakHour}
          weekRevenue={stats.weekRevenue}
          monthRevenue={stats.monthRevenue}
        />

        <AnalyticsCharts
          topItems={stats.topItems}
          paymentTotals={stats.paymentTotals}
          trend={stats.trend}
        />

        <AnalyticsTables itemRows={stats.itemRows} orderTypeRows={stats.orderTypeRows} />

        <AnalyticsBillRegister bills={stats.selected} onRefresh={refreshQuietly} notify={notify} />

        {showDownload && (
          <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowDownload(false)}>
            <div className="modal-content download-modal-content">
              <div className="modal-header">
                <h2>Download Excel report</h2>
                <button type="button" className="modal-close" onClick={() => setShowDownload(false)}>×</button>
              </div>
              <div className="download-modal-fields">
                <div className="download-report-field">
                  <label>From date</label>
                  <CustomDatePicker value={downloadFrom} onChange={setDownloadFrom} className="download-modal-date-input" />
                </div>
                <div className="download-report-field">
                  <label>To date</label>
                  <CustomDatePicker value={downloadTo} onChange={setDownloadTo} className="download-modal-date-input" />
                </div>
                <p className="download-report-contents">
                  One workbook with six sheets: Summary, Daily Sales, Payment Methods,
                  Order Types, Item Sales and the full Bill Register.
                </p>
                {downloadError && <p className="modal-note modal-note-error">{downloadError}</p>}
                <button type="button" className="download-report-btn" onClick={exportReport} disabled={downloading}>
                  {downloading ? 'Building workbook…' : 'Download .xlsx'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
