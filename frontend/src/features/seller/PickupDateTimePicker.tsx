import { useId, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Clock3 } from "lucide-react";

const pad = (value: number) => String(value).padStart(2, "0");
const calendarDate = (value: string) => new Date(`${value}T00:00:00Z`);
const dateKey = (value: Date) => value.toISOString().slice(0, 10);
const shopToday = () => new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit",
}).format(new Date());
const dateLabel = (value: string) => new Intl.DateTimeFormat("vi-VN", {
  timeZone: "UTC", weekday: "long", day: "numeric", month: "long", year: "numeric",
}).format(calendarDate(value));

interface Props {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  errorId?: string;
}

export function PickupDateTimePicker({ value, onChange, disabled, invalid, errorId }: Props) {
  const id = useId();
  const gridRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const today = shopToday();
  const selected = value.split("T")[0];
  const time = value.split("T")[1] || "09:00";
  const [month, setMonth] = useState(() => (selected || today).slice(0, 7));
  const [expanded, setExpanded] = useState(!selected);
  const first = calendarDate(`${month}-01`);
  const offset = (first.getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const tomorrow = calendarDate(today);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

  const choose = (date: string) => {
    onChange(`${date}T${time}`);
    setMonth(date.slice(0, 7));
    setExpanded(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  };
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
    if (target >= today) {
      setMonth(target.slice(0, 7));
      requestAnimationFrame(() => gridRef.current?.querySelector<HTMLButtonElement>(`[data-date="${target}"]`)?.focus());
    }
    return true;
  };

  return (
    <fieldset className="pickup-schedule" disabled={disabled}>
      <legend>Ngày và giờ hẹn nhận</legend>
      <div className="pickup-date-shortcuts">
        <button type="button" aria-pressed={selected === today} onClick={() => choose(today)}>Hôm nay</button>
        <button type="button" aria-pressed={selected === dateKey(tomorrow)} onClick={() => choose(dateKey(tomorrow))}>Ngày mai</button>
      </div>
      <button ref={triggerRef} type="button" className="pickup-date-trigger" aria-expanded={expanded}
        aria-controls={`${id}-calendar`} aria-invalid={invalid || undefined} aria-describedby={invalid ? errorId : undefined}
        onClick={() => setExpanded(!expanded)}>
        <CalendarDays size={20} aria-hidden="true" />
        <span>{selected ? dateLabel(selected) : "Chọn ngày nhận hàng"}</span>
        <ChevronRight size={18} className={expanded ? "is-expanded" : ""} aria-hidden="true" />
      </button>
      <div className={`pickup-schedule-details ${expanded ? "with-calendar" : ""}`}>
      {expanded && <div className="pickup-calendar" id={`${id}-calendar`}>
        <div className="pickup-calendar-heading">
          <button type="button" aria-label="Tháng trước" disabled={disabled || month <= today.slice(0, 7)} onClick={() => moveMonth(-1)}><ChevronLeft size={18} /></button>
          <span aria-live="polite">Tháng {first.getUTCMonth() + 1}, {first.getUTCFullYear()}</span>
          <button type="button" aria-label="Tháng sau" onClick={() => moveMonth(1)}><ChevronRight size={18} /></button>
        </div>
        <div className="pickup-calendar-grid" ref={gridRef}>
          {["T2", "T3", "T4", "T5", "T6", "T7", "CN"].map(day => <span className="pickup-weekday" key={day}>{day}</span>)}
          {Array.from({ length: offset }, (_, i) => <span key={`blank-${i}`} />)}
          {Array.from({ length: days }, (_, i) => {
            const date = `${month}-${pad(i + 1)}`;
            return <button key={date} type="button" data-date={date} aria-label={dateLabel(date)}
              aria-pressed={selected === date} aria-current={date === today ? "date" : undefined}
              disabled={disabled || date < today} onClick={() => choose(date)}
              onKeyDown={event => { if (moveFocus(date, event.key)) event.preventDefault(); }}>{i + 1}</button>;
          })}
        </div>
      </div>}
      <div className="pickup-time-panel">
      <div className="pickup-time-heading"><Clock3 size={17} aria-hidden="true" /><span>Giờ nhận hàng</span><small>Giờ Việt Nam · GMT+7</small></div>
      <div className="pickup-time-fields">
        <div><label htmlFor={`${id}-hour`}>Giờ</label>
          <select id={`${id}-hour`} className="select-field" value={time.slice(0, 2)} disabled={disabled || !selected}
            onChange={event => onChange(`${selected}T${event.target.value}:${time.slice(3, 5)}`)}>
            {Array.from({ length: 24 }, (_, i) => <option key={i} value={pad(i)}>{pad(i)}</option>)}
          </select>
        </div>
        <span aria-hidden="true">:</span>
        <div><label htmlFor={`${id}-minute`}>Phút</label>
          <select id={`${id}-minute`} className="select-field" value={time.slice(3, 5)} disabled={disabled || !selected}
            onChange={event => onChange(`${selected}T${time.slice(0, 2)}:${event.target.value}`)}>
            {Array.from({ length: 60 }, (_, i) => <option key={i} value={pad(i)}>{pad(i)}</option>)}
          </select>
        </div>
      </div>
      <p className="pickup-time-help">{selected ? "Chọn giờ đã thống nhất với khách." : "Chọn ngày trước, sau đó chọn giờ nhận."}</p>
      </div>
      </div>
    </fieldset>
  );
}
