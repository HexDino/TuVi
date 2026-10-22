'use client';

import { useState } from 'react';
import type { CalendarType, Gender } from '@/types/tuvi';

export interface BirthFormValue {
  name: string;
  gender: Gender;
  calendarType: CalendarType;
  date: string;
  hour: number;
  minute: number;
  viewingYear: number;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);

/** Nhãn giờ theo 12 chi để người dùng dễ chọn đúng. */
function hourLabel(h: number): string {
  const ranges = [
    '23–1 · Tý',
    '1–3 · Sửu',
    '3–5 · Dần',
    '5–7 · Mão',
    '7–9 · Thìn',
    '9–11 · Tỵ',
    '11–13 · Ngọ',
    '13–15 · Mùi',
    '15–17 · Thân',
    '17–19 · Dậu',
    '19–21 · Tuất',
    '21–23 · Hợi',
  ];
  const idx = h === 23 ? 0 : h === 0 ? 0 : Math.floor((h + 1) / 2);
  return `${String(h).padStart(2, '0')}:00 — ${ranges[idx] ?? ''}`;
}

export function BirthForm({
  onSubmit,
  loading,
}: {
  onSubmit: (v: BirthFormValue) => void;
  loading: boolean;
}) {
  const [name, setName] = useState('');
  const [gender, setGender] = useState<Gender>('nam');
  const [calendarType, setCalendarType] = useState<CalendarType>('solar');
  const [date, setDate] = useState('1990-10-21');
  const [hour, setHour] = useState(12);
  const [minute, setMinute] = useState(0);
  const [viewingYear, setViewingYear] = useState(new Date().getFullYear());

  return (
    <form
      className="panel panel-pad"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ name, gender, calendarType, date, hour, minute, viewingYear });
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
            onClick={() => setCalendarType('solar')}
          >
            Dương lịch
          </button>
          <button
            type="button"
            data-active={calendarType === 'lunar'}
            onClick={() => setCalendarType('lunar')}
          >
            Âm lịch
          </button>
        </div>
      </div>

      <div className="field">
        <label htmlFor="date">{calendarType === 'solar' ? 'Ngày sinh dương lịch' : 'Ngày sinh âm lịch'}</label>
        <input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
      </div>

      <div className="field">
        <label htmlFor="hour">Giờ sinh</label>
        <select id="hour" value={hour} onChange={(e) => setHour(Number(e.target.value))}>
          {HOURS.map((h) => (
            <option key={h} value={h}>
              {hourLabel(h)}
            </option>
          ))}
        </select>
      </div>

      <div className="row-2">
        <div className="field">
          <label htmlFor="minute">Phút</label>
          <input
            id="minute"
            type="number"
            min={0}
            max={59}
            value={minute}
            onChange={(e) => setMinute(Number(e.target.value))}
          />
        </div>
        <div className="field">
          <label htmlFor="year">Năm xem hạn</label>
          <input
            id="year"
            type="number"
            min={1900}
            max={2200}
            value={viewingYear}
            onChange={(e) => setViewingYear(Number(e.target.value))}
          />
        </div>
      </div>

      <button className="submit" type="submit" disabled={loading}>
        {loading ? 'Đang lập lá số…' : 'Lập lá số & luận giải'}
      </button>

      <p className="hint">
        Lá số được an bằng engine nội bộ (iztro, tiếng Việt), sau đó đối chiếu tự động với bảng lá số của
        tuvi.cohoc.net. Nếu hai bên lệch nhau, hệ thống cảnh báo ngay — thường do giờ sinh hoặc do khác
        phái an sao.
      </p>
    </form>
  );
}
