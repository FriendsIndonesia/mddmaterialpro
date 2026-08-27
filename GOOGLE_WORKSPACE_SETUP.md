# Integrasi Google Workspace

Target akun: `friendsindonesia28@gmail.com`

Backend berada di folder:

`google-workspace-backend/`

## Deploy Apps Script

1. Masuk ke Google Drive dengan akun `friendsindonesia28@gmail.com`.
2. Buka project Apps Script:
   `https://script.google.com/u/0/home/projects/1SPjZ7FXhsxqR2uUayTXkGxZoMfgIkmRlap6KWKeBpMGykwbOqBfgPcrE/edit`
3. Salin isi `google-workspace-backend/Code.gs` ke file `Code.gs`.
4. Buka `Project Settings`, aktifkan `Show appsscript.json manifest file in editor`.
5. Salin isi `google-workspace-backend/appsscript.json` ke file `appsscript.json`.
6. Jalankan fungsi `setupMddMaterialPro` sekali, lalu izinkan akses. Backend akan memakai spreadsheet aktif jika project terhubung ke Spreadsheet; jika tidak, backend akan membuat Spreadsheet baru `MDD Material Pro Backend`.
8. Klik `Deploy` > `New deployment`.
9. Pilih type `Web app`.
10. Set:
    - Execute as: `Me`
    - Who has access: `Anyone`
11. Klik `Deploy`, lalu salin `Web app URL`.

## Hubungkan ke Aplikasi

1. Buka aplikasi `MDD Material Pro`.
2. Login sebagai Owner.
3. Buka menu `Setting`.
4. Klik `Profile Aplikasi`.
5. Tempel `Web app URL` Apps Script pada kolom `URL Web App Apps Script`.
6. Aktifkan `Mode Online Google Workspace / auto-sync backend`.
7. Klik `Simpan`. Setelah itu perubahan data aplikasi akan otomatis dikirim ke backend Google Workspace.

Endpoint backend juga bisa dicek langsung dengan:

- Status: `WEB_APP_URL`
- Ambil database terakhir: `WEB_APP_URL?action=state`

Web App URL aktif untuk build ini:

`https://script.google.com/macros/s/AKfycbz9yQQmE6P5EnTplKVlFTZL1GNPyvblgKBGvOL6qBwG3zjlnO6kRBeWJb0JBvH2MIur/exec`

## Sheet yang Dibuat

Backend akan membuat dan memperbarui sheet:

- `Metadata`
- `Products`
- `Customers`
- `Suppliers`
- `Employees`
- `CashAccounts`
- `Packages`
- `Sales`
- `Purchases`
- `CashTransactions`
- `Payments`
- `StockMoves`
- `Returns`
- `PendingSales`
- `PendingPurchases`
- `SyncQueue`
- `Profile`
- `History`
- `RawState`

`RawState` menyimpan payload lengkap untuk backup teknis, sedangkan sheet lain menyimpan data dalam format tabel.
