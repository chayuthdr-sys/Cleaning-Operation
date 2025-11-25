/**
 * ActionService.gs
 */
const ActionService = {
  saveLog: function(data) {
    try {
      const ss = SpreadsheetApp.openById(CONSTANTS.SPREADSHEET_ID);
      const logSheet = ss.getSheetByName('Logs');
      const userEmail = Session.getActiveUser().getEmail();
      const workerInfo = DataService.getUserDetails(userEmail);

      const imageData = data.imageBase64.split(',')[1]; 
      const decodedImage = Utilities.base64Decode(imageData);
      const fileName = `Log_${data.taskID}_${new Date().getTime()}.jpg`;
      const blob = Utilities.newBlob(decodedImage, 'image/jpeg', fileName);
      
      const folder = DriveApp.getFolderById(CONSTANTS.FOLDER_ID);
      const file = folder.createFile(blob);
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

      logSheet.appendRow([
        new Date(),
        data.taskID,
        file.getUrl(),
        userEmail,
        'Submitted',
        data.department,
        workerInfo.name,
        workerInfo.position,
        ''
      ]);
      return { success: true, message: 'บันทึกสำเร็จ' };
    } catch (e) { return { success: false, message: e.toString() }; }
  },

  approveMonthly: function(data) {
    try {
      const ss = SpreadsheetApp.openById(CONSTANTS.SPREADSHEET_ID);
      const sheet = ss.getSheetByName('MonthlyApprovals');
      const userEmail = Session.getActiveUser().getEmail();

      let fileUrl = '';
      if (data.imageBase64) {
        const imageData = data.imageBase64.split(',')[1];
        const decodedImage = Utilities.base64Decode(imageData);
        const fileName = `MonthApprove_${data.dept}_${data.month}.jpg`;
        const blob = Utilities.newBlob(decodedImage, 'image/jpeg', fileName);
        const folder = DriveApp.getFolderById(CONSTANTS.FOLDER_ID);
        const file = folder.createFile(blob);
        file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        fileUrl = file.getUrl();
      }

      sheet.appendRow([
        new Date(),
        data.month,
        data.dept,
        userEmail,
        fileUrl,
        'Approved'
      ]);
      return { success: true };
    } catch (e) { return { success: false, message: e.toString() }; }
  },

  approveTaskWithPhoto: function(data) { return {success:true}; }, // เผื่อไว้
  rejectTask: function(rowIndex) {
    const ss = SpreadsheetApp.openById(CONSTANTS.SPREADSHEET_ID);
    const sheet = ss.getSheetByName('Logs');
    sheet.getRange(rowIndex, 5).setValue('Rejected');
    return { success: true };
  }
};
