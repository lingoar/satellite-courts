// Which sheet to read, and which tabs. Add a tab here when the city adds a site:
// the gid is the number after "gid=" in the tab's URL. lights: true marks courts lit for night play.
const COURTS_CONFIG = {
  sheetId: '1zpnq9KvS73oZ8SK1JbUaBuK9u9nv_3NArXW1Hy7Pkzs',
  city: 'Sunnyvale, CA',
  timeZone: 'America/Los_Angeles',
  refreshMinutes: 5,
  tabs: [
    { gid: '0', name: 'Fremont High School', lights: true },
    { gid: '377964083', name: 'Sunnyvale Middle School', lights: true },
    { gid: '507680901', name: 'Serra Park', lights: true },
    { gid: '1205469322', name: 'Ortega Park', lights: true },
    { gid: '1684496093', name: 'Ponderosa Park', lights: true },
    { gid: '1142405317', name: 'Washington Park', lights: true },
    { gid: '387222631', name: 'Braly Park', lights: true },
    { gid: '1847099568', name: 'Encinal Park', lights: true },
    { gid: '447685095', name: 'Orchard Gardens' },
    { gid: '577575228', name: 'Columbia Park', lights: true },
    { gid: '375641675', name: 'Lakewood Park', lights: true },
    { gid: '972547779', name: 'Fairwood Park', lights: true },
    { gid: '1660808941', name: 'Seven Seas' },
  ],
};

if (typeof module === 'object' && module.exports) module.exports = COURTS_CONFIG;
