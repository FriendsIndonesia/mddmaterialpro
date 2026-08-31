# MDD Material Pro

Aplikasi kasir material offline-first untuk penjualan, purchase, stok, keuangan, laporan, dan sinkronisasi backend Google Workspace.

## Aplikasi

File utama:

`outputs/mdd-kasir-complete/matrialpro.html`

Jika dipublish via GitHub Pages, `index.html` di root akan mengarahkan ke file aplikasi tersebut.

## Backend Google Workspace

Target akun:

`friendsindonesia28@gmail.com`

Kode backend Apps Script:

`google-workspace-backend/Code.gs`

Project Apps Script:

`https://script.google.com/u/0/home/projects/1SPjZ7FXhsxqR2uUayTXkGxZoMfgIkmRlap6KWKeBpMGykwbOqBfgPcrE/edit`

Panduan deployment:

`GOOGLE_WORKSPACE_SETUP.md`

Backend mendukung:
- `GET` status backend.
- `GET ?action=state` untuk mengambil database terakhir.
- `POST` sinkronisasi database dari aplikasi.
- Auto-sync dari aplikasi setelah `URL Web App Apps Script` dan `Mode Online Google Workspace` diaktifkan di `Setting > Profile Aplikasi`.

Web App URL aktif:

`https://script.google.com/macros/s/AKfycbz9yQQmE6P5EnTplKVlFTZL1GNPyvblgKBGvOL6qBwG3zjlnO6kRBeWJb0JBvH2MIur/exec`

## GitHub

Repository:

`https://github.com/FriendsIndonesia/mddmaterialpro`

## Login Awal

- Akun dan kode akses dikelola Owner melalui menu **Setting → Kode Akses** dan tidak dipublikasikan di repository.
- Kasir: `kasir` / `kasir123`
- Gudang: `gudang` / `gudang123`

## Status Data Awal

Build ini disiapkan kosong untuk pembeli/user baru. Data produk, pelanggan, supplier, karyawan, kas, paket, transaksi, laporan, dan history awal kosong.

## Revisi Master Dokumen

Menu Master Dokumen kini memiliki panel database/laporan untuk melihat, mengedit, dan menghapus data master. Role Kasir dan Gudang hanya dapat melihat kolom Master Pelanggan, Master Supplier, Master Kategori, Master Barang, Master Paket, Stok Opname, dan Master Cetak Barcode.

## Revisi Keuangan

Panel Pembayaran Hutang di menu Keuangan kini menampilkan laporan hutang aktif per faktur, lengkap dengan Jatuh Tempo, No. Faktur, Supplier, Hutang Aktif, Bayar, Retur, Sisa Hutang, dan tombol Bayar yang membuka form pembayaran cicilan.
Setiap baris hutang juga memiliki tombol Edit dan Hapus untuk koreksi typo/kesalahan input, serta form pembayaran hutang memakai tombol Simpan & Cetak untuk mencetak bukti pembayaran supplier.
Panel Pembayaran Piutang dibuat dengan konsep yang sama: Input Data, tabel faktur piutang aktif, Bayar, Edit, Hapus, dan Simpan & Cetak bukti pembayaran pelanggan.
