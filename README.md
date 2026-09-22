# Zehra vs Samiye — Lock In

Bu sürüm özellikle **kolay kullanım** için hazırlanmıştır.

- npm yok
- terminal yok
- build yok
- server kodu yok
- GitHub Pages'te ücretsiz host edilir
- telefon / tablet / bilgisayarda responsive çalışır
- iki farklı cihazda aynı oda canlı senkron olur

## Özellikler

- 🌸 Zehra / 💜 Samiye seçimi
- ortak 7 karakterli oda kodu
- oda davet linki paylaşma
- iki cihaz arasında Firebase canlı senkron
- normal Free Focus timer
- 🍅 25 dakikalık Pomodoro
- 🧠 50 dakikalık Deep Focus
- çalışan timer'ın iki cihazda görünmesi
- Firebase server-time offset ile daha tutarlı timer
- aynı anda iki cihaz butona bassa bile transaction ile double-count koruması
- günlük hedef
- canlı lider / dakika farkı
- streak
- toplam daily wins
- focus session history
- günlük history
- son 7 battle grafiği
- haftalık kupa
- aylık Wrapped
- Wrapped kopyalama
- custom roast
- custom loser punishment
- ceza ruleti
- nudge/dürtme sistemi
- browser notification
- kazanana confetti
- PWA / ana ekrana ekleme desteği
- offline olduğunda son sayfayı açabilmek için cache
- otomatik yeni gün rollover
- mobil safe-area desteği

---

# Sadece bir kere yapılacak kurulum

Canlı iki-cihaz senkronu için ücretsiz Firebase gerekir. Bunu bir kez yaptıktan sonra siteyi normal şekilde kullanırsınız.

## 1. Firebase projesi

1. `https://console.firebase.google.com` adresine git.
2. **Create a project** seç.
3. Projeyi oluştur.
4. Project Overview ekranında **Web (`</>`)** ikonuna bas.
5. Uygulamaya istediğin bir isim ver, örneğin `lock-in`.
6. **Register app** de.
7. Firebase sana şöyle bir blok gösterecek:

```js
const firebaseConfig = {
  apiKey: "...",
  authDomain: "...",
  databaseURL: "...",
  projectId: "...",
  storageBucket: "...",
  messagingSenderId: "...",
  appId: "..."
};
```

Bu değerleri bu klasördeki **`firebase-config.js`** dosyasına yapıştır.

> `firebaseConfig` web uygulamalarında client tarafında kullanılır. Şifre gibi gizli bir server credential değildir.

## 2. Anonymous Authentication

Firebase Console:

**Authentication → Sign-in method → Anonymous → Enable**

Bu sayede Zehra ve Samiye hesap açmadan uygulamayı kullanabilir.

## 3. Realtime Database

Firebase Console:

**Realtime Database → Create Database**

Database oluşunca **Rules** sekmesine git ve bu klasördeki `database.rules.json` dosyasının içeriğini yapıştırıp **Publish** de.

## 4. GitHub Pages domainini Firebase'e ekle

Firebase Console:

**Authentication → Settings → Authorized domains → Add domain**

Buraya sadece GitHub Pages domainini yaz:

`KULLANICIADIN.github.io`

Örneğin GitHub kullanıcı adın `zehra123` ise:

`zehra123.github.io`

---

# GitHub'a yükleme — kod yazmadan

## 1. Repo oluştur

GitHub'da **New repository** de.

Örnek repo adı:

`focus-battle`

Public seçebilirsin.

## 2. Dosyaları yükle

Bu ZIP'in **içindeki bütün dosyaları** repo'nun en üst seviyesine yükle.

Özellikle `index.html` doğrudan repo root'unda olmalı.

## 3. GitHub Pages'i aç

Repo içinde:

**Settings → Pages → Build and deployment**

- Source: **Deploy from a branch**
- Branch: **main**
- Folder: **/(root)**
- **Save**

Bir süre sonra site adresin:

`https://KULLANICIADIN.github.io/focus-battle/`

şeklinde olur.

---

# Kullanım

1. İkiniz de siteyi açın.
2. Zehra kendi cihazında **Zehra**, Samiye kendi cihazında **Samiye** seçsin.
3. Biriniz **Yeni oda oluştur** desin.
4. Sağ üstte çıkan oda butonuna basıp davet linkini diğerine gönderin.
5. Diğer kişi linki açınca aynı odaya otomatik bağlanır.
6. Bundan sonra süre, timer, sonuçlar ve ayarlar iki cihazda canlı görünür.

Tarayıcı kapatılıp tekrar açıldığında son oda hatırlanır.

---

# Telefonda app gibi kullanma

### iPhone / Safari

Safari'de siteyi aç:

**Share → Add to Home Screen**

Sonra ana ekrandaki ikonundan açabilirsin.

### Android / Chrome

Siteyi açınca desteklenen cihazlarda 📲 butonu çıkar. Ona basarak yükleyebilirsin.

---

# Bildirimler

Sağ üstteki 🔔 butonuna bas.

Site açıkken veya tarayıcı onu aktif tutarken:

- nudge
- rakibin seni geçmesi
- Pomodoro bitişi

için browser notification gösterebilir.

Tamamen kapalı uygulamaya remote push göndermek server tarafı gerektirdiğinden bu sürüme özellikle eklenmedi; böylece proje ücretsiz ve basit kalıyor.

---

# Önemli

`firebase-config.js` dosyasını değiştirdikten sonra eski bir sürüm telefonda cache'te kalırsa siteyi bir kez yenile.

Bu proje kişisel/iki kişilik kullanım için hazırlanmıştır. Oda kodunu yalnızca birbirinizle paylaşmanız önerilir.
