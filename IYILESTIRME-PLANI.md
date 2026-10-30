# Patrica Klinik | Uygulama durumu

Surum 0.3.0. Asamalar mevcut botun denetiminden cikarildi; "10 kat" olculmus
bir performans iddiasi degildir. Canli API ve test sonuclari ayri raporlanir.

| Asama | Uygulanan kapsam | Sinir |
|---|---|---|
| Ilk yanit | Komut/modal tesliminde erken ACK; modal acarken cached roller | Teslimde taze rol kontrolu korunur |
| Kurtarma | SQLite outbox, tekrar/engelli durum, mesaj ID/nonce, manuel eslestirme | Discord icin kalici exactly-once garantisi yok |
| Audit | Karaktere gore bolme, teyit edilen son olaya kadar cursor | DB asil kaynaktir |
| Arama | Isim/PK, dosya/seans/finans/basvuru/takvim sayfalari, yonetim indeksi | Klinik not listeye cikmaz |
| Randevu | Tek durum karti, butonlar, cakismali devir rollback, offline kontrol | Gecmis randevu kendiliginden tamamlanmaz |
| Mesai ve basvuru | Giris/cikis karti, bekleyen is sayisi, karar/rol ayri durum | Discord rol hiyerarsisi uygulanmayi engelleyebilir |
| Kasa | Uzlastirma, teslim alindi kaydi, versiyonlu tarife ve tutar snapshot | Oyun bakiyesi elle girilir; maas orani uydurulmaz |
| Aktarma | Yetkili TXT/guvenli HTML ciktisi, kalici kanit BLOB | Saklama suresi ve anonimlestirme politikasi kullanici karari bekler; veri silinmez |
| Isletim | Windows gozetim, heartbeat/disk kontrolu, oturum acilisi, yedek/restore | Kullanici yerel yedek secti; ayri disk/bulut hedefi yok |
| Personel dosyasi | Kisiye ozel alan, Istanbul gunluk karti, mazeret/devir/tutanak, personel aciklamasi ve yonetim gerekcesi | Otomatik devamsizlik tespiti, ceza ve maas kesintisi yok |
| RP kimligi | Basvuru adi onayda Discord ID'sine baglanir; yetki varsa takma ad guncellenir; elle atama ve ad duzeltme komutlari | Sunucu sahibi/ust rolde ad elle duzenlenir; ayni isimli iki hesap otomatik birlestirilmez |
| Resimli rehber | Mevcut roadmap kanalinda dort adimli Sharp gorseli ve ayrintili metinler | Gorsel ozet, ayrintili islem kurallarinin yerini almaz |

## Sonraki kararlar

- Personel listesi gerekirse onayli karakter adi, gorev ve Discord ID'sini
  yonetim kanalinda sayfali goster. Mevcut ozel dosya izinlerini genisletme.
- Mazeret kabul edildiginde cakisan randevular icin yonetime uyari eklenebilir;
  randevulari otomatik iptal etme karari ayrica verilmeli.
- RP adinin degisim gecmisi ve ayni adli personel uyarisi, ekip buyudugunde
  kimlik karisikligi gorulurse eklenmeli.

## Kabul kontrolleri

Sentetik testler: maker-checker, guild izolasyonu, dosya yetkisi, para ve seans
tekrari, kuyruk commit/rollback/lease, 100 dosya sayfalama, 100 audit olayi,
tarife snapshot, cakisan devir, HTML/script kacisi ve kanit BLOB/defter/resources
ile tam geri donus. Gercek aday/personel hesaplarindan uc uca test ayrica gerekir.

## Referanslar

- [Discord interaction yanitlari](https://discord.com/developers/docs/interactions/receiving-and-responding)
- [Discord rate limits](https://discord.com/developers/docs/topics/rate-limits)
- [discord-tickets/bot](https://github.com/discord-tickets/bot): personel akislarini inceleme; kod alinmadi.
- [discord-html-transcripts](https://github.com/ItzDerock/discord-html-transcripts): gorunum fikri; bagimlilik eklenmedi.
- [BullMQ idempotent jobs](https://docs.bullmq.io/patterns/idempotent-jobs): tekrar guvenligi fikri; Redis kurulmadan SQLite kullanildi.
