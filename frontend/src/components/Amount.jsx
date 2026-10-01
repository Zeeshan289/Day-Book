import { splitRs } from '../money.js';

// Shows an amount in two cells: rupees and paisa, like the printed book.
export default function Amount({ value, className = '' }) {
  if (value === null || value === undefined || value === '') {
    return (<><td className={`rs ${className}`} /><td className={`ps ${className}`} /></>);
  }
  const { rs, ps } = splitRs(value);
  return (
    <>
      <td className={`rs ${className}`}>{value < 0 ? '−' : ''}{rs}</td>
      <td className={`ps ${className}`}>{ps}</td>
    </>
  );
}
