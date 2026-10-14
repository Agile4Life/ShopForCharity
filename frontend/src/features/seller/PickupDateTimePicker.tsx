import { useId, useRef, useState } from "react";
import { CalendarDays, ChevronRight, Clock3 } from "lucide-react";
import { Calendar, calendarDate, dateKey, shopToday, dateLabel } from "../../components/Calendar";
import { firstPickupDate, pickupScheduleHelp } from "./pickup-time";

const pad = (value: number) => String(value).padStart(2, "0");

interface Props {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  errorId?: string;
  label?: string;
  triggerId?: string;
  optional?: boolean;
  inputRef?: (element: HTMLButtonElement | null) => void;
  onBlur?: () => void;
}

export function PickupDateTimePicker({ value, onChange, disabled, invalid, errorId, label = "Ngày và giờ hẹn nhận", triggerId, optional, inputRef, onBlur }: Props) {
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const today = shopToday();
  const minDate = today > firstPickupDate ? today : firstPickupDate;
  const selected = value.split("T")[0];
  const time = value.split("T")[1] || "09:00";
  const [expanded, setExpanded] = useState(!selected && !optional);
  const tomorrow = calendarDate(today);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

  const choose = (date: string) => {
    if (date < minDate) return;
    const allowedTime = time < "08:00" || time > "17:00" ? "09:00" : time;
    onChange(`${date}T${allowedTime}`);
    setExpanded(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  };

  return (
    <fieldset className="pickup-schedule" disabled={disabled} onKeyDown={event => {
      if (event.key === "Escape" && expanded) { event.stopPropagation(); setExpanded(false); triggerRef.current?.focus(); }
    }}>
      {!triggerId && <legend>{label}</legend>}
      <div className="pickup-date-shortcuts">
        <button type="button" disabled={today < minDate} aria-pressed={selected === today} onClick={() => choose(today)}>Hôm nay</button>
        <button type="button" disabled={dateKey(tomorrow) < minDate} aria-pressed={selected === dateKey(tomorrow)} onClick={() => choose(dateKey(tomorrow))}>Ngày mai</button>
      </div>
      <button ref={element => { triggerRef.current = element; inputRef?.(element); }} onBlur={onBlur} id={triggerId} type="button" className="pickup-date-trigger" aria-label={label} aria-expanded={expanded}
        aria-controls={`${id}-calendar`} aria-invalid={invalid || undefined} aria-describedby={invalid ? errorId : undefined}
        onClick={() => setExpanded(!expanded)}>
        <CalendarDays size={20} aria-hidden="true" />
        <span>{selected ? dateLabel(selected) : "Chọn ngày nhận hàng"}</span>
        <ChevronRight size={18} className={expanded ? "is-expanded" : ""} aria-hidden="true" />
      </button>
      <div className={`pickup-schedule-details ${expanded ? "with-calendar" : ""}`}>
      {expanded && <Calendar id={`${id}-calendar`} value={selected} min={minDate} disabled={disabled} onChange={choose} />}
      <div className="pickup-time-panel">
      <div className="pickup-time-heading"><Clock3 size={17} aria-hidden="true" /><span>Giờ nhận hàng</span><small>Giờ Việt Nam · GMT+7</small></div>
      <div className="pickup-time-fields">
        <div><label htmlFor={`${id}-hour`}>Giờ</label>
          <select id={`${id}-hour`} className="select-field" value={time.slice(0, 2)} disabled={disabled || !selected}
            onChange={event => onChange(`${selected}T${event.target.value}:${event.target.value === "17" ? "00" : time.slice(3, 5)}`)}>
            {Array.from({ length: 10 }, (_, i) => <option key={i + 8} value={pad(i + 8)}>{pad(i + 8)}</option>)}
          </select>
        </div>
        <span aria-hidden="true">:</span>
        <div><label htmlFor={`${id}-minute`}>Phút</label>
          <select id={`${id}-minute`} className="select-field" value={time.slice(3, 5)} disabled={disabled || !selected}
            onChange={event => onChange(`${selected}T${time.slice(0, 2)}:${event.target.value}`)}>
            {Array.from({ length: 60 }, (_, i) => <option key={i} value={pad(i)} disabled={time.slice(0, 2) === "17" && i > 0}>{pad(i)}</option>)}
          </select>
        </div>
      </div>
      <p className="pickup-time-help">{pickupScheduleHelp}</p>
      </div>
      </div>
      {optional && selected && <button type="button" className="calendar-back" onClick={() => { onChange(""); setExpanded(false); }}>Xóa thời gian nhận</button>}
    </fieldset>
  );
}
