/**
 * Code.gs - Main Controller & Router
 */

// --- 1. CONFIGURATION ---
const CONSTANTS = {
  SPREADSHEET_ID: '1Dik3JJzJrqoQdal_ytjADDxsdqgnomQaCx5NGaAfXxE', // <--- ตรวจสอบ ID ให้ถูก
  FOLDER_ID: '11AetQBzDhQDvjnNwBy1c8gEkd5nT0C-s'      // <--- ตรวจสอบ ID ให้ถูก
};

// --- 2. ROUTING ---
function doGet(e) {
  let userEmail = "unknown";
  try { userEmail = Session.getActiveUser().getEmail(); } catch(e) {}
  
  const role = DataService.getUserRole(userEmail);

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

// --- 3. ADMIN TOOLS ---
function onOpen() {
  SpreadsheetApp.getUi().createMenu('🔧 Admin Tools')
    .addItem('🔄 รีเซ็ตระบบ (Clear Cache)', 'resetSystemVersion').addToUi();
}
function resetSystemVersion() {
  PropertiesService.getScriptProperties().setProperty('DATA_VERSION', new Date().getTime().toString());
  SpreadsheetApp.getUi().alert('✅ รีเซ็ตเรียบร้อย');
}

// --------------------------------------------------------------------
// 🔥 4. EXPOSE FUNCTIONS (ต้องมีเพื่อให้หน้าเว็บเรียกได้)
// --------------------------------------------------------------------

// Worker
function getStandardsData() { return DataService.getStandardsData(); }
function saveLog(data) { return ActionService.saveLog(data); }

// Dashboard
function getAllDepartments() { return DataService.getAllDepartments(); }
function getDashboardData(date, dept) { return DataService.getDashboardData(date, dept); }
function getMissingReport(date) { return DataService.getMissingReport(date); }
function approveMonthly(data) { return ActionService.approveMonthly(data); }
// (เผื่อใช้)
function approveTaskWithPhoto(data) { return ActionService.approveTaskWithPhoto(data); }
function rejectTask(rowIndex) { return ActionService.rejectTask(rowIndex); }
