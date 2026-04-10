# 배포 가이드

## 1. Docker 배포

```bash
# 빌드
docker compose build

# 실행
docker compose up -d

# 로그 확인
docker compose logs -f

# 중지
docker compose down
```

## 2. Railway 배포

1. [Railway](https://railway.app) 가입 후 새 프로젝트 생성
2. GitHub 리포지토리 연결 (`jouno7201/crypto-auto-trading`)
3. 환경 변수 설정:
   - `UPBIT_ACCESS_KEY`
   - `UPBIT_SECRET_KEY`
   - `NODE_ENV=production`
   - `PORT=3008`
4. 자동 배포 활성화 (main 브랜치 push 시)

## 3. AWS EC2 배포

```bash
# EC2 인스턴스에서
git clone https://github.com/jouno7201/crypto-auto-trading.git
cd crypto-auto-trading
cp .env.example .env
# .env 파일에 API 키 설정

# Docker로 실행
docker compose up -d

# 또는 직접 실행
npm ci --production
pm2 start ecosystem.config.js
```

## 4. HTTPS 적용 (Let's Encrypt)

Nginx 리버스 프록시 + Certbot 사용:

```bash
# Nginx 설치
sudo apt install nginx certbot python3-certbot-nginx

# Nginx 설정 (/etc/nginx/sites-available/crypto-trading)
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3008;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}

# SSL 인증서 발급
sudo certbot --nginx -d your-domain.com
```

## 5. 자동 백업 (cron)

```bash
# 매일 새벽 3시 백업 실행
crontab -e
# 추가:
0 3 * * * /path/to/crypto-auto-trading/scripts/backup.sh >> /var/log/crypto-backup.log 2>&1
```
