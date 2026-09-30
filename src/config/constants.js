/** Values shared across the portals. Keep in step with server/config.py. */

/** Tables on the floor. The dropdowns list 1..TABLE_COUNT. */
export const TABLE_COUNT = 10;

export const PAYMENT_METHODS = ['Cash', 'Card', 'UPI', 'Zomato', 'Swiggy', 'Pending'];

export const ORDER_TYPES = ['Dine-in', 'Take Out', 'Delivery'];

/** `[{value,label}]` for the table dropdowns, with an "unassigned" first row. */
export function tableOptions(emptyLabel = 'Not assigned') {
  return [
    { value: '', label: emptyLabel },
    ...Array.from({ length: TABLE_COUNT }, (_, i) => ({
      value: String(i + 1),
      label: `Table ${i + 1}`,
    })),
  ];
}
