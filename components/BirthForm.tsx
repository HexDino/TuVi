'use client';

import { useEffect, useState } from 'react';
import type { CalendarType, Gender } from '@/types/tuvi';
import { DatePicker } from './ui/DatePicker';
import { NumberStepper } from './ui/NumberStepper';
import { SelectMenu } from './ui/SelectMenu';

export interface BirthFormValue {
  name: string;
  gender: Gender;
  calendarType: CalendarType;
  date: string;
  hour: number;
  minute: number;
  viewingYear: number;
  isLeapMonth: boolean;
  /** iztro: true = qua ngày 16 của tháng nhuận thì tính sang tháng kế. */
  fixLeap: boolean;
}

const CHI = [
  { name: 'Tý', range: '23–1' },
  { name: 'Sửu', range: '1–3' },
  { name: 'Dần', range: '3–5' },
  { name: 'Mão', range: '5–7' },
  { name: 'Thìn', range: '7–9' },
  { name: 'Tỵ', range: '9–11' },
  { name: 'Ngọ', range: '11–13' },
  { name: 'Mùi', range: '13–15' },
  { name: 'Thân', range: '15–17' },
  { name: 'Dậu', range: '17–19' },
  { name: 'Tuất', range: '19–21' },
  { name: 'Hợi', range: '21–23' },
];

function chiIndexOf(hour: number): number {
  return hour === 23 || hour === 0 ? 0 : Math.floor((hour + 1) / 2);
}

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, hour) => {
  const chi = CHI[chiIndexOf(hour)];
  return {
    value: String(hour),
    label: `${String(hour).padStart(2, '0')}:00`,
    hint: `${chi.name} · ${chi.range}`,
  };
});

const LEAP_OPTIONS = [
  { value: '1', label: 'Từ ngày 16 trở đi tính sang tháng kế tiếp' },
  { value: '0', label: 'Giữ nguyên trong tháng nhuận' },
];

function padDate(d: string): string {
  const m = d.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!m) return d;
  return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
}

