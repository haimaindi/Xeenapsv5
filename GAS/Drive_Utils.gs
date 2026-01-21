
/**
 * XEENAPS PKM - DRIVE UTILITIES
 */

/**
 * permanentlyDeleteFile
 * Hard delete a file from Google Drive (bypasses Trash).
 * Requires Advanced Drive Service (v3) to be enabled.
 */
function permanentlyDeleteFile(fileId) {
  if (!fileId) return;
  try {
    // Drive.Files.remove is part of the Advanced Drive Service
    // This action is permanent and cannot be undone.
    Drive.Files.remove(fileId);
    console.log("Successfully hard deleted file: " + fileId);
  } catch (e) {
    console.error("Failed to permanently delete file: " + fileId + ". Error: " + e.message);
    // Fallback: If advanced service fails, try standard trash as safety
    try {
      DriveApp.getFileById(fileId).setTrashed(true);
    } catch (innerErr) {
      console.error("Trash fallback also failed: " + innerErr.message);
    }
  }
}
