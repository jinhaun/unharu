(function () {
  'use strict';
  // 여행 일정: date(시작일)부터 endDate(마지막 날)까지 하루하루 이어지는 기록입니다.
  const isDate = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
  const isTrip = (item) => Boolean(item && item.type === 'trip' && isDate(item.date));
  const endOf = (item) => isTrip(item) && isDate(item.endDate) && item.endDate >= item.date ? item.endDate : item?.date || '';
  const covers = (item, key) => isTrip(item) ? item.date <= key && key <= endOf(item) : item?.date === key;
  const overlapsMonth = (item, prefix) => isTrip(item)
    ? item.date.slice(0, 7) <= prefix && prefix <= endOf(item).slice(0, 7)
    : Boolean(item?.date) && item.date.startsWith(prefix);

  function dayCount(item) {
    const start = new Date(`${item.date}T12:00:00`), end = new Date(`${endOf(item)}T12:00:00`);
    return Math.round((end - start) / 86400000) + 1;
  }
  function label(item) {
    const days = dayCount(item);
    return days <= 1 ? '당일' : `${days - 1}박 ${days}일`;
  }
  const shortDate = (key) => `${Number(key.slice(5, 7))}.${Number(key.slice(8, 10))}`;
  function range(item) {
    const end = endOf(item);
    return end === item.date ? shortDate(item.date) : `${shortDate(item.date)}~${shortDate(end)}`;
  }

  // Gives overlapping trips different rows so each bar stays on one line across the week.
  function slots(trips) {
    const ordered = trips.filter(isTrip).sort((a, b) => a.date.localeCompare(b.date) || endOf(b).localeCompare(endOf(a)) || String(a.id).localeCompare(String(b.id)));
    const rowEnds = [];
    const result = new Map();
    for (const trip of ordered) {
      let row = rowEnds.findIndex((end) => end < trip.date);
      if (row < 0) row = rowEnds.length;
      rowEnds[row] = endOf(trip);
      result.set(trip.id, row);
    }
    return result;
  }

  // How the bar piece in one day cell should look. weekday: 0 = Sunday ... 6 = Saturday.
  function segment(item, key, weekday) {
    const first = key === item.date, last = key === endOf(item);
    const left = Math.round((new Date(`${endOf(item)}T12:00:00`) - new Date(`${key}T12:00:00`)) / 86400000) + 1;
    return {
      first,
      last,
      extendLeft: !first && weekday !== 0,
      extendRight: !last && weekday !== 6,
      showTitle: first || weekday === 0,
      // Number of day cells this bar covers from here to the end of the week row.
      span: Math.max(1, Math.min(left, 7 - weekday))
    };
  }

  window.DAYFLOW_TRIP = Object.freeze({ isTrip, endOf, covers, overlapsMonth, dayCount, label, range, slots, segment });
})();
