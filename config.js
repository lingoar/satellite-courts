// Which sheet to read, and which tabs. Add a tab here when the city adds a site:
// the gid is the number after "gid=" in the tab's URL. lights: true marks courts lit for night play.
// School courts are open to the public only when school is not in session.
// Hours are minutes after midnight; days are 0 = Monday … 4 = Friday.
// Update both blocks each school year from the linked bell schedules and calendars.

// Fremont High: https://fhs.fuhsd.org/about-us/general-information/bell-schedule
// Calendar: https://www.fuhsd.org/about-us/general-information/calendar
const FREMONT_HIGH_2026_27 = {
  first: '2026-08-17',
  last: '2027-06-03',
  hours: [
    { days: [0, 1, 3], start: 8 * 60 + 30, end: 15 * 60 + 50 },
    { days: [2, 4], start: 8 * 60 + 30, end: 15 * 60 + 5 },
  ],
  off: [
    ['2026-09-07'], ['2026-10-12'], ['2026-11-11'], ['2026-11-25', '2026-11-27'],
    ['2026-12-21', '2027-01-01'], ['2027-01-18'], ['2027-02-15', '2027-02-19'],
    ['2027-03-15'], ['2027-04-12', '2027-04-16'], ['2027-05-31'],
  ],
};

// Sunnyvale Middle: https://www.sesd.org/about-usnew/departments/teaching-and-learning-department/instruction/bell-schedule
// Calendar: https://www.sesd.org/about-usnew/calendar-81
const SUNNYVALE_MIDDLE_2026_27 = {
  first: '2026-08-17',
  last: '2027-06-09',
  hours: [
    { days: [0, 1, 2, 3, 4], start: 8 * 60 + 25, end: 15 * 60 + 10 },
    // From the notice on the sheet's own tab.
    { days: [0], start: 15 * 60 + 15, end: 16 * 60 + 30, from: '2026-09-21', label: 'School tennis club' },
  ],
  off: [
    ['2026-09-07'], ['2026-10-12'], ['2026-11-11'], ['2026-11-23', '2026-11-27'],
    ['2026-12-21', '2027-01-01'], ['2027-01-18', '2027-01-19'], ['2027-02-15', '2027-02-19'],
    ['2027-03-15'], ['2027-04-12', '2027-04-16'], ['2027-05-31'],
  ],
};

const COURTS_CONFIG = {
  sheetId: '1zpnq9KvS73oZ8SK1JbUaBuK9u9nv_3NArXW1Hy7Pkzs',
  city: 'Sunnyvale, CA',
  timeZone: 'America/Los_Angeles',
  refreshMinutes: 5,
  tabs: [
    { gid: '577575228', name: 'Columbia Park', lights: true },
    { gid: '447685095', name: 'Orchard Gardens' },
    { gid: '0', name: 'Fremont High School', lights: true, school: FREMONT_HIGH_2026_27 },
    { gid: '377964083', name: 'Sunnyvale Middle School', lights: true, school: SUNNYVALE_MIDDLE_2026_27 },
    { gid: '507680901', name: 'Serra Park', lights: true },
    { gid: '1205469322', name: 'Ortega Park', lights: true },
    { gid: '1684496093', name: 'Ponderosa Park', lights: true },
    { gid: '1142405317', name: 'Washington Park', lights: true },
    { gid: '387222631', name: 'Braly Park', lights: true },
    { gid: '1847099568', name: 'Encinal Park', lights: true },
    { gid: '375641675', name: 'Lakewood Park', lights: true },
    { gid: '972547779', name: 'Fairwood Park', lights: true },
    { gid: '1660808941', name: 'Seven Seas' },
  ],
};

if (typeof module === 'object' && module.exports) module.exports = COURTS_CONFIG;
