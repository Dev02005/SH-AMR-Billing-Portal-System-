/**
 * Every backend call the portals make, in one place.
 *
 * Components import these instead of hand-writing URLs, which is how the
 * front end and back end drifted apart (`POST /api/bills` vs `POST /api/bill`,
 * a `PUT /api/custom-items/:name` with no route behind it, and a deprecated
 * `/api/token` that returned 410 to the server portal).
 */

import client from './client';

// ------------------------------------------------------------------ auth

export const login = (email, password) =>
  client.post('/api/auth/login', { email, password }, { skipAuthRedirect: true }).then((r) => r.data);

export const logout = () => client.post('/api/auth/logout').then((r) => r.data);

// ------------------------------------------------------------------ menu

export const fetchMenuItems = () => client.get('/api/custom-items').then((r) => r.data.items || []);

export const fetchCategories = () => client.get('/api/categories').then((r) => r.data.categories || []);

export const createMenuItem = (formData) =>
  client.post('/api/custom-items', formData).then((r) => r.data);

export const updateMenuItem = (name, payload) =>
  client.put(`/api/custom-items/${encodeURIComponent(name)}`, payload).then((r) => r.data);

export const deleteMenuItem = (name) =>
  client.delete(`/api/custom-items/${encodeURIComponent(name)}`).then((r) => r.data);

export const createCategory = (name) => client.post('/api/categories', { name }).then((r) => r.data);

export const deleteCategory = (name) =>
  client.delete(`/api/categories/${encodeURIComponent(name)}`).then((r) => r.data);

// ------------------------------------------------------------------ bills

export const fetchNextBillNumber = () =>
  client.get('/api/bill-number').then((r) => r.data.billNumber);

export const saveBill = (bill) => client.post('/api/bill', bill).then((r) => r.data);

export const fetchBills = () => client.get('/api/bills').then((r) => r.data.bills || []);

// Bills are addressed by their unique document id. Bill *numbers* restart at
// 1 each morning, so hundreds of bills share one - addressing by number could
// delete an unrelated day's bill.

export const deleteBillPermanently = (id) =>
  client.delete(`/api/bill/${id}/permanent-delete`).then((r) => r.data);

// ------------------------------------------------------------ print queue

export const sendToPrintQueue = (bill) => client.post('/api/print-queue', bill).then((r) => r.data);

export const fetchPrintQueue = () => client.get('/api/print-queue').then((r) => r.data.requests || []);

export const deletePrintRequest = (id) =>
  client.delete(`/api/print-queue/${id}`).then((r) => r.data);

// --------------------------------------------------- active tables / kitchen

export const openTable = (order) => client.post('/api/active-tables', order).then((r) => r.data);

// `board: true` hides tickets the kitchen has already served.
export const fetchActiveTables = ({ board = false } = {}) =>
  client.get('/api/active-tables', { params: board ? { board: true } : undefined })
    .then((r) => r.data.tables || []);

// Status moves address one ticket: a table can have several open orders and
// each cooks and clears on its own.
export const setKitchenStatus = (ticketId, kitchenStatus) =>
  client
    .patch(`/api/active-tables/${encodeURIComponent(ticketId)}/status`, { kitchenStatus })
    .then((r) => r.data);

// Cancel one order from the counter's table plan; its print request goes too.
export const deleteOrder = (ticketId) =>
  client.delete(`/api/active-tables/${encodeURIComponent(ticketId)}`).then((r) => r.data);

// Settle a whole table: closes every open ticket on it at once.
export const closeWholeTable = (tableNumber) =>
  client.patch(`/api/active-tables/table/${encodeURIComponent(tableNumber)}/close-table`).then((r) => r.data);

// ---------------------------------------------------------- notifications

export const fetchNotifications = () =>
  client.get('/api/notifications').then((r) => r.data.notifications || []);

export const acknowledgeNotifications = (ids) =>
  client.post('/api/notifications/seen', { ids }).then((r) => r.data);

// ---------------------------------------------------------------- reports

/**
 * The sales workbook for a date range, as a Blob ready to save.
 *
 * Built by the server from every bill in the range, not from the page's
 * already-loaded list, so a long range cannot be silently truncated.
 */
export const downloadSalesWorkbook = async (from, to) => {
  let response;
  try {
    response = await client.get('/api/reports/sales.xlsx', {
      params: { from, to },
      responseType: 'blob',
    });
  } catch (err) {
    // With responseType 'blob' the JSON error body arrives as a Blob too;
    // unwrap it so the UI can show "No bills in that date range" rather than
    // a bare status code.
    const body = err.response?.data;
    if (body instanceof Blob) {
      try {
        err.response.data = JSON.parse(await body.text());
      } catch {
        /* not JSON - leave it */
      }
    }
    throw err;
  }

  const disposition = response.headers['content-disposition'] || '';
  const match = disposition.match(/filename="?([^";]+)"?/i);
  return {
    blob: response.data,
    filename: match ? match[1] : `SH-Arabian-Mandi-Sales_${from}_to_${to}.xlsx`,
  };
};
