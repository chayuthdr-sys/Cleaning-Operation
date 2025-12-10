/**
 * Code.gs (Fixed: Date Parsing Issue & Users-based Shift)
 */

// --- 1. CONFIGURATION ---
const CONSTANTS = {
  SPREADSHEET_ID: '1Dik3JJzJrqoQdal_ytjADDxsdqgnomQaCx5NGaAfXxE', 
  FOLDER_ID: '11AetQBzDhQDvjnNwBy1c8gEkd5nT0C-s' 
};

// --- 2. ROUTING ---
function doGet(e) {
  let userEmail = "unknown";
  try { userEmail = Session.getActiveUser().getEmail(); } catch(e) {}
  
  const role = getUserRole(userEmail);

  let templateName = 'error';
  if (role === 'Worker') templateName = 'worker';
  else if (role === 'Manager' || role === 'QA') templateName = 'dashboard';
  else if (role === 'Staff') templateName = 'staff'; 
  else return HtmlService.createHtmlOutput(`<div style="text-align:center;margin-top:50px;"><h3>⛔ Access Denied</h3><p>${userEmail} ไม่มีสิทธิ์ใช้งาน</p></div>`);

  return HtmlService.createTemplateFromFile(templateName)
    .evaluate()
    .setTitle('Cleaning Operation App')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// --- 3. UTILITY & CORE LOGIC ---

// [NEW] ฟังก์ชันแปลงวันที่ รองรับทั้งแบบสากล และแบบ DD/MM/YYYY (ไทย/UK)
function parseDate(dateStr) {
  if (!dateStr) return null;
  
  // 1. ลองแปลงแบบปกติ (Standard JS Date)
  let d = new Date(dateStr);
  if (!isNaN(d.getTime())) return d;
  
  // 2. ถ้าไม่ได้ ลองแปลงแบบ Custom (DD/MM/YYYY HH:mm:ss)
  try {
    // แยกวันที่กับเวลา (รองรับการคั่นด้วย space หรือ comma)
    let parts = String(dateStr).trim().split(/[\s,]+/); 
    let datePart = parts[0]; 
    let timePart = parts.length > 1 ? parts[parts.length - 1] : '00:00:00'; // เอาส่วนสุดท้ายเป็นเวลา
    
    // แยกวัน/เดือน/ปี
    let dParts = datePart.split('/'); // คาดว่าเป็น 24/11/2025
    if (dParts.length === 3) {
      // สร้าง ISO String: YYYY-MM-DDTHH:mm:ss
      // dParts[0]=Day, dParts[1]=Month, dParts[2]=Year
      let iso = `${dParts[2]}-${dParts[1].padStart(2,'0')}-${dParts[0].padStart(2,'0')}T${timePart}`;
      let d2 = new Date(iso);
      if (!isNaN(d2.getTime())) return d2;
    }
  } catch (e) { console.error("Parse Error: " + dateStr); }
  
  return null; // ยอมแพ้ แปลงไม่ได้
}

function getUserShiftMap() {
  const ss = SpreadsheetApp.openById(CONSTANTS.SPREADSHEET_ID);
  const data = ss.getSheetByName('Users').getDataRange().getValues();
  const map = {};
  const shifts = new Set();
  
  for (let i = 1; i < data.length; i++) {
    const email = String(data[i][0]).trim().toLowerCase();
    const shift = String(data[i][5] || 'General'); // Column F (Index 5)
    map[email] = shift;
    if(shift && shift !== '-') shifts.add(shift);
  }
  return { map: map, uniqueShifts: Array.from(shifts).sort() };
}

function getUserRole(email) {
  try {
    const ss = SpreadsheetApp.openById(CONSTANTS.SPREADSHEET_ID);
    const data = ss.getSheetByName('Users').getDataRange().getValues();
    const targetEmail = String(email).trim().toLowerCase();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim().toLowerCase() === targetEmail) {
        return data[i][1]; 
      }
    }
  } catch (e) { console.error(e); }
  return null;
}

function getUserDetails(email) {
  const ss = SpreadsheetApp.openById(CONSTANTS.SPREADSHEET_ID);
  const data = ss.getSheetByName('Users').getDataRange().getValues();
  let info = { name: 'Unknown', position: 'Unknown', dept: 'All', shift: '-' };
  
  const targetEmail = String(email).trim().toLowerCase();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim().toLowerCase() === targetEmail) {
      info = { 
        name: data[i][2] || 'Unknown', 
        position: data[i][3] || 'Unknown', 
        dept: data[i][4] || 'All',
        shift: data[i][5] || '-'
      };
      break;
    }
  }
  return info;
}