export function BirthForm({
  onSubmit,
  loading,
  initial,
}: {
  onSubmit: (v: BirthFormValue) => void;
  loading: boolean;
  /** Thông tin của lá số đang mở (từ URL hoặc lần gửi gần nhất) để form không lệch với bàn lá số. */
  initial?: BirthFormValue | null;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [gender, setGender] = useState<Gender>(initial?.gender ?? 'nam');
  const [calendarType, setCalendarType] = useState<CalendarType>(initial?.calendarType ?? 'solar');
  const [date, setDate] = useState(initial?.date ?? '1990-10-21');
  const [hour, setHour] = useState(initial?.hour ?? 12);
  const [minute, setMinute] = useState(initial?.minute ?? 0);
  const [viewingYear, setViewingYear] = useState(initial?.viewingYear ?? new Date().getFullYear());
  const [isLeapMonth, setIsLeapMonth] = useState(initial?.isLeapMonth ?? false);
  const [fixLeap, setFixLeap] = useState(initial?.fixLeap ?? true);

  useEffect(() => {
    if (!initial) return;
    setName(initial.name);
    setGender(initial.gender);
    setCalendarType(initial.calendarType);
    setDate(initial.date);
    setHour(initial.hour);
    setMinute(initial.minute);
    setViewingYear(initial.viewingYear);
    setIsLeapMonth(initial.isLeapMonth);
    setFixLeap(initial.fixLeap);
  }, [initial]);

  const pickCalendar = (next: CalendarType) => {
    if (next === calendarType) return;
    setCalendarType(next);
    setDate(padDate(date));
    if (next === 'solar') setIsLeapMonth(false);
  };

  return (
    <form
      className="panel panel-pad"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({
          name,
          gender,
          calendarType,
          date: date.trim(),
          hour,
          minute,
          viewingYear,
          isLeapMonth: calendarType === 'lunar' && isLeapMonth,
          fixLeap: calendarType === 'lunar' ? fixLeap : true,
        });
      }}
    >
      <div className="panel-title">Thông tin sinh</div>

      <div className="field">
        <label htmlFor="name">Họ tên (không bắt buộc)</label>
        <input
          id="name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nguyễn Văn A"
        />
      </div>

      <div className="field">
        <label>Giới tính</label>
        <div className="seg">
          <button type="button" data-active={gender === 'nam'} onClick={() => setGender('nam')}>
            Nam
          </button>
          <button type="button" data-active={gender === 'nu'} onClick={() => setGender('nu')}>
            Nữ
          </button>
        </div>
      </div>

      <div className="field">
        <label>Loại lịch</label>
        <div className="seg">
          <button
            type="button"
            data-active={calendarType === 'solar'}
            onClick={() => pickCalendar('solar')}
          >
            Dương lịch
          </button>
          <button
            type="button"
            data-active={calendarType === 'lunar'}
            onClick={() => pickCalendar('lunar')}
          >
            Âm lịch
          </button>
        </div>
      </div>

      <div className="field">
        <label htmlFor="date">
          {calendarType === 'solar' ? 'Ngày sinh dương lịch' : 'Ngày sinh âm lịch'}
        </label>
        {calendarType === 'solar' ? (
          <DatePicker
            id="date"
            label="Ngày sinh dương lịch"
            value={date}
            onChange={setDate}
            min="1900-01-31"
            max="2100-12-31"
          />
        ) : (
          <input
            id="date"
            type="text"
            inputMode="numeric"
            placeholder="1990-9-4"
            pattern="\d{4}-\d{1,2}-\d{1,2}"
            title="Nhập theo dạng năm-tháng-ngày, ví dụ: 1990-9-4"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            onBlur={(e) => setDate(padDate(e.target.value.trim()))}
            required
          />
        )}
        {calendarType === 'lunar' && (
          <span className="hint" style={{ marginTop: 6, display: 'block' }}>
            Dạng năm-tháng-ngày (cho phép ngày 30), ví dụ: 1990-9-4.
          </span>
        )}
      </div>

      {calendarType === 'lunar' && (
        <div className="field">
          <label className="check">
            <input
              type="checkbox"
              checked={isLeapMonth}
              onChange={(e) => setIsLeapMonth(e.target.checked)}
            />
            <span className="check-box" aria-hidden="true" />
            <span>Tháng nhuận</span>
          </label>
          {isLeapMonth && (
            <div className="leap-policy">
              <SelectMenu
                id="fixLeap"
                value={fixLeap ? '1' : '0'}
                onChange={(next) => setFixLeap(next === '1')}
                options={LEAP_OPTIONS}
                ariaLabel="Cách xử lý ngày trong tháng nhuận"
              />
            </div>
          )}
        </div>
      )}

      <div className="field">
        <label htmlFor="hour">Giờ sinh</label>
        <SelectMenu
          id="hour"
          value={String(hour)}
          options={HOUR_OPTIONS}
          onChange={(next) => setHour(Number(next))}
          ariaLabel="Giờ sinh"
        />
      </div>

      <div className="row-2">
        <div className="field">
          <label htmlFor="minute">Phút</label>
          <NumberStepper
            id="minute"
            value={minute}
            min={0}
            max={59}
            onChange={setMinute}
            ariaLabel="Phút sinh"
          />
        </div>
        <div className="field">
          <label htmlFor="year">Năm xem hạn</label>
          <NumberStepper
            id="year"
            value={viewingYear}
            min={1900}
            max={2100}
            onChange={setViewingYear}
            ariaLabel="Năm xem hạn"
          />
        </div>
      </div>

      <button className="submit" type="submit" disabled={loading}>
        {loading ? 'Đang lập lá số…' : 'Lập lá số'}
      </button>
    </form>
  );
}
