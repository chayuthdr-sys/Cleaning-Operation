/**
 * Code.gs (Updated: Add Location Name to Dashboard)
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
  else return HtmlService.createHtmlOutput(`<div style="text-align:center;margin-top:50px;"><h3>⛔ Access Denied</h3><p>${userEmail} ไม่มีสิทธิ์ใช้งาน</p></div>`);

  return HtmlService.createTemplateFromFile(templateName)
    .evaluate()
    .setTitle('Cleaning Operation App')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// --- 3. CORE LOGIC ---

// --- 3. CORE LOGIC (แก้ไขให้รองรับช่องว่างและตัวพิมพ์เล็กใหญ่) ---

function getUserRole(email) {
  try {
    const ss = SpreadsheetApp.openById(CONSTANTS.SPREADSHEET_ID);
    const data = ss.getSheetByName('Users').getDataRange().getValues();
    
    // แปลง email คนล็อกอินให้เป็นตัวเล็กและตัดช่องว่าง
    const targetEmail = String(email).trim().toLowerCase(); 

    for (let i = 1; i < data.length; i++) {
      // แปลง email ใน Sheet ให้เป็นแบบเดียวกันก่อนเทียบ
      const sheetEmail = String(data[i][0]).trim().toLowerCase();
      
      if (sheetEmail === targetEmail) {
        return data[i][1]; // เจอแล้ว! ส่ง Role กลับไป
      }
    }
  } catch (e) { console.error("Error getting role: " + e); }
  return null;
}

function getUserDetails(email) {
  const ss = SpreadsheetApp.openById(CONSTANTS.SPREADSHEET_ID);
  const data = ss.getSheetByName('Users').getDataRange().getValues();
  let info = { name: 'Unknown', position: 'Unknown', dept: 'All' };
  
  const targetEmail = String(email).trim().toLowerCase();

  for (let i = 1; i < data.length; i++) {
    const sheetEmail = String(data[i][0]).trim().toLowerCase();
    
    if (sheetEmail === targetEmail) {
      info = { 
        name: data[i][2] || 'Unknown', 
        position: data[i][3] || 'Unknown', 
        dept: data[i][4] || 'All' 
      };
      break;
    }
  }
  return info;
}
  

// --- 4. WORKER LOGIC ---
function getStandardsData() {
  try {
    const userEmail = Session.getActiveUser().getEmail();
    const userInfo = getUserDetails(userEmail);
    const userDept = userInfo.dept;

    const ss = SpreadsheetApp.openById(CONSTANTS.SPREADSHEET_ID);
    const stdSheet = ss.getSheetByName('Standards');
    if (!stdSheet) throw new Error("ไม่พบ Sheet Standards");
    const stdData = stdSheet.getDataRange().getValues();
    stdData.shift(); 

    const logSheet = ss.getSheetByName('Logs');
    const doneSet = new Set();
    
    if (logSheet) {
      const logData = logSheet.getDataRange().getDisplayValues();
      const todayStr = Utilities.formatDate(new Date(), "GMT+7", "yyyy-MM-dd");

      for (let i = 1; i < logData.length; i++) {
        const row = logData[i];
        if (!row[0]) continue;
        try {
          let dPart = row[0].split(',')[0].trim().split(' ')[0];
          let parts = dPart.split('/');
          let logDate = (parts.length === 3) 
            ? `${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}` 
            : Utilities.formatDate(new Date(row[0]), "GMT+7", "yyyy-MM-dd");

          if (logDate === todayStr && row[1]) {
             doneSet.add(String(row[1]));
          }
        } catch(e) {}
      }
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
          isDone: doneSet.has(tID)
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

// --- 5. DASHBOARD FUNCTIONS ---
function getAllDepartments() {
  const ss = SpreadsheetApp.openById(CONSTANTS.SPREADSHEET_ID);
  const data = ss.getSheetByName('Standards').getDataRange().getValues();
  data.shift(); 
  const depts = new Set();
  data.forEach(row => { if(row[4]) depts.add(String(row[4]).trim()); });
  return Array.from(depts).sort();
}

function getDashboardData(filterDate, filterDept) {
  const userEmail = Session.getActiveUser().getEmail();
  const role = getUserRole(userEmail);
  const userInfo = getUserDetails(userEmail);
  const userDept = userInfo.dept;

  const ss = SpreadsheetApp.openById(CONSTANTS.SPREADSHEET_ID);
  const stdData = ss.getSheetByName('Standards').getDataRange().getValues();
  
  // [NEW] สร้าง Map สำหรับดึงชื่อจุด (Location) และ รูปตัวอย่าง (StdImg)
  const stdMap = {}; // TaskID -> ImgURL
  const locMap = {}; // TaskID -> LocationName
  for(let i=1; i<stdData.length; i++) {
    stdMap[stdData[i][0]] = stdData[i][3];
    locMap[stdData[i][0]] = stdData[i][1]; // Col 1 = LocationName
  }

  const logData = ss.getSheetByName('Logs').getDataRange().getDisplayValues();
  logData.shift();
  let result = logData;

  // 1. Filter Date
  if (filterDate) {
    result = result.filter(row => {
      if (!row[0]) return false;
      try {
        let dPart = row[0].split(',')[0].trim().split(' ')[0];
        let parts = dPart.split('/');
        let rDate = (parts.length===3) ? `${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}` : Utilities.formatDate(new Date(row[0]), "GMT+7", "yyyy-MM-dd");
        return rDate === filterDate;
      } catch(e) { return false; }
    });
  }

  // 2. Filter Dept
  let target = 'All';
  if (role === 'Manager') target = userDept;
  else if (filterDept) target = filterDept;
  
  const cleanTarget = String(target || 'All').trim();
  if (cleanTarget !== 'All') {
    result = result.filter(row => String(row[5]||'').trim() === cleanTarget);
  }

  // 3. Monthly Status
  const monthlySheet = ss.getSheetByName('MonthlyApprovals');
  let isApproved = false; let mgrPhoto = '';
  if (monthlySheet && filterDate) {
     const mData = monthlySheet.getDataRange().getValues();
     const sMonth = filterDate.slice(0, 7);
     if (cleanTarget !== 'All') {
       for(let i=1; i<mData.length; i++) {
         if (String(mData[i][1]).trim() === sMonth && String(mData[i][2]).trim() === cleanTarget) {
            isApproved = true; mgrPhoto = mData[i][4]; break;
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
    stdImg: stdMap[row[1]] || '',
    location: locMap[row[1]] || '-' // [NEW] เพิ่มส่งชื่อจุดไปด้วย
  })).reverse();

  return { rows: rows, viewerRole: role, viewerDept: userDept, monthlyStatus: { isApproved: isApproved, mgrPhoto: mgrPhoto } };
}

function getMissingReport(checkDate) {
  const ss = SpreadsheetApp.openById(CONSTANTS.SPREADSHEET_ID);
  const stdData = ss.getSheetByName('Standards').getDataRange().getValues();
  stdData.shift();
  const logs = ss.getSheetByName('Logs').getDataRange().getValues();
  
  let targetDate = checkDate;
  if (!targetDate) {
    const y = new Date(); y.setDate(y.getDate() - 1);
    targetDate = Utilities.formatDate(y, "GMT+7", "yyyy-MM-dd");
  }
  
  const doneSet = new Set();
  for(let i=1; i<logs.length; i++) {
    let d = new Date(logs[i][0]);
    if (!isNaN(d.getTime())) {
       if(Utilities.formatDate(d, "GMT+7", "yyyy-MM-dd") === targetDate) doneSet.add(String(logs[i][1]));
    }
  }

  const missing = [];
  stdData.forEach(row => {
    if (!doneSet.has(String(row[0]))) missing.push({ taskID: row[0], location: row[1], dept: row[4] });
  });
  return { missingList: missing, checkedDate: targetDate };
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

// --- ADMIN TOOLS ---
function onOpen() {
  SpreadsheetApp.getUi().createMenu('🔧 Admin Tools')
    .addItem('🔄 รีเซ็ตระบบ (Clear Cache)', 'resetSystemVersion').addToUi();
}
function resetSystemVersion() {
  PropertiesService.getScriptProperties().setProperty('DATA_VERSION', new Date().getTime().toString());
  SpreadsheetApp.getUi().alert('✅ รีเซ็ตเรียบร้อย');
}