function getShiftDate(dateObj) {
  let d = new Date(dateObj);
  const CUTOFF_HOUR = 6; 
  if (d.getHours() < CUTOFF_HOUR) {
    d.setDate(d.getDate() - 1);
  }
  return Utilities.formatDate(d, "GMT+7", "yyyy-MM-dd");
}

// --- 4. WORKER & STAFF LOGIC ---
function getStandardsData() {
  try {
    const userEmail = Session.getActiveUser().getEmail();
    const userInfo = getUserDetails(userEmail);
    const userDept = userInfo.dept;
    const userShift = userInfo.shift; 

    const ss = SpreadsheetApp.openById(CONSTANTS.SPREADSHEET_ID);
    const stdSheet = ss.getSheetByName('Standards');
    const stdData = stdSheet.getDataRange().getValues();
    stdData.shift(); 

    const currentShiftDate = getShiftDate(new Date()); 
    const userMapData = getUserShiftMap(); 
    const shiftMap = userMapData.map;

    // 1. Worker Logs
    const logSheet = ss.getSheetByName('Logs');
    const doneSet = new Set();
    if (logSheet) {
      const logData = logSheet.getDataRange().getDisplayValues();
      for (let i = 1; i < logData.length; i++) {
        const row = logData[i];
        if (!row[0]) continue;
        try {
          let logTimestamp = parseDate(row[0]); // [FIX] ใช้ parseDate
          if (!logTimestamp) continue;
          
          let logShiftDate = getShiftDate(logTimestamp);
          let workerEmail = String(row[3]).trim().toLowerCase();
          let workerShift = shiftMap[workerEmail] || 'General';

          if (logShiftDate === currentShiftDate && workerShift === userShift && row[1]) {
             doneSet.add(String(row[1]));
          }
        } catch(e) {}
      }
    }

    // 2. Staff Logs
    let staffSheet = ss.getSheetByName('StaffLogs');
    if (!staffSheet) {
       staffSheet = ss.insertSheet('StaffLogs');
       staffSheet.appendRow(['Timestamp', 'TaskID', 'Location', 'Department', 'StaffEmail']);
    }

    const staffReadySet = new Set();
    const sData = staffSheet.getDataRange().getValues();
    for (let i = 1; i < sData.length; i++) {
       try {
         // StaffLogs ใช้ getValues (Object) ปกติ Google Sheet จะส่งมาเป็น Date Object อยู่แล้ว
         let d = sData[i][0];
         // แต่กันเหนียว ถ้าเป็น String ให้ parse
         if (!(d instanceof Date)) d = parseDate(d);
         
         if (d) {
            let sDate = getShiftDate(d);
            let staffEmail = String(sData[i][4]).trim().toLowerCase();
            let staffShift = shiftMap[staffEmail] || 'General';

            if (sDate === currentShiftDate && staffShift === userShift) {
               staffReadySet.add(String(sData[i][1]));
            }
         }
       } catch(e) {}
    }

    const tasks = [];
    const cleanUserDept = String(userDept).trim();

    for (let i = 0; i < stdData.length; i++) {
      const row = stdData[i];
      const tID = String(row[0]);
      const rowDept = String(row[4] || '').trim();
      
      if (cleanUserDept === 'All' || cleanUserDept === rowDept) {
        tasks.push({
          taskID: tID,
          location: String(row[1]),
          desc: String(row[2]),
          stdImg: String(row[3]),
          department: rowDept,
          isDone: doneSet.has(tID),
          isStaffReady: staffReadySet.has(tID) 
        });
      }
    }
    return tasks;

  } catch (err) { throw new Error("Server Error: " + err.toString()); }
}

function saveLog(data) {
  try {
    const ss = SpreadsheetApp.openById(CONSTANTS.SPREADSHEET_ID);
    const logSheet = ss.getSheetByName('Logs');
    const userEmail = Session.getActiveUser().getEmail();
    const workerInfo = getUserDetails(userEmail);

    const imageData = data.imageBase64.split(',')[1]; 
    const blob = Utilities.newBlob(Utilities.base64Decode(imageData), 'image/jpeg', `Log_${data.taskID}.jpg`);
    const file = DriveApp.getFolderById(CONSTANTS.FOLDER_ID).createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    logSheet.appendRow([new Date(), data.taskID, file.getUrl(), userEmail, 'Submitted', data.department, workerInfo.name, workerInfo.position, '']);
    return { success: true };
  } catch (e) { return { success: false, message: e.toString() }; }
}

