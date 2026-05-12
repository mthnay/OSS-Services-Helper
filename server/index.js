const express = require('express');
const Brevo = require('@getbrevo/brevo');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const dns = require('dns');
if (dns.setDefaultResultOrder) {
    dns.setDefaultResultOrder('ipv4first');
}
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET || 'oss-services-helper-secret-key-123';
const AUTH_FILE = process.env.USER_DATA_PATH
    ? path.join(process.env.USER_DATA_PATH, 'auth.json')
    : path.join(__dirname, 'auth.json');

// Kimlik doğrulama verilerini başlat
if (!fs.existsSync(AUTH_FILE)) {
    const defaultAuth = {
        username: 'metehan ay',
        passwordHash: bcrypt.hashSync('220624', 10)
    };
    fs.writeFileSync(AUTH_FILE, JSON.stringify(defaultAuth, null, 2));
}

const getAuthData = async () => JSON.parse(await fs.promises.readFile(AUTH_FILE, 'utf8'));
const saveAuthData = async (data) => await fs.promises.writeFile(AUTH_FILE, JSON.stringify(data, null, 2));

const app = express();
const PORT = process.env.PORT || 5001;

app.use(cors());
app.use(express.json());

// Auth Middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).json({ success: false, message: 'Yetkisiz erişim. Lütfen giriş yapın.' });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ success: false, message: 'Oturum süresi dolmuş veya geçersiz token.' });
        req.user = user;
        next();
    });
};

// Auth Endpoints
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const authData = await getAuthData();

        if (username.toLowerCase() === authData.username.toLowerCase() && await bcrypt.compare(password, authData.passwordHash)) {
            const token = jwt.sign({ username: authData.username }, JWT_SECRET, { expiresIn: '7d' });
            return res.json({ success: true, token, user: { name: authData.username } });
        }

        res.status(401).json({ success: false, message: 'Hatalı kullanıcı adı veya şifre.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Sunucu hatası.' });
    }
});

app.post('/api/change-password', authenticateToken, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const authData = await getAuthData();

        if (!(await bcrypt.compare(currentPassword, authData.passwordHash))) {
            return res.status(400).json({ success: false, message: 'Mevcut şifre hatalı.' });
        }

        authData.passwordHash = await bcrypt.hash(newPassword, 10);
        await saveAuthData(authData);

        res.json({ success: true, message: 'Şifre başarıyla güncellendi.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Sunucu hatası.' });
    }
});

// Ön yüz (React) dosyalarını sunma
const clientDistPath = path.join(__dirname, '../client/dist');
app.use(express.static(clientDistPath));

// Dosya Yükleme Ayarları
const uploadDir = process.env.USER_DATA_PATH
    ? path.join(process.env.USER_DATA_PATH, 'uploads')
    : path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}
console.log('Upload directory:', uploadDir);

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        // Her zaman aynı isimle kaydedelim ki üzerine yazsın (tek dosya mantığı)
        // Ya da orijinal ismini saklayıp bir config dosyasında tutabiliriz.
        // Basitlik için: 'attachment.pdf' olarak kaydediyoruz.
        cb(null, 'generic_attachment.pdf');
    }
});

const upload = multer({ storage: storage });

// Dosya Yükleme Endpoint'i (Korumalı)
app.post('/upload-attachment', authenticateToken, upload.single('file'), (req, res) => {
    console.log('Upload request received');
    if (!req.file) {
        console.log('No file in request');
        return res.status(400).json({ success: false, message: 'Dosya seçilmedi.' });
    }
    console.log('File uploaded:', req.file.path);
    res.json({ success: true, message: 'Dosya başarıyla yüklendi ve varsayılan olarak ayarlandı.' });
});

// Kayıtlı dosya bilgisini kontrol etme
app.get('/check-attachment', async (req, res) => {
    const defaultPath = path.join(__dirname, 'assets', 'Bilgilendirme.pdf');
    const uploadedPath = path.join(uploadDir, 'generic_attachment.pdf');

    try {
        await fs.promises.access(uploadedPath);
        return res.json({ exists: true, name: 'Bilgilendirme.pdf' });
    } catch {
        try {
            await fs.promises.access(defaultPath);
            return res.json({ exists: true, name: 'Bilgilendirme.pdf' });
        } catch {
            return res.json({ exists: false });
        }
    }
});

// Dosya Silme (Korumalı)
app.delete('/delete-attachment', authenticateToken, async (req, res) => {
    const filePath = path.join(uploadDir, 'generic_attachment.pdf');
    try {
        await fs.promises.access(filePath);
        await fs.promises.unlink(filePath);
        res.json({ success: true, message: 'Dosya silindi.' });
    } catch {
        res.json({ success: false, message: 'Silinecek dosya bulunamadı veya yetkisiz erişim.' });
    }
});

