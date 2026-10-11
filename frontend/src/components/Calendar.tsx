import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export const calendarDate = (value: string) => new Date(`${value}T00:00:00Z`);
export const dateKey = (value: Date) => value.toISOString().slice(0, 10);
export const shopToday = () => new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit",
}).format(new Date());
export const dateLabel = (value: string) => new Intl.DateTimeFormat("vi-VN", {
  timeZone: "UTC", weekday: "long", day: "numeric", month: "long", year: "numeric",
}).format(calendarDate(value));

interface Props {
  value: string;
  onChange: (value: string) => void;
  min?: string;
  disabled?: boolean;
  id?: string;
}

export function Calendar({ value, onChange, min, disabled, id }: Props) {
  const today = shopToday();
  const [month, setMonth] = useState(() => (value || min || today).slice(0, 7));
  const [view, setView] = useState<"days" | "months" | "years">("days");
  const [yearStart, setYearStart] = useState(() => Number(month.slice(0, 4)) - 5);
  const gridRef = useRef<HTMLDivElement>(null);
  const first = calendarDate(`${month}-01`);
  const year = first.getUTCFullYear();
  const monthIndex = first.getUTCMonth();
  const offset = (first.getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const canUseMonth = (candidate: string) => !min || candidate >= min.slice(0, 7);
  const moveMonth = (delta: number) => {
    const next = new Date(first);
    next.setUTCMonth(next.getUTCMonth() + delta);
    setMonth(dateKey(next).slice(0, 7));
  };
  const moveFocus = (date: string, key: string) => {
    const delta = ({ ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 } as Record<string, number>)[key];
    if (delta === undefined) return false;
    const next = calendarDate(date);
    next.setUTCDate(next.getUTCDate() + delta);
    const target = dateKey(next);
    if (!min || target >= min) {
      setMonth(target.slice(0, 7));
      requestAnimationFrame(() => gridRef.current?.querySelector<HTMLButtonElement>(`[data-date="${target}"]`)?.focus());
    }
    return true;
  };
  return (
    <div className="pickup-calendar themed-calendar" id={id} role="group" aria-label="Lịch chọn ngày">
      <div className="pickup-calendar-heading">
        <button type="button" aria-label={view === "years" ? "12 năm trước" : view === "months" ? "Năm trước" : "Tháng trước"}
          disabled={disabled || (view === "days" ? !canUseMonth(dateKey(new Date(Date.UTC(year, monthIndex, 0))).slice(0, 7))
            : view === "months" ? !!min && year <= Number(min.slice(0, 4)) : yearStart <= 1 || !!min && yearStart <= Number(min.slice(0, 4)))}
          onClick={() => view === "years" ? setYearStart(start => Math.max(1, start - 12))
            : view === "months" ? setMonth(`${year - 1}-${month.slice(5)}`) : moveMonth(-1)}>
          <ChevronLeft size={18} aria-hidden="true" />
        </button>
        <div className="calendar-period" aria-live="polite">
          {view === "years" ? <span>{yearStart} – {yearStart + 11}</span> : <>
            <button type="button" disabled={disabled} className="calendar-period-button" aria-label="Chọn tháng"
              aria-pressed={view === "months"} onClick={() => setView(view === "months" ? "days" : "months")}>
              Tháng {monthIndex + 1}
            </button>
            <button type="button" disabled={disabled} className="calendar-period-button" aria-label="Chọn năm"
              onClick={() => { setYearStart(Math.max(1, year - 5)); setView("years"); }}>{year}</button>
          </>}
        </div>
        <button type="button" disabled={disabled} aria-label={view === "years" ? "12 năm sau" : view === "months" ? "Năm sau" : "Tháng sau"}
          onClick={() => view === "years" ? setYearStart(start => start + 12)
            : view === "months" ? setMonth(`${year + 1}-${month.slice(5)}`) : moveMonth(1)}>
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      </div>
      {view === "days" ? <div className="pickup-calendar-grid" ref={gridRef}>
        {["T2", "T3", "T4", "T5", "T6", "T7", "CN"].map(day => <span className="pickup-weekday" key={day}>{day}</span>)}
        {Array.from({ length: offset }, (_, i) => <span key={`blank-${i}`} />)}
        {Array.from({ length: days }, (_, i) => {
          const date = `${month}-${String(i + 1).padStart(2, "0")}`;
          return <button key={date} type="button" data-date={date} aria-label={dateLabel(date)}
            aria-pressed={value === date} aria-current={date === today ? "date" : undefined}
            disabled={disabled || !!min && date < min} onClick={() => onChange(date)}
            onKeyDown={event => { if (moveFocus(date, event.key)) event.preventDefault(); }}>{i + 1}</button>;
        })}
      </div> : <div className="calendar-choice-grid" aria-label={view === "months" ? "Các tháng" : "Các năm"}>
        {Array.from({ length: 12 }, (_, i) => {
          const candidate = view === "months" ? `${year}-${String(i + 1).padStart(2, "0")}` : `${yearStart + i}-${month.slice(5)}`;
          const blocked = view === "months" ? !canUseMonth(candidate) : !!min && yearStart + i < Number(min.slice(0, 4));
          return <button type="button" key={candidate} disabled={disabled || blocked}
            aria-pressed={view === "months" ? i === monthIndex : yearStart + i === year}
            onClick={() => { setMonth(view === "years" && !canUseMonth(candidate) ? min!.slice(0, 7) : candidate); setView(view === "years" ? "months" : "days"); }}>
            {view === "months" ? `Tháng ${i + 1}` : yearStart + i}
          </button>;
        })}
      </div>}
      {view !== "days" && <button type="button" className="calendar-back" disabled={disabled} onClick={() => setView("days")}>Quay lại chọn ngày</button>}
    </div>
  );
}
