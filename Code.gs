/**
 * Code.gs - Main Controller & Router
 * ไฟล์นี้ทำหน้าที่เป็น "ประตูหน้าด่าน" รับคำสั่งจากหน้าเว็บ
 */

// --- CONFIGURATION ---
const CONSTANTS = {
  SPREADSHEET_ID: '1Dik3JJzJrqoQdal_ytjADDxsdqgnomQaCx5NGaAfXxE', // ID Sheet ของคุณ
  FOLDER_ID: '11AetQBzDhQDvjnNwBy1c8gEkd5nT0C-s'      // ID Folder ของคุณ
};

// --- ROUTING (doGet) ---
function doGet(e) {
  const userEmail = Session.getActiveUser().getEmail();
  const role = DataService.getUserRole(userEmail);

  let templateName = 'error'; 

  if (role === 'Worker') {
    templateName = 'worker';
  } else if (role === 'Manager' || role === 'QA') {
    templateName = 'dashboard';
  } else {
    return HtmlService.createHtmlOutput(
      `<div style="text-align:center; font-family:sans-serif; margin-top:50px;">
         <h3>⛔ Access Denied</h3>
         <p>Email: <b>${userEmail}</b> ไม่มีสิทธิ์ใช้งานระบบนี้</p>
         <p>กรุณาติดต่อ Admin เพื่อลงทะเบียนใน Sheet "Users"</p>
       </div>`
    );
  }

  return HtmlService.createTemplateFromFile(templateName)
    .evaluate()
    .setTitle('Cleaning Operation App')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// --- MENU ADMIN ---
function onOpen() {
  SpreadsheetApp.getUi().createMenu('🔧 Admin Tools')
    .addItem('🔄 อัปเดตข้อมูลระบบ (Clear Cache)', 'resetSystemVersion').addToUi();
}
function resetSystemVersion() {
  PropertiesService.getScriptProperties().setProperty('DATA_VERSION', new Date().getTime().toString());
  SpreadsheetApp.getUi().alert('✅ รีเซ็ตระบบเรียบร้อย');
}

// -----------------------------------------------------------
// 🔥 ส่วนสำคัญที่สุด: EXPOSE FUNCTIONS (ต้องมีเพื่อให้หน้าเว็บเรียกได้)
// -----------------------------------------------------------

// 1. สำหรับ Worker (ตัวที่ทำให้คุณหมุนค้าง ถ้าไม่มีบรรทัดนี้)
function getStandardsData() { return DataService.getStandardsData(); }
function saveLog(data) { return ActionService.saveLog(data); }

// 2. สำหรับ Dashboard
function getAllDepartments() { return DataService.getAllDepartments(); }
function getDashboardData(date, dept) { return DataService.getDashboardData(date, dept); }
function getMissingReport(date) { return DataService.getMissingReport(date); }
function approveTaskWithPhoto(data) { return ActionService.approveTaskWithPhoto(data); }
function approveMonthly(data) { return ActionService.approveMonthly(data); } // เพิ่มให้ครบ
function rejectTask(rowIndex) { return ActionService.rejectTask(rowIndex); }
