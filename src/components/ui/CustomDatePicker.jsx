import { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';

export default function CustomDatePicker({
  value,
  onChange,
  className
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [placement, setPlacement] = useState('bottom');
  const [popupStyle, setPopupStyle] = useState({});
  const [currentMonth, setCurrentMonth] = useState(() => {
    return value ? new Date(value) : new Date();
  });
  const wrapperRef = useRef(null);
  const popupRef = useRef(null);
  
  useEffect(() => {
    if (value) setCurrentMonth(new Date(value));
  }, [value]);

  useEffect(() => {
    const handleClickOutside = e => {
      if (wrapperRef.current && wrapperRef.current.contains(e.target)) return;
      if (popupRef.current && popupRef.current.contains(e.target)) return;
      setIsOpen(false);
    };
    const handleScroll = () => {
      if (isOpen) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleScroll);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleScroll);
    };
  }, [isOpen]);

  useLayoutEffect(() => {
    if (isOpen && wrapperRef.current) {
      const rect = wrapperRef.current.getBoundingClientRect();
      const popupHeight = 340;
      const popupWidth = 280;
      let newStyle = {
        position: 'fixed',
        width: popupWidth,
        zIndex: 99999
      };

      if (rect.right + popupWidth + 10 <= window.innerWidth) {
        newStyle.left = rect.right + 10;
        setPlacement('right');
      } else if (rect.left - popupWidth - 10 >= 0) {
        newStyle.left = rect.left - popupWidth - 10;
        setPlacement('left');
      } else {
        newStyle.left = rect.left;
        if (rect.bottom + popupHeight > window.innerHeight && rect.top - popupHeight > 0) {
          newStyle.bottom = window.innerHeight - rect.top + 8;
          newStyle.top = 'auto';
          setPlacement('top');
        } else {
          newStyle.top = rect.bottom + 8;
          newStyle.bottom = 'auto';
          setPlacement('bottom');
        }
      }

      if (placement === 'right' || placement === 'left' || newStyle.left !== rect.left) {
        if (rect.top + popupHeight > window.innerHeight) {
          newStyle.bottom = 20;
          newStyle.top = 'auto';
        } else {
          newStyle.top = rect.top;
          newStyle.bottom = 'auto';
        }
      }
      setPopupStyle(newStyle);
    }
  }, [isOpen, placement]);

  const getDaysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (year, month) => new Date(year, month, 1).getDay();
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const dayNames = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
  
  const handlePrevMonth = () => setCurrentMonth(new Date(year, month - 1, 1));
  const handleNextMonth = () => setCurrentMonth(new Date(year, month + 1, 1));
  
  const handleDateClick = day => {
    const selectedDate = new Date(year, month, day);
    const yyyy = selectedDate.getFullYear();
    const mm = String(selectedDate.getMonth() + 1).padStart(2, '0');
    const dd = String(selectedDate.getDate()).padStart(2, '0');
    onChange(`${yyyy}-${mm}-${dd}`);
    setIsOpen(false);
  };
  
  const handleTodayClick = () => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    onChange(`${yyyy}-${mm}-${dd}`);
    setIsOpen(false);
  };
  
  const handleClear = () => {
    onChange('');
    setIsOpen(false);
  };
  
  const selectedDateObj = value ? new Date(value) : null;
  
  return (
    <div className="custom-date-picker-wrapper" ref={wrapperRef}>
      <div 
        className={`custom-date-picker-input ${isOpen ? 'active' : ''} ${className || ''}`}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span>{value || 'Select Date...'}</span>
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
          <line x1="16" y1="2" x2="16" y2="6"></line>
          <line x1="8" y1="2" x2="8" y2="6"></line>
          <line x1="3" y1="10" x2="21" y2="10"></line>
        </svg>
      </div>
      {isOpen && createPortal(
        <div className={`custom-date-picker-popup placement-${placement}`} style={popupStyle} ref={popupRef}>
          <div className="calendar-header">
            <span className="calendar-month-year">{monthNames[month]} {year}</span>
            <div className="calendar-nav">
              <button onClick={handlePrevMonth} type="button">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="15 18 9 12 15 6"></polyline>
                </svg>
              </button>
              <button onClick={handleNextMonth} type="button">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="9 18 15 12 9 6"></polyline>
                </svg>
              </button>
            </div>
          </div>
          <div className="calendar-grid">
            {dayNames.map(day => (
              <div key={day} className="calendar-day-name">{day}</div>
            ))}
            {Array.from({ length: firstDay }).map((_, i) => (
              <div key={`empty-${i}`} className="calendar-day empty"></div>
            ))}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const isSelected = selectedDateObj && 
                                 selectedDateObj.getDate() === day && 
                                 selectedDateObj.getMonth() === month && 
                                 selectedDateObj.getFullYear() === year;
              return (
                <div 
                  key={day} 
                  className={`calendar-day ${isSelected ? 'selected' : ''}`}
                  onClick={() => handleDateClick(day)}
                >
                  {day}
                </div>
              );
            })}
          </div>
          <div className="calendar-footer">
            <button type="button" onClick={handleClear} className="calendar-btn calendar-clear-btn">Clear</button>
            <button type="button" onClick={handleTodayClick} className="calendar-btn calendar-today-btn">Today</button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
