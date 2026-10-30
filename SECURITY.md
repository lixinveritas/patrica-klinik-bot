# Guvenlik

Patrica Klinik kurgu RP isletmesi icindir. Gercek saglik verisi veya gercek
odeme isleme amaciyla tasarlanmamistir.

## Kapsam

- Islem aninda taze rol kontrolu; modal acilisinda hizli uyelik kontrolu.
- Psikolog yalniz atanmis dosyanin notunu okur. Resepsiyon liste/randevu icin
  gerekli kimlik ve sorumlu bilgisini gorur; klinik notu goremez.
- Ozel threadler davete kapalidir. Arsiv ana kanali psikolog ve yonetime aciktir.
  Discord yoneticileri/sunucu sahibi bu sinirin disindadir.
- Finans kaniti yalniz finans ve yonetime sunulur. Discord CDN'den sinirli
  boyutlu TXT/LOG veya dogrulanmis tek kare gorsel kabul edilir.
- HTML ciktisi kacisli metindir, script veya dis kaynak calistirmaz.
- Kasa onayi transaction, tekil kayit ve degistirilemez defter kurallari kullanir.

## Gizli dosyalar

`.env`, `data/`, yedekler, SQLite, gunlukler ve calisma sureci dosyalari Git'e
girmez. `npm run publish:check` takip edilen dosyalari kontrol eder; `.env`
varsa yerel tokenle tam eslesmeyi de arar. CI'da canli token gerekmez.

Gizli degerleri issue, log veya ekran goruntusune koyma. Bir acigi bildirmek
icin repodaki **Security > Report a vulnerability** ozelligi varsa onu kullan;
yoksa kamuya acik issue'ya yalniz hassas olmayan ozet yaz.

## Sinirlar

Yerel dosyalar sifrelenmez; bilgisayar ve yedek erisimi isletmeci sorumlulugundadir.
Saklama suresi/otomatik silme yoktur. Bot Discord veya FiveM icin guvenlik
sertifikasi, odeme garantisi veya kesintisiz hizmet iddiasinda bulunmaz.
