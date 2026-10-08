"use client";

import { useMemo, useState } from "react";
import { WEEKDAYS } from "@/lib/constants";

export function WindowPicker({ initialDays = [1, 2, 3, 4, 5], start = "09:00", end = "17:00" }: { initialDays?: number[]; start?: string; end?: string }) {
  const [days, setDays] = useState<number[]>(initialDays);
  const [open, setOpen] = useState(start);
  const [close, setClose] = useState(end);
  const windows = useMemo(() => days.map((weekday) => ({ weekday, start: open, end: close })), [days, open, close]);

  function toggle(day: number) {
    setDays((current) => (current.includes(day) ? current.filter((item) => item !== day) : [...current, day].sort((a, b) => a - b)));
  }

  return (
    <div className="space-y-3" data-testid="window-picker">
      <input type="hidden" name="windows" value={JSON.stringify(windows)} />
      <div className="flex flex-wrap gap-2">
        {WEEKDAYS.map((label, weekday) => (
          <button
            key={label}
            type="button"
            className={`min-h-11 min-w-11 rounded-full px-3 text-sm ${days.includes(weekday) ? "bg-ink text-paper" : "bg-white text-ink ring-1 ring-line"}`}
            onClick={() => toggle(weekday)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          Opens
          <input className="mt-1 w-full rounded-2xl border border-line bg-white px-3 py-2" type="time" value={open} onChange={(event) => setOpen(event.target.value)} />
        </label>
        <label className="text-sm">
          Closes
          <input className="mt-1 w-full rounded-2xl border border-line bg-white px-3 py-2" type="time" value={close} onChange={(event) => setClose(event.target.value)} />
        </label>
      </div>
      <p className="text-sm text-ink/60">{days.length ? `${days.map((day) => WEEKDAYS[day]).join(", ")} · ${open}–${close}` : "Pick the days you take bookings."}</p>
    </div>
  );
}
