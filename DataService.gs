/**
 * DataService.gs
 */

const DataService = {
  
  _getSysVer: function() {
    return PropertiesService.getScriptProperties().getProperty('DATA_VERSION') || 'v1';
  },

  // --- User & Role ---
  getUserRole: function(email) {
    const cache = CacheService.getScriptCache();
    const key = `Role_${email}_${this._getSysVer()}`;
    const cached = cache.get(key);
    if (cached) return cached;

    const ss = SpreadsheetApp.openById(CONSTANTS.SPREADSHEET_ID);
    const data = ss.getSheetByName('Users').getDataRange().getValues();
    let role = null;
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === email) { role = data[i][1]; break; }
    }
    if (role) cache.put(key, role, 21600);
    return role;
  },

  getUserDetails: function(email) {
    const cache = CacheService.getScriptCache();
    const key = `Info_${email}_${this._getSysVer()}`;
    const cached = cache.get(key);
    if (cached) return JSON.parse(cached);

    const ss = SpreadsheetApp.openById(CONSTANTS.SPREADSHEET_ID);
    const data = ss.getSheetByName('Users').getDataRange().getValues();
    let info = { name: 'Unknown', position: 'Unknown', dept: 'All' };
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === email) {
        info = { 
          name: data[i][2] || 'Unknown', 
          position: data[i][3] || 'Unknown',
          dept: data[i][4] || 'All'
        };
        break;
      }
    }
    cache.put(key, JSON.stringify(info), 21600);
    return info;
  },

  getAllDepartments: function() {
    const ss = SpreadsheetApp.openById(CONSTANTS.SPREADSHEET_ID);
    const sheet = ss.getSheetByName('Standards');
    const data = sheet.getDataRange().getValues();
    data.shift(); 
    const depts = new Set();
    data.forEach(row => { if(row[4]) depts.add(row[4].toString().trim()); });
    return Array.from(depts).sort();
  },

  // --- WORKER LOGIC (Robust Version) ---
  getStandardsData: function() {
    try {
      const userEmail = Session.getActiveUser().getEmail();
      const userInfo = this.getUserDetails(userEmail);
      const userDept = userInfo.dept;

      const ss = SpreadsheetApp.openById(CONSTANTS.SPREADSHEET_ID);
      const stdData = ss.getSheetByName('Standards').getDataRange().getValues();
      stdData.shift();

      // ใช้ DisplayValues เพื่ออ่านวันที่เป็น Text (กัน Error)
      const logs = ss.getSheetByName('Logs').getDataRange().getDisplayValues();
      const todayStr = Utilities.formatDate(new Date(), "GMT+7", "yyyy-MM-dd");
      const doneTasks = new Set();

      for(let i=1; i<logs.length; i++) {
        const row = logs[i];
        if (!row[0]) continue;

        try {
          // Logic แปลงวันที่ (รองรับทั้งไทยและสากล)
          let dateStr = row[0].split(',')[0].trim().split(' ')[0];
          let parts = dateStr.split('/');
          let logDate;
          
          if (parts.length === 3) {
            // DD/MM/YYYY
            logDate = `${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`;
          } else {
             // Standard Date
             let d = new Date(row[0]);
             if (!isNaN(d.getTime())) logDate = Utilities.formatDate(d, "GMT+7", "yyyy-MM-dd");
          }

          if (logDate === todayStr && row[1]) {
             doneTasks.add(String(row[1]));
          }
        } catch (e) {
          console.error("Date Parse Error:", row[0]);
          continue; 
        }
      }

      // Filter Dept
      let filteredStd = stdData;
      if (userDept && userDept !== 'All') {
        filteredStd = stdData.filter(row => String(row[4] || '').trim() === String(userDept).trim());
      }

      return filteredStd.map(row => ({
        taskID: String(row[0]),
        location: String(row[1]),
        desc: String(row[2]),
        stdImg: String(row[3]),
        department: String(row[4]),
        isDone: doneTasks.has(String(row[0]))
      }));

    } catch (err) {
      throw new Error("Server Error: " + err.message);
    }
  },

  // --- DASHBOARD LOGIC ---
  getDashboardData: function(filterDate, filterDept) {
    const userEmail = Session.getActiveUser().getEmail();
    const role = this.getUserRole(userEmail);
    const userInfo = this.getUserDetails(userEmail);
    const userDept = userInfo.dept;

    const ss = SpreadsheetApp.openById(CONSTANTS.SPREADSHEET_ID);
    
    const stdData = ss.getSheetByName('Standards').getDataRange().getValues();
    const stdMap = {};
    for(let i=1; i<stdData.length; i++) stdMap[stdData[i][0]] = stdData[i][3];

    const logData = ss.getSheetByName('Logs').getDataRange().getDisplayValues();
    logData.shift();

    let result = logData;
    
    // 1. Filter Date
    if (filterDate) {
      result = result.filter(row => {
        if (!row[0]) return false;
        try {
          let dateStr = row[0].split(',')[0].trim().split(' ')[0]; 
          let parts = dateStr.split('/');
          let rowDateFormatted;
          if (parts.length === 3) {
            rowDateFormatted = `${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`;
          } else {
             let d = new Date(row[0]);
             rowDateFormatted = Utilities.formatDate(d, "GMT+7", "yyyy-MM-dd");
          }
          return rowDateFormatted === filterDate;
        } catch (e) { return false; }
      });
    }

    // 2. Filter Dept
    let targetDept = 'All';
    if (role === 'Manager') targetDept = userDept;
    else if (filterDept) targetDept = filterDept;

    if (targetDept && String(targetDept).toUpperCase() !== 'ALL') {
      result = result.filter(row => {
        const rowDept = String(row[5] || '').trim();
        const filterVal = String(targetDept).trim();
        return rowDept === filterVal;
      });
    }

    // 3. Monthly Status
    const monthlySheet = ss.getSheetByName('MonthlyApprovals');
    let isMonthlyApproved = false;
    let mgrPhoto = '';
    
    if (monthlySheet && filterDate) {
       const selectedMonth = filterDate.substring(0, 7); 
       const mData = monthlySheet.getDataRange().getValues();
       
       // เช็ค Status เฉพาะแผนกที่กำลังดู (ถ้าเป็น All จะไม่เช็ค)
       // หรือถ้า Manager ดูของตัวเองก็เช็คได้
       let checkDept = targetDept;
       if (targetDept === 'All' && role === 'Manager') checkDept = userDept;

       if (checkDept && checkDept !== 'All') {
         for(let i=1; i<mData.length; i++) {
           const rowMonth = String(mData[i][1]).trim();
           const rowDept = String(mData[i][2]).trim();
           if (rowMonth === selectedMonth && rowDept === String(checkDept).trim()) {
              isMonthlyApproved = true;
              mgrPhoto = mData[i][4];
              break; 
           }
         }
       }
    }

    const rows = result.map((row, index) => ({
      timestamp: row[0],
      taskID: row[1],
      photoUrl: row[2],
      worker: row[3],
      status: row[4],
      dept: row[5],
      name: row[6],
      position: row[7],
      stdImg: stdMap[row[1]] || ''
    })).reverse();

    return {
      rows: rows,
      viewerRole: role,
      viewerDept: userDept,
      monthlyStatus: { isApproved: isMonthlyApproved, mgrPhoto: mgrPhoto }
    };
  },

  getMissingReport: function(checkDate) {
    const ss = SpreadsheetApp.openById(CONSTANTS.SPREADSHEET_ID);
    const stdData = ss.getSheetByName('Standards').getDataRange().getValues();
    stdData.shift();
    const logs = ss.getSheetByName('Logs').getDataRange().getValues();
    
    let targetDate = checkDate;
    if (!targetDate) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      targetDate = Utilities.formatDate(yesterday, "GMT+7", "yyyy-MM-dd");
    }
    
    const doneSet = new Set();
    for(let i=1; i<logs.length; i++) {
      const d = Utilities.formatDate(new Date(logs[i][0]), "GMT+7", "yyyy-MM-dd");
      if(d === targetDate) doneSet.add(String(logs[i][1]));
    }

    const missing = [];
    stdData.forEach(row => {
      const tid = String(row[0]);
      if (!doneSet.has(tid)) missing.push({ taskID: tid, location: row[1], dept: row[4] });
    });
    return { missingList: missing, checkedDate: targetDate }; 
  }
};