function saveStaffLog(taskID, location, dept) {
  try {
    const ss = SpreadsheetApp.openById(CONSTANTS.SPREADSHEET_ID);
    let sheet = ss.getSheetByName('StaffLogs');
    if (!sheet) {
       sheet = ss.insertSheet('StaffLogs');
       sheet.appendRow(['Timestamp', 'TaskID', 'Location', 'Department', 'StaffEmail']);
    }
    const userEmail = Session.getActiveUser().getEmail();
    sheet.appendRow([new Date(), taskID, location, dept, userEmail]);
    return { success: true };
  } catch(e) { return { success: false, message: e.toString() }; }
}

// --- 5. DASHBOARD FUNCTIONS ---

function getAllShifts() {
  return getUserShiftMap().uniqueShifts;
}

function getAllDepartments() {
  const ss = SpreadsheetApp.openById(CONSTANTS.SPREADSHEET_ID);
  const data = ss.getSheetByName('Standards').getDataRange().getValues();
  data.shift();
  const depts = new Set();
  data.forEach(row => { if(row[4]) depts.add(String(row[4]).trim()); });
  return Array.from(depts).sort();
}

function getDashboardData(filterDate, filterDept, filterShift) { 
  const userEmail = Session.getActiveUser().getEmail();
  const role = getUserRole(userEmail);
  const userInfo = getUserDetails(userEmail);
  const userDept = userInfo.dept;

  const ss = SpreadsheetApp.openById(CONSTANTS.SPREADSHEET_ID);
  const userMapData = getUserShiftMap();
  const shiftMap = userMapData.map;

  // Prepare Standards
  const stdData = ss.getSheetByName('Standards').getDataRange().getValues();
  const stdMap = {}; 
  const locMap = {}; 
  for(let i=1; i<stdData.length; i++) {
    stdMap[stdData[i][0]] = stdData[i][3];
    locMap[stdData[i][0]] = stdData[i][1];
  }

  // Prepare Staff Logs
  const staffSheet = ss.getSheetByName('StaffLogs');
  const staffLogMap = {}; 
  const targetDateStr = filterDate || getShiftDate(new Date());

  if (staffSheet) {
    const sData = staffSheet.getDataRange().getValues();
    for(let i=1; i<sData.length; i++) {
      let d = sData[i][0];
      if (!(d instanceof Date)) d = parseDate(d); // [FIX]

      if (d) {
         const sDate = getShiftDate(d);
         if (sDate === targetDateStr) {
           const tID = String(sData[i][1]);
           const sEmail = String(sData[i][4]).trim().toLowerCase();
           const sShift = shiftMap[sEmail] || 'General'; 
           
           staffLogMap[`${tID}_${sShift}`] = {
             timeStr: Utilities.formatDate(d, "GMT+7", "HH:mm"),
             fullTime: d,
             user: sData[i][4]
           };
         }
      }
    }
  }

  // Prepare Worker Logs
  const logData = ss.getSheetByName('Logs').getDataRange().getDisplayValues(); 
  logData.shift();
  let result = [];

  for (let i = 0; i < logData.length; i++) {
    const row = logData[i];
    if (!row[0]) continue;
    
    // [FIX] ใช้ parseDate แทน new Date()
    const d = parseDate(row[0]);
    if (!d) continue;

    const rowShiftDate = getShiftDate(d);
    
    const wEmail = String(row[3]).trim().toLowerCase();
    const rowShiftLabel = shiftMap[wEmail] || 'General';

    // Filters
    if (rowShiftDate !== targetDateStr) continue;
    if (filterShift && filterShift !== 'All') {
        if (rowShiftLabel !== filterShift) continue;
    }

    let targetDept = 'All';
    if (role === 'Manager') targetDept = userDept;
    else if (filterDept) targetDept = filterDept;
    
    if (targetDept !== 'All' && String(row[5]||'').trim() !== targetDept) continue;

    result.push({ row: row, dateObj: d, shiftLabel: rowShiftLabel });
  }

  // Monthly Status
  const monthlySheet = ss.getSheetByName('MonthlyApprovals');
  let isApproved = false; let mgrPhoto = '';
  if (monthlySheet && filterDate) {
     const mData = monthlySheet.getDataRange().getValues();
     const sMonth = filterDate.slice(0, 7);
     let mTarget = (role === 'Manager') ? userDept : (filterDept || 'All');
     if(mTarget !== 'All') {
       for(let i=1; i<mData.length; i++) {
         if (String(mData[i][1]).trim() === sMonth && String(mData[i][2]).trim() === mTarget) {
            isApproved = true; mgrPhoto = mData[i][4]; break;
         }
       }
     }
  }

  const rows = result.map((item) => {
    const row = item.row;
    const workerDateObj = item.dateObj;
    const shiftLabel = item.shiftLabel;
    const taskID = row[1];
    
    const staffInfo = staffLogMap[`${taskID}_${shiftLabel}`] || null;

    let comparison = 'N/A';
    if (staffInfo) {
       if (staffInfo.fullTime < workerDateObj) comparison = 'OK';
       else comparison = 'Late';
    } else {
       comparison = 'Missing';
    }

    return {
      timestamp: row[0], 
      timeOnly: Utilities.formatDate(workerDateObj, "GMT+7", "HH:mm"),
      shiftLabel: shiftLabel,
      taskID: taskID, 
      photoUrl: row[2], 
      worker: row[3], 
      status: row[4], 
      dept: row[5], 
      name: row[6], 
      position: row[7], 
      stdImg: stdMap[taskID] || '',
      location: locMap[taskID] || '-',
      staffTime: staffInfo ? staffInfo.timeStr : '-',
      staffUser: staffInfo ? staffInfo.user : '-',
      consistency: comparison
    };
  }).reverse();

  return { rows: rows, viewerRole: role, viewerDept: userDept, monthlyStatus: { isApproved: isApproved, mgrPhoto: mgrPhoto } };
}

