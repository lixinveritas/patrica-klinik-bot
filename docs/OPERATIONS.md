# Isletim ve kurtarma

## Gunluk kullanim

### Karakter adi ve Discord hesabi

Basvuru kanalinda **Psikolog Basvurusu** veya **Resepsiyon Basvurusu** butonu
secilir. Gorev forma yazilmaz. Basarili gonderimde aday BAS kodunu gorur ve yonetim
kanalina bir basvuru karti gider. BAS kodu gorunmuyorsa kayit olusmamistir;
yonetim kanalinda da kart beklenmez. Bu durumda formdaki hatayi duzeltip yeniden
gondermek gerekir.

Basvuruda karakterin ad ve soyadi yazilir. Onay karari bu adi ayni Discord
kullanici ID'sine baglar; gorev rolu yetkiyi belirler. Bot takma adi
degistirebiliyorsa sunucudaki gorunen adi da uygular. Sunucu sahibi veya botun
rolunun ustundeki hesaplarda Discord adi elle duzenlenir; kayitli karakter adi
personel kartinda yine kullanilir. Basvuru kartindaki **Discord adi** durumu
bu ayrimi gosterir.

Elle personel atamasinda `/klinik personel` komutunun `karakter-adi` alani ilk
atamada zorunludur. Sonraki RP adi degisikliginde bot sahibi `/klinik isim`
kullanir. Karakter adi ad ve soyad biciminde, en fazla 32 karakterdir. Ayni
karakter adini kullanan iki Discord hesabini sistem otomatik olarak tek kisi
saymaz; resmi kimlik Discord ID'sidir.

`roadmap` kanalinin ilk mesajinda Sharp ile uretilen resimli dort adimli
rehber vardir. Alttaki metinler kanal, kod ve istisna aciklamalarini tasir.
Gorselde hazir emoji, stok gorsel veya AI uretilmis varlik yoktur.

### Kisisel personel dosyasi

Personel kabul edildiginde veya gorev atandiginda `personel-dosyalari` altinda
yalniz ilgili kisi ve yonetimin gorebildigi bir ozel alt kanal acilir. Mevcut
personel bot acilisinda da eslestirilir. Calisma Masasi > **Personel Dosyam**
veya `/klinik personelim` ile ulasilir.

Her Istanbul gunu icin tek bir gorselli kart tutulur. Seans/randevu sayisi,
atanmis aktif dosya, kayitli mesai ve bekleyen finans sayisi kayitlardan gelir;
gorusme notu gorunmez. Seans ve dosya kodlari kartin metnindedir. Mesai bot
kaydidir, oyun AFK veya gercek calisma suresi olcumu degildir. Veri degisince
ve en gec yaklasik bes dakikada yenileme kuyruga alinir.

- **Mazeret Bildir:** gelinemeyen ilk/son gun ve neden. Bir mazeret en fazla
  31 gunu kapsar. Ayni tarihe ust uste bildirim acilmaz. Yonetim gerekceyle
  uygun gorur veya reddeder; randevular kendiliginden iptal edilmez.
- **Devir Notu:** bekleyen is, sonraki adim ve ilgili PK/RD/FIN kodlari.
- **Personel Kayitlarim:** kendi IK kayitlarinin sayfali listesi.
- Yonetimde **personel-kayitlari > Tutanak Ac:** kisi, olay tarihi, gozlem ve
  ilgili kayit. Personel kendi kartindaki **Aciklama Ekle** ile cevap verebilir.
- Asil tutanak/aciklama degistirilmez veya silinmez. Yonetim karari gerekceyle
  kaydedilir. Otomatik ceza, maas kesintisi veya "gelmedi" tespiti yoktur.
- `/klinik personel-kaydi kod:IK-0001` detay verir; sadece ilgili kisi ve yonetim.

Personelden ayrilinca alt kanal uyeligi kaldirilir ve alan arsivlenir. Ana
kanalin personel rol kapisi, bot kapaliyken rol kaldirildiginda da erisimi keser.
Discord yoneticileri/sunucu sahibi bu sinirin disindadir.

### Personel bildirimini kurtarma

`/klinik personel-kurtar` yalniz yonetime aciktir. Tur olarak ozel kanal,
bugunun karti veya yonetim/personel IK karti secilir. Hedef Discord ID si ya da
IK kodudur. Var olan kanal/mesaj ID sini **kimlik** alanina yaz. Mesaj bu botun
olmali ve tam kayit koduyla eslesmelidir. Hic olusmadigi aktif/arsiv gecmisinde
dogrulandiysa **yoklugunu-dogruladim:true** ile tekrar kuyruga alinabilir.
Bu onay verilmeden belirsiz gonderim otomatik yeniden atilmaz.

Gorseller Sharp ile duzenlenir. Manrope/Newsreader yerel SIL OFL fontlaridir;
kartta AI gorseli, varsayilan emoji veya hazir stok gorsel kullanilmaz. Font
kaynaklari ve lisanslari `assets/fonts/` altindadir. `npm run preview:personnel`
yalniz yerel sentetik onizleme uretir; Discord'a veya canli personele kayit yazmaz.

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
Discord adinin otomatik degismesi icin botun `Manage Nicknames` izni ve hedefe
gore yeterli rol hiyerarsisi gerekir. Bu izin yoksa onayli RP adi kayitta kalir;
takma adi yonetim elle ayarlar.

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
