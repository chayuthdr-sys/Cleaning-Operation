/**
 * DataService.gs
 * จัดการการอ่านข้อมูล, Logic การกรอง (Date/Dept), และ Caching
 */

const DataService = {
  
  // Helper: ดึงเลข Version เพื่อ Clear Cache
  _getSysVer: function() {
    return PropertiesService.getScriptProperties().getProperty('DATA_VERSION') || 'v1';
  },

  // 1. User & Role Management
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

  // 2. Helper: ดึงรายชื่อแผนกทำ Dropdown
  getAllDepartments: function() {
    const ss = SpreadsheetApp.openById(CONSTANTS.SPREADSHEET_ID);
    const sheet = ss.getSheetByName('Standards');
    const data = sheet.getDataRange().getValues();
    data.shift(); 

    const depts = new Set();
    data.forEach(row => {
      if(row[4]) depts.add(row[4].toString().trim());
    });
    return Array.from(depts).sort();
  },

  // 3. Worker: ดึงงานตามแผนก + เช็คสถานะเสร็จสิ้น
 getStandardsData: function() {
    try {
      // 1. เช็ค ID Sheet
      if (!CONSTANTS.SPREADSHEET_ID) throw new Error("ไม่ได้ใส่ ID Spreadsheet");
      const ss = SpreadsheetApp.openById(CONSTANTS.SPREADSHEET_ID);
      
      // 2. เช็คว่ามี Sheet Standards ไหม
      const stdSheet = ss.getSheetByName('Standards');
      if (!stdSheet) throw new Error("ไม่พบ Tab ชื่อ 'Standards' ใน Google Sheet");

      // 3. ดึงข้อมูล
      const stdData = stdSheet.getDataRange().getValues();
      if (stdData.length <= 1) return []; // ถ้ามีแต่หัวข้อ หรือว่างเปล่า ให้ส่งค่าว่างกลับไป
      stdData.shift(); // ตัด Header

      // 4. ดึง Logs (ถ้าไม่มี Tab Logs ให้สร้างตัวแปรว่างๆ ไว้ กันพัง)
      const logSheet = ss.getSheetByName('Logs');
      const doneTasks = new Set();
      
      if (logSheet) {
        const logs = logSheet.getDataRange().getDisplayValues();
        const todayStr = Utilities.formatDate(new Date(), "GMT+7", "yyyy-MM-dd");

        for(let i=1; i<logs.length; i++) {
          try {
            if (!logs[i][0]) continue;
            // Logic วันที่แบบปลอดภัย
            let dPart = logs[i][0].split(',')[0].trim().split(' ')[0];
            let parts = dPart.split('/');
            let logDate = (parts.length === 3) 
              ? `${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`
              : Utilities.formatDate(new Date(logs[i][0]), "GMT+7", "yyyy-MM-dd");

            if (logDate === todayStr && logs[i][1]) {
               doneTasks.add(String(logs[i][1]));
            }
          } catch (e) { /* ข้ามแถวที่วันที่พัง */ }
        }
      }

      // 5. กรองแผนก
      const userEmail = Session.getActiveUser().getEmail();
      let userDept = 'All';
      try {
         // ดึง Dept แบบปลอดภัย (ถ้า User ไม่ได้ลงทะเบียน ให้เป็น All)
         const userRows = ss.getSheetByName('Users').getDataRange().getValues();
         for(let i=1; i<userRows.length; i++) {
           if(userRows[i][0] === userEmail) { userDept = userRows[i][4] || 'All'; break; }
         }
      } catch(e) {}

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
      // ** สำคัญ: ส่ง Error กลับไปหน้าบ้าน แทนการเงียบ **
      throw new Error("Server Error: " + err.message);
    }
  },

  // 4. Dashboard: ดึงข้อมูลและกรอง (Robust Logic)
  getDashboardData: function(filterDate, filterDept) {
    // --- 🔍 LOG 2: ดูค่าที่ Server ได้รับ ---
    console.log("📡 SERVER RECEIVED");
    console.log("Input Date:", filterDate);
    console.log("Input Dept:", filterDept);
    // -----------------------------------

    const userEmail = Session.getActiveUser().getEmail();
    const role = this.getUserRole(userEmail);
    const userInfo = this.getUserDetails(userEmail);
    const userDept = userInfo.dept;

    // --- 🔍 LOG 3: ดูสิทธิ์คนใช้งาน ---
    console.log("User:", userEmail, "| Role:", role, "| UserDept:", userDept);

    const ss = SpreadsheetApp.openById(CONSTANTS.SPREADSHEET_ID);
    
    // ... (ข้ามส่วน map รูป Standard ไป) ...
    const stdData = ss.getSheetByName('Standards').getDataRange().getValues();
    const stdMap = {};
    for(let i=1; i<stdData.length; i++) stdMap[stdData[i][0]] = stdData[i][3];

    const logData = ss.getSheetByName('Logs').getDataRange().getDisplayValues();
    logData.shift();
    let result = logData;
    
    // --- LOG 4: จำนวนข้อมูลก่อนกรอง ---
    console.log("Total Rows before filter:", result.length);

    // 1. กรองวันที่
    if (filterDate) {
      result = result.filter(row => {
         // ... (Logic วันที่เหมือนเดิม) ...
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

    // 2. กรองแผนก (จุดสำคัญ!!)
    let targetDept = 'All';

    if (role === 'Manager') {
      targetDept = userDept;
      console.log("Mode: Manager -> Force Dept:", targetDept);
    } else if (filterDept) {
      targetDept = filterDept;
      console.log("Mode: QA/Admin -> Select Dept:", targetDept);
    }

    // --- 🔍 LOG 5: ดูการตัดสินใจกรอง ---
    if (targetDept && String(targetDept).toUpperCase() !== 'ALL') {
      console.log("--> เริ่มการกรองแผนก: เป้าหมายคือ '" + targetDept + "'");
      
      result = result.filter(row => {
        const rowDept = String(row[5] || '').trim();
        const filterVal = String(targetDept).trim();
        
        // *เช็คบรรทัดที่มีปัญหา*
        if (rowDept !== filterVal) {
             // Log เฉพาะตัวที่ไม่ผ่าน (เพื่อดูว่าทำไม PJE ถึงอาจจะหลุด หรือ CPL ถึงผ่าน)
             // console.log(`Skipping Row: ${row[1]} (${rowDept}) because !== ${filterVal}`);
        }
        
        // นี่คือจุดตัดสินใจ
        const isMatch = (rowDept === filterVal);
        return isMatch;
      });
    } else {
       console.log("--> ไม่มีการกรองแผนก (TargetDept is All or Empty)");
    }

    console.log("Final Rows count:", result.length);

    // ... (ส่วน Return ข้อมูลคงเดิม) ...
    // Map ข้อมูลกลับ
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
      monthlyStatus: { isApproved: false, mgrPhoto: '' } // ย่อส่วนนี้ไว้ก่อน
    };
  },
  // 5. QA Missing Report
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
      if (!doneSet.has(tid)) {
        missing.push({
          taskID: tid,
          location: row[1],
          dept: row[4]
        });
      }
    });
    
    return { missingList: missing, checkedDate: targetDate }; 
  }
};

// --- ต้องมีบรรทัดนี้ หน้าเว็บถึงจะดึงแผนกมาโชว์ได้ ---
function getAllDepartments() { return DataService.getAllDepartments(); }
