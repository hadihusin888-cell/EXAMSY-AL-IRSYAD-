
/**
 * EXAMSY BACKEND V7.0 - ULTIMATE DATA INTEGRITY
 * Menggunakan penamaan kolom yang unik di setiap sheet untuk mencegah crash data
 * dan memastikan sinkronisasi antara Siswa, Sesi, dan Ruang tetap terjaga.
 */

function doGet(e) {
  return response(getAllData(), true);
}

function doPost(e) {
  try {
    var contents = JSON.parse(e.postData.contents);
    var action = contents.action;
    var payload = contents.payload;

    initDatabase();

    switch (action) {
      case 'ADD_STUDENT':
        return addRow("STUDENTS", [payload.nis, payload.name, payload.class, payload.roomId || "", payload.password || "password123", "BELUM_MASUK"]);
      case 'UPDATE_STUDENT':
        return updateRow("STUDENTS", 0, payload.nis, {
          1: payload.name,
          2: payload.class,
          3: payload.roomId || "",
          4: payload.password,
          5: payload.status
        });
      case 'DELETE_STUDENT':
        return deleteRow("STUDENTS", 0, payload.nis);
      case 'BULK_UPDATE_STUDENTS':
        return bulkUpdateStudents(payload.selectedNis, payload.updates);

      case 'ADD_SESSION':
        return addRow("SESSIONS", [payload.id, payload.name, payload.class, payload.pin, payload.durationMinutes, payload.isActive, payload.pdfUrl || ""]);
      case 'UPDATE_SESSION':
        return updateRow("SESSIONS", 0, payload.id, {
          1: payload.name,
          2: payload.class,
          3: payload.pin,
          4: payload.durationMinutes,
          5: payload.isActive,
          6: payload.pdfUrl
        });
      case 'DELETE_SESSION':
        return deleteRow("SESSIONS", 0, payload.id);

      case 'ADD_ROOM':
        return addRow("ROOMS", [payload.id, payload.name, payload.capacity, payload.username, payload.password]);
      case 'UPDATE_ROOM':
        return updateRow("ROOMS", 0, payload.id, {
          1: payload.name,
          2: payload.capacity,
          3: payload.username,
          4: payload.password
        });
      case 'DELETE_ROOM':
        return deleteRow("ROOMS", 0, payload.id);

      default:
        return response("Action not recognized", false);
    }
  } catch (err) {
    return response(err.toString(), false);
  }
}

function initDatabase() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  // Header dibuat unik sepenuhnya untuk setiap tabel
  var sheets = {
    "STUDENTS": ["NIS", "NAMA_SISWA", "KELAS_SISWA", "RUANGID", "PASSWORD", "STATUS"],
    "SESSIONS": ["ID", "NAMA_UJIAN", "KELAS_UJIAN", "PIN", "DURASI", "AKTIF", "PDFURL"],
    "ROOMS": ["ID", "NAMA_RUANG", "KAPASITAS", "USERNAME", "PASSWORD"]
  };

  for (var name in sheets) {
    var sheet = ss.getSheetByName(name);
    if (!sheet) {
      sheet = ss.insertSheet(name);
      sheet.appendRow(sheets[name]);
      sheet.getRange(1, 1, 1, sheets[name].length).setFontWeight("bold").setBackground("#f3f4f6");
    }
  }
}

function addRow(sheetName, rowData) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  sheet.appendRow(rowData);
  return response("Data berhasil ditambahkan", true);
}

function updateRow(sheetName, keyColIndex, keyValue, updates) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][keyColIndex]) === String(keyValue)) {
      for (var colIndex in updates) {
        if (updates[colIndex] !== undefined) {
          sheet.getRange(i + 1, parseInt(colIndex) + 1).setValue(updates[colIndex]);
        }
      }
      return response("Update berhasil", true);
    }
  }
  return response("Data tidak ditemukan", false);
}

function deleteRow(sheetName, keyColIndex, keyValue) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  var data = sheet.getDataRange().getValues();
  for (var i = data.length - 1; i >= 1; i--) {
    if (String(data[i][keyColIndex]) === String(keyValue)) {
      sheet.deleteRow(i + 1);
    }
  }
  return response("Hapus berhasil", true);
}

function bulkUpdateStudents(selectedNis, updates) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("STUDENTS");
  var data = sheet.getDataRange().getValues();
  selectedNis.forEach(function(nis) {
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(nis)) {
        if (updates.roomId !== undefined) sheet.getRange(i + 1, 4).setValue(updates.roomId);
        if (updates.status !== undefined) sheet.getRange(i + 1, 6).setValue(updates.status);
      }
    }
  });
  return response("Update massal berhasil", true);
}

function getAllData() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  return {
    students: getSheetData(ss.getSheetByName("STUDENTS")),
    sessions: getSheetData(ss.getSheetByName("SESSIONS")),
    rooms: getSheetData(ss.getSheetByName("ROOMS"))
  };
}

function getSheetData(sheet) {
  if (!sheet) return [];
  var range = sheet.getDataRange();
  if (range.getNumRows() < 2) return [];
  var data = range.getValues();
  var headers = data[0];
  var result = [];
  for (var i = 1; i < data.length; i++) {
    var obj = {};
    for (var j = 0; j < headers.length; j++) {
      var key = String(headers[j]).toUpperCase();
      var propName = key.toLowerCase();
      
      // Mapping Header Unik ke Properti Objek Frontend
      if (key === "NAMA_SISWA" || key === "NAMA_UJIAN" || key === "NAMA_RUANG") propName = "name";
      if (key === "KELAS_SISWA" || key === "KELAS_UJIAN") propName = "class";
      
      if (key === "RUANGID") propName = "roomId";
      if (key === "AKTIF") propName = "isActive";
      if (key === "DURASI") propName = "durationMinutes";
      if (key === "PDFURL") propName = "pdfUrl";
      if (key === "KAPASITAS") propName = "capacity";
      
      obj[propName] = data[i][j];
    }
    result.push(obj);
  }
  return result;
}

function response(data, success) {
  var res = { success: success, timestamp: new Date().toISOString() };
  if (success) res.data = data; else res.message = data;
  return ContentService.createTextOutput(JSON.stringify(res)).setMimeType(ContentService.MimeType.JSON);
}
