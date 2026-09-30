import { useMemo, useState } from 'react';
import { rupees } from '../../../utils/format';

/** Sort rows by `field`, handling both text and numeric columns. */
function sortRows(rows, field, order) {
  return [...rows].sort((a, b) => {
    const left = a[field];
    const right = b[field];
    const result = typeof left === 'string' ? left.localeCompare(right) : (left || 0) - (right || 0);
    return order === 'asc' ? result : -result;
  });
}

function SortableTable({ title, rows, columns, emptyText, totalLabel }) {
  const [sort, setSort] = useState({ field: columns[columns.length - 1].key, order: 'desc' });

  const sorted = useMemo(() => sortRows(rows, sort.field, sort.order), [rows, sort]);

  const toggle = (field) => setSort((prev) => ({
    field,
    order: prev.field === field && prev.order === 'desc' ? 'asc' : 'desc',
  }));

  const totals = columns.reduce((acc, column) => {
    if (column.sum) acc[column.key] = rows.reduce((sum, row) => sum + (row[column.key] || 0), 0);
    return acc;
  }, {});

  return (
    <div className="report-section">
      <h3>{title}</h3>
      <div className="table-responsive">
        <table className="report-table report-table-fit">
          <thead>
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  className={column.align ? `align-${column.align}` : ''}
                  onClick={() => toggle(column.key)}
                >
                  {column.label}
                  <span className="sort-indicator">
                    {sort.field === column.key ? (sort.order === 'asc' ? ' ▲' : ' ▼') : ''}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr><td colSpan={columns.length} className="no-data">{emptyText}</td></tr>
            )}
            {sorted.map((row) => (
              <tr key={row[columns[0].key]}>
                {columns.map((column) => (
                  <td key={column.key} className={column.cellClass}>
                    {column.money ? rupees(row[column.key]) : row[column.key]}
                  </td>
                ))}
              </tr>
            ))}
            {sorted.length > 0 && (
              <tr className="report-total">
                {columns.map((column, index) => (
                  <td key={column.key} className={column.cellClass}>
                    {index === 0 ? totalLabel : (
                      column.sum ? (column.money ? rupees(totals[column.key]) : totals[column.key]) : ''
                    )}
                  </td>
                ))}
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const ITEM_COLUMNS = [
  { key: 'name', label: 'Item name' },
  { key: 'qty', label: 'Qty', align: 'center', cellClass: 'qty-cell', sum: true },
  { key: 'total', label: 'Total', align: 'right', cellClass: 'amount-cell', sum: true, money: true },
];

const ORDER_TYPE_COLUMNS = [
  { key: 'type', label: 'Order type', cellClass: 'event-cell' },
  { key: 'count', label: 'Bills', align: 'center', cellClass: 'qty-cell', sum: true },
  { key: 'total', label: 'Total', align: 'right', cellClass: 'amount-cell', sum: true, money: true },
];

export default function AnalyticsTables({ itemRows = [], orderTypeRows = [] }) {
  return (
    <>
      <SortableTable
        title="Item sales summary"
        rows={itemRows}
        columns={ITEM_COLUMNS}
        emptyText="No items sold in this period"
        totalLabel="TOTAL"
      />
      <SortableTable
        title="Order type analysis"
        rows={orderTypeRows}
        columns={ORDER_TYPE_COLUMNS}
        emptyText="No orders in this period"
        totalLabel="TOTAL"
      />
    </>
  );
}