// SMTP Bağlantı Testi (Korumalı)
app.post('/test-connection', authenticateToken, async (req, res) => {
    if (!process.env.BREVO_API_KEY) {
        return res.status(500).json({
            success: false,
            message: 'BREVO_API_KEY bulunamadı. Lütfen sunucu ortam değişkenlerini (.env) kontrol edin.'
        });
    }

    res.status(200).json({ success: true, message: 'Brevo API Key mevcut! Bağlantı başarılı.' });
});

// E-posta gönderme endpoint'i (Korumalı)
app.post('/send-email', authenticateToken, async (req, res) => {
    const { to, subject, text, auth } = req.body;

    if (!process.env.BREVO_API_KEY) {
        return res.status(500).json({
            success: false,
            message: 'BREVO_API_KEY bulunamadı. Sunucu yöneticisi ile iletişime geçin.'
        });
    }

    const apiInstance = new Brevo.TransactionalEmailsApi();
    apiInstance.setApiKey(Brevo.TransactionalEmailsApiApiKeys.apiKey, process.env.BREVO_API_KEY);

    // Ekleri hazırla (Brevo için Base64 gerekiyor)
    const attachments = [];

    // Önce assets klasöründeki sabit/varsayılan dosyaya bak
    const defaultAttachmentPath = path.join(__dirname, 'assets', 'Bilgilendirme.pdf');
    const uploadedAttachmentPath = path.join(uploadDir, 'generic_attachment.pdf');

    try {
        await fs.promises.access(defaultAttachmentPath);
        const fileBuffer = await fs.promises.readFile(defaultAttachmentPath);
        attachments.push({ name: 'Bilgilendirme.pdf', content: fileBuffer.toString('base64') });
    } catch {
        try {
            await fs.promises.access(uploadedAttachmentPath);
            const fileBuffer = await fs.promises.readFile(uploadedAttachmentPath);
            attachments.push({ name: 'Bilgilendirme.pdf', content: fileBuffer.toString('base64') });
        } catch {}
    }

    // İmza logosunu Base64'e çevirip HTML içine göm
    const logoPath = path.join(__dirname, 'assets', 'signature_logo.png');
    let logoBase64 = '';
    try {
        await fs.promises.access(logoPath);
        const logoBuffer = await fs.promises.readFile(logoPath);
        logoBase64 = `data:image/png;base64,${logoBuffer.toString('base64')}`;
    } catch {}

    const fromEmail = (auth && auth.user) ? auth.user : 'servis.mavibahce@artitroy.com';

    let sendSmtpEmail = new Brevo.SendSmtpEmail();
    sendSmtpEmail.subject = subject;
    sendSmtpEmail.htmlContent = `
        <div style="font-family: Arial, sans-serif; color: #333; line-height: 1.6;">
            ${text.replace(/\n/g, '<br>')}
            <br><br>
            ${logoBase64 ? `<img src="${logoBase64}" width="150" style="display: block; margin-top: 20px;" alt="Troy Logo">` : ''}
        </div>
    `;
    sendSmtpEmail.sender = { name: "OSS Services Helper", email: fromEmail };
    sendSmtpEmail.to = [{ email: to }];
    sendSmtpEmail.cc = [{ email: 'servis.mavibahce@artitroy.com' }];
    
    if (attachments.length > 0) {
        sendSmtpEmail.attachment = attachments;
    }

    try {
        const data = await apiInstance.sendTransacEmail(sendSmtpEmail);
        console.log('Email sent via Brevo:', data);
        res.status(200).json({ success: true, message: 'Email başarıyla gönderildi!' });
    } catch (error) {
        // Brevo hata detaylarını yakala
        const errorDetail = error.response && error.response.body ? error.response.body : error.message;
        console.error('Brevo Error Detail:', errorDetail);
        res.status(500).json({ 
            success: false, 
            message: 'Email gönderilirken hata oluştu.', 
            error: typeof errorDetail === 'object' ? JSON.stringify(errorDetail) : errorDetail 
        });
    }
});


// React Router için tüm istekleri index.html'e yönlendir (API rotaları hariç)
app.get(/^.*$/, async (req, res) => {
    const indexPath = path.join(clientDistPath, 'index.html');
    try {
        await fs.promises.access(indexPath);
        res.sendFile(indexPath);
    } catch {
        res.send('Frontend build not found. Please run build first.');
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on port ${PORT}`);
});