function getMissingReport(checkDate, checkShift) { 
  const ss = SpreadsheetApp.openById(CONSTANTS.SPREADSHEET_ID);
  const stdData = ss.getSheetByName('Standards').getDataRange().getValues();
  stdData.shift();
  const logs = ss.getSheetByName('Logs').getDataRange().getValues();

  const userMapData = getUserShiftMap();
  const shiftMap = userMapData.map;
  
  let targetDate = checkDate;
  if (!targetDate) {
    const y = new Date(); 
    y.setDate(y.getDate() - 1);
    targetDate = getShiftDate(y);
  }
  
  const doneSet = new Set();
  
  for(let i=1; i<logs.length; i++) {
    // [FIX] ใช้ parseDate
    let d = parseDate(logs[i][0]);
    
    if (d) {
       if(getShiftDate(d) === targetDate) {
         const wEmail = String(logs[i][3]).trim().toLowerCase();
         const wShift = shiftMap[wEmail] || 'General';

         if (!checkShift || checkShift === 'All' || wShift === checkShift) {
            doneSet.add(String(logs[i][1]));
         }
       }
    }
  }

  const missing = [];
  stdData.forEach(row => {
    if (!doneSet.has(String(row[0]))) {
      missing.push({ 
        taskID: row[0], 
        location: row[1], 
        dept: row[4],
        shift: checkShift === 'All' ? 'ทุกกะ' : checkShift
      });
    }
  });
  
  return { missingList: missing, checkedDate: targetDate, checkedShift: checkShift };
}

function approveMonthly(data) {
  try {
    const ss = SpreadsheetApp.openById(CONSTANTS.SPREADSHEET_ID);
    const sheet = ss.getSheetByName('MonthlyApprovals');
    const blob = Utilities.newBlob(Utilities.base64Decode(data.imageBase64.split(',')[1]), 'image/jpeg', 'MonthApprove.jpg');
    const file = DriveApp.getFolderById(CONSTANTS.FOLDER_ID).createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    sheet.appendRow([new Date(), data.month, data.dept, Session.getActiveUser().getEmail(), file.getUrl(), 'Approved']);
    return { success: true };
  } catch (e) { return { success: false, message: e.toString() }; }
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu('🔧 Admin Tools')
    .addItem('🔄 รีเซ็ตระบบ (Clear Cache)', 'resetSystemVersion').addToUi();
}
function resetSystemVersion() {
  PropertiesService.getScriptProperties().setProperty('DATA_VERSION', new Date().getTime().toString());
  SpreadsheetApp.getUi().alert('✅ รีเซ็ตเรียบร้อย');
}
