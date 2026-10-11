import { useEffect, useId, useRef, useState } from "react";
import { CalendarDays, ChevronDown } from "lucide-react";
import { Calendar, dateLabel } from "./Calendar";

interface Props {
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder?: string;
  disabled?: boolean;
}

export function DatePicker({ value, onChange, label, placeholder = "Chọn ngày", disabled }: Props) {
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    if (!expanded) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setExpanded(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [expanded]);
  const close = () => { setExpanded(false); triggerRef.current?.focus(); };
  return <div className="themed-date-picker" ref={rootRef} onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget)) setExpanded(false);
  }} onKeyDown={event => {
    if (event.key === "Escape" && expanded) { event.stopPropagation(); close(); }
  }}>
    <button type="button" ref={triggerRef} className="pickup-date-trigger" aria-label={label}
      disabled={disabled} aria-expanded={expanded} aria-controls={id} onClick={() => setExpanded(!expanded)}>
      <CalendarDays size={18} aria-hidden="true" />
      <span>{value ? dateLabel(value) : placeholder}</span>
      <ChevronDown size={16} aria-hidden="true" />
    </button>
    {expanded && <div className="date-picker-panel">
      <Calendar id={id} value={value} disabled={disabled} onChange={date => { onChange(date); close(); }} />
      <div className="calendar-footer">
        <button type="button" onClick={() => { onChange(""); close(); }} disabled={disabled || !value}>Xóa ngày</button>
        <button type="button" onClick={close}>Đóng lịch</button>
      </div>
    </div>}
  </div>;
}
