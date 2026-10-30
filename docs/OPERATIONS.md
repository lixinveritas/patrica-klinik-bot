# Isletim ve kurtarma

## Gunluk kullanim

`calisma-masasi` personelin ana panelidir: dosya, randevu, seans, tahsilat,
mesai ve listeler. `roadmap` her kanalin ne ise yaradigini anlatir.

| Islem | Komut veya panel |
|---|---|
| Isim / PK ile bulma | `/klinik ara` ve `sayfa` |
| Yetkili seans kodlari | `/klinik seanslar` |
| Randevu sonucu | Karttaki Tamamlandi / Iptal / Gelmedi |
| Dosya devri | `/klinik devret`; `iptal` yoksa gelecek randevular aktarilir |
| Not dosyasi | `/klinik dosya`; `html` secenegi guvenli gorunum verir |
| Bekleyen para | `/klinik bekleyenler` veya Finans > Bekleyen Kayitlar |
| Para gercekten kasaya geldi | Finans `/klinik teslim kod:FIN-0001` |
| Gun sonu farki | `/klinik uzlastir`; gozlenen bakiye ve aciklama |
| Ucret | `/klinik tarifeler`; yonetim `/klinik tarife` |
| Basvuru / rol durumu | `/klinik basvurular` ve `sayfa` |
| Yarim kalan isler | Yonetim `/klinik saglik` |

Basvuru onayi ile rol atamasi ayri durumlardir. Rol hiyerarsisi veya izin
engeli varsa karar korunur, yetki atamasi bekler. Eski basvuru, personelden
cikarilan kisinin rolunu yeniden vermemelidir.

## Para kurallari

- Bildirim onaylanmadan kasa degismez. Bildiren kendi kaydini onaylayamaz.
- Seans tutari kayit anindaki tarifedir; sonraki degisiklik eski seansi etkilemez.
- Tahsilat onayi ile kasaya fiziksel teslim ayri kayittir. Teslim onayi bakiyeyi
  ikinci kez arttirmaz; bildiren kendi teslimini dogrulayamaz.
- Uzlastirma oyun bakiyesi ile defter arasindaki farki saklar; para uretmez.
- Bot FiveM hesabini okumaz. Dosya SHA256 tekrar kontrolu, sahte odeme tespiti degildir.

## Bildirim kurtarma

Veri ve bildirim gorevi ayni SQLite transaction'inda saklanir. Worker acilista
ve dakikada bir calisir. Gecici hatalarda sinirli beklemeli tekrar dener; izin
veya belirsiz gonderim hatasinda isi engeller. `/klinik saglik` bu durumu gosterir.

Discord nonce korumasi kisa surelidir; kalici exactly-once garantisi yoktur.
Sonucu belirsiz eski gonderim otomatik olarak yeniden atilmaz:

1. Ilgili kanalda FIN/BAS/RD/SN kodunu ara.
2. Mesaj varsa `/klinik bildirim` ile kodun sayisal numarasini ve mesaj ID sini eslestir.
3. Kesinlikle yoksa `/klinik tekrar` ve `yoklugunu-dogruladim:true` kullan.
4. Dosya kanali icin de once aktif/arsivlenmis ozel threadleri kontrol et.
   Kayitli kanal ID si varsa yeni thread olusturmak yerine eslesmeyi incele.

Yalniz izin engeli olan staff/index/shift isleri icin yonetim sorunu duzelttikten
sonra ilgili personel atamasini/mesai islemini/kurulumu yeniden uygular.
Bir para veya seans kaydini bildirim hatasi yuzunden yeniden acma.

## Calistirma

Node 24.14+ kullan. `.env` degerlerini yerelde ayarla. Developer Portal'da
Server Members Intent acik olmali; Message Content Intent gerekmez.

```sh
npm ci
npm test
npm run register
npm run provision
npm run start:background
```

Bot rolu Patrica rollerinin ustunde olmali. Kurulum yalniz ayarlanan sunucuyu
degistirir; yonetici ve sunucu sahibi Discord izinlerini asabilir.
Gercek aday/personel hesaplariyla gizlilik kontrolu ayrica yapilmalidir.

Windows'ta `npm run autostart:install` oturum acilisina gizli baslatma ekler.
Kaldirmak icin Windows Baslangic klasorundeki `Patrica Klinik.vbs` dosyasini sil.
`npm run restart` kayitli surecin kimligini ve kilit sahipligini kontrol eder.
Gozetim dusen botu tekrar baslatir; bilgisayar kapaliyken veya uykudayken hizmet yoktur.
`data/health.json` son kalp atisini, hazirlik ve bos disk durumunu tutar.
10 MB ustu runtime gunlukleri ayrilir; otomatik silinmez. Dusuk disk esigi 200 MB.

## Yerel yedek ve geri donus

Her gun ve `npm run backup` ile SQLite tutarli yedegi alinir. Butunluk, dis
anahtarlar ve finans defteri kontrol edilir. Dosyalar `data/backups/` altindadir.
Kanit BLOB'lari, notlar ve Discord kaynak eslesmeleri yedegin icindedir.

```sh
npm run restore -- data/backups/YEDEK.sqlite D:/guvenli-klasor/yeni.sqlite
```

Hedef klasor once olusturulmali. Komut var olan dosyaya veya canli DB'ye yazmaz.
Once yeni hedefi incele; botu durdurmadan `patrica.sqlite` degistirme. WAL/SHM
dosyalarini elle karistirma. Eski surum yedeklerinin yeni tablolari ilk acilista
Store tarafindan eklenir. Geri yuklenen eski outbox/kaynak eslesmeleri Discord'un
bugunku durumuyla kontrol edilmeden canliya alinmamalidir.

Yedek ayni disktedir: fiziksel disk kaybini karsilamaz. Otomatik yedek silme,
danisan anonimlestirme ve saklama suresi tanimli degildir. Sure uydurulmadan
veri silinmez; gizlilik talebi yonetimin kontrollu islemi olarak ele alinmalidir.
