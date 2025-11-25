/**
 * Code.gs (All-in-One Robust Version + Check Done Tasks)
 */

// --- 1. CONFIGURATION ---
const CONSTANTS = {
  SPREADSHEET_ID: '1Dik3JJzJrqoQdal_ytjADDxsdqgnomQaCx5NGaAfXxE', // ตรวจสอบ ID ให้ถูกต้อง
  FOLDER_ID: '11AetQBzDhQDvjnNwBy1c8gEkd5nT0C-s'     // ตรวจสอบ ID ให้ถูกต้อง
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

function getUserRole(email) {
  try {
    const ss = SpreadsheetApp.openById(CONSTANTS.SPREADSHEET_ID);
    const data = ss.getSheetByName('Users').getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === email) return data[i][1];
    }
  } catch (e) { console.error("Error getting role: " + e); }
  return null;
}

function getUserDetails(email) {
  const ss = SpreadsheetApp.openById(CONSTANTS.SPREADSHEET_ID);
  const data = ss.getSheetByName('Users').getDataRange().getValues();
  let info = { name: 'Unknown', position: 'Unknown', dept: 'All' };
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === email) {
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

/**
 * ฟังก์ชันดึงงาน Worker (Update: เพิ่มการเช็คงานที่ทำเสร็จแล้วในวันนี้)
 */
function getStandardsData() {
  try {
    // 1. ดึงข้อมูล User
    const userEmail = Session.getActiveUser().getEmail();
    let userDept = 'All';
    try {
       const uInfo = getUserDetails(userEmail);
       userDept = uInfo.dept || 'All';
    } catch(e) {
       console.warn("User Details Error:", e);
    }

    const ss = SpreadsheetApp.openById(CONSTANTS.SPREADSHEET_ID);

    // --- ส่วนที่เพิ่มใหม่: ตรวจสอบ Logs ของวันนี้ ---
    const logSheet = ss.getSheetByName('Logs');
    const doneSet = new Set(); // เก็บ TaskID ที่ทำเสร็จแล้ว
    
    if (logSheet) {
      const logData = logSheet.getDataRange().getValues();
      // หาวันที่ปัจจุบัน (Timezone ไทย)
      const today = Utilities.formatDate(new Date(), "GMT+7", "yyyy-MM-dd");

      // วนลูปเช็ค Logs (เริ่มแถวที่ 1 เพื่อข้าม Header)
      for (let i = 1; i < logData.length; i++) {
        const row = logData[i];
        const timestamp = row[0];
        const taskID = String(row[1]);
        const workerEmail = String(row[3]);

        // เช็คว่า User ตรงกัน และ วันที่ตรงกัน หรือไม่
        if (workerEmail === userEmail && timestamp) {
          try {
             // แปลง Timestamp ใน Log ให้เป็นวันที่เพื่อเปรียบเทียบ
             const logDate = Utilities.formatDate(new Date(timestamp), "GMT+7", "yyyy-MM-dd");
             if (logDate === today) {
               doneSet.add(taskID);
             }
          } catch (err) {
             // ข้ามกรณี Date format ผิดพลาด
          }
        }
      }
    }
    // ---------------------------------------------

    // 2. ดึงข้อมูล Standards
    const sheet = ss.getSheetByName('Standards');
    if (!sheet) throw new Error("ไม่พบ Sheet Standards");

    const data = sheet.getDataRange().getValues();
    data.shift(); // ตัด Header

    // 3. กรองข้อมูล
    const tasks = [];
    const cleanUserDept = String(userDept).trim();

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const tID = String(row[0]);
      const rowDept = String(row[4] || '').trim(); // Col E: Department

      // เงื่อนไข: ถ้า User เป็น All หรือ แผนกตรงกัน -> ให้แสดง
      if (cleanUserDept === 'All' || cleanUserDept === rowDept) {
        tasks.push({
          taskID: tID,
          location: String(row[1]),
          desc: String(row[2]),
          stdImg: String(row[3]),
          department: rowDept,
          isDone: doneSet.has(tID) // ส่งสถานะว่าเสร็จหรือยังไปด้วย
        });
      }
    }

    console.log(`Worker Load: ${tasks.length} tasks for ${userEmail}`);
    return tasks;
  } catch (err) {
    throw new Error("Server Error: " + err.toString());
  }
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

// --- DASHBOARD FUNCTIONS ---
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
  const stdMap = {};
  for(let i=1; i<stdData.length; i++) stdMap[stdData[i][0]] = stdData[i][3];

  const logData = ss.getSheetByName('Logs').getDataRange().getDisplayValues();
  logData.shift();
  
  let result = logData;
  // Filter Date
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

  // Filter Dept
  let target = 'All';
  if (role === 'Manager') target = userDept;
  else if (filterDept) target = filterDept;
  
  const cleanTarget = String(target || 'All').trim();
  if (cleanTarget !== 'All') {
    result = result.filter(row => String(row[5]||'').trim() === cleanTarget);
  }

  // Monthly Status
  const monthlySheet = ss.getSheetByName('MonthlyApprovals');
  let isApproved = false;
  let mgrPhoto = '';
  if (monthlySheet && filterDate) {
     const mData = monthlySheet.getDataRange().getValues();
     const sMonth = filterDate.slice(0, 7);
     if (cleanTarget !== 'All') {
       for(let i=1; i<mData.length; i++) {
         if (String(mData[i][1]).trim() === sMonth && String(mData[i][2]).trim() === cleanTarget) {
            isApproved = true;
            mgrPhoto = mData[i][4]; break;
         }
       }
     }
  }

  const rows = result.map((row, index) => ({
    timestamp: row[0], taskID: row[1], photoUrl: row[2], worker: row[3], status: row[4], dept: row[5], name: row[6], position: row[7], stdImg: stdMap[row[1]] || ''
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
