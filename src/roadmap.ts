import { Store } from './store.js';

export function roadmapMessages(s:Store,guild:string):string[] {
  const ch=(key:string,name:string)=>{const id=s.resource(guild,`channel:${key}`);return id?`<#${id}>`:`#${name}`;};
  return [
`# Patrica | Buradan Basla
Bu kanal personelin kullanim rehberi. Kod ezberlemene gerek yok; islemlerin cogu butonla yapiliyor.

**Ilk kez gelen personel ne yapacak?**
1. ${ch('staff','calisma-masasi')} kanalini ac.
2. **Mesai Ac** butonuna bas.
3. Danisan geldiyse **Dosya Ac** ile kaydini olustur. Sorumlu psikolog alanina Discord kullanici kimligi yazilir; karakter adi yazilmaz.
4. Randevu gerekiyorsa **Randevu** butonunu kullan.
5. Gorusme bitince psikolog **Seans Kaydet** butonuyla notunu girer.
6. Oyun ici odeme alindiginda **Tahsilat Bildir** kullanilir; seans kodu ve kanit dosyasi eklenir.
7. Finans yetkilisi odemeyi kontrol edip onaylar. Onaydan once para bot kasasina eklenmez.
8. Isin bittiginde **Mesai Kapat** butonuna bas.
9. **Personel Dosyam** ile kendi ozel alanina gec. Gunluk kartin, mazeret ve devir notun burada. Baska personelin dosyasina giremezsin.

**Kodlar ne demek?**
PK-0001 = danisan dosyasi.
SN-0001 = tek bir gorusme/seans.
RD-0001 = randevu.
FIN-0001 = para bildirimi.
BAS-0001 = personel basvurusu.
IK-0001 = mazeret, devir notu veya personel tutanagi.
Bir kodu digerinin yerine yazma.`,
`# Ortak Kanallar
**${ch('welcome','hos-geldiniz')}**
Yeni gelenin ilk gordugu yer. Personel basvurusu icin nereye gidecegini anlatir. Burada dosya veya tahsilat acilmaz.

**${ch('rules','kurallar')}**
Gizlilik, calisma esaslari ve ucretler. Danisan bilgisi kimle paylasilabilir, hangi hizmet kac para: once buraya bak.

**${ch('apply','personel-basvurusu')}**
Henuz personel olmayan kisi **Basvuru Yap** butonunu kullanir. Oynadigin karakterin adini ve soyadini, istedigin gorevi, IC ve OOC bilgiyi ayri yaz. Onaylaninca karakter adi personel dosyana kaydedilir; botun Discord yetkisi varsa sunucudaki gorunen adin da guncellenir. Bu buton danisan kaydi acmaz. Gorev degisikligi icin yeniden basvurma; yonetime yaz.

**${ch('announcements','kurum-duyurulari')}**
Yonetimin resmi duyurulari. Vardiya, tarife veya calisma duzeni degisirse burada aciklanir.

**${ch('staff','calisma-masasi')}**
Botun ana kumandasi. Dosya Ac, Randevu, Seans Kaydet, Tahsilat Bildir, Mesai Ac/Kapat ve Randevularim burada.

**${ch('chat','personel-iletisim')}**
Personelle gunluk koordinasyon ve OOC konusma. Seans notlarini veya odeme kanitlarini buraya atma.

**${ch('appointments','randevu-takvimi')}**
Yeni randevu bildirimleri ve yaklasan randevu hatirlatmalari. Randevuyu buraya mesaj yazarak degil, Calisma Masasi'ndaki butondan olustur.

**${ch('shifts','mesai-ve-devir')}**
Bekleyen isini, izin durumunu veya devir aciklamani personele yazabilecegin yer. Mesaiyi acip kapatmak icin yine Calisma Masasi'ndaki butonlari kullan.`,
`# Dosya ve Seans Nasil Kullanilir?
**${ch('records','danisan-dosyalari')} — psikolog ve yonetim alani**
Her danisan icin PK koduyla ozel bir alt kanal olusur. Psikolog yalniz kendisine atanan ozel dosyaya eklenir. Resepsiyon bu arsivi goremez.

**Dosyayi acmak:**
Calisma Masasi > Dosya Ac > karakter adi, oyun ici iletisim ve sorumlu psikolog Discord kimligi.
Ayni karakter icin tekrar tekrar dosya acma.

**Seans notu girmek:**
Calisma Masasi > Seans Kaydet > PK kodu > ilk/takip/cift > kisa gorusme notu.
Notta danisanin anlattigi, senin gozlemin, birlikte belirlenen hedef ve sonraki adim olsun. Gercek oyuncunun ozel bilgilerini yazma.

**Eski notlari okumak:**
**/klinik dosya kod:PK-0001** yaz. Yalniz sorumlu psikolog veya yonetim okuyabilir. Notlar dosya eki olarak sana ozel yanitta gelir.

**Tarife:**
Guncel fiyat icin /klinik tarifeler. Ilk kurulumda ilk: 20.000$, takip: 15.000$, cift: 25.000$ toplam. Yonetim yeni tarife kaydedebilir; eski seans tutari korunur.
Seans kaydetmek tek basina kasaya para eklemez.

**Randevu bitince:**
**/klinik randevu kod:RD-0001 durum:Tamamlandi** kullan. Kisi gelmediyse Gelmedi, vazgectiyse Iptal sec. Karttaki Tamamlandi / Iptal / Gelmedi butonlari ayni mesaji yeniler. Bot kapaliyken gecen randevu kontrol gerekiyor olarak gorunur.`,
`# Para Islemleri Nasil Yapilir?
**${ch('finance','finans-masasi')} — finans ve yonetim**
Kasa Ozeti: onayli gelir, cikis ve kayitli bakiye.
Bekleyen Kayitlar: henuz onaylanmamis bildirimleri gosterir.
Gider Bildir: kira, reklam veya personel odemesi gibi bir cikis talebi.
Iade Talebi: daha once onaylanan FIN gelir kaydina bagli iade.
Hesap Dokumu: onayli kasa hareketlerini CSV dosyasi olarak indirir.

**${ch('cash','tahsilat-kayitlari')} — finans ve yonetim**
FIN kartlari burada. Gorsel kanit kartta gorunur; chatlog dosyasi indirilebilir.
Kaniti Gor > oyun ici para hareketini kontrol et > Onayla veya Reddet.
Kendi actigin para kaydini kendin onaylayamazsin.

**Psikolog tahsilati nasil bildirir?**
Calisma Masasi > Tahsilat Bildir > SN kodu > kanit dosyasini sec > gonder.
Tutar seansin tarifesinden otomatik gelir. Yeni dosya kodunu veya randevu kodunu SN yerine yazma.

**Kanit dosyasi:**
TXT/LOG: UTF-8, en fazla 256 KB.
PNG/JPG/WEBP: en fazla 4 MB.
Sadece odemeyle ilgili satirlari veya kirpilmis ekran goruntusunu ekle.

**Onemli:** Bot FiveM hesabindaki parayi okumaz. Kanit yuklemek odemeyi onaylamaz. Finans yetkilisinin eslestirmesi gerekir.`,
`# Yonetim Kanallari
Bu bolumdeki kanallari gorememek hata degil; gorevine gore kapali olabilir.

**${ch('applications','basvuru-degerlendirme')}**
Personel basvurulari buraya gelir. Karakter adini RP kimligiyle kontrol et; Discord kullanici ID'si hesabi tanir, karakter adi onun yerini tutmaz. Gorusmeye Cagir, Onayla veya Reddet butonuyla ilerle. Karar gerekcesini yaz. Onay rol atamasini ve ad guncellemesini baslatir. Kartta **Discord adi: Elle duzenlenmeli** yaziyorsa takma adi sunucudan elle degistir. Ozel mesaji kapali adaya bot ulasamayabilir; sonucu kendisine ayrica bildir.

**${ch('index','dosya-indeksi')}**
Dosya kodu, sorumlu ve durum otomatik guncellenir. Klinik gorusme notlari bu listeye cikmaz.

**${ch('audit','islem-gecmisi')}**
Kim hangi bot islemini yapti, hangi kaydi acti/onayladi: burada kodlarla gorunur. Seans notu veya kanit icerigi burada paylasilmaz. Bildirimler kisa gecikmeyle gelebilir.

**${ch('complaints','olay-ve-sikayet')}**
Sikayet, yanlis islem ve personel sorunu icin. Ilgili PK/RD/FIN kodunu, ne oldugunu ve beklenen duzeltmeyi yaz. Gerekmedikce ozel seans notunu kopyalama.

**Yetki ve dosya devri:**
Bot sahibi **/klinik personel** ile gorev atar veya personeli cikarir.
Elle gorev atarken **karakter-adi** alanini doldur. Ad sonradan degisirse **/klinik isim** kullan. Sunucu sahibi Mira Patrica dahil botun adini degistiremedigi hesaplarda kayitli RP adi personel kartinda gorunur; Discord takma adini yetkili kisi elle ayarlar. Gorev rolleri yetkidir, her karakter icin yeni rol acilmaz.
Yonetim **/klinik devret** ile dosyayi baska psikologa verir. Gelecekteki randevular yeni psikologa aktarilir; cakisma varsa islem reddedilir. iptal secenegiyle randevulari iptal ederek devredebilirsin.
**/klinik dosya-durumu** dosyayi kapatir veya yeniden acar. Kapatma bekleyen randevulari iptal eder.`,
`# Takilirsan Once Buraya Bak
**Yanlis kod hatasi:** PK, SN, RD ve FIN farkli kayitlar. Istendigi turde kod yaz.
**Yetkin yok:** O dosya sana atanmamis veya bu islem gorevine kapali. Baskasinin hesabindan deneme; yonetime yaz.
**Kaydedildi ama bildirim gitmedi:** Yeni kayit acma. Botun verdigi kodu yonetime ilet. Finans icin Bekleyen Kayitlar, dosya icin /klinik dosya kullan.
**Islem zaman asimina ugradi:** Hemen tekrar gonderme. Once kayit olusmus mu kontrol et.
**Ayni kanit kullanilmis:** Ayni dosyayi farkli adla tekrar eklemek yeni odeme sayilmaz. Ilk FIN kaydini kontrol et.
**Kasa sifir:** Bildirimler onay bekliyor olabilir. Seans veya dosya acmak kasayi arttirmaz.
**Eski formda dosya alani yok:** Formu kapatip butona tekrar bas.
**Tarih kabul edilmiyor:** 2026-11-02 21:30 biciminde, Istanbul saatini yaz. Randevu suresi 20/30/45/60 dakika.

## Hizli Arama ve Kontrol
/klinik ara: isim veya PK koduyla dosyani bul; sayfa secenegiyle ilerle.
/klinik seanslar: SN kodlarini gor. /klinik bekleyenler: finans listesi.
/klinik uzlastir: gozlenen oyun bakiyesini defterle karsilastir; defteri degistirmez.
/klinik teslim: onayli gelir gercekten kasaya gelince finans kaydeder.
/klinik saglik: yonetim bekleyen/engellenen bildirimleri kontrol eder.

**Personel alani:** Calisma Masasi > Personel Dosyam. Gunluk seans ve dosya kodlari burada; gorusme notu ortak ozete cikmaz. Mazeret Bildir ile gelemeyecegin tarihleri ve nedeni gir. Devir Notu ile bekleyen isi kaydet. IK kaydini /klinik personel-kaydi ile oku. Tutanak geldiyse Aciklama Ekle butonunu kullan. Otomatik ceza uygulanmaz.

Kullanim sorusunu ${ch('chat','personel-iletisim')} kanalina, yanlis kayit/sikayeti yonetime ilet. Yalniz ilgili kodu paylas; tum danisan dosyasini ortak kanala atma.`
  ];
}
