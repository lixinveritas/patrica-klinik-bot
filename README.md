<p align="center"><img src="docs/header.svg" alt="Patrica Klinik" width="100%"></p>

<p align="center">
  <a href="https://github.com/lixinveritas/patrica-klinik-bot/actions/workflows/check.yml"><img alt="Checks" src="https://github.com/lixinveritas/patrica-klinik-bot/actions/workflows/check.yml/badge.svg"></a>
  <img alt="Node 24.14+" src="https://img.shields.io/badge/Node-24.14%2B-22ddb4?style=flat-square">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-strict-339cff?style=flat-square">
  <img alt="SQLite" src="https://img.shields.io/badge/SQLite-local-ffd43b?style=flat-square">
</p>

# Patrica Klinik

Kurgu psikoloji klinigi icin Discord personel ve isletme botu.
Basvuru, danisan dosyasi, randevu, seans, kanitli tahsilat ve kasa defteri
tek bir butonlu calisma masasinda toplanir.

**[Kullanim ve kurtarma](docs/OPERATIONS.md)** · **[Guvenlik](SECURITY.md)** · **[Uygulama durumu](IYILESTIRME-PLANI.md)**

## Personel ne yapar?

| Alan | Is akisi |
|---|---|
| Basvuru | Buton, IC/OOC formu, yonetim karari, rol atama durumu |
| Klinik | Ozel dosya, atanmis psikolog, isim/kod arama, seans listesi |
| Takvim | Tek randevu karti, durum butonlari, cakisma kontrolu, guvenli devir |
| Finans | Dosya/gorsel kanit, ikinci kisi onayi, iade siniri, kasa teslimi |
| Yonetim | Otomatik indeks, audit, tarife surumleri, gun sonu uzlastirma |
| Isletim | Kalici bildirim kuyrugu, yerel yedek, geri donus, Windows gozetimi |

Gorseller icin lisansli yerel **Lucide** ikonlari kullanilir. Varsayilan Unicode
emoji veya AI tarafindan uretilmis ikon yoktur. Personel rehberi sunucudaki
**roadmap** kanalina, mevcut mesajlar yenilenerek yayinlanir.

## Para nasil izlenir?

~~~mermaid
flowchart LR
  A[Seans ve sabit tutar] --> B[Kanitli tahsilat bildirimi]
  B --> C[Ikinci kisi kontrolu]
  C --> D[Onayli defter]
  D --> E[Kasa teslim kaydi]
  D --> F[Gozlenen bakiye ile uzlastirma]
~~~

Bildirim onaylanmadan bakiye artmaz. Kaydi acan kisi kendi onayini veremez.
Teslim ve uzlastirma bakiyeye ikinci kez para eklemez. Bot **oyun hesabini
okumaz**; finans sorumlusu kaniti oyun ici hareketle eslestirir.

## Kurulum

**Node.js 24.14+**, Discord uygulamasi ve bot rolunu yonetebilecegin bir sunucu gerekir.
Developer Portal'da **Server Members Intent** acilmali. Message Content Intent kullanilmaz.

1. Repoyu indir, 'npm ci' calistir.
2. '.env.example' dosyasini '.env' olarak kopyala; bot tokeni ve kimlikleri yerelde doldur.
3. 'npm test' ile kontrol et.
4. 'npm run register' ile komutlari hedef sunucuya kaydet.
5. Bot rolunu Patrica rollerinin ustune koy; 'npm run provision' ile kanallari kur.
6. 'npm run start:background' ile Windows'ta gizli gozetimli calistir.

On planda calistirmak icin 'npm start'. Linux'ta on plan surecini kendi servis
yoneticinle calistir; repodaki arka plan/oturum acilisi yardimcilari Windows icindir.

## Guvenilirlik ve gizlilik

- Islem ile bildirim gorevi ayni SQLite transaction'inda saklanir.
- Bildirimler kayitli mesaj ID siyle guncellenir. Sonucu belirsiz eski gonderim
  otomatik tekrarlanmaz; yonetim mevcut mesaji eslestirir veya yoklugunu dogrular.
- Klinik notlari yalniz atanmis psikolog ve yonetim gorebilir. Resepsiyon notlari goremez.
- Discord yoneticileri ve sunucu sahibi platform izinlerini asabilir.
- SQLite yedegi kanit dosyalarini ve kaynak eslesmelerini de icerir.
- '.env', canli DB, yedekler ve gunlukler Git'ten dislanir. CI canli token istemez.

## Gelistirme

~~~sh
npm test
npm run doctor
npm run publish:check
npm audit --omit=dev
~~~

Testler finans butunlugu, yetki sinirlari, tekrar gonderim, kuyruk, transfer,
HTML kacisi ve BLOB dahil geri yuklemeyi kapsar. Test verileri sentetiktir;
test basarisi gercek kullanicilarla Discord uc uca testi yapildigi anlamina gelmez.

## Sinirlar

Yerel bilgisayar kapaliyken veya uykudayken bot calismaz. Ayni diskteki yedek
fiziksel disk kaybini karsilamaz. Otomatik maas, yapay zeka hizmeti, tum Discord
sohbetlerini dinleme ve otomatik veri silme yoktur. Bu proje gercek saglik
hizmeti veya gercek para odeme sistemi degildir.

Ikon lisansi ve kaynaklari: [assets](assets). Diger projelerden kod kopyalanmamistir;
referanslar [uygulama notunda](IYILESTIRME-PLANI.md) listelenir.
