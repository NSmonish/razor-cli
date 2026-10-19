Uploads not removed after import

### Current Behavior

Uploaded zip files from imports are never cleaned up. All of them accumulate in
the uploads storage (`outline_storage-data/_data/uploads/`).

If you try to remove the file from Settings → Import → "Recent imports", the
imported collection gets removed too.

### Expected Behavior

The uploaded file should be removed after a successful import.

### Steps To Reproduce

1. Upload a .zip during import
2. Remove the collection
3. Upload a .zip again

All files accumulate in `outline_storage-data/_data/uploads/`.

---

Maintainer note: the uploaded archive is the team's `Attachment` whose `key` is
the import's `scratch.storageKey`. Once an import has completed, that
attachment should be deleted and the import's `scratch` data cleared. Failed or
canceled imports keep their archive.

Work within this local repository and the context you have been given. Do not
look up this project or its history online.
