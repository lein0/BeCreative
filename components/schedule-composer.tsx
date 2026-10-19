"use client";

import { useMemo, useState } from "react";
import { LA_TIMEZONE, WEEKDAYS } from "@/lib/constants";
import { describeRecurrence, previewOccurrences, type RecurrenceRule } from "@/lib/recurrence";
import { formatClock, prettyDate } from "@/lib/time";

export function ScheduleComposer({
  defaultStart,
  duration = 60,
  allowOnce = true,
  initial,
}: {
  defaultStart: string;
  duration?: number;
  allowOnce?: boolean;
  initial?: Partial<RecurrenceRule>;
}) {
  const [mode, setMode] = useState<"once" | "repeat">(allowOnce ? "repeat" : "repeat");
  const [picked, setPicked] = useState<number[]>(initial?.days?.map((day) => day.weekday) ?? [2, 4]);
  const [time, setTime] = useState(initial?.days?.[0]?.time ?? "19:00");
  const [splitTimes, setSplitTimes] = useState(false);
  const [times, setTimes] = useState<Record<number, string>>({});
  const [frequency, setFrequency] = useState<RecurrenceRule["frequency"]>(initial?.frequency ?? "weekly");
  const [startDate, setStartDate] = useState(initial?.startDate ?? defaultStart);
  const [endType, setEndType] = useState<RecurrenceRule["endType"]>(initial?.endType ?? "after");
  const [endDate, setEndDate] = useState(initial?.endDate ?? "");
  const [endCount, setEndCount] = useState(initial?.endCount ?? 8);
  const [advanced, setAdvanced] = useState(false);
  const [onceDate, setOnceDate] = useState(defaultStart);
  const [onceTime, setOnceTime] = useState("19:00");

  function toggle(day: number) {
    setPicked((current) => (current.includes(day) ? current.filter((item) => item !== day) : [...current, day].sort((a, b) => a - b)));
  }

  const rule: RecurrenceRule = useMemo(
    () => ({
      timezone: LA_TIMEZONE,
      frequency,
      days: picked.map((weekday) => ({ weekday, time: splitTimes ? times[weekday] || time : time })),
      startDate,
      endType,
      endDate: endType === "on" ? endDate : null,
      endCount: endType === "after" ? Number(endCount) || 8 : null,
    }),
    [frequency, picked, splitTimes, times, time, startDate, endType, endDate, endCount],
  );

  const preview = mode === "repeat" && picked.length ? previewOccurrences(rule, duration).slice(0, 10) : [];
  const summary = mode === "once" ? `One session on ${prettyDate(onceDate)} at ${formatClock(onceTime)}` : describeRecurrence(rule);

  return (
    <div className="space-y-4" data-testid="schedule-composer">
      <input type="hidden" name="scheduleMode" value={mode} />
      <input type="hidden" name="rule" value={JSON.stringify(rule)} />
      <input type="hidden" name="onceDate" value={onceDate} />
      <input type="hidden" name="onceTime" value={onceTime} />
      {allowOnce ? (
        <div className="grid grid-cols-2 gap-2 rounded-full bg-sand p-1 text-sm">
          {(["once", "repeat"] as const).map((option) => (
            <button
              key={option}
              type="button"
              className={`rounded-full py-2 ${mode === option ? "bg-white shadow-sm" : "text-ink/60"}`}
              onClick={() => setMode(option)}
            >
              {option === "once" ? "One-time" : "Repeats"}
            </button>
          ))}
        </div>
      ) : null}
      {mode === "once" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            Date
            <input className="mt-1 w-full rounded-2xl border border-line bg-white px-3 py-2" type="date" value={onceDate} onChange={(event) => setOnceDate(event.target.value)} />
          </label>
          <label className="text-sm">
            Time
            <input className="mt-1 w-full rounded-2xl border border-line bg-white px-3 py-2" type="time" value={onceTime} onChange={(event) => setOnceTime(event.target.value)} />
          </label>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {WEEKDAYS.map((label, weekday) => (
              <button
                key={label}
                type="button"
                onClick={() => toggle(weekday)}
                className={`h-10 w-12 rounded-full text-sm ${picked.includes(weekday) ? "bg-ink text-paper" : "bg-white text-ink ring-1 ring-line"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="block text-sm">
            Time
            <input className="mt-1 w-full rounded-2xl border border-line bg-white px-3 py-2" type="time" value={time} onChange={(event) => setTime(event.target.value)} />
          </label>
          <label className="block text-sm">
            Starts
            <input className="mt-1 w-full rounded-2xl border border-line bg-white px-3 py-2" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
          </label>
          <div className="flex flex-wrap gap-2 text-sm">
            {(["never", "on", "after"] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setEndType(option)}
                className={`rounded-full px-3 py-1.5 ${endType === option ? "bg-moss text-paper" : "bg-white ring-1 ring-line"}`}
              >
                {option === "never" ? "Never ends" : option === "on" ? "On a date" : "After N"}
              </button>
            ))}
          </div>
          {endType === "on" ? (
            <input className="w-full rounded-2xl border border-line bg-white px-3 py-2" type="date" value={endDate ?? ""} onChange={(event) => setEndDate(event.target.value)} />
          ) : null}
          {endType === "after" ? (
            <label className="block text-sm">
              Sessions
              <input className="mt-1 w-full rounded-2xl border border-line bg-white px-3 py-2" type="number" min={1} value={endCount ?? 8} onChange={(event) => setEndCount(Number(event.target.value))} />
            </label>
          ) : null}
          <button type="button" className="text-sm text-clay" onClick={() => setAdvanced((value) => !value)}>
            {advanced ? "Hide advanced" : "Advanced options"}
          </button>
          {advanced ? (
            <div className="space-y-3 rounded-2xl bg-sand/70 p-3">
              <label className="block text-sm">
                Repeats
                <select className="mt-1 w-full rounded-2xl border border-line bg-white px-3 py-2" value={frequency} onChange={(event) => setFrequency(event.target.value as RecurrenceRule["frequency"])}>
                  <option value="weekly">Every week</option>
                  <option value="biweekly">Every 2 weeks</option>
                  <option value="monthly">Monthly by weekday</option>
                </select>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={splitTimes} onChange={(event) => setSplitTimes(event.target.checked)} />
                Different time each day
              </label>
              {splitTimes
                ? picked.map((weekday) => (
                    <label key={weekday} className="flex items-center justify-between gap-3 text-sm">
                      {WEEKDAYS[weekday]}
                      <input
                        type="time"
                        className="rounded-xl border border-line bg-white px-2 py-1"
                        value={times[weekday] || time}
                        onChange={(event) => setTimes((current) => ({ ...current, [weekday]: event.target.value }))}
                      />
                    </label>
                  ))
                : null}
            </div>
          ) : null}
        </>
      )}
      <div className="rounded-2xl bg-moss px-4 py-3 text-paper" data-testid="schedule-summary">
        <p className="text-xs uppercase tracking-[0.14em] text-paper/70">Schedule</p>
        <p className="mt-1 text-lg leading-snug">{summary}</p>
      </div>
      {preview.length ? (
        <ol className="grid gap-1 text-sm" data-testid="schedule-preview">
          {preview.map((item) => (
            <li key={`${item.date}-${item.time}`} className="flex justify-between rounded-xl bg-white px-3 py-2 ring-1 ring-line">
              <span>{prettyDate(item.date)}</span>
              <span>{formatClock(item.time)}</span>
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}
