import { FORM_DAYS, type PlayerAttendance } from '../../domain/attendance';
import { formatDayMonth } from '../dates';

/** Docházka u jména (10. 11. 2026): „naposledy 4. 11. · 3× za 28 dní“ (+ „· celkem 12×“), nebo „zatím nebyl“. */
export function AttendanceMeta({ a, total }: { a?: PlayerAttendance; total?: boolean }) {
  if (!a?.last) return <span className="att-meta">zatím nebyl</span>;
  return (
    <span className="att-meta">
      naposledy <b>{formatDayMonth(a.last)}</b> · {a.recent}× za {FORM_DAYS} dní{total && ` · celkem ${a.total}×`}
    </span>
  );
}
