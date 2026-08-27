# MDD Material Pro

File utama: `matrialpro.html`

Login awal:
- Owner: `owner` / `owner123`
- Kasir: `kasir` / `kasir123`
- Gudang: `gudang` / `gudang123`

Fitur utama:
- Dashboard Owner: metrik harian untuk produk terjual, omzet, pembelian, stock kritis, pembayaran piutang/hutang, petty cash, saldo kas, nilai stock, piutang/hutang tersisa, dan nilai aset keseluruhan.
- Dashboard Owner menampilkan nama toko, alamat, dan telepon dari `Profile Aplikasi` di menu Setting.
- Laporan Dashboard Owner memiliki kolom `Selisih Stock` dari hasil stok opname.
- Produk: menu database produk material di antara Dashboard Owner dan Kasir, bersumber langsung dari `Master Barang`, lengkap dengan ringkasan total produk, stock akhir, nilai stock, stock kritis, tambah barang, edit/delete produk, dan PDF Produk.
- Kasir: penjualan, retur, pelanggan retail/supplier/sosial/pribadi/lainnya, pencarian produk via nama/kode/kategori/barcode, satuan, HPP, harga jual 1/2 yang bisa dipilih, harga negosiasi, invoice otomatis, ongkir, Deposit, edit/hapus keranjang tanpa kolom Diskon, pending, pembayaran, cetak faktur/surat jalan/reprint.
- Kasir: form pelanggan memakai Nama Pelanggan manual/datalist dari Master Pelanggan, Tipe Pelanggan, Alamat Pelanggan, Whatsapp, Invoice Pending dengan Edit/Hapus/Lanjut Bayar, tombol `Simpan & Bayar`, dan laporan kasir berisi alamat, Whatsapp, bank charge, serta deposit tersisa.
- Purchase: pembelian supplier dengan struktur Cari Barang dan Keranjang Pembelian setara Kasir, memakai Harga HPP, Harga Beli 1, dan Harga Lainnya, tetap memiliki tombol `+ Barang Baru`, tombol `Simpan & Bayar`, no pembelian otomatis, ongkir, bank charge, pending pembelian, retur, warning stok, price tag, produksi paket.
- Purchase: form supplier memakai Nama Sales, Nama Perusahaan, Whatsapp dari Master Supplier, nomor PO otomatis, tanpa tombol `Simpan Saja`, dan laporan pembelian mengikuti kolom Tanggal, No. PO, Nama Sales, Nama Perusahaan, Whatsapp, Nama Barang, Qty, Metode Pembayaran, Jumlah Total, dan hutang tersisa.
- Logo aplikasi memakai logo MDD Material Pro terlampir pada tampilan awal, sidebar, dan PWA manifest.
- Hak akses: Owner dapat membuka semua menu/dashboard. Kasir dan Gudang dibatasi sesuai aturan akses yang dapat diatur Owner dari menu Setting.
- Keuangan: pembayaran hutang/piutang cicilan, transaksi kas, biaya operasional, gaji, cashflow, kategori Petty Cash/Qris/E-Wallet/Credit Card/Deposit Pelanggan, serta akun `Rek. Bank`.
- Keuangan: panel Pembayaran Hutang menampilkan laporan faktur aktif dengan kolom Tanggal, Jatuh Tempo, No. Faktur, Supplier, Hutang Aktif, Bayar, Retur, Sisa Hutang, dan tombol `Bayar` per faktur yang langsung membuka form pembayaran cicilan.
- Keuangan: tombol `Input Data` pada Pembayaran Hutang membuka form input manual/berbasis data supplier untuk kolom Tanggal, Jatuh Tempo, No. Faktur, Supplier, Hutang Aktif, Bayar, Retur, dan Sisa Hutang. Panel Pembayaran Piutang diletakkan di bawah Pembayaran Hutang agar masing-masing laporan tampil full layar.
- Keuangan: setiap baris Pembayaran Hutang memiliki tombol `Bayar`, `Edit`, dan `Hapus`. Form pembayaran hutang memakai tombol `Simpan & Cetak` untuk mencatat pembayaran sekaligus mencetak bukti pembayaran supplier.
- Keuangan: Pembayaran Piutang mengikuti konsep Pembayaran Hutang, dengan laporan Tanggal, Jatuh Tempo, No. Faktur, Pelanggan, Piutang Aktif, Bayar, Retur, Sisa Piutang, tombol Input Data, Bayar, Edit, Hapus, serta bukti pembayaran pelanggan saat `Simpan & Cetak`.
- Keuangan memiliki kartu `Petty Cash` dan panel `Laporan Petty Cash` berisi Petty Cash Awal, Penggunaan, dan Sisa Petty Cash.
- Laporan: laporan penjualan, retur, pembelian, kas, hutang, piutang, stok, revisi stok, master, rugi laba, export PDF, serta ringkasan nilai faktual dan catatan penjelas di setiap kartu laporan.
- Login: kolom password dilengkapi tombol mata untuk melihat atau menyembunyikan input password.
- History Transaksi: tombol `Clear History` untuk membersihkan seluruh history transaksi.
- Visual aplikasi diberi gaya 3D bevel tanpa glow berlebihan pada logo, brand, headline, ikon menu, kartu dashboard, chart, tabel, dan ringkasan laporan. Judul dashboard memakai paduan royal blue, gold, dan putih. Logo dan ikon dashboard disetel `contain`, tanpa rotasi, tanpa clip, agar tidak terpotong.
- Master Dokumen dan Setting lengkap, termasuk profile aplikasi, hardware, kode akses, dan form hak akses Kasir/Gudang.
- Master Dokumen memiliki panel `Database Master Dokumen` untuk melihat, mengedit, dan menghapus data Master Pelanggan, Supplier, Karyawan, Kategori, Paket, Stok Opname, Cetak Barcode, Edit Harga, dan Master Kas sesuai hak akses.
- Hak akses Master Dokumen untuk Kasir dan Gudang hanya menampilkan Master Pelanggan, Master Supplier, Master Kategori, Master Barang, Master Paket, Stok Opname, dan Master Cetak Barcode.
- Integrasi menu diperkuat: akses Master memfilter tampilan dan export PDF sesuai role, konfigurasi endpoint Google Workspace tersimpan di Profile Aplikasi, dan Produksi Paket tercatat ke history/laporan stok.
- Master Barang: satuan memakai dropdown yang sama dengan Kasir, Harga Beli, Harga Jual 1/2, Stock Masuk, Stock Keluar, Stock Akhir otomatis dari rumus Stock Masuk - Stock Keluar, serta data ini terhubung ke transaksi dan laporan stok.
- Master Barang menyediakan dropdown kategori material standar seperti Pondasi dan Beton, Struktur Rangka, Sanitari dan Plambing, serta kategori material lainnya.
- Master Kas memakai pilihan nama kas `Kas Utama`, `Kas 2`, dan `Rek. Bank`.
- Master Supplier memiliki kolom Nama Perusahaan. Master Karyawan memiliki Posisi Jabatan dan Mulai Bekerja.
- Master Pelanggan memiliki Jumlah Deposit dan label Whatsapp. Master Supplier memakai Nama Sales dan Whatsapp. Setting Profile memakai label Whatsapp.
- Stok Opname memiliki Nomor, SKU, Nama Barang, dropdown Satuan, Stock Sistem otomatis dari Stock Akhir barang terpilih, Stock Fisik, Selisih otomatis, dan Keterangan/Catatan tanpa kolom Stock Baru.

Data disimpan offline di `localStorage`. Untuk backend Google Workspace, buka `Setting > Profile Aplikasi`, isi `URL Web App Apps Script`, lalu aktifkan `Mode Online Google Workspace / auto-sync backend`.
Build ini disiapkan sebagai aplikasi baru untuk ditawarkan/dijual: data produk, pelanggan, supplier, karyawan, kas, paket, diskon, transaksi, laporan, dan history awal sudah kosong. Aplikasi memakai storage key bersih dan membersihkan storage versi lama yang berpotensi berisi data uji/demo.

Integrasi:
- Google Workspace: `friendsindonesia28@gmail.com`
- Apps Script: `https://script.google.com/u/0/home/projects/1SPjZ7FXhsxqR2uUayTXkGxZoMfgIkmRlap6KWKeBpMGykwbOqBfgPcrE/edit`
- GitHub: `https://github.com/FriendsIndonesia/mddmaterialpro`
- Backend Apps Script: lihat `../../google-workspace-backend/Code.gs`
- Panduan setup: lihat `../../GOOGLE_WORKSPACE_SETUP.md`
